/* ---------------------------------------------------------------------------
 * Migración de una base v4 (compatible con Python) a la v5.
 *
 * La v5 rompe la compatibilidad a propósito. Esta migración:
 *   1. Agrega las columnas nuevas si faltan (ALTER TABLE, no destructivo).
 *   2. Convierte el stock existente a la UNIDAD CHICA de cada artículo.
 *   3. Le pone número interno a los ingresos que no lo tenían.
 *   4. Deja constancia en `config` y en la auditoría.
 *
 * Es idempotente: correrla dos veces no hace nada la segunda vez.
 *
 * ANTES de tocar nada se hace un respaldo con fecha (lo dispara `conectar()`).
 * ------------------------------------------------------------------------- */
import type { Database } from 'better-sqlite3';

import { auditar, getConfig, setConfig } from '../nucleo/config';
import { BASE_FAMILIA, infoUnidad } from '../nucleo/unidades';
import { VERSION_ESQUEMA } from './esquema';

const CLAVE_VERSION = 'esquema_version';

/** Columnas que hay que agregar al pasar de v4 a v5. */
const COLUMNAS_V5: Array<[tabla: string, columna: string, definicion: string]> = [
  ['ingresos', 'nro_proveedor', "TEXT NOT NULL DEFAULT ''"],
  ['ingreso_det', 'cantidad_origen', 'REAL'],
  ['ingreso_det', 'unidad_origen', 'TEXT'],
  ['salida_det', 'cantidad_origen', 'REAL'],
  ['salida_det', 'unidad_origen', 'TEXT'],
];

function tieneColumna(db: Database, tabla: string, columna: string): boolean {
  const filas = db.prepare(`PRAGMA table_info(${tabla})`).all() as Array<{ name: string }>;
  return filas.some((f) => f.name === columna);
}

export interface ResultadoMigracion {
  desde: number;
  hasta: number;
  columnasAgregadas: number;
  articulosConvertidos: number;
  ingresosNumerados: number;
}

/** Versión del esquema que tiene la base abierta. */
export function versionDe(db: Database): number {
  const v = getConfig(db, CLAVE_VERSION);
  if (v) return Number(v) || 0;
  // Sin marca: si ya tiene las columnas de la v5, es v5; si no, es v4.
  return tieneColumna(db, 'ingresos', 'nro_proveedor') ? VERSION_ESQUEMA : 4;
}

/**
 * Lleva la base a la versión actual. Devuelve `null` si no había nada que hacer.
 */
export function migrar(db: Database): ResultadoMigracion | null {
  const desde = versionDe(db);
  if (desde >= VERSION_ESQUEMA) {
    setConfig(db, CLAVE_VERSION, VERSION_ESQUEMA);
    return null;
  }

  let columnasAgregadas = 0;
  let articulosConvertidos = 0;
  let ingresosNumerados = 0;

  const tx = db.transaction(() => {
    // --- 1. columnas nuevas -------------------------------------------------
    for (const [tabla, columna, definicion] of COLUMNAS_V5) {
      if (!tieneColumna(db, tabla, columna)) {
        db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
        columnasAgregadas += 1;
      }
    }

    // --- 2. stock a la unidad chica ----------------------------------------
    //
    // Hasta la v4, un artículo con unidad GAL guardaba «5» y eso significaba
    // 5 galones. Desde la v5 la unidad del artículo es la CHICA (litros), así
    // que ese 5 pasa a ser 18.925 y la unidad del artículo pasa a ser L.
    //
    // Solo se tocan los artículos cuya unidad NO es ya la base de su familia.
    const articulos = db.prepare('SELECT id, unidad FROM articulos').all() as Array<{
      id: number;
      unidad: string;
    }>;

    const escalarIngreso = db.prepare(
      `UPDATE ingreso_det
          SET cantidad_origen = cantidad,
              unidad_origen   = ?,
              cantidad        = cantidad * ?,
              costo_unitario  = CASE WHEN ? > 0 THEN costo_unitario / ? ELSE costo_unitario END
        WHERE articulo_id = ?`,
    );
    const escalarSalida = db.prepare(
      `UPDATE salida_det
          SET cantidad_origen = cantidad,
              unidad_origen   = ?,
              cantidad        = cantidad * ?
        WHERE articulo_id = ?`,
    );
    const escalarAjuste = db.prepare(
      'UPDATE ajustes SET cantidad = cantidad * ? WHERE articulo_id = ?',
    );
    const cambiarUnidad = db.prepare(
      'UPDATE articulos SET unidad = ?, stock_minimo = stock_minimo * ? WHERE id = ?',
    );

    for (const a of articulos) {
      const u = infoUnidad(a.unidad);
      const base = BASE_FAMILIA[u.familia];
      if (u.codigo === base || u.factor === 1) continue;

      // El precio también se reescala: si un galón costaba S/ 22, el litro
      // cuesta 22 / 3.785. Si no, la valorización se dispararía por 3.785.
      escalarIngreso.run(u.codigo, u.factor, u.factor, u.factor, a.id);
      escalarSalida.run(u.codigo, u.factor, a.id);
      escalarAjuste.run(u.factor, a.id);
      cambiarUnidad.run(base, u.factor, a.id);
      articulosConvertidos += 1;
    }

    // --- 3. numerar los ingresos viejos ------------------------------------
    //
    // En la v4 `nro_documento` era el número del proveedor. Pasa a
    // `nro_proveedor`, y el interno se genera nuevo.
    const ingresos = db
      .prepare('SELECT id, nro_documento, fecha FROM ingresos ORDER BY fecha, id')
      .all() as Array<{ id: number; nro_documento: string; fecha: string }>;

    const actualizar = db.prepare(
      'UPDATE ingresos SET nro_proveedor = ?, nro_documento = ? WHERE id = ?',
    );
    // Se arranca desde el número más alto que YA exista de cada año. Si no,
    // un ingreso que por casualidad ya tuviera formato interno chocaría con
    // uno generado acá, y el índice único de más adelante no dejaría abrir la
    // base.
    const porAnio = new Map<string, number>();
    for (const i of ingresos) {
      const m = /^I(\d{4})-(\d{4})$/.exec(i.nro_documento);
      if (!m) continue;
      const anio = m[1]!;
      porAnio.set(anio, Math.max(porAnio.get(anio) ?? 0, Number(m[2])));
    }

    for (const i of ingresos) {
      // Si ya tiene formato interno (I2026-0001), no se toca.
      if (/^I\d{4}-\d{4}$/.test(i.nro_documento)) continue;
      const anio = (i.fecha || '').slice(0, 4) || String(new Date().getFullYear());
      const n = (porAnio.get(anio) ?? 0) + 1;
      porAnio.set(anio, n);
      actualizar.run(i.nro_documento, `I${anio}-${String(n).padStart(4, '0')}`, i.id);
      ingresosNumerados += 1;
    }

    setConfig(db, CLAVE_VERSION, VERSION_ESQUEMA);
  });

  tx();

  auditar(
    db,
    'MIGRACION ESQUEMA',
    `v${desde} -> v${VERSION_ESQUEMA}: ${columnasAgregadas} columnas, ` +
      `${articulosConvertidos} articulos a unidad chica, ${ingresosNumerados} ingresos numerados`,
  );

  return { desde, hasta: VERSION_ESQUEMA, columnasAgregadas, articulosConvertidos, ingresosNumerados };
}
