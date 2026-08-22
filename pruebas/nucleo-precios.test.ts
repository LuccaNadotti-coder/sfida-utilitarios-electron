/* ---------------------------------------------------------------------------
 * Port del BLOQUE 1 de `test_core.py` — LOS PRECIOS NO SON FIJOS.
 *
 * Cada compra puede tener un precio distinto. El precio es OPCIONAL y 0
 * significa «sin precio», nunca «gratis».
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { guardarArticulo } from '../src/main/nucleo/articulos';
import { CAT_LIMPIEZA, CAT_OFICINA, listarCategorias } from '../src/main/nucleo/categorias';
import { listarAuditoria } from '../src/main/nucleo/config';
import { ErrorNegocio } from '../src/main/nucleo/errores';
import { registrarIngreso } from '../src/main/nucleo/movimientos';
import {
  actualizarCostoLinea,
  historialPrecios,
  listarStock,
  resumenPanel,
  resumenPrecios,
  ultimoPrecio,
} from '../src/main/nucleo/stock';
import { fmtPrecio, fmtVariacion, hoy } from '../src/main/nucleo/textos';
import { carpetaTemporal } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let p1: number;
let p2: number;

beforeAll(() => {
  tmp = carpetaTemporal();
  db = conectar(join(tmp.ruta, 'precios.db'), false).db;
  const cats = Object.fromEntries(listarCategorias(db).map((c) => [c.nombre, c.id]));
  p1 = guardarArticulo(db, 'OFI-0001', 'Papel Bond A4 75GR', cats[CAT_OFICINA]!, 'MILLAR', 5);
  p2 = guardarArticulo(db, 'LIM-0001', 'Escoba', cats[CAT_LIMPIEZA]!, 'UNIDAD', 3);

  registrarIngreso(db, 'BOLETA', 'B001-0001', '2026-01-10', 'distribuidora lima', '', [
    [p1, 10, 14.5],
    [p2, 5, 0],
  ]);
});

afterAll(() => {
  db.close();
  tmp.borrar();
});

describe('precios', () => {
  it('acepta una linea sin precio (costo 0)', () => {
    const filas = historialPrecios(db, p2);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.precio).toBeNull();
  });

  it('sin precio se muestra con guion, nunca S/ 0.00', () => {
    expect(fmtPrecio(0)).toBe('—');
    expect(fmtPrecio(null)).toBe('—');
    expect(fmtPrecio(14.5)).toBe('S/ 14.50');
  });

  it('bloquea precios negativos', () => {
    expect(() => registrarIngreso(db, 'BOLETA', 'B-NEG', hoy(), '', '', [[p1, 1, -5]])).toThrow(
      ErrorNegocio,
    );
  });

  it('ultimo_precio trae precio, fecha, proveedor y documento', () => {
    const u = ultimoPrecio(db, p1)!;
    expect(u.precio).toBe(14.5);
    expect(u.fecha).toBe('2026-01-10');
    expect(u.proveedor).toBe('DISTRIBUIDORA LIMA');
    expect(u.documento).toBe('BOLETA B001-0001');
  });

  it('ultimo_precio es None cuando nunca se cargo precio', () => {
    expect(ultimoPrecio(db, p2)).toBeNull();
  });

  it('ultimo_precio toma la compra mas nueva, no el promedio', () => {
    registrarIngreso(db, 'FACTURA', 'F001-0002', '2026-03-05', 'Comercial Sur', '', [[p1, 20, 16.0]]);
    registrarIngreso(db, 'BOLETA', 'B001-0003', '2026-06-20', 'Distribuidora Lima', '', [
      [p1, 8, 12.0],
    ]);
    const u = ultimoPrecio(db, p1)!;
    expect(u.precio).toBe(12.0);
    expect(u.fecha).toBe('2026-06-20');
  });

  it('historial_precios: 3 compras de la mas nueva a la mas vieja', () => {
    const h = historialPrecios(db, p1);
    expect(h).toHaveLength(3);
    expect(h[0]!.fecha).toBe('2026-06-20');
    expect(h[h.length - 1]!.fecha).toBe('2026-01-10');
  });

  it('historial_precios: trae documento, proveedor y cantidad', () => {
    const h = historialPrecios(db, p1);
    expect(h[0]!.documento).toBe('BOLETA B001-0003');
    expect(h[0]!.proveedor).toBe('DISTRIBUIDORA LIMA');
    expect(h[0]!.cantidad).toBe(8);
  });

  it('historial_precios: la compra mas vieja no tiene variacion', () => {
    const h = historialPrecios(db, p1);
    expect(h[h.length - 1]!.variacion).toBeNull();
  });

  it('historial_precios: variacion 14.50 -> 16.00 = +10.3%', () => {
    const h = historialPrecios(db, p1);
    expect(Math.abs(h[1]!.variacion! - 10.3448)).toBeLessThan(0.01);
  });

  it('historial_precios: variacion 16.00 -> 12.00 = -25%', () => {
    const h = historialPrecios(db, p1);
    expect(Math.abs(h[0]!.variacion! + 25.0)).toBeLessThan(0.01);
  });

  it('fmt_variacion pinta el signo', () => {
    expect(fmtVariacion(10.3448)).toBe('+10.3%');
    expect(fmtVariacion(-25.0)).toBe('-25.0%');
    expect(fmtVariacion(null)).toBe('—');
  });

  it('resumen_precios: minimo, maximo y promedio', () => {
    const r = resumenPrecios(db, p1);
    expect(r.minimo).toBe(12.0);
    expect(r.maximo).toBe(16.0);
    expect(Math.abs(r.promedio! - 14.1667)).toBeLessThan(0.01);
    expect(r.compras).toBe(3);
  });

  it('resumen_precios sin precios devuelve null', () => {
    expect(resumenPrecios(db, p2).minimo).toBeNull();
  });

  it('historial_precios filtra por periodo', () => {
    expect(historialPrecios(db, p1, '2026-02-01', '2026-12-31')).toHaveLength(2);
  });

  it('el inventario se valoriza con el ultimo precio pagado', () => {
    // p1: 38 millares * 12.00 = 456  ·  p2: sin precio, no suma
    const res = resumenPanel(db);
    expect(Math.abs(res.valorizado - 456.0)).toBeLessThan(0.01);
  });

  it('listar_stock trae ultimo precio y su fecha', () => {
    const st = Object.fromEntries(listarStock(db).map((f) => [f.codigo, f]));
    expect(st['OFI-0001']!.ultimo_precio).toBe(12.0);
    expect(st['OFI-0001']!.ultima_fecha).toBe('2026-06-20');
  });

  it('listar_stock deja el precio vacio si nunca se cargo', () => {
    const st = Object.fromEntries(listarStock(db).map((f) => [f.codigo, f]));
    expect(st['LIM-0001']!.ultimo_precio).toBeNull();
  });

  it('actualizar_costo_linea cambia el precio', () => {
    const linea = historialPrecios(db, p1)[0]!.det_id;
    expect(actualizarCostoLinea(db, linea, 13.75)).toBe(true);
    expect(ultimoPrecio(db, p1)!.precio).toBe(13.75);
  });

  it('actualizar_costo_linea no hace nada si el precio es el mismo', () => {
    const linea = historialPrecios(db, p1)[0]!.det_id;
    expect(actualizarCostoLinea(db, linea, 13.75)).toBe(false);
  });

  it('la correccion de precio queda en la auditoria con el valor anterior', () => {
    const aud = listarAuditoria(db, 20);
    expect(
      aud.some(
        (a) =>
          a.accion === 'PRECIO CORREGIDO' &&
          (a.detalle ?? '').includes('12.00') &&
          (a.detalle ?? '').includes('13.75'),
      ),
    ).toBe(true);
  });

  it('actualizar_costo_linea rechaza negativos', () => {
    const linea = historialPrecios(db, p1)[0]!.det_id;
    expect(() => actualizarCostoLinea(db, linea, -1)).toThrow(ErrorNegocio);
  });

  it('se puede cargar el precio de una linea que estaba sin precio', () => {
    const detP2 = historialPrecios(db, p2)[0]!.det_id;
    actualizarCostoLinea(db, detP2, 9.9);
    expect(ultimoPrecio(db, p2)!.precio).toBe(9.9);
  });

  it('actualizar_costo_linea acepta coma decimal', () => {
    const detP2 = historialPrecios(db, p2)[0]!.det_id;
    actualizarCostoLinea(db, detP2, '8,25');
    expect(ultimoPrecio(db, p2)!.precio).toBe(8.25);
  });

  it('actualizar_costo_linea falla si la linea no existe', () => {
    expect(() => actualizarCostoLinea(db, 999999, 5)).toThrow(ErrorNegocio);
  });
});
