/* ---------------------------------------------------------------------------
 * El esquema no cambia sin querer.
 *
 * Hasta la v4 esta prueba comparaba contra el esquema de la versión Python,
 * porque las dos apps abrían el mismo archivo. **Desde la v5 ya no**: se
 * agregaron columnas a propósito (el N° del proveedor, la unidad digitada de
 * cada línea) y la app de Python no las entiende.
 *
 * Lo que se vigila ahora es otra cosa, igual de importante: que el esquema no
 * cambie SIN QUERER. `fijos/esquema-v5.txt` es el contrato; si alguien agrega
 * una columna o renombra un índice, esta prueba falla y hay que actualizar el
 * fijo a mano, que es exactamente el momento de preguntarse si hace falta una
 * migración.
 *
 * `fijos/esquema-python.txt` se conserva para la prueba de divergencia de
 * abajo, que deja por escrito EN QUÉ se separaron.
 * ------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { CATEGORIAS_FIJAS, VERSION_ESQUEMA } from '../src/main/db/esquema';
import { carpetaTemporal, firmaEsquema } from './ayudas';

const leer = (nombre: string): string[] =>
  readFileSync(join(__dirname, 'fijos', nombre), 'utf8').split('\n').filter(Boolean);

const ESPERADO_V5 = leer('esquema-v5.txt');
const ESQUEMA_PYTHON = leer('esquema-python.txt');

describe('esquema de la base', () => {
  it('coincide con el fijo de la v5', () => {
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'nueva.db'), false);
      expect(firmaEsquema(db)).toEqual(ESPERADO_V5);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('se marca la versión del esquema en config', () => {
    const tmp = carpetaTemporal();
    try {
      const { db, version } = conectar(join(tmp.ruta, 'ver.db'), false);
      expect(version).toBe(VERSION_ESQUEMA);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('documenta EN QUÉ se separó de la versión Python', () => {
    // Si esta lista crece, es que se agregó algo más: hay que decidir a
    // conciencia si `migraciones.ts` lo cubre.
    const columnasV5 = new Set(
      ESPERADO_V5.filter((l) => l.startsWith('col|')).map((l) => {
        const p = l.split('|');
        return `${p[1]}.${p[3]}`;
      }),
    );
    const columnasPy = new Set(
      ESQUEMA_PYTHON.filter((l) => l.startsWith('col|')).map((l) => {
        const p = l.split('|');
        return `${p[1]}.${p[3]}`;
      }),
    );

    // 1. Columnas que EXISTEN en la v5 y no existían en Python.
    const agregadas = [...columnasV5].filter((c) => !columnasPy.has(c)).sort();
    expect(agregadas).toEqual([
      'ingreso_det.cantidad_origen',
      'ingreso_det.unidad_origen',
      'ingresos.nro_proveedor',
      'salida_det.cantidad_origen',
      'salida_det.unidad_origen',
    ]);

    // 2. No se BORRÓ ninguna columna: una base v4 migrada no pierde datos.
    expect([...columnasPy].filter((c) => !columnasV5.has(c))).toEqual([]);

    // 3. Índices nuevos. Los `ix_*_fecha` son por rendimiento; `ix_ing_prov`
    //    apoya la regla de «no registrar dos veces la misma boleta»; y
    //    `ux_ing_nrodoc` reemplaza al UNIQUE que en Python vivía dentro de la
    //    tabla `ingresos`. Es un índice y no una restricción de tabla porque
    //    una base v4 ya trae el suyo y ALTER TABLE no puede cambiarlo: así la
    //    base nueva y la migrada terminan con la misma regla.
    const indicesV5 = ESPERADO_V5.filter((l) => l.startsWith('index|')).map((l) => l.split('|')[1]);
    const indicesPy = ESQUEMA_PYTHON.filter((l) => l.startsWith('index|')).map((l) => l.split('|')[1]);
    expect(indicesV5.filter((i) => !indicesPy.includes(i)).sort()).toEqual([
      'ix_aju_fecha',
      'ix_ing_fecha',
      'ix_ing_prov',
      'ix_sal_fecha',
      'ux_ing_nrodoc',
    ]);

    // 4. El único DEFAULT que cambió: la unidad de fábrica pasó del texto
    //    viejo «UNIDAD» al código «UND» del catálogo.
    const defaultDe = (fijo: string[], col: string): string | undefined =>
      fijo.find((l) => l.startsWith(`col|${col}|`) || l.includes(`|${col.split('.')[1]}|`))
        ? fijo.find((l) => {
            const p = l.split('|');
            return l.startsWith('col|') && `${p[1]}.${p[3]}` === col;
          })
        : undefined;
    expect(defaultDe(ESQUEMA_PYTHON, 'articulos.unidad')).toContain("dflt='UNIDAD'");
    expect(defaultDe(ESPERADO_V5, 'articulos.unidad')).toContain("dflt='UND'");
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
