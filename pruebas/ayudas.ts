/* ---------------------------------------------------------------------------
 * Ayudas comunes de las pruebas.
 * ------------------------------------------------------------------------- */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';

/**
 * Carpeta temporal propia de cada prueba, que se borra sola.
 *
 * El borrado es TOLERANTE a propósito: en Windows, SQLite puede tardar un
 * instante en soltar el archivo y `rmSync` tira EPERM. Que falle la limpieza
 * no puede hacer fallar la prueba — si no, un detalle del sistema de archivos
 * se hace pasar por un error de la lógica, que es justo lo que no queremos.
 */
export function carpetaTemporal(): { ruta: string; borrar: () => void } {
  const ruta = mkdtempSync(join(tmpdir(), 'sfida-prueba-'));
  return {
    ruta,
    borrar: () => {
      try {
        rmSync(ruta, { recursive: true, force: true, maxRetries: 3, retryDelay: 60 });
      } catch {
        /* el sistema operativo se encarga de los temporales */
      }
    },
  };
}

/**
 * Firma normalizada del esquema de una base: tablas, columnas (con tipo,
 * NOT NULL, default y clave primaria), claves foráneas e índices.
 *
 * Se ordena para poder comparar dos bases sin depender del orden de creación.
 */
export function firmaEsquema(db: Database): string[] {
  const salida: string[] = [];

  const objetos = db
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master " +
        "WHERE name NOT LIKE 'sqlite_autoindex%' ORDER BY type DESC, name",
    )
    .all() as { type: string; name: string; tbl_name: string; sql: string | null }[];

  for (const o of objetos) {
    const sql = (o.sql ?? '').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
    salida.push(`${o.type}|${o.name}|${o.tbl_name}|${sql}`);
  }

  const tablas = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];

  for (const { name } of tablas) {
    for (const c of db.prepare(`PRAGMA table_info(${name})`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>) {
      salida.push(
        `col|${name}|${c.cid}|${c.name}|${c.type}|nn=${c.notnull}|dflt=${c.dflt_value}|pk=${c.pk}`,
      );
    }
    for (const f of db.prepare(`PRAGMA foreign_key_list(${name})`).all() as Array<{
      id: number;
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>) {
      salida.push(`fk|${name}|${f.id}|${f.table}|${f.from}|${f.to}|${f.on_delete}`);
    }
    for (const i of db.prepare(`PRAGMA index_list(${name})`).all() as Array<{
      name: string;
      unique: number;
      origin: string;
    }>) {
      salida.push(`idx|${name}|${i.name}|unique=${i.unique}|origin=${i.origin}`);
    }
  }

  return salida.sort();
}
