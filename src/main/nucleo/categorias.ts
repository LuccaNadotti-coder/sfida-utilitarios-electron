/* ---------------------------------------------------------------------------
 * Categorías. Port de `sfida_core.py`.
 *
 * SOLO EXISTEN DOS: ÚTILES DE OFICINA y ÚTILES DE LIMPIEZA. No se pueden crear
 * más. `migrarCategorias()` corre sola al abrir la base y manda a oficina todo
 * lo que venga de categorías viejas.
 * ------------------------------------------------------------------------- */
import type { Database } from 'better-sqlite3';

import { CAT_LIMPIEZA, CAT_OFICINA, CATEGORIAS_FIJAS } from '../db/esquema';
import { auditar } from './config';
import { ErrorNegocio } from './errores';
import { norm, normalizarNombre, sinTildes } from './textos';

export { CAT_LIMPIEZA, CAT_OFICINA, CATEGORIAS_FIJAS };

/** Reconoce el nombre escrito sin tilde y devuelve el bueno. */
export const CANON_CATEGORIA: Record<string, string> = {
  'UTILES DE OFICINA': CAT_OFICINA,
  'UTILES DE LIMPIEZA': CAT_LIMPIEZA,
};

/** Cómo se reparten las categorías viejas al pasar a las dos nuevas. */
const CAT_VIEJAS: Record<string, string> = {
  'UTILES DE OFICINA': CAT_OFICINA,
  'UTILES DE ESCRITORIO': CAT_OFICINA,
  OFICINA: CAT_OFICINA,
  ESCRITORIO: CAT_OFICINA,
  OTROS: CAT_OFICINA,
  'UTILES DE LIMPIEZA': CAT_LIMPIEZA,
  LIMPIEZA: CAT_LIMPIEZA,
};

export interface Categoria {
  id: number;
  nombre: string;
}

export function listarCategorias(db: Database): Categoria[] {
  return db.prepare('SELECT * FROM categorias ORDER BY nombre').all() as Categoria[];
}

export function buscarCategoria(db: Database, nombre: unknown): Categoria | undefined {
  return db
    .prepare('SELECT * FROM categorias WHERE nombre = ? COLLATE NOCASE')
    .get(norm(nombre)) as Categoria | undefined;
}

export function idCategoria(db: Database, nombre: unknown, crear = true): number | null {
  const fila = buscarCategoria(db, nombre);
  if (fila) return fila.id;
  return crear ? guardarCategoria(db, nombre) : null;
}

/**
 * Port de `guardar_categoria()`.
 *
 * Rechaza cualquier nombre que no sea una de las dos fijas y devuelve siempre
 * la forma canónica CON TILDE.
 */
export function guardarCategoria(db: Database, nombre: unknown, catId: number | null = null): number {
  let n = normalizarNombre(nombre);
  if (!n) throw new ErrorNegocio('Escriba el nombre de la categoria.');
  const canonica = CANON_CATEGORIA[sinTildes(n)];
  if (!canonica) {
    throw new ErrorNegocio(`Solo existen dos categorias: ${CAT_OFICINA} y ${CAT_LIMPIEZA}.`);
  }
  n = canonica;
  const ya = buscarCategoria(db, n);
  if (ya && ya.id !== catId) throw new ErrorNegocio('Ya existe una categoria con ese nombre.');
  try {
    if (catId) {
      db.prepare('UPDATE categorias SET nombre=? WHERE id=?').run(n, catId);
      return catId;
    }
    return db.prepare('INSERT INTO categorias(nombre) VALUES (?)').run(n).lastInsertRowid as number;
  } catch {
    throw new ErrorNegocio('Ya existe una categoria con ese nombre.');
  }
}

/** Port de `eliminar_categoria()`: bloquea si hay artículos adentro. */
export function eliminarCategoria(db: Database, catId: number): void {
  const { c } = db.prepare('SELECT COUNT(*) c FROM articulos WHERE categoria_id=?').get(catId) as {
    c: number;
  };
  if (c) {
    throw new ErrorNegocio(
      `No se puede borrar: hay ${c} articulos en esa categoria. Cambielos de categoria primero.`,
    );
  }
  db.prepare('DELETE FROM categorias WHERE id=?').run(catId);
}

/** Port de `categoria_corta()`: «ÚTILES DE LIMPIEZA» -> «LIMPIEZA». */
export function categoriaCorta(nombre: unknown): string {
  const t = sinTildes(nombre);
  if (!t) return '-';
  if (t.includes('LIMPIEZA')) return 'LIMPIEZA';
  if (t.includes('OFICINA')) return 'OFICINA';
  return String(nombre);
}

/**
 * Port de `_migrar_categorias()`. Corre sola al abrir la base.
 *
 * 1. Asegura que existan las dos fijas (y corrige el nombre al canónico con
 *    tilde si difiere solo en mayúsculas).
 * 2. Mueve los artículos de cualquier otra categoría: lo desconocido va a
 *    LIMPIEZA solo si el nombre contiene «LIMPIEZA», si no a OFICINA.
 * 3. Los artículos sin categoría van a oficina.
 */
export function migrarCategorias(db: Database): void {
  const filas = db.prepare('SELECT id, nombre FROM categorias').all() as Categoria[];
  const hayArticulos = db.prepare('SELECT 1 FROM articulos LIMIT 1').get();
  if (filas.length === 0 && !hayArticulos) return;

  const destino: Record<string, number> = {};
  for (const fija of CATEGORIAS_FIJAS) {
    const f = db.prepare('SELECT id FROM categorias WHERE nombre=? COLLATE NOCASE').get(fija) as
      | { id: number }
      | undefined;
    if (f) {
      destino[fija] = f.id;
      db.prepare('UPDATE categorias SET nombre=? WHERE id=?').run(fija, f.id);
    } else {
      destino[fija] = db.prepare('INSERT INTO categorias(nombre) VALUES (?)').run(fija)
        .lastInsertRowid as number;
    }
  }

  const idsFijas = new Set(Object.values(destino));
  let movidos = 0;
  for (const f of filas) {
    if (idsFijas.has(f.id)) continue;
    const clave = sinTildes(f.nombre);
    const nueva = CAT_VIEJAS[clave] ?? (clave.includes('LIMPIEZA') ? CAT_LIMPIEZA : CAT_OFICINA);
    const r = db
      .prepare('UPDATE articulos SET categoria_id=? WHERE categoria_id=?')
      .run(destino[nueva]!, f.id);
    db.prepare('DELETE FROM categorias WHERE id=?').run(f.id);
    movidos += r.changes || 0;
  }

  db.prepare('UPDATE articulos SET categoria_id=? WHERE categoria_id IS NULL').run(
    destino[CAT_OFICINA]!,
  );

  if (movidos) {
    auditar(db, 'CATEGORIAS', `Se unificaron en 2 categorias (${movidos} articulos movidos)`);
  }
}
