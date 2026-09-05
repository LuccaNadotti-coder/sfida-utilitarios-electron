/* ---------------------------------------------------------------------------
 * El buscador de artículos de los combos (ingresos, egresos, reportes).
 *
 * El problema que arregla: al escribir el nombre completo —justo cuando el
 * texto ya no entra en el renglón— la lista quedaba vacía. El filtro viejo
 * exigía que TODAS las palabras estuvieran tal cual en el nombre, así que una
 * palabra de más («DE»), un plural o una letra mal tipeada la apagaban entera,
 * y desde la pantalla parecía que la búsqueda inteligente se había ido sola.
 * ------------------------------------------------------------------------- */
import { describe, expect, it } from 'vitest';

import { buscarArticulos, type ArticuloBuscable } from '../src/compartido/busqueda';

const ARTICULOS: ArticuloBuscable[] = [
  { id: 1, codigo: 'OF-0001', nombre: 'PAPEL BOND A4 75 GR', unidad: 'MLL' },
  { id: 2, codigo: 'OF-0002', nombre: 'PAPEL BOND A4 70 GR', unidad: 'MLL' },
  { id: 3, codigo: 'OF-0003', nombre: 'ARCHIVADOR LOMO ANCHO OFICIO', unidad: 'UND' },
  { id: 4, codigo: 'OF-0004', nombre: 'CUADERNO ANILLADO CUADRICULADO', unidad: 'UND' },
  { id: 5, codigo: 'LI-0001', nombre: 'DETERGENTE EN POLVO LIMÓN', unidad: 'KG' },
  { id: 6, codigo: 'LI-0002', nombre: 'LEJÍA CONCENTRADA', unidad: 'L' },
];

const nombres = (texto: string): string[] =>
  buscarArticulos(ARTICULOS, texto).filas.map((a) => a.nombre);

describe('búsqueda de artículos en el combo', () => {
  it('sin texto devuelve todo', () => {
    expect(buscarArticulos(ARTICULOS, '').filas).toHaveLength(ARTICULOS.length);
  });

  it('encuentra por parte del nombre, sin importar tildes ni mayúsculas', () => {
    expect(nombres('lejia')).toEqual(['LEJÍA CONCENTRADA']);
    expect(nombres('limon')).toEqual(['DETERGENTE EN POLVO LIMÓN']);
  });

  it('encuentra por código', () => {
    expect(nombres('LI-0002')).toEqual(['LEJÍA CONCENTRADA']);
  });

  it('encuentra con las palabras en otro orden', () => {
    expect(nombres('OFICIO ARCHIVADOR')).toEqual(['ARCHIVADOR LOMO ANCHO OFICIO']);
  });

  // El caso que rompía: el nombre completo con una palabra de relleno.
  it('una palabra de más NO deja la lista vacía', () => {
    const r = buscarArticulos(ARTICULOS, 'ARCHIVADOR DE LOMO ANCHO OFICIO');
    expect(r.filas.map((a) => a.nombre)).toEqual(['ARCHIVADOR LOMO ANCHO OFICIO']);
    expect(r.aproximada).toBe(true);
  });

  it('perdona el plural', () => {
    expect(nombres('ARCHIVADORES')).toEqual(['ARCHIVADOR LOMO ANCHO OFICIO']);
  });

  it('perdona una letra mal tipeada en palabras largas', () => {
    expect(nombres('ARCHIVDOR')).toEqual(['ARCHIVADOR LOMO ANCHO OFICIO']);
    expect(nombres('CUARERNO')).toEqual(['CUADERNO ANILLADO CUADRICULADO']);
  });

  it('encuentra con la palabra escrita a medias', () => {
    expect(nombres('CUADE ANILL')).toEqual(['CUADERNO ANILLADO CUADRICULADO']);
  });

  // Perdonar una letra en los números juntaría artículos que son distintos.
  it('los números NO se perdonan: 75 no trae el de 70', () => {
    expect(nombres('PAPEL BOND A4 75')).toEqual(['PAPEL BOND A4 75 GR']);
    expect(nombres('PAPEL BOND A4 70')).toEqual(['PAPEL BOND A4 70 GR']);
  });

  it('lo que coincide del todo no se marca como aproximado', () => {
    expect(buscarArticulos(ARTICULOS, 'PAPEL BOND').aproximada).toBe(false);
  });

  it('cuando de verdad no hay nada parecido, devuelve vacío', () => {
    const r = buscarArticulos(ARTICULOS, 'TALADRO NEUMATICO');
    expect(r.filas).toEqual([]);
    expect(r.aproximada).toBe(false);
  });

  it('ordena primero lo que empieza igual', () => {
    expect(nombres('PAPEL')[0]).toContain('PAPEL BOND');
  });

  it('respeta el tope de filas', () => {
    const muchos = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      codigo: `X-${i}`,
      nombre: `LAPICERO AZUL ${i}`,
      unidad: 'UND',
    }));
    expect(buscarArticulos(muchos, 'LAPICERO', 60).filas).toHaveLength(60);
  });
});
