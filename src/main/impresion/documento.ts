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
  /**
   * Correr el vale a los costados, en milímetros. Negativo hacia la izquierda.
   *
   * Es el ajuste fino para las impresoras cuyo cabezal no imprime centrado en
   * el papel. El centrado automático resuelve el caso normal; esto arregla el
   * resto sin tener que adivinar desde el código.
   */
  corrimientoMm?: number;
  /**
   * Si el `@page` declara el tamaño de la hoja.
   *
   * Va en `false` cuando el vale se manda a una impresora sin pedirle una
   * medida (ver TRAMPA 9 en `imprimir.ts`): ahí la hoja la pone el
   * controlador, y una medida distinta declarada en el CSS es justamente lo
   * que hace que Chromium centre el ticket y deje media hoja en blanco
   * arriba. Sin `size`, el vale empieza en el borde de arriba del papel.
   */
  declararTamano?: boolean;
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
  const { anchoMm, texto, htmlA4, modoMargen, declararTamano = true, corrimientoMm = 0 } = op;
  const cols = COLUMNAS[anchoMm] ?? 42;
  const margenMm = margen(anchoMm);
  const utilMm = anchoMm - margenMm * 2;
  const esA4 = anchoMm >= 200;

  const tamano = declararTamano ? `size: ${anchoMm}mm auto; ` : '';
  const reglaPagina =
    modoMargen === 'css'
      ? `@page { ${tamano}margin: ${margenMm}mm; }`
      : `@page { ${tamano}margin: 0; }`;
  // El margen de arriba y abajo, nada más: el de los costados ya no se pone
  // como relleno fijo, sale del centrado (ver más abajo).
  const rellenoVertical = modoMargen === 'css' ? '0' : `${margenMm}mm`;

  // El corrimiento viaja INLINE para que también se vea en la vista previa de
  // la pantalla, que recibe solo el `outerHTML` de este elemento.
  const corrimiento = corrimientoMm
    ? ` style="position:relative;left:${corrimientoMm}mm"`
    : '';

  const cuerpo = esA4
    ? `<div id="hoja"${corrimiento}>${htmlA4 ?? ''}</div>`
    : `<pre id="hoja"${corrimiento}>${esc(texto ?? '')}</pre>`;

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
  /* Solo arriba y abajo: a los costados el aire lo pone el centrado. */
  body { padding: ${rellenoVertical} 0; }
  /*
   * EN PANTALLA el papel se simula con su ancho nominal, para que la foto de
   * verificación y la vista previa se parezcan al papel de verdad.
   *
   * AL IMPRIMIR no se fija ningún ancho: el body ocupa la hoja que dé el
   * controlador y el vale se centra en ELLA. Esto es lo que arregla el ticket
   * desparejo: el ancho de la hoja del controlador no siempre es el nominal
   * (un rollo de «80 mm» suele declarar 72 a 76), y con un relleno fijo de
   * 5.5 mm a la izquierda el ticket quedaba pegado a un costado, con todo el
   * sobrante del otro lado. Centrado, la diferencia se reparte sola.
   */
  @media screen { body { width: ${anchoMm}mm; } }
  #hoja {
    color: #000;
    width: ${utilMm}mm;
    max-width: 100%;
    margin: 0 auto;
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
