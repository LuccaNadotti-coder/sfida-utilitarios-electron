/* ---------------------------------------------------------------------------
 * El esquema tiene que ser IDÉNTICO al de la versión Python.
 *
 * Las dos aplicaciones abren el mismo archivo .db. Si un día alguien agrega
 * una columna, renombra un índice o cambia un DEFAULT "para mejorar", las dos
 * versiones dejan de entenderse y se rompe en el almacén, no acá.
 *
 * El archivo `fijos/esquema-python.txt` se generó leyendo la base real creada
 * por `sfida_core.py` (%LOCALAPPDATA%\SFIDA\sfida_inventario.db) y es el
 * contrato. No se toca a mano.
 * ------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { CATEGORIAS_FIJAS } from '../src/main/db/esquema';
import { carpetaTemporal, firmaEsquema } from './ayudas';

const ESPERADO = readFileSync(join(__dirname, 'fijos', 'esquema-python.txt'), 'utf8')
  .split('\n')
  .filter(Boolean);

describe('esquema de la base', () => {
  it('coincide exactamente con el que crea la versión Python', () => {
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'nueva.db'), false);
      expect(firmaEsquema(db)).toEqual(ESPERADO);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('deja las claves foráneas ENCENDIDAS en la conexión', () => {
    // SQLite las trae apagadas de fábrica. Sin esto, los ON DELETE CASCADE de
    // ingreso_det y salida_det no se disparan y anular una boleta dejaría
    // líneas huérfanas.
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'fk.db'), false);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('el CASCADE borra el detalle al borrar la cabecera', () => {
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'casc.db'), false);
      const cat = db.prepare('SELECT id FROM categorias LIMIT 1').get() as { id: number };
      const art = db
        .prepare(
          'INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES (?,?,?,?,?)',
        )
        .run('OFI-0001', 'LAPICERO AZUL', cat.id, 'UND', 0).lastInsertRowid as number;
      const ing = db
        .prepare('INSERT INTO ingresos(tipo_doc,nro_documento,fecha) VALUES (?,?,?)')
        .run('BOLETA', 'B001-1', '2026-08-22').lastInsertRowid as number;
      db.prepare(
        'INSERT INTO ingreso_det(ingreso_id,articulo_id,cantidad,costo_unitario) VALUES (?,?,?,?)',
      ).run(ing, art, 10, 0);

      db.prepare('DELETE FROM ingresos WHERE id = ?').run(ing);

      const { c } = db.prepare('SELECT COUNT(*) c FROM ingreso_det').get() as { c: number };
      expect(c).toBe(0);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('siembra exactamente las dos categorías fijas, con sus tildes', () => {
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'cat.db'), false);
      const filas = db.prepare('SELECT nombre FROM categorias ORDER BY nombre').all() as {
        nombre: string;
      }[];
      expect(filas.map((f) => f.nombre).sort()).toEqual([...CATEGORIAS_FIJAS].sort());
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('rechaza una cantidad de cero o negativa en el detalle (CHECK del esquema)', () => {
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'chk.db'), false);
      const cat = db.prepare('SELECT id FROM categorias LIMIT 1').get() as { id: number };
      const art = db
        .prepare(
          'INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES (?,?,?,?,?)',
        )
        .run('OFI-0002', 'BORRADOR', cat.id, 'UND', 0).lastInsertRowid as number;
      const ing = db
        .prepare('INSERT INTO ingresos(tipo_doc,nro_documento,fecha) VALUES (?,?,?)')
        .run('BOLETA', 'B001-2', '2026-08-22').lastInsertRowid as number;

      expect(() =>
        db
          .prepare('INSERT INTO ingreso_det(ingreso_id,articulo_id,cantidad) VALUES (?,?,?)')
          .run(ing, art, 0),
      ).toThrow();
      db.close();
    } finally {
      tmp.borrar();
    }
  });
});
