/* ---------------------------------------------------------------------------
 * Port de los BLOQUES 3 y 4 de `test_core.py`:
 *   - CATEGORÍAS FIJAS (solo dos, con migración automática)
 *   - UNIDADES DE MEDIDA Y SUS EQUIVALENCIAS
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { listarArticulos, obtenerArticulo, guardarArticulo } from '../src/main/nucleo/articulos';
import {
  CANON_CATEGORIA,
  CAT_LIMPIEZA,
  CAT_OFICINA,
  CATEGORIAS_FIJAS,
  buscarCategoria,
  categoriaCorta,
  listarCategorias,
} from '../src/main/nucleo/categorias';
import {
  BASE_FAMILIA,
  UNIDADES,
  convertirABase,
  equivalenciaUnidad,
  etiquetaUnidad,
  fmtCantidad,
  normalizarUnidad,
} from '../src/main/nucleo/unidades';
import { carpetaTemporal } from './ayudas';

describe('solo dos categorias', () => {
  it('las dos categorias fijas son oficina y limpieza', () => {
    expect([...CATEGORIAS_FIJAS]).toEqual(['ÚTILES DE OFICINA', 'ÚTILES DE LIMPIEZA']);
  });

  it('la categoria se reconoce aunque se escriba sin tilde', () => {
    expect(CANON_CATEGORIA['UTILES DE OFICINA']).toBe(CAT_OFICINA);
    expect(CANON_CATEGORIA['UTILES DE LIMPIEZA']).toBe(CAT_LIMPIEZA);
  });

  it('categoria_corta acorta para las tablas', () => {
    expect(categoriaCorta(CAT_LIMPIEZA)).toBe('LIMPIEZA');
    expect(categoriaCorta(CAT_OFICINA)).toBe('OFICINA');
    expect(categoriaCorta('')).toBe('-');
  });

  it('al abrir una base vieja quedan solo dos categorias y los articulos se mudan', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'vieja.db');

      // Una base "vieja", con las cuatro categorías de antes
      let a = conectar(ruta, false);
      a.db.prepare("INSERT INTO categorias(nombre) VALUES ('Útiles de Escritorio')").run();
      a.db.prepare("INSERT INTO categorias(nombre) VALUES ('Otros')").run();
      const esc = buscarCategoria(a.db, 'Útiles de Escritorio')!.id;
      const otr = buscarCategoria(a.db, 'Otros')!.id;
      a.db
        .prepare(
          "INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES ('ESC-0001','ENGRAPADOR',?,'UND',1)",
        )
        .run(esc);
      a.db
        .prepare(
          "INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES ('ART-0009','FOCO LED',?,'UND',1)",
        )
        .run(otr);
      a.db
        .prepare(
          "INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES ('SIN-0001','ARTICULO SIN CATEGORIA',NULL,'UND',1)",
        )
        .run();
      a.db.close();

      // Al reabrir corre la migración sola
      a = conectar(ruta, false);
      const cats = listarCategorias(a.db).map((c) => c.nombre);
      expect(cats).toHaveLength(2);

      const porCod = Object.fromEntries(listarArticulos(a.db).map((x) => [x.codigo, x.categoria]));
      expect(porCod['ESC-0001']).toBe(CAT_OFICINA); // útiles de escritorio -> oficina
      expect(porCod['ART-0009']).toBe(CAT_OFICINA); // «Otros» -> oficina
      expect(porCod['SIN-0001']).toBe(CAT_OFICINA); // sin categoría -> oficina
      a.db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('una categoria desconocida con «LIMPIEZA» en el nombre va a limpieza', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'desconocida.db');
      let a = conectar(ruta, false);
      a.db.prepare("INSERT INTO categorias(nombre) VALUES ('COSAS DE LIMPIEZA PROFUNDA')").run();
      const id = buscarCategoria(a.db, 'COSAS DE LIMPIEZA PROFUNDA')!.id;
      a.db
        .prepare(
          "INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES ('X-1','TRAPO',?,'UND',1)",
        )
        .run(id);
      a.db.close();

      a = conectar(ruta, false);
      const porCod = Object.fromEntries(listarArticulos(a.db).map((x) => [x.codigo, x.categoria]));
      expect(porCod['X-1']).toBe(CAT_LIMPIEZA);
      a.db.close();
    } finally {
      tmp.borrar();
    }
  });
});

describe('unidades de medida', () => {
  it('el catalogo de unidades no esta vacio', () => {
    expect(UNIDADES.length).toBeGreaterThanOrEqual(15);
  });

  it('no hay codigos de unidad repetidos', () => {
    const codigos = UNIDADES.map((u) => u[0]);
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('cada familia tiene su unidad base', () => {
    expect(UNIDADES.every((u) => u[2] in BASE_FAMILIA)).toBe(true);
  });

  it('un galon equivale a 3.785 litros', () => {
    expect(equivalenciaUnidad('GAL')).toBe('1 GAL = 3.785 L');
  });

  it('el litro es la unidad base y no muestra equivalencia', () => {
    expect(equivalenciaUnidad('L')).toBe('');
  });

  it('una docena son 12 unidades', () => {
    expect(equivalenciaUnidad('DOC')).toBe('1 DOC = 12 UND');
  });

  it('un bidon de 20 son 20 litros', () => {
    expect(equivalenciaUnidad('BD20')).toBe('1 BD20 = 20 L');
  });

  it('un saco son 50 kilos', () => {
    expect(equivalenciaUnidad('SAC')).toBe('1 SAC = 50 KG');
  });

  it('las unidades de factor 1 no muestran equivalencia aunque no sean la base', () => {
    // CJA, PQT, BOL, JGO, ROL y BLQ: comportamiento no obvio nº 13.
    for (const cod of ['CJA', 'PQT', 'BOL', 'JGO', 'ROL', 'BLQ']) {
      expect(equivalenciaUnidad(cod)).toBe('');
    }
  });

  it('2 galones son 7.57 litros', () => {
    const [val, base] = convertirABase(2, 'GAL');
    expect(Math.abs(val - 7.57)).toBeLessThan(0.001);
    expect(base).toBe('L');
  });

  it('500 gramos son 0.5 kilos', () => {
    const [val, base] = convertirABase(500, 'GR');
    expect(Math.abs(val - 0.5)).toBeLessThan(0.0001);
    expect(base).toBe('KG');
  });

  it('3 docenas son 36 unidades', () => {
    const [val, base] = convertirABase(3, 'DOC');
    expect(val).toBe(36);
    expect(base).toBe('UND');
  });

  it('fmt_cantidad muestra la equivalencia entre parentesis', () => {
    expect(fmtCantidad(3, 'GAL')).toBe('3 GAL (11.36 L)');
  });

  it('fmt_cantidad no repite cuando ya es la unidad base', () => {
    expect(fmtCantidad(3, 'L')).toBe('3 L');
  });

  it('etiqueta_unidad arma el texto de los combos', () => {
    expect(etiquetaUnidad('GAL')).toBe('GAL · Galón  (1 GAL = 3.785 L)');
    expect(etiquetaUnidad('L')).toBe('L · Litro');
  });

  it('normalizar_unidad entiende los nombres viejos', () => {
    expect(normalizarUnidad('GALONERA')).toBe('GAL');
    expect(normalizarUnidad('LITRO')).toBe('L');
    expect(normalizarUnidad('UNIDAD')).toBe('UND');
    expect(normalizarUnidad('PAQUETE')).toBe('PQT');
    expect(normalizarUnidad('KILO')).toBe('KG');
  });

  it('normalizar_unidad entiende el nombre completo con tilde', () => {
    expect(normalizarUnidad('Galón')).toBe('GAL');
  });

  it('una unidad desconocida cae en UND', () => {
    expect(normalizarUnidad('chirimoya')).toBe('UND');
    expect(normalizarUnidad('')).toBe('UND');
    expect(normalizarUnidad(null)).toBe('UND');
  });

  it('guardar_articulo guarda el codigo de la unidad, no el texto', () => {
    const tmp = carpetaTemporal();
    try {
      const { db } = conectar(join(tmp.ruta, 'u.db'), false);
      const id = guardarArticulo(db, 'X-1', 'ALGO', null, 'unidad', 1);
      expect(obtenerArticulo(db, id)!.unidad).toBe('UND');
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('al abrir la base se traducen las unidades viejas', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'unidades.db');
      let a = conectar(ruta, false);
      a.db
        .prepare(
          "INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES ('LIM-9001','LEJIA',NULL,'GALONERA',1)",
        )
        .run();
      a.db
        .prepare(
          "INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo) VALUES ('OFI-9001','PAPEL BOND',NULL,'MILLAR',1)",
        )
        .run();
      a.db.close();

      a = conectar(ruta, false);
      const unis = Object.fromEntries(listarArticulos(a.db).map((x) => [x.codigo, x.unidad]));
      expect(unis['LIM-9001']).toBe('GAL');
      expect(unis['OFI-9001']).toBe('MLL');
      a.db.close();
    } finally {
      tmp.borrar();
    }
  });
});
