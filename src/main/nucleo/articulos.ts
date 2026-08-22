/* ---------------------------------------------------------------------------
 * Artículos y sucursales. Port de `sfida_core.py`.
 * ------------------------------------------------------------------------- */
import type { Database } from 'better-sqlite3';

import type { ArticuloListado, FiltroArticulos } from '../../compartido/contrato';
import { auditar } from './config';
import { ErrorNegocio } from './errores';
import { SQL_STOCK } from './stock';
import { norm, normalizarNombre } from './textos';
import { normalizarUnidad } from './unidades';

export interface Articulo {
  id: number;
  codigo: string;
  nombre: string;
  categoria_id: number | null;
  unidad: string;
  stock_minimo: number;
  activo: number;
  creado_en: string;
}

/**
 * Port de `listar_articulos()`.
 *
 * OJO — comportamiento no obvio nº 9: filtra con LIKE en SQL, o sea que SÍ
 * distingue tildes. Es distinto de `listarStock()`, que filtra en memoria con
 * `coincide()`. Las dos búsquedas conviven a propósito.
 */
export function listarArticulos(db: Database, filtro: FiltroArticulos = {}): ArticuloListado[] {
  const { texto = '', soloActivos = true, categoriaId = null } = filtro;
  let sql = `SELECT a.*, c.nombre AS categoria,
                    COALESCE(st.stock, 0) AS stock
             FROM articulos a
             LEFT JOIN categorias c ON c.id = a.categoria_id
             LEFT JOIN (${SQL_STOCK}) st ON st.articulo_id = a.id
             WHERE 1=1`;
  const par: unknown[] = [];
  if (soloActivos) sql += ' AND a.activo = 1';
  if (categoriaId) {
    sql += ' AND a.categoria_id = ?';
    par.push(categoriaId);
  }
  const t = norm(texto);
  if (t) {
    sql += ' AND (a.nombre LIKE ? OR a.codigo LIKE ?)';
    par.push(`%${t}%`, `%${t}%`);
  }
  sql += ' ORDER BY a.nombre';
  return db.prepare(sql).all(...par) as ArticuloListado[];
}

export function obtenerArticulo(db: Database, artId: number): Articulo | undefined {
  return db.prepare('SELECT * FROM articulos WHERE id=?').get(artId) as Articulo | undefined;
}

/**
 * Port de `codigo_sugerido()`.
 *
 * Toma el último código con ese prefijo POR `id DESC` (no por número), le suma
 * 1 al sufijo y devuelve «OFI-0001» (4 dígitos). Si el sufijo no es numérico,
 * cae en COUNT(*)+1.
 */
export function codigoSugerido(db: Database, prefijo = 'ART'): string {
  const fila = db
    .prepare('SELECT codigo FROM articulos WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1')
    .get(`${prefijo}-%`) as { codigo: string } | undefined;
  let n = 1;
  if (fila) {
    const partes = String(fila.codigo).split('-');
    const ultimo = partes[partes.length - 1] ?? '';
    if (/^\d+$/.test(ultimo)) {
      n = Number(ultimo) + 1;
    } else {
      const { c } = db.prepare('SELECT COUNT(*) c FROM articulos').get() as { c: number };
      n = c + 1;
    }
  }
  return `${prefijo}-${String(n).padStart(4, '0')}`;
}

/**
 * Port de `guardar_articulo()`.
 *
 * OJO — comportamiento no obvio nº 7: el CÓDIGO se guarda con `strip().upper()`,
 * NO con `normalizarNombre()`. O sea que conserva los espacios internos.
 */
export function guardarArticulo(
  db: Database,
  codigo: unknown,
  nombre: unknown,
  categoriaId: number | null,
  unidad: unknown,
  stockMinimo: unknown,
  activo: number | boolean = 1,
  artId: number | null = null,
): number {
  const cod = norm(codigo).toUpperCase();
  const nom = normalizarNombre(nombre);
  const uni = normalizarUnidad(unidad);
  if (!cod) throw new ErrorNegocio('El articulo necesita un codigo.');
  if (!nom) throw new ErrorNegocio('El articulo necesita un nombre.');

  const min = Number(stockMinimo ?? 0);
  if (!Number.isFinite(min)) throw new ErrorNegocio('El stock minimo debe ser un numero.');
  if (min < 0) throw new ErrorNegocio('El stock minimo no puede ser negativo.');

  try {
    if (artId) {
      db.prepare(
        `UPDATE articulos SET codigo=?, nombre=?, categoria_id=?,
         unidad=?, stock_minimo=?, activo=? WHERE id=?`,
      ).run(cod, nom, categoriaId, uni, min, Number(activo), artId);
      return artId;
    }
    return db
      .prepare(
        `INSERT INTO articulos (codigo, nombre, categoria_id, unidad, stock_minimo, activo)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(cod, nom, categoriaId, uni, min, Number(activo)).lastInsertRowid as number;
  } catch {
    throw new ErrorNegocio(`Ya existe otro articulo con el codigo ${cod}.`);
  }
}

/**
 * Port de `eliminar_articulo()`.
 *
 * Un artículo con movimientos NO se borra: se desactiva, para conservar el
 * historial.
 */
export function eliminarArticulo(db: Database, artId: number): 'desactivado' | 'eliminado' {
  const { n } = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM ingreso_det WHERE articulo_id=?) +
        (SELECT COUNT(*) FROM salida_det  WHERE articulo_id=?) +
        (SELECT COUNT(*) FROM ajustes     WHERE articulo_id=?) AS n`,
    )
    .get(artId, artId, artId) as { n: number };
  if (n) {
    db.prepare('UPDATE articulos SET activo=0 WHERE id=?').run(artId);
    return 'desactivado';
  }
  db.prepare('DELETE FROM articulos WHERE id=?').run(artId);
  return 'eliminado';
}

export function reactivarArticulo(db: Database, artId: number): void {
  db.prepare('UPDATE articulos SET activo=1 WHERE id=?').run(artId);
  auditar(db, 'ARTICULO', `reactivado id=${artId}`);
}

/* ------------------------------------------------------------- sucursales */

export interface Sucursal {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  responsable: string | null;
  activo: number;
  creado_en: string;
}

export function listarSucursales(db: Database, soloActivas = true): Sucursal[] {
  let sql = 'SELECT * FROM sucursales';
  if (soloActivas) sql += ' WHERE activo=1';
  return db.prepare(`${sql} ORDER BY nombre`).all() as Sucursal[];
}

/** Port de `guardar_sucursal()`. La DIRECCIÓN también va en MAYÚSCULAS. */
export function guardarSucursal(
  db: Database,
  codigo: unknown,
  nombre: unknown,
  direccion: unknown = '',
  responsable: unknown = '',
  activo: number | boolean = 1,
  sucId: number | null = null,
): number {
  const cod = norm(codigo).toUpperCase();
  const nom = normalizarNombre(nombre);
  const resp = normalizarNombre(responsable);
  const dir = normalizarNombre(direccion);
  if (!cod) throw new ErrorNegocio('La sucursal necesita un codigo.');
  if (!nom) throw new ErrorNegocio('La sucursal necesita un nombre.');
  try {
    if (sucId) {
      db.prepare(
        `UPDATE sucursales SET codigo=?, nombre=?, direccion=?,
         responsable=?, activo=? WHERE id=?`,
      ).run(cod, nom, dir, resp, Number(activo), sucId);
      return sucId;
    }
    return db
      .prepare(
        `INSERT INTO sucursales (codigo, nombre, direccion, responsable, activo)
         VALUES (?,?,?,?,?)`,
      )
      .run(cod, nom, dir, resp, Number(activo)).lastInsertRowid as number;
  } catch {
    throw new ErrorNegocio(`Ya existe otra sucursal con el codigo ${cod}.`);
  }
}

/** Cuántas filas hay en cada tabla. Diagnóstico para el Control Maestro. */
export function conteos(db: Database): Record<string, number> {
  const tablas = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  const salida: Record<string, number> = {};
  for (const { name } of tablas) {
    const r = db.prepare(`SELECT COUNT(*) c FROM "${name}"`).get() as { c: number };
    salida[name] = r.c;
  }
  return salida;
}

/** Una sucursal con salidas no se borra: se desactiva. */
export function eliminarSucursal(db: Database, sucId: number): 'desactivada' | 'eliminada' {
  const { c } = db.prepare('SELECT COUNT(*) c FROM salidas WHERE sucursal_id=?').get(sucId) as {
    c: number;
  };
  if (c) {
    db.prepare('UPDATE sucursales SET activo=0 WHERE id=?').run(sucId);
    return 'desactivada';
  }
  db.prepare('DELETE FROM sucursales WHERE id=?').run(sucId);
  return 'eliminada';
}
