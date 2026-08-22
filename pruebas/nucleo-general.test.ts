/* ---------------------------------------------------------------------------
 * Port de la primera parte de `test_core.py` (secciones marcadas con «# ---»).
 *
 * Cada `it()` es un `check()` del original. El orden y el escenario se
 * conservan porque las pruebas se apoyan unas en otras: el stock que deja una
 * es el que verifica la siguiente.
 * ------------------------------------------------------------------------- */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import {
  eliminarArticulo,
  eliminarSucursal,
  guardarArticulo,
  guardarSucursal,
  listarSucursales,
} from '../src/main/nucleo/articulos';
import {
  CAT_LIMPIEZA,
  CAT_OFICINA,
  guardarCategoria,
  listarCategorias,
} from '../src/main/nucleo/categorias';
import { ErrorNegocio } from '../src/main/nucleo/errores';
import {
  cabeceraIngreso,
  cabeceraSalida,
  detalleSalida,
  eliminarIngreso,
  eliminarSalida,
  listarSalidas,
  registrarAjuste,
  siguienteNroVale,
} from '../src/main/nucleo/movimientos';
import { exportarCsv, respaldarBd } from '../src/main/nucleo/mantenimiento';
import {
  articulosMasMovidos,
  consumoPorSucursal,
  detalleConsumoSucursal,
  kardex,
} from '../src/main/nucleo/reportes';
import { alertasStockMinimo, nivelesStock, resumenPanel, stockDe } from '../src/main/nucleo/stock';
import { carpetaTemporal, ingresarStock, sacarStock } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let cats: Record<string, number>;
let a1: number;
let a2: number;
let a3: number;
let aX: number;
let s1: number;
let s2: number;
let ing: number;
let rutaBd: string;

beforeAll(() => {
  tmp = carpetaTemporal();
  rutaBd = join(tmp.ruta, 'test.db');
  db = conectar(rutaBd, false).db;
  cats = Object.fromEntries(listarCategorias(db).map((c) => [c.nombre, c.id]));
});

afterAll(() => {
  db.close();
  tmp.borrar();
});

describe('maestros', () => {
  it('solo existen las dos categorias fijas', () => {
    expect(Object.keys(cats)).toHaveLength(2);
  });

  it('las categorias de fabrica van en MAYUSCULAS', () => {
    expect(cats[CAT_OFICINA]).toBeDefined();
    expect(cats[CAT_LIMPIEZA]).toBeDefined();
  });

  it('no deja crear una tercera categoria', () => {
    expect(() => guardarCategoria(db, 'Utiles de Cocina')).toThrow(ErrorNegocio);
  });

  it('articulos creados', () => {
    a1 = guardarArticulo(db, 'ART-0001', 'Lapicero azul Faber', cats[CAT_OFICINA]!, 'UNIDAD', 20);
    a2 = guardarArticulo(db, 'ART-0002', 'Papel higienico jumbo', cats[CAT_LIMPIEZA]!, 'PAQUETE', 10);
    a3 = guardarArticulo(db, 'ART-0003', 'Jabon liquido 1L', cats[CAT_LIMPIEZA]!, 'GALONERA', 5);
    expect(a1 && a2 && a3).toBeTruthy();
  });

  it('bloquea codigo duplicado', () => {
    expect(() => guardarArticulo(db, 'ART-0001', 'Duplicado', null, 'UNIDAD', 0)).toThrow(ErrorNegocio);
  });

  it('exige codigo', () => {
    expect(() => guardarArticulo(db, '', 'Sin codigo', null, 'UNIDAD', 0)).toThrow(ErrorNegocio);
  });

  it('sucursales creadas', () => {
    s1 = guardarSucursal(db, 'SUC01', 'Sede Central', 'Av. Principal 123', 'Ana');
    s2 = guardarSucursal(db, 'SUC02', 'Tienda Norte', 'Jr. Norte 45', 'Luis');
    expect(listarSucursales(db)).toHaveLength(2);
  });
});

describe('ingreso por boleta', () => {
  it('ingreso registrado', () => {
    ing = ingresarStock(
      db,
      [
        [a1, 100, 0.8],
        [a2, 50, 12.5],
        [a3, 12, 18.0],
      ],
      { nroProveedor: 'B001-1234', proveedor: 'Librería Sol', observacion: 'compra mensual' },
    );
    expect(ing).toBeGreaterThan(0);
  });

  it('el N° interno lo genera el sistema', () => {
    // v5: `nro_documento` es interno y automático; el del proveedor va aparte.
    const cab = cabeceraIngreso(db, ing)!;
    expect(cab.nro_documento).toMatch(/^I\d{4}-\d{4}$/);
    expect(cab.nro_proveedor).toBe('B001-1234');
  });

  it('stock tras ingreso lapiceros = 100', () => {
    expect(stockDe(db, a1)).toBe(100);
  });

  it('bloquea la misma boleta del mismo proveedor', () => {
    aX = guardarArticulo(db, 'ART-9000', 'Auxiliar de pruebas', null, 'UND', 0);
    // v5: la regla se apoya en proveedor + N° del proveedor, que es lo que
    // de verdad identifica el papel.
    expect(() =>
      ingresarStock(db, [[aX, 5, 1]], { nroProveedor: 'B001-1234', proveedor: 'Librería Sol' }),
    ).toThrow(ErrorNegocio);
  });

  it('el mismo número de OTRO proveedor sí entra', () => {
    // Se usa un artículo aparte: las pruebas de stock de más abajo cuentan
    // sobre a1 y no se pueden ensuciar acá.
    const id = ingresarStock(db, [[aX, 1, 1]], {
      nroProveedor: 'B001-1234',
      proveedor: 'Otra Distribuidora',
    });
    expect(id).toBeGreaterThan(0);
  });

  it('sin número de proveedor no se puede comprobar y se deja pasar', () => {
    // Hay boletas sin número legible: bloquearlas trabaría el almacén.
    const id = ingresarStock(db, [[aX, 1, 1]], { proveedor: 'Sin Numero SA' });
    expect(id).toBeGreaterThan(0);
  });

  it('valida formato de fecha', () => {
    expect(() => ingresarStock(db, [[aX, 5, 1]], { fecha: '12/05/2026' })).toThrow(ErrorNegocio);
  });

  it('exige al menos un item', () => {
    expect(() => ingresarStock(db, [])).toThrow(ErrorNegocio);
  });
});

describe('salida a sucursal', () => {
  let v1: string;

  it('salida registrada', () => {
    v1 = siguienteNroVale(db);
    const sal = sacarStock(db, s1, [
      [a1, 30],
      [a2, 10],
    ], { observacion: 'reparto semanal' });
    expect(sal).toBeGreaterThan(0);
  });

  it('el N° de vale lo genera el sistema y NO es editable', () => {
    // v5: ya no se puede escribir a mano. `registrarSalida` ni siquiera
    // recibe el número: lo asigna solo.
    const cab = cabeceraSalida(db, listarSalidas(db)[0]!.id)!;
    expect(cab.nro_vale).toBe(v1);
    expect(cab.nro_vale).toMatch(/^V\d{4}-\d{4}$/);
  });

  it('stock tras salida lapiceros = 70', () => {
    expect(stockDe(db, a1)).toBe(70);
  });

  it('numero de vale correlativo', () => {
    expect(siguienteNroVale(db)).not.toBe(v1);
  });

  it('stock lapiceros = 50 tras 2 salidas', () => {
    sacarStock(db, s2, [
      [a1, 20],
      [a3, 4],
    ]);
    expect(stockDe(db, a1)).toBe(50);
  });

  it('bloquea salida sin stock', () => {
    try {
      sacarStock(db, s1, [[a3, 999]]);
      expect.unreachable('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorNegocio);
      expect((e as Error).message.toLowerCase()).toContain('insuficiente');
    }
  });

  it('suma lineas repetidas antes de validar', () => {
    // 30 + 30 = 60 supera el stock de 50 -> debe bloquear
    expect(() =>
      sacarStock(db, s1, [
        [a1, 30],
        [a1, 30],
      ]),
    ).toThrow(ErrorNegocio);
    expect(stockDe(db, a1)).toBe(50);
  });

  it('agrupa lineas repetidas en el vale', () => {
    const salAg = sacarStock(db, s1, [
      [a1, 5],
      [a1, 5],
    ]);
    expect(detalleSalida(db, salAg)).toHaveLength(1);
    expect(stockDe(db, a1)).toBe(40);
    eliminarSalida(db, salAg);
  });

  it('exige sucursal', () => {
    expect(() => sacarStock(db, 0, [[a1, 1]])).toThrow(ErrorNegocio);
  });
});

describe('alertas de stock minimo', () => {
  it('alertas devuelve una lista', () => {
    expect(Array.isArray(alertasStockMinimo(db))).toBe(true);
  });

  it('jabon aparece en alertas al bajar del minimo', () => {
    sacarStock(db, s1, [[a3, 6]]); // jabon queda 2
    const al = alertasStockMinimo(db);
    expect(al.some((a) => a.nombre.includes('JABON'))).toBe(true);
  });
});

describe('kardex', () => {
  it('kardex tiene movimientos', () => {
    expect(kardex(db, a1).length).toBeGreaterThanOrEqual(3);
  });

  it('saldo final del kardex = stock actual', () => {
    const k = kardex(db, a1);
    expect(Math.abs(k[k.length - 1]!.saldo - stockDe(db, a1))).toBeLessThan(0.001);
  });
});

describe('reportes', () => {
  it('consumo por sucursal lista las 2 sucursales', () => {
    expect(consumoPorSucursal(db)).toHaveLength(2);
  });

  it('sucursal con mas unidades primero', () => {
    const cs = consumoPorSucursal(db);
    expect(cs[0]!.unidades).toBeGreaterThanOrEqual(cs[1]!.unidades);
  });

  it('detalle de consumo por sucursal', () => {
    expect(detalleConsumoSucursal(db, s1).length).toBeGreaterThanOrEqual(2);
  });

  it('top de articulos mas movidos', () => {
    expect(articulosMasMovidos(db).length).toBeGreaterThanOrEqual(3);
  });

  it('panel resumen', () => {
    const res = resumenPanel(db);
    expect(res.articulos).toBe(4);
    expect(res.sucursales).toBe(2);
    expect(res.salidas).toBeGreaterThanOrEqual(3);
  });

  it('niveles de stock para la dona suman los articulos activos', () => {
    const n = nivelesStock(db);
    expect(n.ok + n.por_agotarse + n.bajo_minimo).toBe(4);
  });
});

describe('ajustes', () => {
  it('ajuste negativo descuenta', () => {
    const antes = stockDe(db, a2);
    registrarAjuste(db, a2, -5, 'merma por humedad');
    expect(stockDe(db, a2)).toBe(antes - 5);
  });

  it('bloquea ajuste que deja negativo', () => {
    expect(() => registrarAjuste(db, a2, -99999, 'error')).toThrow(ErrorNegocio);
  });

  it('bloquea ajuste de cero', () => {
    expect(() => registrarAjuste(db, a2, 0, 'nada')).toThrow(ErrorNegocio);
  });
});

describe('anulaciones', () => {
  it('bloquea anular boleta ya repartida', () => {
    expect(() => eliminarIngreso(db, ing)).toThrow(ErrorNegocio);
  });

  it('anular salida devuelve el stock', () => {
    const stockPrev = stockDe(db, a1);
    const salTmp = sacarStock(db, s1, [[a1, 5]]);
    eliminarSalida(db, salTmp);
    expect(stockDe(db, a1)).toBe(stockPrev);
  });
});

describe('borrado protegido', () => {
  it('articulo con movimientos se desactiva, no se borra', () => {
    expect(eliminarArticulo(db, a1)).toBe('desactivado');
  });

  it('articulo sin movimientos si se elimina', () => {
    const a4 = guardarArticulo(db, 'ART-0009', 'Temporal', null, 'UNIDAD', 0);
    expect(eliminarArticulo(db, a4)).toBe('eliminado');
  });

  it('sucursal con salidas se desactiva', () => {
    expect(eliminarSucursal(db, s1)).toBe('desactivada');
  });
});

describe('exportacion', () => {
  it('exporta CSV', () => {
    const csvp = join(tmp.ruta, 'sal.csv');
    exportarCsv(csvp, ['A', 'B'], [
      [1, 2],
      [3, 4],
    ]);
    expect(statSync(csvp).size).toBeGreaterThan(0);
  });

  it('neutraliza lo que Excel tomaria por formula', () => {
    // Los nombres de los artículos entran por CSV y vuelven a salir en los
    // reportes. Sin esto, un nombre que empieza con «=» se ejecuta al abrir el
    // archivo exportado.
    const csvp = join(tmp.ruta, 'formula.csv');
    exportarCsv(csvp, ['Articulo'], [
      ['=1+1'],
      ['+SUM(A1)'],
      ['@SUM(A1)'],
      ['-CMD()'],
    ]);
    const texto = readFileSync(csvp, 'utf8');
    for (const peligroso of ['=1+1', '+SUM(A1)', '@SUM(A1)', '-CMD()']) {
      expect(texto).toContain(`'${peligroso}`);
    }
  });

  it('pero NO toca los numeros negativos, que son datos de verdad', () => {
    const csvp = join(tmp.ruta, 'negativos.csv');
    exportarCsv(csvp, ['Ajuste'], [['-5'], ['-3.5'], ['-12,75'], ['LEJIA']]);
    const texto = readFileSync(csvp, 'utf8');
    expect(texto).not.toContain("'-5");
    expect(texto).not.toContain("'-3.5");
    expect(texto).not.toContain("'-12,75");
    expect(texto).not.toContain("'LEJIA");
  });

  it('crea respaldo', () => {
    const bk = respaldarBd(join(tmp.ruta, 'backup.db'), rutaBd);
    expect(existsSync(bk)).toBe(true);
  });
});
