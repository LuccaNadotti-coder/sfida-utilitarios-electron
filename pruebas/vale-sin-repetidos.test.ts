/* ---------------------------------------------------------------------------
 * En un vale de salida un artículo NO puede aparecer dos veces.
 *
 * Se podía: la pantalla dejaba agregar dos renglones de BORRADOR. No era solo
 * feo. El núcleo YA sumaba las líneas repetidas antes de guardar, así que esos
 * dos renglones terminaban siendo uno solo en la base y en el ticket impreso:
 * la pantalla mostraba una cosa y se guardaba otra.
 *
 * En los INGRESOS sí se puede repetir, y es a propósito: la misma boleta puede
 * traer el mismo artículo a dos precios distintos.
 * ------------------------------------------------------------------------- */
import { describe, expect, it } from 'vitest';

import { juntarEnVale, type LineaVale } from '../src/compartido/conversion';

const fila = (cantidad: number, unidad: string): LineaVale => ({ articuloId: 7, cantidad, unidad });

describe('juntar dos veces el mismo articulo en un vale', () => {
  it('misma unidad: suma y conserva la unidad', () => {
    const r = juntarEnVale(fila(10, 'UND'), { cantidad: 5, unidad: 'UND' }, 'UND');
    expect(r).toEqual({ articuloId: 7, cantidad: 15, unidad: 'UND' });
  });

  it('unidades distintas: pasa todo a la unidad de stock', () => {
    // 1 GAL + 500 ML = 4.285 L. No hay forma de escribir eso en galones ni en
    // mililitros sin que quede raro, así que se muestra en litros.
    const r = juntarEnVale(fila(1, 'GAL'), { cantidad: 500, unidad: 'ML' }, 'L');
    expect(r.unidad).toBe('L');
    expect(r.cantidad).toBeCloseTo(4.285, 4);
  });

  it('la unidad de stock también cuenta como «distinta» si la previa era otra', () => {
    const r = juntarEnVale(fila(2, 'GAL'), { cantidad: 1, unidad: 'L' }, 'L');
    expect(r.unidad).toBe('L');
    expect(r.cantidad).toBeCloseTo(2 * 3.785 + 1, 4);
  });

  it('nunca cambia de artículo', () => {
    expect(juntarEnVale(fila(1, 'GAL'), { cantidad: 1, unidad: 'ML' }, 'L').articuloId).toBe(7);
  });

  it('sumar cero deja la fila como estaba', () => {
    const r = juntarEnVale(fila(3, 'UND'), { cantidad: 0, unidad: 'UND' }, 'UND');
    expect(r.cantidad).toBe(3);
  });

  it('con decimales no acumula error visible', () => {
    // 0.5 L tres veces tiene que dar 1.5, no 1.4999999999999998 en pantalla.
    let r = fila(0.5, 'L');
    r = juntarEnVale(r, { cantidad: 0.5, unidad: 'L' }, 'L');
    r = juntarEnVale(r, { cantidad: 0.5, unidad: 'L' }, 'L');
    expect(r.cantidad).toBeCloseTo(1.5, 6);
  });
});
