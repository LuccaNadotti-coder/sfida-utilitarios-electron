/* ---------------------------------------------------------------------------
 * Fraccionamiento de unidades (v5).
 *
 * El caso real del almacén: se COMPRA por galón y se REPARTE por litro o por
 * medio litro. El artículo se define en su unidad más chica y el sistema
 * convierte en cada movimiento.
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { guardarArticulo, guardarSucursal } from '../src/main/nucleo/articulos';
import { ErrorNegocio } from '../src/main/nucleo/errores';
import { detalleIngreso, detalleSalida } from '../src/main/nucleo/movimientos';
import { stockDe, ultimoPrecio } from '../src/main/nucleo/stock';
import {
  aUnidadStock,
  equivalenciaContra,
  unidadBaseDe,
  unidadesCompatibles,
} from '../src/main/nucleo/unidades';
import { carpetaTemporal, ingresarStock, sacarStock } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let lejia: number;
let suc: number;

beforeEach(() => {
  tmp = carpetaTemporal();
  db = conectar(join(tmp.ruta, 'frac.db'), false).db;
  // La LEJÍA se define en LITROS, que es la unidad chica de su familia.
  lejia = guardarArticulo(db, 'LIM-0005', 'LEJIA', null, 'L', 10);
  suc = guardarSucursal(db, 'SUC01', 'CENTRAL');
});

afterEach(() => {
  db.close();
  tmp.borrar();
});

describe('conversión pura', () => {
  it('1 GAL son 3.785 L', () => {
    expect(aUnidadStock(1, 'GAL', 'L')).toBeCloseTo(3.785, 5);
  });

  it('500 ML son 0.5 L', () => {
    expect(aUnidadStock(500, 'ML', 'L')).toBeCloseTo(0.5, 5);
  });

  it('de galones a mililitros también sale', () => {
    expect(aUnidadStock(1, 'GAL', 'ML')).toBeCloseTo(3785, 3);
  });

  it('NO se puede pasar de litros a kilos', () => {
    expect(aUnidadStock(1, 'L', 'KG')).toBeNull();
  });

  it('el combo solo ofrece unidades de la misma familia', () => {
    const codigos = unidadesCompatibles('L').map((u) => u.codigo);
    expect(codigos).toContain('ML');
    expect(codigos).toContain('GAL');
    expect(codigos).toContain('BD20');
    expect(codigos).not.toContain('KG');
    expect(codigos).not.toContain('UND');
  });

  it('las unidades se ofrecen de la más chica a la más grande', () => {
    expect(unidadesCompatibles('L').map((u) => u.codigo)).toEqual(['ML', 'L', 'GAL', 'BD5', 'BD20']);
  });

  it('unidadBaseDe devuelve la base de la familia', () => {
    expect(unidadBaseDe('GAL')).toBe('L');
    expect(unidadBaseDe('SAC')).toBe('KG');
    expect(unidadBaseDe('CJA')).toBe('UND');
  });

  it('la equivalencia se muestra contra la unidad de stock, no contra la base', () => {
    expect(equivalenciaContra('GAL', 'ML')).toBe('1 GAL = 3785 ML');
    expect(equivalenciaContra('L', 'L')).toBe('');
  });
});

describe('compro en galones, reparto en litros', () => {
  it('comprar 1 GAL suma 3.785 L al stock', () => {
    ingresarStock(db, [[lejia, 1, 22, 'GAL']], { nroProveedor: 'B-1', proveedor: 'PROV' });
    expect(stockDe(db, lejia)).toBeCloseTo(3.785, 4);
  });

  it('el precio se convierte a precio POR LITRO', () => {
    // Si no se convirtiera, el inventario se valorizaría por 3.785 de más.
    ingresarStock(db, [[lejia, 1, 22, 'GAL']], { nroProveedor: 'B-1', proveedor: 'PROV' });
    const u = ultimoPrecio(db, lejia)!;
    expect(u.precio).toBeCloseTo(22 / 3.785, 4);
  });

  it('la línea guarda lo que se digitó, para poder imprimirlo', () => {
    const id = ingresarStock(db, [[lejia, 2, 22, 'GAL']], { nroProveedor: 'B-2', proveedor: 'PROV' });
    const d = detalleIngreso(db, id)[0]!;
    expect(d.cantidad_origen).toBe(2);
    expect(d.unidad_origen).toBe('GAL');
    expect(d.cantidad).toBeCloseTo(7.57, 4);
  });

  it('repartir 500 ML descuenta 0.5 L', () => {
    ingresarStock(db, [[lejia, 10, 5, 'GAL']], { nroProveedor: 'B-3', proveedor: 'PROV' });
    const antes = stockDe(db, lejia);
    sacarStock(db, suc, [[lejia, 500, 'ML']]);
    expect(stockDe(db, lejia)).toBeCloseTo(antes - 0.5, 4);
  });

  it('la salida también guarda la unidad digitada', () => {
    ingresarStock(db, [[lejia, 10, 5, 'GAL']], { nroProveedor: 'B-4', proveedor: 'PROV' });
    const id = sacarStock(db, suc, [[lejia, 500, 'ML']]);
    const d = detalleSalida(db, id)[0]!;
    expect(d.cantidad_origen).toBe(500);
    expect(d.unidad_origen).toBe('ML');
    expect(d.cantidad).toBeCloseTo(0.5, 4);
  });

  it('sin unidad, se usa la de stock', () => {
    ingresarStock(db, [[lejia, 4, 3]], { nroProveedor: 'B-5', proveedor: 'PROV' });
    expect(stockDe(db, lejia)).toBe(4);
  });

  it('el control de stock se hace en la unidad de stock', () => {
    // Hay 3.785 L (1 galón). Pedir 5000 ML (5 L) tiene que fallar.
    ingresarStock(db, [[lejia, 1, 22, 'GAL']], { nroProveedor: 'B-6', proveedor: 'PROV' });
    expect(() => sacarStock(db, suc, [[lejia, 5000, 'ML']])).toThrow(ErrorNegocio);
  });

  it('agrupa líneas repetidas aunque vengan en unidades distintas', () => {
    ingresarStock(db, [[lejia, 10, 5, 'GAL']], { nroProveedor: 'B-7', proveedor: 'PROV' });
    const id = sacarStock(db, suc, [
      [lejia, 1, 'GAL'],
      [lejia, 500, 'ML'],
    ]);
    const det = detalleSalida(db, id);
    expect(det).toHaveLength(1);
    expect(det[0]!.cantidad).toBeCloseTo(3.785 + 0.5, 4);
  });

  it('mezclar familias distintas da un error claro', () => {
    expect(() =>
      ingresarStock(db, [[lejia, 1, 10, 'KG']], { nroProveedor: 'B-8', proveedor: 'PROV' }),
    ).toThrow(/no se puede pasar de litros a kilos|medidas distintas/i);
  });
});
