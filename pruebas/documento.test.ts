/* ---------------------------------------------------------------------------
 * El documento HTML que se manda a la impresora.
 *
 * Es texto puro, así que se puede revisar sin abrir ninguna ventana. Lo que
 * vigilan estas pruebas es que el vale se ubique SIEMPRE contra el borde
 * izquierdo de la hoja, con un ancho fijo. Fue un error real y caro: se probó
 * centrarlo con `margin: 0 auto` para repartir el sobrante del papel, y como
 * el vale se manda sin pedirle medida a la impresora, la hoja que arma
 * Chromium es CARTA (216 mm). Centrado ahí, el ticket arrancaba fuera del
 * rollo de 80 mm y salían impresos tres caracteres por línea. Ver TRAMPA 28.
 * ------------------------------------------------------------------------- */
import { describe, expect, it } from 'vitest';

import { documentoVale } from '../src/main/impresion/documento';
import { COLUMNAS, margen } from '../src/main/impresion/ticket';

function ticket(anchoMm: number, extra: Record<string, unknown> = {}): string {
  return documentoVale({
    anchoMm,
    texto: 'EGRESOS ALMACEN UTILITARIOS\n' + '-'.repeat(COLUMNAS[anchoMm] ?? 42),
    htmlA4: null,
    modoMargen: 'driver',
    declararTamano: false,
    ...extra,
  });
}

describe('de qué borde arranca el vale', () => {
  it('el vale NUNCA se centra en la hoja', () => {
    // `margin: 0 auto` reparte el sobrante de la hoja, y la hoja no es el
    // papel: con una hoja carta el vale se iba afuera del rollo.
    expect(ticket(80)).not.toContain('margin: 0 auto');
    expect(ticket(58)).not.toContain('margin: 0 auto');
  });

  it('el relleno del papel va a los cuatro costados, no solo arriba y abajo', () => {
    expect(ticket(80)).toContain('padding: 5.5mm;');
    expect(ticket(58)).toContain('padding: 4.5mm;');
  });

  it('el cuerpo mide el ancho util, mida lo que mida la hoja', () => {
    for (const mm of [80, 58] as const) {
      // Ancho fijo en el body: así el vale ocupa siempre lo mismo, aunque
      // Chromium arme una hoja carta de 216 mm.
      expect(ticket(mm)).toMatch(
        new RegExp(`body\\s*\\{[^}]*width:\\s*${mm - margen(mm) * 2}mm`),
      );
    }
  });

  it('el ancho del papel no se declara en ningun lado', () => {
    // Ni al imprimir ni en pantalla: el ancho que se fija es el ÚTIL, y los
    // milímetros del margen los pone el relleno.
    expect(ticket(80)).not.toContain('@media screen');
    expect(ticket(80)).not.toMatch(/width:\s*80mm/);
  });
});

describe('corrimiento manual', () => {
  it('sin corrimiento no ensucia el HTML', () => {
    expect(ticket(80)).not.toContain('position:relative');
    expect(ticket(80, { corrimientoMm: 0 })).not.toContain('position:relative');
  });

  it('el corrimiento va INLINE, para que la vista previa lo muestre igual', () => {
    expect(ticket(80, { corrimientoMm: 2.5 })).toContain('style="position:relative;left:2.5mm"');
  });

  it('acepta correr el vale hacia la izquierda', () => {
    expect(ticket(80, { corrimientoMm: -1.5 })).toContain('left:-1.5mm');
  });
});
