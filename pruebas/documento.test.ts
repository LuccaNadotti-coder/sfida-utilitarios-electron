/* ---------------------------------------------------------------------------
 * El documento HTML que se manda a la impresora.
 *
 * Es texto puro, así que se puede revisar sin abrir ninguna ventana. Lo que
 * vigilan estas pruebas es el CENTRADO, que fue un error real: el vale se
 * ubicaba con un relleno fijo de 5.5 mm a la izquierda, y como la hoja que da
 * el controlador no siempre mide lo que dice el papel, el ticket salía pegado
 * a un costado con todo el sobrante del otro.
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

describe('centrado del vale en el papel', () => {
  it('el bloque del ticket se centra, no se empuja con relleno', () => {
    const html = ticket(80);
    expect(html).toContain('margin: 0 auto');
    // El relleno de los costados tiene que ser cero: si volviera, el ticket
    // quedaría corrido en cuanto la hoja no midiera los 80 mm nominales.
    expect(html).toContain('padding: 5.5mm 0');
  });

  it('el bloque mide el ancho util, no el del papel', () => {
    for (const mm of [80, 58] as const) {
      expect(ticket(mm)).toContain(`width: ${mm - margen(mm) * 2}mm`);
    }
  });

  it('el ancho del papel solo se simula EN PANTALLA', () => {
    const html = ticket(80);
    // Al imprimir manda la hoja del controlador: no se le fija ningún ancho.
    expect(html).toContain('@media screen { body { width: 80mm; } }');
    expect(html).not.toMatch(/\n\s*body\s*\{[^}]*width:\s*80mm/);
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
