/* ---------------------------------------------------------------------------
 * Configuración, clave del Control Maestro y auditoría.
 * Port de `sfida_core.py`.
 * ------------------------------------------------------------------------- */
import { pbkdf2Sync, randomBytes } from 'node:crypto';

import type { Database } from 'better-sqlite3';

import { ErrorNegocio } from './errores';
import { norm } from './textos';

/* ------------------------------------------------------------------ config */

export function getConfig(db: Database, clave: string, porDefecto: string | null = null): string | null {
  const f = db.prepare('SELECT valor FROM config WHERE clave=?').get(clave) as
    | { valor: string | null }
    | undefined;
  return f ? f.valor : porDefecto;
}

/** Port de `set_config()`. Guarda SIEMPRE como texto, igual que Python. */
export function setConfig(db: Database, clave: string, valor: unknown): void {
  db.prepare(
    'INSERT INTO config(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor',
  ).run(clave, String(valor));
}

/* -------------------------------------------------------------- animaciones */

export const CFG_ANIMACIONES = 'animaciones';

/** De fábrica vienen ENCENDIDAS: solo `"0"` las apaga. */
export function animacionesActivas(db: Database): boolean {
  return getConfig(db, CFG_ANIMACIONES, '1') !== '0';
}

export function setAnimaciones(db: Database, encendidas: boolean): void {
  setConfig(db, CFG_ANIMACIONES, encendidas ? '1' : '0');
}

/* --------------------------------------------------- clave Control Maestro */

export const CLAVE_POR_DEFECTO = 'sfida2026';

/**
 * Port de `_hash_clave()`.
 *
 * PBKDF2-HMAC-SHA256, 120000 iteraciones, salida hex. Los parámetros tienen
 * que coincidir EXACTAMENTE con los de Python: si alguien ya cambió la clave
 * desde la app vieja, tiene que seguir entrando desde la nueva.
 *
 * Python: hashlib.pbkdf2_hmac("sha256", clave.utf8, sal.utf8, 120000).hex()
 * — sin `dklen`, o sea 32 bytes (el tamaño del digest de sha256).
 */
function hashClave(clave: string, sal: string): string {
  return pbkdf2Sync(Buffer.from(clave, 'utf8'), Buffer.from(sal, 'utf8'), 120000, 32, 'sha256').toString('hex');
}

export function verificarClave(db: Database, clave: string): boolean {
  const guardado = getConfig(db, 'clave_maestra');
  const sal = getConfig(db, 'clave_sal');
  if (!guardado || !sal) return clave === CLAVE_POR_DEFECTO; // primera vez
  return hashClave(clave ?? '', sal) === guardado;
}

export function claveEsLaDeFabrica(db: Database): boolean {
  return verificarClave(db, CLAVE_POR_DEFECTO);
}

export function cambiarClave(db: Database, claveActual: string, claveNueva: string): void {
  if (!verificarClave(db, claveActual)) {
    throw new ErrorNegocio('La clave actual no es correcta.');
  }
  const nueva = norm(claveNueva);
  if (nueva.length < 4) {
    throw new ErrorNegocio('La clave nueva debe tener al menos 4 caracteres.');
  }
  const sal = randomBytes(16).toString('hex');
  setConfig(db, 'clave_sal', sal);
  setConfig(db, 'clave_maestra', hashClave(nueva, sal));
  auditar(db, 'CAMBIO DE CLAVE', 'Se cambio la clave del Control Maestro');
}

/* --------------------------------------------------------------- auditoría */

export interface FilaAuditoria {
  id: number;
  momento: string;
  accion: string;
  detalle: string | null;
}

/**
 * Port de `auditar()`.
 *
 * Trunca el detalle a 400 caracteres y SE TRAGA cualquier excepción: auditar
 * nunca puede romper la operación que se estaba haciendo.
 */
export function auditar(db: Database, accion: string, detalle: unknown = ''): void {
  try {
    db.prepare('INSERT INTO auditoria(accion, detalle) VALUES (?,?)').run(
      accion,
      String(detalle ?? '').slice(0, 400),
    );
  } catch {
    /* auditar nunca rompe la operación */
  }
}

export function listarAuditoria(db: Database, limite = 300, texto = ''): FilaAuditoria[] {
  let sql = 'SELECT * FROM auditoria WHERE 1=1';
  const par: unknown[] = [];
  const t = norm(texto);
  if (t) {
    sql += ' AND (accion LIKE ? OR detalle LIKE ?)';
    const like = `%${t.toUpperCase()}%`;
    par.push(like, like);
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  par.push(limite);
  return db.prepare(sql).all(...par) as FilaAuditoria[];
}

export function limpiarAuditoria(db: Database, dejarUltimos = 200): void {
  db.prepare(
    'DELETE FROM auditoria WHERE id NOT IN (SELECT id FROM auditoria ORDER BY id DESC LIMIT ?)',
  ).run(dejarUltimos);
}
