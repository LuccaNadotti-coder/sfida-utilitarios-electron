/* ---------------------------------------------------------------------------
 * El documento HTML que se manda a la impresora.
 *
 * Se arma como un archivo suelto y se carga en una ventana OCULTA aparte.
 * Nunca se imprime la ventana de la aplicación: saldrían los botones y el menú
 * en el papel.
 *
 * El script de adentro mide el ancho real de una línea de N caracteres y ajusta
 * el tamaño de letra hasta que entre. NO se puede fijar: 42 caracteres a 10 pt
 * no entran en 74 mm, y cada PC tiene fuentes distintas. Es la misma lección
 * que en Qt, pero acá la medición es exacta.
 * ------------------------------------------------------------------------- */
import { COLUMNAS, margen } from './ticket';

/** Cómo se aplica el margen de 3 mm. Ver el README del prototipo. */
export type ModoMargen = 'driver' | 'css';

export interface OpcionesDocumento {
  anchoMm: number;
  /** Texto plano del ticket (80/58 mm) o `null` si es A4. */
  texto: string | null;
  /** HTML del A4, o `null` si es ticket. */
  htmlA4: string | null;
  modoMargen: ModoMargen;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Arma el documento completo, listo para escribir a un archivo y cargar.
 *
 * Expone `window.__medidas()` para que el proceso principal pueda preguntar
 * cuánto mide la hoja antes de imprimir.
 */
export function documentoVale(op: OpcionesDocumento): string {
  const { anchoMm, texto, htmlA4, modoMargen } = op;
  const cols = COLUMNAS[anchoMm] ?? 42;
  const margenMm = margen(anchoMm);
  const utilMm = anchoMm - margenMm * 2;
  const esA4 = anchoMm >= 200;

  const reglaPagina =
    modoMargen === 'css'
      ? `@page { size: ${anchoMm}mm auto; margin: ${margenMm}mm; }`
      : `@page { size: ${anchoMm}mm auto; margin: 0; }`;
  const relleno = modoMargen === 'css' ? '0' : `${margenMm}mm`;

  const cuerpo = esA4
    ? `<div id="hoja">${htmlA4 ?? ''}</div>`
    : `<pre id="hoja">${esc(texto ?? '')}</pre>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline';">
<title>Vale</title>
<style>
  ${reglaPagina}
  html, body { margin: 0; padding: 0; background: #fff; }
  body { padding: ${relleno}; width: ${utilMm}mm; }
  #hoja {
    color: #000;
    margin: 0;
    ${
      esA4
        ? "font-family: Arial, Helvetica, sans-serif; font-size: 10pt;"
        : "white-space: pre; font-weight: 600; line-height: 116%; font-family: Consolas, 'Courier New', 'DejaVu Sans Mono', 'Liberation Mono', monospace;"
    }
  }
  #regla { position: absolute; visibility: hidden; white-space: pre; top: -9999px; left: 0; }
</style>
</head>
<body>
${cuerpo}
<span id="regla"></span>
<script>
(function () {
  'use strict';
  var COLS = ${cols};
  var UTIL_MM = ${utilMm};
  var MARGEN_MM = ${margenMm};
  var ANCHO_MM = ${anchoMm};
  var MODO = ${JSON.stringify(modoMargen)};
  var ES_A4 = ${esA4 ? 'true' : 'false'};
  var MM_A_PX = 96 / 25.4;   // en CSS, 1mm son siempre 96/25.4 px, tambien al imprimir
  var hoja = document.getElementById('hoja');
  var tam = ES_A4 ? 10 : ajustar();

  // El tamano de letra se MIDE, no se fija: 42 caracteres a 10 pt no entran en
  // 74 mm, y cada PC tiene fuentes distintas.
  function ajustar() {
    var objetivo = UTIL_MM * MM_A_PX;
    var regla = document.getElementById('regla');
    var estilo = getComputedStyle(hoja);
    regla.style.fontFamily = estilo.fontFamily;
    regla.style.fontWeight = estilo.fontWeight;
    regla.textContent = new Array(COLS + 1).join('M');

    function anchoCon(pt) {
      regla.style.fontSize = pt + 'pt';
      return regla.getBoundingClientRect().width;
    }
    // estimacion: 1 pt = 25.4/72 mm y un monoespaciado avanza ~0.60 em
    var t = Math.min(13, Math.max(4, (UTIL_MM / (25.4 / 72)) / (COLS * 0.60)));
    var usado = anchoCon(t);
    if (usado > 0) t = Math.min(13, Math.max(4, t * (objetivo / usado)));
    // garantia final: se compara contra el ancho REAL medido, no contra un
    // objetivo teorico, porque el motor redondea la letra a pixeles enteros
    for (var i = 0; i < 200 && anchoCon(t) > objetivo && t > 3; i++) {
      t = Math.round((t - 0.02) * 100) / 100;
    }
    hoja.style.fontSize = t + 'pt';
    return t;
  }

  window.__medidas = function () {
    // NO usar document.documentElement.scrollHeight: devuelve el maximo entre
    // el contenido y el viewport, asi que todos los vales darian el mismo alto
    // y el rollo continuo botaria papel de mas en cada ticket.
    var rellenoPx = (MODO === 'driver' ? MARGEN_MM : 0) * MM_A_PX;
    var altoContenidoPx = hoja.getBoundingClientRect().height + rellenoPx * 2;
    var altoContenidoMm = altoContenidoPx / MM_A_PX;
    var altoHojaMm = altoContenidoMm + (MODO === 'css' ? MARGEN_MM * 2 : 0);
    var lineas = ES_A4 ? null : hoja.textContent.split('\\n');
    return {
      anchoMm: ANCHO_MM, margenMm: MARGEN_MM, utilMm: UTIL_MM, cols: COLS,
      modoMargen: MODO,
      tamLetraPt: tam,
      altoHojaMm: Math.round(altoHojaMm * 100) / 100,
      lineas: lineas ? lineas.length : null,
      lineaMasLarga: lineas ? Math.max.apply(null, lineas.map(function (l) { return l.length; })) : null,
      html: hoja.outerHTML
    };
  };
})();
</script>
</body>
</html>`;
}
