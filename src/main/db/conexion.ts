/* ---------------------------------------------------------------------------
 * Apertura de la base. Port de `conectar()` / `crear_esquema()` de
 * `sfida_core.py`.
 *
 * Esto NO importa nada de Electron a propósito: la lógica de datos tiene que
 * poder probarse sin abrir ninguna ventana (es el equivalente de sfida_core.py,
 * que tampoco importaba PySide6).
 * ------------------------------------------------------------------------- */
import { existsSync } from 'node:fs';

import Database from 'better-sqlite3';
import type { Database as BaseDatos } from 'better-sqlite3';

import { migrarCategorias } from '../nucleo/categorias';
import { migrarUnidades } from '../nucleo/mantenimiento';
import { asegurarCarpeta } from '../rutas';
import { CATEGORIAS_FIJAS, ESQUEMA } from './esquema';
import { respaldarConBase, type ResultadoRespaldo } from './respaldo';

export interface AperturaBd {
  db: BaseDatos;
  ruta: string;
  /** El archivo ya existía antes de abrirlo (no lo creamos nosotros). */
  existiaAntes: boolean;
  respaldo: ResultadoRespaldo;
}

/**
 * Abre (o crea) la base y deja el esquema listo.
 *
 * @param ruta            archivo .db
 * @param conRespaldo     hacer la copia de seguridad previa (se apaga en las pruebas)
 */
export function conectar(ruta: string, conRespaldo = true): AperturaBd {
  const existiaAntes = existsSync(ruta);
  asegurarCarpeta(dirnameDe(ruta));

  const db = new Database(ruta);

  // SQLite trae las claves foráneas APAGADAS de fábrica y hay que prenderlas
  // en CADA conexión. Sin esto, los ON DELETE CASCADE de ingreso_det y
  // salida_det no se disparan y anular una boleta dejaría líneas huérfanas.
  // La versión Python hace lo mismo en conectar().
  db.pragma('foreign_keys = ON');

  crearEsquema(db);

  const respaldo = conRespaldo
    ? respaldarConBase(db, ruta, existiaAntes)
    : ({ hecho: false, motivo: 'base nueva, no hay nada que respaldar' } as ResultadoRespaldo);

  return { db, ruta, existiaAntes, respaldo };
}

/**
 * Crea las tablas si faltan, siembra las categorías y corre las migraciones
 * automáticas — igual que `crear_esquema()` en Python.
 *
 * Las migraciones corren SOLAS en cada apertura, no una vez: son idempotentes
 * y así una base vieja se arregla con solo abrirla.
 */
export function crearEsquema(db: BaseDatos): void {
  db.exec(ESQUEMA);
  datosIniciales(db);
  migrarCategorias(db);
  migrarUnidades(db);
}

/** Port de `_datos_iniciales()`: si no hay categorías, inserta las dos fijas. */
function datosIniciales(db: BaseDatos): void {
  const { c } = db.prepare('SELECT COUNT(*) c FROM categorias').get() as { c: number };
  if (c > 0) return;
  const insertar = db.prepare('INSERT INTO categorias(nombre) VALUES (?)');
  const tx = db.transaction(() => {
    for (const nombre of CATEGORIAS_FIJAS) insertar.run(nombre);
  });
  tx();
}

function dirnameDe(ruta: string): string {
  const i = Math.max(ruta.lastIndexOf('\\'), ruta.lastIndexOf('/'));
  return i > 0 ? ruta.slice(0, i) : '.';
}
