/* ---------------------------------------------------------------------------
 * Vale de ejemplo. Sin base de datos: son los mismos campos que devuelve
 * `sc.cabecera_salida()` + `sc.detalle_salida()` del proyecto Python.
 *
 * Esta pensado a proposito para hacer sufrir al armado del ticket:
 *   - un nombre de articulo largo, que se tiene que partir en dos lineas
 *   - una unidad con equivalencia (GAL), que imprime «= 18.93 L» abajo
 *   - una direccion de sucursal larga, que se tiene que sangrar bajo el valor
 *   - una cantidad decimal
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const VALE_EJEMPLO = {
    nro_vale: 'V2026-0042',
    fecha: '2026-08-21',
    suc_codigo: 'SUC03',
    sucursal: 'TIENDA SAN JUAN DE LURIGANCHO',
    direccion: 'AV. PROCERES DE LA INDEPENDENCIA 1845, SAN JUAN DE LURIGANCHO',
    entregado_por: 'CARLOS RAMIREZ',
    recibido_por: 'MARIA FERNANDEZ',
    observacion: 'ENTREGA CORRESPONDIENTE A LA SEMANA 34',

    empresa: 'SFIDA',
    empresa_dir: 'AV. INDUSTRIAL 450 - LIMA',
    empresa_ruc: '20512345678',

    items: [
      { codigo: 'OFI-0010', nombre: 'PAPEL BOND A4 75GR', cantidad: 3, unidad: 'MLL' },
      { codigo: 'OFI-0001', nombre: 'LAPICERO AZUL FABER CASTELL TRILUX 034', cantidad: 24, unidad: 'UND' },
      { codigo: 'LIM-0003', nombre: 'JABON LIQUIDO PARA MANOS', cantidad: 5, unidad: 'GAL' },
      { codigo: 'LIM-0008', nombre: 'BOLSA NEGRA GRANDE', cantidad: 12, unidad: 'PQT' },
      { codigo: 'LIM-0004', nombre: 'DETERGENTE EN POLVO', cantidad: 2.5, unidad: 'KG' },
      { codigo: 'OFI-0013', nombre: 'FOLDER MANILA A4', cantidad: 2, unidad: 'CTO' },
    ],
  };

  global.VALE_EJEMPLO = VALE_EJEMPLO;
  if (typeof module !== 'undefined' && module.exports) module.exports = VALE_EJEMPLO;
})(typeof window !== 'undefined' ? window : globalThis);
