/* ---------------------------------------------------------------------------
 * Port de la primera parte de `test_core.py` (secciones marcadas con «# ---»).
 *
 * Cada `it()` es un `check()` del original. El orden y el escenario se
 * conservan porque las pruebas se apoyan unas en otras: el stock que deja una
 * es el que verifica la siguiente.
 * ------------------------------------------------------------------------- */
import { existsSync, statSync } from 'node:fs';
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
  detalleSalida,
  eliminarIngreso,
  eliminarSalida,
  registrarAjuste,
  registrarIngreso,
  registrarSalida,
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
import { hoy } from '../src/main/nucleo/textos';
import { carpetaTemporal } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let cats: Record<string, number>;
let a1: number;
let a2: number;
let a3: number;
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
    ing = registrarIngreso(db, 'BOLETA', 'B001-1234', hoy(), 'Librería Sol', 'compra mensual', [
      [a1, 100, 0.8],
      [a2, 50, 12.5],
      [a3, 12, 18.0],
    ]);
    expect(ing).toBeGreaterThan(0);
  });

  it('stock tras ingreso lapiceros = 100', () => {
    expect(stockDe(db, a1)).toBe(100);
  });

  it('bloquea boleta duplicada', () => {
    expect(() =>
      registrarIngreso(db, 'BOLETA', 'B001-1234', hoy(), 'X', '', [[a1, 5, 1]]),
    ).toThrow(ErrorNegocio);
  });

  it('valida formato de fecha', () => {
    expect(() =>
      registrarIngreso(db, 'BOLETA', 'B001-9999', '12/05/2026', 'X', '', [[a1, 5, 1]]),
    ).toThrow(ErrorNegocio);
  });

  it('exige al menos un item', () => {
    expect(() => registrarIngreso(db, 'BOLETA', 'B001-8888', hoy(), 'X', '', [])).toThrow(ErrorNegocio);
  });
});

describe('salida a sucursal', () => {
  let v1: string;

  it('salida registrada', () => {
    v1 = siguienteNroVale(db);
    const sal = registrarSalida(db, v1, hoy(), s1, 'Almacen', 'Ana', 'reparto semanal', [
      [a1, 30],
      [a2, 10],
    ]);
    expect(sal).toBeGreaterThan(0);
  });

  it('stock tras salida lapiceros = 70', () => {
    expect(stockDe(db, a1)).toBe(70);
  });

  it('numero de vale correlativo', () => {
    expect(siguienteNroVale(db)).not.toBe(v1);
  });

  it('stock lapiceros = 50 tras 2 salidas', () => {
    registrarSalida(db, siguienteNroVale(db), hoy(), s2, 'Almacen', 'Luis', '', [
      [a1, 20],
      [a3, 4],
    ]);
    expect(stockDe(db, a1)).toBe(50);
  });

  it('bloquea salida sin stock', () => {
    try {
      registrarSalida(db, 'V-TEST', hoy(), s1, '', '', '', [[a3, 999]]);
      expect.unreachable('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorNegocio);
      expect((e as Error).message.toLowerCase()).toContain('insuficiente');
    }
  });

  it('suma lineas repetidas antes de validar', () => {
    // 30 + 30 = 60 supera el stock de 50 -> debe bloquear
    expect(() =>
      registrarSalida(db, 'V-TEST2', hoy(), s1, '', '', '', [
        [a1, 30],
        [a1, 30],
      ]),
    ).toThrow(ErrorNegocio);
    expect(stockDe(db, a1)).toBe(50);
  });

  it('agrupa lineas repetidas en el vale', () => {
    const salAg = registrarSalida(db, 'V-AGRUP', hoy(), s1, '', '', '', [
      [a1, 5],
      [a1, 5],
    ]);
    expect(detalleSalida(db, salAg)).toHaveLength(1);
    expect(stockDe(db, a1)).toBe(40);
    eliminarSalida(db, salAg);
  });

  it('exige sucursal', () => {
    expect(() => registrarSalida(db, 'V-TEST3', hoy(), null, '', '', '', [[a1, 1]])).toThrow(
      ErrorNegocio,
    );
  });
});

describe('alertas de stock minimo', () => {
  it('alertas devuelve una lista', () => {
    expect(Array.isArray(alertasStockMinimo(db))).toBe(true);
  });

  it('jabon aparece en alertas al bajar del minimo', () => {
    registrarSalida(db, 'V-AL-1', hoy(), s1, '', '', '', [[a3, 6]]); // jabon queda 2
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
    expect(res.articulos).toBe(3);
    expect(res.sucursales).toBe(2);
    expect(res.salidas).toBeGreaterThanOrEqual(3);
  });

  it('niveles de stock para la dona suman los articulos activos', () => {
    const n = nivelesStock(db);
    expect(n.ok + n.por_agotarse + n.bajo_minimo).toBe(3);
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
    const salTmp = registrarSalida(db, 'V-DEL', hoy(), s1, '', '', '', [[a1, 5]]);
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

  it('crea respaldo', () => {
    const bk = respaldarBd(join(tmp.ruta, 'backup.db'), rutaBd);
    expect(existsSync(bk)).toBe(true);
  });
});
