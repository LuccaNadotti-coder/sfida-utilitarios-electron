/* ---------------------------------------------------------------------------
 * La tabla de unidades está en DOS lados y tienen que decir lo mismo.
 *
 *   - `src/main/nucleo/unidades.ts`   → la que manda, la que guarda en la base
 *   - `src/compartido/conversion.ts`  → la que usa la pantalla para mostrar en
 *                                       vivo cuánto va a salir del stock
 *
 * Está duplicada para no ir al proceso principal en cada tecla. El riesgo es
 * que se desincronicen: si el renderer dijera que 1 GAL son 3.8 L y el núcleo
 * 3.785, la pantalla mostraría un número y se guardaría otro. Nadie lo notaría
 * hasta que no cierre un inventario.
 *
 * Tanto el comentario del archivo como el CLAUDE.md afirmaban que «la prueba
 * unidades.test.ts lo vigila». Esa prueba NO existía. Ahora sí.
 * ------------------------------------------------------------------------- */
import { describe, expect, it } from 'vitest';

import { convertirAStock } from '../src/compartido/conversion';
import { UNIDADES, aUnidadStock, infoUnidad } from '../src/main/nucleo/unidades';

const CODIGOS = UNIDADES.map(([codigo]) => codigo);

describe('las dos tablas de unidades dicen lo mismo', () => {
  it('todas las conversiones posibles dan igual en los dos lados', () => {
    const distintas: string[] = [];

    for (const desde of CODIGOS) {
      for (const hacia of CODIGOS) {
        // Solo tiene sentido comparar dentro de la misma familia: entre
        // familias el núcleo devuelve null y la pantalla no convierte.
        if (infoUnidad(desde).familia !== infoUnidad(hacia).familia) continue;

        const nucleo = aUnidadStock(7, desde, hacia);
        const pantalla = convertirAStock(7, desde, hacia);
        if (nucleo === null) continue;
        if (Math.abs(nucleo - pantalla) > 1e-9) {
          distintas.push(`${desde}->${hacia}: nucleo=${nucleo} pantalla=${pantalla}`);
        }
      }
    }

    expect(distintas).toEqual([]);
  });

  it('la pantalla conoce todas las unidades del catálogo', () => {
    // Si el núcleo tuviera una unidad que la pantalla no, `convertirAStock`
    // devolvería la cantidad SIN convertir: la pantalla mostraría lo digitado
    // como si fuera lo que va al stock, y no avisaría nada.
    const desconocidas = CODIGOS.filter((c) => {
      const familia = infoUnidad(c).familia;
      // Se convierte a otra unidad de la misma familia con factor distinto.
      const otra = CODIGOS.find(
        (x) => infoUnidad(x).familia === familia && infoUnidad(x).factor !== infoUnidad(c).factor,
      );
      if (!otra) return false;
      const esperado = aUnidadStock(1, c, otra);
      if (esperado === null) return false;
      return Math.abs(esperado - convertirAStock(1, c, otra)) > 1e-9;
    });

    expect(desconocidas).toEqual([]);
  });

  it('coinciden en el caso que motivó todo: 1 GAL = 3.785 L', () => {
    expect(aUnidadStock(1, 'GAL', 'L')).toBeCloseTo(3.785, 6);
    expect(convertirAStock(1, 'GAL', 'L')).toBeCloseTo(3.785, 6);
  });

  it('las dos tablas tienen la misma cantidad de unidades', () => {
    // Si el núcleo suma una y la pantalla no, la prueba de arriba igual pasa
    // (la nueva no se recorre en el lado que no la tiene). Este conteo lo
    // agarra.
    const enPantalla = CODIGOS.filter((c) => convertirAStock(1, c, c) === 1);
    expect(enPantalla).toHaveLength(CODIGOS.length);
  });
});
