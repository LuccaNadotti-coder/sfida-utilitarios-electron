/* ---------------------------------------------------------------------------
 * Las tres cosas nuevas de la v5 que no son fraccionamiento:
 *
 *   - Sugerencia de compra   (qué falta y cuánto pedir, según lo que se gasta)
 *   - Conteo físico guiado   (cargar lo contado y que el sistema ajuste)
 *   - Los dos gráficos       (valor del almacén en el tiempo, inversión por
 *                             tienda)
 *
 * Todas usan FECHAS VIEJAS a propósito: los reportes valorizan con el precio
 * vigente en cada fecha, y si todo pasara «hoy» no se notaría si esa parte
 * está mal.
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { guardarArticulo, guardarSucursal } from '../src/main/nucleo/articulos';
import { ErrorNegocio } from '../src/main/nucleo/errores';
import { aplicarConteoFisico } from '../src/main/nucleo/movimientos';
import {
  evolucionValorAlmacen,
  inversionPorSucursal,
  sugerenciaCompra,
} from '../src/main/nucleo/reportes';
import { stockDe } from '../src/main/nucleo/stock';
import { carpetaTemporal, ingresarStock, sacarStock } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let lapicero: number;
let papel: number;
let cinta: number;
let central: number;
let norte: number;

/** Una fecha a N días de la referencia, en ISO. */
function haceDias(n: number, ref = new Date()): string {
  const d = new Date(ref.getTime() - n * 86400000);
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

beforeEach(() => {
  tmp = carpetaTemporal();
  db = conectar(join(tmp.ruta, 'sm.db'), false).db;
  lapicero = guardarArticulo(db, 'OFI-0001', 'LAPICERO AZUL', null, 'UND', 50);
  papel = guardarArticulo(db, 'OFI-0010', 'PAPEL BOND A4', null, 'UND', 20);
  cinta = guardarArticulo(db, 'OFI-0020', 'CINTA ADHESIVA', null, 'UND', 0);
  central = guardarSucursal(db, 'SUC01', 'ALMACEN CENTRAL');
  norte = guardarSucursal(db, 'SUC02', 'TIENDA NORTE');
});

afterEach(() => {
  db.close();
  tmp.borrar();
});

describe('sugerencia de compra', () => {
  it('no sugiere nada si no falta nada', () => {
    // Stock muy por encima del mínimo y sin consumo: no hay nada que pedir.
    ingresarStock(db, [[lapicero, 500, 1]], { nroProveedor: 'B-1', proveedor: 'PROV' });
    const s = sugerenciaCompra(db);
    expect(s.find((x) => x.id === lapicero)).toBeUndefined();
  });

  it('un articulo sin stock sale primero y marcado «sin stock»', () => {
    ingresarStock(db, [[lapicero, 100, 1]], {
      nroProveedor: 'B-1',
      proveedor: 'PROV',
      fecha: haceDias(60),
    });
    sacarStock(db, central, [[lapicero, 100]], { fecha: haceDias(30) });

    const s = sugerenciaCompra(db);
    expect(s[0]!.id).toBe(lapicero);
    expect(s[0]!.urgencia).toBe('sin stock');
  });

  it('calcula cuanto pedir a partir de lo que se consume', () => {
    // 90 unidades en 3 meses = 30 al mes = 1 por día.
    // Con 30 días de cobertura hacen falta 30 y hay 10: sugiere 20.
    ingresarStock(db, [[papel, 100, 2]], { nroProveedor: 'B-2', proveedor: 'PROV', fecha: haceDias(85) });
    sacarStock(db, central, [[papel, 30]], { fecha: haceDias(70) });
    sacarStock(db, central, [[papel, 30]], { fecha: haceDias(45) });
    sacarStock(db, central, [[papel, 30]], { fecha: haceDias(15) });

    const s = sugerenciaCompra(db, 3, 30).find((x) => x.id === papel)!;
    expect(s.consumoMensual).toBeCloseTo(30, 1);
    expect(s.stock).toBe(10);
    expect(s.sugerido).toBeCloseTo(20, 1);
  });

  it('estima el costo con el ULTIMO precio pagado', () => {
    ingresarStock(db, [[papel, 100, 2]], { nroProveedor: 'B-2', proveedor: 'PROV', fecha: haceDias(85) });
    ingresarStock(db, [[papel, 10, 5]], { nroProveedor: 'B-3', proveedor: 'PROV', fecha: haceDias(20) });
    sacarStock(db, central, [[papel, 100]], { fecha: haceDias(10) });

    const s = sugerenciaCompra(db, 3, 30).find((x) => x.id === papel)!;
    expect(s.ultimoPrecio).toBe(5); // el de S/ 2 es más viejo
    expect(s.costoEstimado).toBeCloseTo(s.sugerido * 5, 2);
  });

  it('avisa cuantos dias de stock quedan', () => {
    // 60 en 3 meses = 20/mes ≈ 0.667 por día. Con 10 en stock, ~15 días.
    ingresarStock(db, [[papel, 70, 1]], { nroProveedor: 'B-2', proveedor: 'PROV', fecha: haceDias(85) });
    sacarStock(db, central, [[papel, 60]], { fecha: haceDias(40) });

    const s = sugerenciaCompra(db, 3, 30).find((x) => x.id === papel)!;
    expect(s.diasRestantes).toBeGreaterThan(10);
    expect(s.diasRestantes).toBeLessThan(20);
  });

  it('sin consumo, no hay dias restantes que calcular', () => {
    // Bajo el mínimo pero sin salidas: se pide para llegar al mínimo, y los
    // días restantes son «no se sabe», no cero ni infinito.
    ingresarStock(db, [[lapicero, 5, 1]], { nroProveedor: 'B-9', proveedor: 'PROV' });
    const s = sugerenciaCompra(db).find((x) => x.id === lapicero)!;
    expect(s.diasRestantes).toBeNull();
    expect(s.sugerido).toBeCloseTo(45, 4); // el mínimo es 50
  });

  it('no sugiere comprar lo que no tiene minimo ni consumo', () => {
    // CINTA: mínimo 0, sin movimientos. No hace falta pedirla.
    expect(sugerenciaCompra(db).find((x) => x.id === cinta)).toBeUndefined();
  });

  it('un articulo desactivado no se sugiere', () => {
    ingresarStock(db, [[lapicero, 1, 1]], { nroProveedor: 'B-8', proveedor: 'PROV' });
    db.prepare('UPDATE articulos SET activo = 0 WHERE id = ?').run(lapicero);
    expect(sugerenciaCompra(db).find((x) => x.id === lapicero)).toBeUndefined();
  });
});

describe('conteo fisico guiado', () => {
  beforeEach(() => {
    ingresarStock(db, [
      [lapicero, 100, 1],
      [papel, 50, 2],
    ], { nroProveedor: 'B-C', proveedor: 'PROV' });
  });

  it('ajusta el stock a lo contado, para arriba y para abajo', () => {
    aplicarConteoFisico(db, [
      { articuloId: lapicero, contado: 93 }, // faltaban 7
      { articuloId: papel, contado: 55 }, // sobraban 5
    ], 'INVENTARIO ANUAL');

    expect(stockDe(db, lapicero)).toBe(93);
    expect(stockDe(db, papel)).toBe(55);
  });

  it('cuenta cuantos ajusto y cuantos ya estaban bien', () => {
    const r = aplicarConteoFisico(db, [
      { articuloId: lapicero, contado: 93 },
      { articuloId: papel, contado: 50 }, // igual: no genera ajuste
    ], 'CONTEO');

    expect(r).toEqual({ aplicados: 1, sinCambio: 1 });
  });

  it('no crea un ajuste de cero', () => {
    aplicarConteoFisico(db, [{ articuloId: papel, contado: 50 }], 'CONTEO');
    const { c } = db.prepare('SELECT COUNT(*) c FROM ajustes').get() as { c: number };
    expect(c).toBe(0);
  });

  it('rechaza un conteo negativo sin aplicar NADA', () => {
    // Importa que sea todo o nada: si validara sobre la marcha, el primer
    // artículo quedaría ajustado y el segundo no, y nadie sabría dónde quedó.
    expect(() =>
      aplicarConteoFisico(db, [
        { articuloId: lapicero, contado: 90 },
        { articuloId: papel, contado: -3 },
      ], 'CONTEO'),
    ).toThrow(ErrorNegocio);

    expect(stockDe(db, lapicero)).toBe(100);
    expect(stockDe(db, papel)).toBe(50);
  });

  it('el motivo se guarda en cada ajuste, en MAYUSCULAS y con tildes', () => {
    // `registrarAjuste` (el port de la versión Python) NO pone mayúsculas: las
    // forzaba el combo de la pantalla vieja. Esta función es nueva, así que la
    // regla se aplica en el núcleo, donde no se puede saltear.
    aplicarConteoFisico(db, [{ articuloId: lapicero, contado: 90 }], 'conteo de niños');
    const a = db.prepare('SELECT motivo FROM ajustes').get() as { motivo: string };
    expect(a.motivo).toBe('CONTEO DE NIÑOS');
  });

  it('sin motivo, pone uno por defecto', () => {
    aplicarConteoFisico(db, [{ articuloId: lapicero, contado: 90 }], '   ');
    const a = db.prepare('SELECT motivo FROM ajustes').get() as { motivo: string };
    expect(a.motivo).toBe('INVENTARIO FÍSICO');
  });

  it('queda registrado en la auditoria', () => {
    aplicarConteoFisico(db, [{ articuloId: lapicero, contado: 90 }], 'CONTEO');
    const { c } = db
      .prepare("SELECT COUNT(*) c FROM auditoria WHERE accion = 'CONTEO FISICO'")
      .get() as { c: number };
    expect(c).toBe(1);
  });

  it('una lista vacia no rompe ni ensucia la auditoria', () => {
    expect(aplicarConteoFisico(db, [], 'CONTEO')).toEqual({ aplicados: 0, sinCambio: 0 });
    const { c } = db
      .prepare("SELECT COUNT(*) c FROM auditoria WHERE accion = 'CONTEO FISICO'")
      .get() as { c: number };
    expect(c).toBe(0);
  });
});

describe('grafico: valor del almacen en el tiempo', () => {
  it('devuelve la cantidad de puntos pedida y en orden', () => {
    const p = evolucionValorAlmacen(db, '2026-01-01', '2026-06-30', 6);
    expect(p).toHaveLength(6);
    expect(p[0]!.fecha).toBe('2026-01-01');
    expect(p[5]!.fecha).toBe('2026-06-30');
    expect([...p].sort((a, b) => a.fecha.localeCompare(b.fecha))).toEqual(p);
  });

  it('el valor sube con la compra y baja con el reparto', () => {
    ingresarStock(db, [[lapicero, 100, 2]], {
      nroProveedor: 'B-1',
      proveedor: 'PROV',
      fecha: '2026-02-10',
    });
    sacarStock(db, norte, [[lapicero, 40]], { fecha: '2026-04-10' });

    const p = evolucionValorAlmacen(db, '2026-01-01', '2026-06-30', 6);
    const en = (f: string): number => p.find((x) => x.fecha.startsWith(f))!.valor;

    expect(en('2026-01')).toBe(0); // antes de comprar
    expect(en('2026-03')).toBeCloseTo(200, 2); // 100 × 2
    expect(en('2026-06')).toBeCloseTo(120, 2); // 60 × 2
  });

  it('valoriza con el precio VIGENTE en cada fecha, no con el de hoy', () => {
    // Es la diferencia entre un gráfico útil y uno que reescribe la historia:
    // en marzo el almacén valía lo que valía en marzo.
    ingresarStock(db, [[lapicero, 10, 1]], {
      nroProveedor: 'B-1',
      proveedor: 'PROV',
      fecha: '2026-02-01',
    });
    ingresarStock(db, [[lapicero, 10, 9]], {
      nroProveedor: 'B-2',
      proveedor: 'PROV',
      fecha: '2026-05-01',
    });

    const p = evolucionValorAlmacen(db, '2026-01-01', '2026-06-01', 6);
    const marzo = p.find((x) => x.fecha.startsWith('2026-03'))!;
    expect(marzo.unidades).toBe(10);
    expect(marzo.valor).toBeCloseTo(10, 2); // 10 × S/ 1, el precio de entonces
  });

  it('un rango al reves no revienta', () => {
    expect(() => evolucionValorAlmacen(db, '2026-06-01', '2026-01-01', 6)).not.toThrow();
  });
});

describe('grafico: inversion por tienda', () => {
  beforeEach(() => {
    ingresarStock(db, [[lapicero, 200, 3]], {
      nroProveedor: 'B-1',
      proveedor: 'PROV',
      fecha: '2026-03-01',
    });
  });

  it('suma lo que se le mando a cada tienda, valorizado', () => {
    sacarStock(db, central, [[lapicero, 10]], { fecha: '2026-03-05' });
    sacarStock(db, norte, [[lapicero, 30]], { fecha: '2026-03-06' });

    const r = inversionPorSucursal(db, '2026-03-01', '2026-03-31');
    const c = r.find((x) => x.codigo === 'SUC01')!;
    const n = r.find((x) => x.codigo === 'SUC02')!;

    expect(c.invertido).toBeCloseTo(30, 2); // 10 × 3
    expect(n.invertido).toBeCloseTo(90, 2); // 30 × 3
    expect(n.vales).toBe(1);
    expect(n.unidades).toBe(30);
  });

  it('cuenta los vales, no las lineas', () => {
    ingresarStock(db, [[papel, 10, 1]], {
      nroProveedor: 'B-2',
      proveedor: 'PROV',
      fecha: '2026-03-01',
    });
    sacarStock(db, norte, [
      [lapicero, 5],
      [papel, 1],
    ], { fecha: '2026-03-07' });

    const n = inversionPorSucursal(db, '2026-03-01', '2026-03-31').find(
      (x) => x.codigo === 'SUC02',
    )!;
    expect(n.vales).toBe(1);
  });

  it('respeta el periodo pedido', () => {
    sacarStock(db, norte, [[lapicero, 10]], { fecha: '2026-03-05' });
    sacarStock(db, norte, [[lapicero, 10]], { fecha: '2026-05-05' });

    const marzo = inversionPorSucursal(db, '2026-03-01', '2026-03-31').find(
      (x) => x.codigo === 'SUC02',
    )!;
    expect(marzo.unidades).toBe(10);
  });

  it('las tiendas sin movimiento aparecen en cero, no desaparecen', () => {
    // Si se ocultaran, no se notaría que a una tienda no le llega nada.
    const r = inversionPorSucursal(db, '2026-03-01', '2026-03-31');
    expect(r.map((x) => x.codigo).sort()).toEqual(['SUC01', 'SUC02']);
    expect(r.every((x) => x.invertido === 0)).toBe(true);
  });
});
