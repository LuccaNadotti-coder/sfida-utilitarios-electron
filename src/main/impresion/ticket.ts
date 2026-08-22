/* ---------------------------------------------------------------------------
 * Armado del vale en texto monoespaciado. Port de `sfida_impresion.py`, ya
 * validado en el prototipo de la fase 0.
 *
 * Las constantes de columnas NO se escriben a mano en ningún otro lado: si el
 * ancho del nombre y la sangría de las líneas de abajo no salen las dos de
 * SANGRIA_ITEM, el ticket sale con las columnas corridas. Fue un bug real de
 * la versión Qt y hay pruebas que lo vigilan.
 * ------------------------------------------------------------------------- */
import type { CabeceraSalida, DetalleSalida } from '../../compartido/contrato';
import { convertirABase, equivalenciaUnidad, infoUnidad } from '../nucleo/unidades';
import { fmtNum } from '../nucleo/textos';

/** Cuántos caracteres entran a lo ancho en cada papel. */
export const COLUMNAS: Record<number, number> = { 80: 42, 58: 30, 210: 80 };

// Columnas del detalle: cantidad (5) + espacio + unidad (5) + espacio.
export const ANCHO_CANT = 5;
export const ANCHO_UND = 5;
/** El nombre del artículo arranca en la columna 12. Las líneas de abajo también. */
export const SANGRIA_ITEM = ANCHO_CANT + 1 + ANCHO_UND + 1; // = 12
/** Ancho de la columna de los rótulos de la cabecera («N° VALE :»). */
export const SANGRIA_CAMPO = 10;

/** Margen del papel, por lado, en milímetros. */
export function margen(anchoMm: number): number {
  return anchoMm < 200 ? 3.0 : 12.0;
}

/* ------------------------------------------------------------- utilidades */

function rjust(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}
function ljust(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
function rstrip(s: string): string {
  return s.replace(/\s+$/, '');
}

/** Igual que `str.center()` de Python, incluido su reparto impar del sobrante. */
export function center(s: string, ancho: number): string {
  const marg = ancho - s.length;
  if (marg <= 0) return s;
  const izq = Math.floor(marg / 2) + (marg & ancho & 1);
  return ' '.repeat(izq) + s + ' '.repeat(marg - izq);
}

/** Parte un texto largo en varias líneas de ese ancho, sin cortar palabras. */
export function cortar(texto: unknown, ancho: number): string[] {
  const palabras = String(texto ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (let p of palabras) {
    if (p.length > ancho) {
      if (actual) {
        lineas.push(actual);
        actual = '';
      }
      while (p.length > ancho) {
        lineas.push(p.slice(0, ancho));
        p = p.slice(ancho);
      }
    }
    if (!actual) actual = p;
    else if (actual.length + 1 + p.length <= ancho) actual += ' ' + p;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

/** Red de seguridad final: ninguna línea puede pasarse del ancho del papel. */
export function limitar(lineas: string[], cols: number): string[] {
  const salida: string[] = [];
  for (const l of lineas) {
    if (l.length <= cols) salida.push(l);
    else salida.push(...cortar(l, cols));
  }
  return salida;
}

export function centrado(texto: unknown, cols: number): string[] {
  return cortar(texto, cols)
    .filter(Boolean)
    .map((l) => rstrip(center(l, cols)));
}

/** Una línea «ROTULO : valor», sangrando la continuación bajo el valor. */
export function campo(rotulo: string, valor: unknown, cols: number): string[] {
  const ancho = Math.max(8, cols - SANGRIA_CAMPO);
  return cortar(valor, ancho).map((l, i) => rstrip(ljust(i === 0 ? rotulo : '', SANGRIA_CAMPO) + l));
}

/** Las dos firmas. En papel angosto (< 38 columnas) van una debajo de la otra. */
export function bloqueFirmas(cols: number): string[] {
  const raya = '_'.repeat(Math.max(10, cols - 10));
  if (cols >= 38) {
    const media = Math.floor(cols / 2);
    const anchoRaya = Math.max(8, media - 4);
    return [
      '',
      '',
      '',
      center('_'.repeat(anchoRaya), media) + center('_'.repeat(anchoRaya), media),
      center('ENTREGUE CONFORME', media) + center('RECIBI CONFORME', media),
    ];
  }
  return [
    '',
    '',
    '',
    rstrip(center(raya, cols)),
    rstrip(center('ENTREGUE CONFORME', cols)),
    '',
    '',
    rstrip(center(raya, cols)),
    rstrip(center('RECIBI CONFORME', cols)),
  ];
}

/* ------------------------------------------------------------------- vale */

export interface DatosVale {
  cab: CabeceraSalida;
  det: DetalleSalida[];
  empresa: string;
  empresaDir: string;
  empresaRuc: string;
  impresoEl: string;
}

function dmy(iso: unknown): string {
  const p = String(iso ?? '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
}

/** Texto plano del ticket (80 o 58 mm). */
export function textoTicket(v: DatosVale, anchoMm: number): string {
  const cols = COLUMNAS[anchoMm] ?? 42;
  const linea = '-'.repeat(cols);
  const doble = '='.repeat(cols);
  const anNom = Math.max(8, cols - SANGRIA_ITEM);

  const cuerpo: string[] = [];
  let totalItems = 0;
  let totalUnd = 0;
  for (const d of v.det) {
    const u = infoUnidad(d.unidad);
    const cant = fmtNum(d.cantidad);
    totalItems += 1;
    totalUnd += Number(d.cantidad);
    const partes = cortar(d.nombre, anNom);
    cuerpo.push(
      rjust(cant.slice(0, ANCHO_CANT), ANCHO_CANT) +
        ' ' +
        ljust(u.codigo.slice(0, ANCHO_UND), ANCHO_UND) +
        ' ' +
        partes[0],
    );
    for (const extra of partes.slice(1)) cuerpo.push(' '.repeat(SANGRIA_ITEM) + extra);

    let pie = d.codigo;
    if (equivalenciaUnidad(u.codigo)) {
      const [valor, base] = convertirABase(d.cantidad, u.codigo);
      pie += `  =  ${fmtNum(valor)} ${base}`;
    }
    for (const l of cortar(pie, anNom)) cuerpo.push(' '.repeat(SANGRIA_ITEM) + l);
  }

  const cabecera = ['VALE DE SALIDA DE ALMACEN', linea];
  cabecera.push(...campo('N° VALE :', v.cab.nro_vale, cols));
  cabecera.push(...campo('FECHA   :', dmy(v.cab.fecha), cols));
  cabecera.push(...campo('DESTINO :', `${v.cab.suc_codigo} - ${v.cab.sucursal}`, cols));
  if (v.cab.direccion) cabecera.push(...campo('DIRECC. :', v.cab.direccion, cols));
  cabecera.push(...campo('ENTREGA :', v.cab.entregado_por || '-', cols));
  cabecera.push(...campo('RECIBE  :', v.cab.recibido_por || '-', cols));
  // La observación ahora SÍ se imprime: la pantalla ya la llena.
  // Ver CAMBIOS_DELIBERADOS.md punto 2.
  if (v.cab.observacion) cabecera.push(...campo('OBSERV. :', v.cab.observacion, cols));

  const encabezadoTabla = [
    rjust('CANT', ANCHO_CANT) + ' ' + ljust('UND', ANCHO_UND) + ' ' + 'ARTICULO',
  ];

  const pie = [
    linea,
    ljust('TOTAL DE ARTICULOS:', cols - 8) + rjust(String(totalItems), 8),
    ljust('TOTAL DE UNIDADES:', cols - 8) + rjust(fmtNum(totalUnd), 8),
    doble,
  ];

  let membrete = centrado((v.empresa || 'SFIDA').toUpperCase(), cols);
  if (v.empresaDir) membrete = membrete.concat(centrado(v.empresaDir.toUpperCase(), cols));
  if (v.empresaRuc) membrete = membrete.concat(centrado(`RUC ${v.empresaRuc}`, cols));

  const lineas = ([] as string[]).concat(
    membrete,
    [linea],
    cabecera,
    [linea],
    encabezadoTabla,
    [linea],
    cuerpo,
    pie,
    bloqueFirmas(cols),
    [''],
    centrado(`Impreso el ${v.impresoEl}`, cols),
    centrado('SFIDA - Control de Utiles', cols),
    // Tres líneas en blanco: si no, la cuchilla corta el texto.
    ['', '', ''],
  );

  return limitar(lineas, cols).join('\n');
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Versión A4, con tabla de verdad, para archivar. */
export function htmlA4(v: DatosVale): string {
  let totalUnd = 0;
  const filas = v.det
    .map((d) => {
      const u = infoUnidad(d.unidad);
      totalUnd += Number(d.cantidad);
      let eq = '';
      if (equivalenciaUnidad(u.codigo)) {
        const [valor, base] = convertirABase(d.cantidad, u.codigo);
        eq = ` <span style='color:#666'>(${fmtNum(valor)} ${base})</span>`;
      }
      return (
        '<tr>' +
        `<td style='padding:6px;border-bottom:1px solid #ddd'>${esc(d.codigo)}</td>` +
        `<td style='padding:6px;border-bottom:1px solid #ddd'>${esc(d.nombre)}</td>` +
        `<td align='right' style='padding:6px;border-bottom:1px solid #ddd'>${fmtNum(d.cantidad)}</td>` +
        `<td style='padding:6px;border-bottom:1px solid #ddd'>${u.codigo}${eq}</td>` +
        '</tr>'
      );
    })
    .join('');

  const obs = v.cab.observacion
    ? `<p style="font-size:10pt"><b>Observación:</b> ${esc(v.cab.observacion)}</p>`
    : '';

  return (
    '<table width="100%"><tr>' +
    `<td><div style="font-size:20pt;font-weight:bold">${esc(v.empresa)}</div>` +
    `<div style="font-size:8pt;color:#555">${esc(v.empresaDir)}` +
    (v.empresaRuc ? `  &middot;  RUC ${esc(v.empresaRuc)}` : '') +
    '</div></td>' +
    '<td align="right"><div style="font-size:13pt;font-weight:bold">VALE DE SALIDA</div>' +
    `<div style="font-size:14pt;font-weight:bold">N&deg; ${esc(v.cab.nro_vale)}</div>` +
    `<div style="font-size:9pt;color:#555">${dmy(v.cab.fecha)}</div></td>` +
    '</tr></table>' +
    '<hr style="border:0;border-top:2px solid #111">' +
    '<table width="100%" style="font-size:10pt" cellpadding="4">' +
    `<tr><td width="50%"><b>Sucursal destino:</b> ${esc(v.cab.suc_codigo)} - ${esc(v.cab.sucursal)}</td>` +
    `<td><b>Direcci&oacute;n:</b> ${esc(v.cab.direccion || '-')}</td></tr>` +
    `<tr><td><b>Entregado por:</b> ${esc(v.cab.entregado_por || '-')}</td>` +
    `<td><b>Recibido por:</b> ${esc(v.cab.recibido_por || '-')}</td></tr>` +
    '</table><br>' +
    '<table width="100%" cellspacing="0" style="font-size:10pt">' +
    '<tr style="background:#1c2536;color:#ffffff">' +
    '<th align="left" style="padding:7px" width="16%">C&oacute;digo</th>' +
    '<th align="left" style="padding:7px">Art&iacute;culo</th>' +
    '<th align="right" style="padding:7px" width="12%">Cantidad</th>' +
    '<th align="left" style="padding:7px" width="22%">Unidad</th></tr>' +
    filas +
    '</table>' +
    `<p style="font-size:10pt"><b>Total de art&iacute;culos:</b> ${v.det.length}` +
    ` &nbsp;&nbsp; <b>Total de unidades:</b> ${fmtNum(totalUnd)}</p>` +
    obs +
    '<br><br><br>' +
    '<table width="100%" style="font-size:9pt"><tr>' +
    '<td align="center">__________________________<br>Entregu&eacute; conforme</td>' +
    '<td align="center">__________________________<br>Recib&iacute; conforme</td>' +
    '</tr></table>' +
    '<p style="font-size:7.5pt;color:#888;text-align:center">' +
    `SFIDA &middot; Control de &Uacute;tiles de Oficina y Limpieza &middot; Impreso el ${esc(v.impresoEl)}</p>`
  );
}
