/* ---------------------------------------------------------------------------
 * El ticket tiene que respetar el ancho del papel y quedar alineado.
 *
 * Port de las pruebas del bloque «el vale imprimible en formato ticket» de
 * `test_app.py`. Vigilan errores que YA aparecieron una vez en la versión Qt:
 * si el ancho de la columna del artículo y la sangría no coinciden, el vale
 * sale con las líneas corridas o cortado por la cuchilla.
 *
 * Corren sin abrir ninguna ventana: el armado del ticket es texto puro.
 * ------------------------------------------------------------------------- */
import { describe, expect, it } from 'vitest';

import type { CabeceraSalida, DetalleSalida } from '../src/compartido/contrato';
import {
  COLUMNAS,
  SANGRIA_CAMPO,
  SANGRIA_ITEM,
  bloqueFirmas,
  campo,
  cortar,
  htmlA4,
  margen,
  textoTicket,
  type DatosVale,
} from '../src/main/impresion/ticket';

function vale(det: Array<Partial<DetalleSalida>>, cab: Partial<CabeceraSalida> = {}): DatosVale {
  return {
    cab: {
      id: 1,
      nro_vale: 'E2026-0042',
      fecha: '2026-08-21',
      sucursal_id: 1,
      entregado_por: 'CARLOS RAMIREZ',
      recibido_por: 'MARIA FERNANDEZ',
      observacion: '',
      sucursal: 'TIENDA SAN JUAN DE LURIGANCHO',
      suc_codigo: 'SUC03',
      direccion: 'AV. PROCERES DE LA INDEPENDENCIA 1845',
      responsable: null,
      items: 0,
      unidades: 0,
      ...cab,
    } as CabeceraSalida,
    det: det.map((d, i) => ({
      id: i + 1,
      articulo_id: i + 1,
      cantidad: 1,
      codigo: 'OFI-0001',
      nombre: 'ARTICULO',
      unidad: 'UND',
      ...d,
    })) as DetalleSalida[],
    empresa: 'SFIDA',
    empresaDir: 'AV. INDUSTRIAL 450 - LIMA',
    empresaRuc: '20512345678',
    impresoEl: '21/08/2026 22:32',
  };
}

const DETALLE_TIPICO = [
  { codigo: 'OFI-0010', nombre: 'PAPEL BOND A4 75GR', cantidad: 3, unidad: 'MLL' },
  { codigo: 'OFI-0001', nombre: 'LAPICERO AZUL FABER CASTELL TRILUX 034', cantidad: 24, unidad: 'UND' },
  { codigo: 'LIM-0003', nombre: 'JABON LIQUIDO PARA MANOS', cantidad: 5, unidad: 'GAL' },
  { codigo: 'LIM-0004', nombre: 'DETERGENTE EN POLVO', cantidad: 2.5, unidad: 'KG' },
];

describe('margen del papel', () => {
  // El rollo térmico imprime menos ancho del que mide el papel: con 3 mm de
  // margen la punta derecha de cada línea se salía del área imprimible.
  it('el ticket deja al menos 4.5 mm libres a cada lado', () => {
    expect(margen(80)).toBeGreaterThanOrEqual(4.5);
    expect(margen(58)).toBeGreaterThanOrEqual(4.5);
  });

  it('el margen nunca se come mas de la sexta parte del papel', () => {
    for (const mm of [80, 58, 210] as const) {
      expect(margen(mm) * 2).toBeLessThan(mm / 3);
    }
  });

  it('el A4 conserva su margen ancho', () => {
    expect(margen(210)).toBe(12);
  });
});

describe('ancho del papel', () => {
  for (const mm of [80, 58] as const) {
    it(`ninguna linea del ticket de ${mm} mm se pasa del papel`, () => {
      const lineas = textoTicket(vale(DETALLE_TIPICO), mm).split('\n');
      const largas = lineas.filter((l) => l.length > COLUMNAS[mm]!);
      expect(largas).toEqual([]);
    });
  }

  it('un nombre larguisimo sin espacios tampoco desborda', () => {
    const lineas = textoTicket(
      vale([{ nombre: 'X'.repeat(120), codigo: 'OFI-9999', cantidad: 1, unidad: 'UND' }]),
      80,
    ).split('\n');
    expect(lineas.filter((l) => l.length > 42)).toEqual([]);
  });

  it('una direccion de sucursal larguisima tampoco desborda', () => {
    const lineas = textoTicket(
      vale(DETALLE_TIPICO, { direccion: 'AVENIDA '.repeat(30) }),
      58,
    ).split('\n');
    expect(lineas.filter((l) => l.length > 30)).toEqual([]);
  });
});

describe('alineacion de las columnas', () => {
  it('el nombre del articulo y su codigo arrancan en la misma columna', () => {
    const lineas = textoTicket(vale(DETALLE_TIPICO), 80).split('\n');

    // línea de artículo: «   24 UND   LAPICERO…»
    const desalineadas: string[] = [];
    for (const l of lineas) {
      const m = /^\s*[\d.,]+ [A-Z0-9]+\s+(\S)/.exec(l);
      if (m && l.indexOf(m[1]!, m.index) !== SANGRIA_ITEM) desalineadas.push(l);
    }

    // línea del código: sangrada exactamente SANGRIA_ITEM
    const codigos = lineas.filter((l) => /^ +(OFI|LIM)-\d+/.test(l));
    for (const l of codigos) {
      if (l.length - l.replace(/^ +/, '').length !== SANGRIA_ITEM) desalineadas.push(l);
    }

    expect(codigos.length).toBeGreaterThan(0);
    expect(desalineadas).toEqual([]);
  });

  it('la cabecera sangra la continuacion bajo el valor', () => {
    const c = campo('DESTINO :', 'SUCURSAL SAN JUAN DE LURIGANCHO', 30);
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((l) => l.length <= 30)).toBe(true);
    expect(c[1]!.startsWith(' '.repeat(SANGRIA_CAMPO))).toBe(true);
    expect(c[1]![SANGRIA_CAMPO]).not.toBe(' ');
  });

  it('la equivalencia larga se parte en vez de cortarse a la mitad', () => {
    const trozos = cortar('OFI-0001 = 3000 UND', 18);
    expect(trozos.every((t) => t.length <= 18)).toBe(true);
    expect(trozos.join(' ')).toContain('UND');
  });
});

describe('firmas', () => {
  it('en 80 mm van lado a lado', () => {
    const l = bloqueFirmas(42);
    expect(l.some((x) => x.includes('ENTREGUE CONFORME') && x.includes('RECIBI CONFORME'))).toBe(true);
  });

  it('en 58 mm van una debajo de la otra', () => {
    const l = bloqueFirmas(30);
    expect(l.some((x) => x.includes('ENTREGUE CONFORME') && !x.includes('RECIBI CONFORME'))).toBe(true);
    expect(l.some((x) => x.includes('RECIBI CONFORME') && !x.includes('ENTREGUE CONFORME'))).toBe(true);
  });

  it('el corte esta en 38 columnas', () => {
    // Lado a lado son menos renglones que apiladas; el número exacto cambió
    // en la v5 al agregar el renglón del NOMBRE debajo de cada firma.
    expect(bloqueFirmas(38).length).toBeLessThan(bloqueFirmas(37).length);
  });

  it('v5: debajo de cada firma hay un renglon para el NOMBRE', () => {
    for (const cols of [42, 30]) {
      const l = bloqueFirmas(cols);
      const nombres = l.filter((x) => x.includes('NOMBRE'));
      // Uno por firma: en 42 van los dos en la misma línea, en 30 en dos.
      expect(nombres.length).toBeGreaterThanOrEqual(1);
      expect(l.join(' ')).toContain('NOMBRE');
    }
  });
});

describe('contenido del vale', () => {
  it('lleva membrete, numero de vale y las dos firmas', () => {
    const t = textoTicket(vale(DETALLE_TIPICO), 80);
    // v5.2: el título es «EGRESOS ALMACEN UTILITARIOS», hermano del de ingreso.
    expect(t).toContain('EGRESOS ALMACEN UTILITARIOS');
    expect(t).not.toContain('VALE DE EGRESO DE ALMACEN');
    expect(t).toContain('SFIDA');
    expect(t).toContain('RUC 20512345678');
    expect(t).toContain('E2026-0042');
    expect(t).toContain('ENTREGUE CONFORME');
    expect(t).toContain('RECIBI CONFORME');
  });

  it('la fecha sale en dd/mm/aaaa', () => {
    expect(textoTicket(vale(DETALLE_TIPICO), 80)).toContain('21/08/2026');
  });

  it('imprime las equivalencias de las unidades que las tienen', () => {
    const t = textoTicket(vale(DETALLE_TIPICO), 80);
    expect(t).toContain('3000 UND'); // 3 MLL
    expect(t).toContain('18.93 L'); // 5 GAL
  });

  it('NO inventa equivalencia para las unidades base ni las de factor 1', () => {
    const t = textoTicket(vale([{ codigo: 'LIM-0004', nombre: 'DETERGENTE', cantidad: 2, unidad: 'KG' }]), 80);
    expect(t).not.toContain('=  2 KG');
  });

  it('los totales cuentan articulos y unidades', () => {
    const t = textoTicket(vale(DETALLE_TIPICO), 80);
    expect(t).toContain('TOTAL DE ARTICULOS:');
    expect(t).toMatch(/TOTAL DE ARTICULOS:\s+4/);
    // 3 + 24 + 5 + 2.5 = 34.5
    expect(t).toMatch(/TOTAL DE UNIDADES:\s+34\.50/);
  });

  it('termina con tres lineas en blanco para la cuchilla', () => {
    const l = textoTicket(vale(DETALLE_TIPICO), 80).split('\n');
    expect(l.slice(-3).every((x) => x.trim() === '')).toBe(true);
  });

  it('CAMBIO DELIBERADO: la observacion se imprime cuando existe', () => {
    const con = textoTicket(vale(DETALLE_TIPICO, { observacion: 'ENTREGA DE LA SEMANA 34' }), 80);
    expect(con).toContain('OBSERV. :');
    expect(con).toContain('ENTREGA DE LA SEMANA 34');

    const sin = textoTicket(vale(DETALLE_TIPICO, { observacion: '' }), 80);
    expect(sin).not.toContain('OBSERV. :');
  });

  it('la direccion de la sucursal solo sale si existe', () => {
    expect(textoTicket(vale(DETALLE_TIPICO), 80)).toContain('DIRECC. :');
    expect(textoTicket(vale(DETALLE_TIPICO, { direccion: null }), 80)).not.toContain('DIRECC. :');
  });

  it('v5: el ticket YA NO lleva las lineas ENTREGA/RECIBE en la cabecera', () => {
    // Salieron de la pantalla y del cuerpo del ticket: ahora se escriben a
    // mano sobre las firmas del pie.
    const t = textoTicket(vale(DETALLE_TIPICO), 80);
    expect(t).not.toContain('ENTREGA :');
    expect(t).not.toContain('RECIBE  :');
    // Pero las firmas siguen estando.
    expect(t).toContain('ENTREGUE CONFORME');
    expect(t).toContain('RECIBI CONFORME');
  });
});

describe('version A4', () => {
  it('usa tabla de verdad y no el ticket monoespaciado', () => {
    const h = htmlA4(vale(DETALLE_TIPICO));
    expect(h).toContain('<table');
    expect(h).toContain('Recib');
    expect(h).toContain('EGRESOS ALMAC&Eacute;N UTILITARIOS');
  });

  it('escapa el HTML de los nombres', () => {
    const h = htmlA4(vale([{ nombre: 'CINTA <b>ANCHA</b> & FUERTE', codigo: 'X-1', cantidad: 1, unidad: 'UND' }]));
    expect(h).toContain('&lt;b&gt;');
    expect(h).toContain('&amp;');
  });

  it('incluye la observacion cuando existe', () => {
    expect(htmlA4(vale(DETALLE_TIPICO, { observacion: 'URGENTE' }))).toContain('URGENTE');
  });
});
