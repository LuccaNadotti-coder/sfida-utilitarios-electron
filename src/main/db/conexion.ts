/* ---------------------------------------------------------------------------
 * Apertura de la base.
 *
 * Esto NO importa nada de Electron a propósito: la lógica de datos tiene que
 * poder probarse sin abrir ninguna ventana.
 * ------------------------------------------------------------------------- */
import { existsSync } from 'node:fs';

import Database from 'better-sqlite3';
import type { Database as BaseDatos } from 'better-sqlite3';

import { migrarCategorias } from '../nucleo/categorias';
import { migrarUnidades } from '../nucleo/mantenimiento';
import { asegurarCarpeta } from '../rutas';
import { CATEGORIAS_FIJAS, ESQUEMA_INDICES, ESQUEMA_TABLAS } from './esquema';
import { migrar, versionDe, type ResultadoMigracion } from './migraciones';
import {
  respaldarConBase,
  respaldoAutomatico,
  type ResultadoRespaldo,
  type ResultadoRespaldoAuto,
} from './respaldo';

export interface AperturaBd {
  db: BaseDatos;
  ruta: string;
  existiaAntes: boolean;
  respaldo: ResultadoRespaldo;
  /** Copia rotativa de cada apertura. `null` cuando se pide sin respaldos. */
  respaldoAuto: ResultadoRespaldoAuto | null;
  migracion: ResultadoMigracion | null;
  version: number;
}

/**
 * Abre (o crea) la base, la migra si hace falta y deja el esquema listo.
 *
 * @param ruta         archivo .db
 * @param conRespaldo  hacer la copia de seguridad previa (se apaga en pruebas)
 */
export function conectar(ruta: string, conRespaldo = true): AperturaBd {
  const existiaAntes = existsSync(ruta);
  asegurarCarpeta(dirnameDe(ruta));

  const db = new Database(ruta);

  // SQLite trae las claves foráneas APAGADAS de fábrica y hay que prenderlas
  // en CADA conexión. Sin esto, los ON DELETE CASCADE de ingreso_det y
  // salida_det no se disparan y anular una boleta dejaría líneas huérfanas.
  db.pragma('foreign_keys = ON');

  // EL ORDEN DE ESTOS PASOS IMPORTA, y no es el obvio:
  //
  //   1. tablas    — crea las que falten. Sobre una base v4 no cambia nada.
  //   2. respaldo  — antes de tocar un solo dato. Si la migración sale mal, el
  //                  archivo de antes sigue estando.
  //   3. unidades  — normaliza el texto de la unidad ('GALON' -> 'GAL'). VA
  //                  ANTES de migrar: la conversión a unidad chica busca el
  //                  factor por el código, y con el texto viejo no lo
  //                  encontraría y convertiría mal SIN AVISAR.
  //   4. migrar    — acá aparecen las columnas nuevas (nro_proveedor y las de
  //                  unidad de origen) y se convierte el stock.
  //   5. índices   — recién ahora, porque `ix_ing_prov` y `ux_ing_nrodoc` se
  //                  apoyan en columnas del paso 4.
  //
  // Si los índices se crearan junto con las tablas, abrir una base v4 fallaría
  // con «no such column: nro_proveedor» y no habría forma de migrarla.
  db.exec(ESQUEMA_TABLAS);

  const respaldo = conRespaldo
    ? respaldarConBase(db, ruta, existiaAntes)
    : ({ hecho: false, motivo: 'base nueva, no hay nada que respaldar' } as ResultadoRespaldo);

  // La copia rotativa de cada apertura. También va ANTES de migrar, y por el
  // mismo motivo: es la única forma de volver atrás si la migración sale mal.
  const respaldoAuto = conRespaldo && existiaAntes ? respaldoAutomatico(ruta) : null;

  migrarUnidades(db);
  const migracion = migrar(db);

  db.exec(ESQUEMA_INDICES);
  datosIniciales(db);
  migrarCategorias(db);

  return { db, ruta, existiaAntes, respaldo, respaldoAuto, migracion, version: versionDe(db) };
}

/**
 * Crea el esquema completo de una vez. Solo para bases NUEVAS (scripts, datos
 * de demo): sobre una base v4 hay que usar `conectar()`, que intercala la
 * migración entre las tablas y los índices.
 */
export function crearEsquema(db: BaseDatos): void {
  db.exec(ESQUEMA_TABLAS);
  db.exec(ESQUEMA_INDICES);
  datosIniciales(db);
  migrarCategorias(db);
  migrarUnidades(db);
}

/** Si no hay categorías, inserta las dos fijas. */
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
