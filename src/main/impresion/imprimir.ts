/* ---------------------------------------------------------------------------
 * Mandar el vale a la impresora. Producción de lo probado en la fase 0.
 *
 * LAS TRAMPAS, todas marcadas donde aparecen:
 *   1. webContents.print()      -> pageSize en MICRONES  (80 mm = 80000)
 *   2. webContents.printToPDF() -> pageSize en PULGADAS  (80 mm = 3.1496)
 *   3. silent:true necesita deviceName explícito
 *   4. margins:{marginType:'none'} evita que el driver térmico agregue márgenes
 *   5. medir el elemento, NO document.documentElement.scrollHeight
 *   6. si se destruye la última ventana, Electron cierra la app  -> ventana ancla
 *   7. esperar document.fonts.ready antes de medir
 *   8. el tamaño de letra se mide, no se fija
 *   9. el alto a medida NO se le pide a la impresora: la centra (ver abajo)
 * ------------------------------------------------------------------------- */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BrowserWindow } from 'electron';

import type { AnchoPapel, VistaPreviaVale } from '../../compartido/contrato';
import { documentoVale, type ModoMargen } from './documento';
import type { DatosTicketIngreso, DatosVale } from './ticket';
import { htmlA4, htmlA4Ingreso, textoTicket, textoTicketIngreso } from './ticket';

/** Un comprobante listo para imprimir: salida o ingreso. */
export type Comprobante =
  | { tipo: 'salida'; datos: DatosVale }
  | { tipo: 'ingreso'; datos: DatosTicketIngreso };

function textoDe(c: Comprobante, anchoMm: number): string {
  return c.tipo === 'salida' ? textoTicket(c.datos, anchoMm) : textoTicketIngreso(c.datos, anchoMm);
}
function htmlDe(c: Comprobante): string {
  return c.tipo === 'salida' ? htmlA4(c.datos) : htmlA4Ingreso(c.datos);
}

const MICRAS_POR_MM = 1000;
const PULGADAS_POR_MM = 1 / 25.4;

/**
 * Cuántas ventanas de vale hay abiertas.
 *
 * TRAMPA 6: al destruir la última BrowserWindow, Electron dispara
 * 'window-all-closed' y cierra la app. En uso normal la ventana principal está
 * viva, pero al generar varios PDF seguidos sin interfaz el proceso se iría y
 * la siguiente carga fallaría con ERR_FAILED (-2), un error que habla del
 * archivo y no tiene nada que ver con el archivo.
 */
let valesAbiertos = 0;
export function hayValesAbiertos(): boolean {
  return valesAbiertos > 0;
}

interface Medidas {
  anchoMm: number;
  margenMm: number;
  utilMm: number;
  cols: number;
  modoMargen: ModoMargen;
  tamLetraPt: number;
  altoHojaMm: number;
  lineas: number | null;
  lineaMasLarga: number | null;
  html: string;
}

interface ValeAbierto {
  w: BrowserWindow;
  medidas: Medidas;
  carpeta: string;
}

/** Arma el documento y lo abre en una ventana oculta, ya medido. */
async function abrirVale(
  c: Comprobante,
  anchoMm: AnchoPapel,
  modoMargen: ModoMargen = 'driver',
  declararTamano = true,
  corrimientoMm = 0,
): Promise<ValeAbierto> {
  const esA4 = anchoMm >= 200;
  const html = documentoVale({
    anchoMm,
    texto: esA4 ? null : textoDe(c, anchoMm),
    htmlA4: esA4 ? htmlDe(c) : null,
    modoMargen,
    declararTamano,
    corrimientoMm,
  });

  const carpeta = mkdtempSync(join(tmpdir(), 'sfida-vale-'));
  const archivo = join(carpeta, 'vale.html');
  writeFileSync(archivo, html, 'utf8');

  valesAbiertos += 1;
  const w = new BrowserWindow({
    show: false,
    // El ancho no cambia la impresión (eso lo mandan @page y pageSize), pero
    // sí el recorte de capturePage() si alguna vez se quiere una foto.
    width: Math.round(anchoMm * 96 / 25.4) + 60,
    height: 1200,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });

  try {
    await w.loadFile(archivo);
    // TRAMPA 7: si se mide con la fuente de reserva, el alto sale mal.
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const medidas = (await w.webContents.executeJavaScript('window.__medidas()')) as Medidas;
    return { w, medidas, carpeta };
  } catch (e) {
    cerrarVale({ w, carpeta } as ValeAbierto);
    throw e;
  }
}

function cerrarVale(v: Pick<ValeAbierto, 'w' | 'carpeta'>): void {
  if (v.w && !v.w.isDestroyed()) v.w.destroy();
  valesAbiertos = Math.max(0, valesAbiertos - 1);
  try {
    rmSync(v.carpeta, { recursive: true, force: true, maxRetries: 2 });
  } catch {
    /* el sistema se encarga de los temporales */
  }
}

/**
 * TRAMPA 1: `print()` mide en MICRONES.
 *
 * TRAMPA 9, y es la que dejaba media hoja en blanco arriba de cada ticket:
 * cuando se pide una hoja a medida, Chromium la manda a Windows en el
 * DEVMODE (`dmPaperWidth`/`dmPaperLength`) SIN apagar `dmPaperSize`. Con la
 * bandera del papel puesta, casi ningún controlador mira el alto a medida:
 * se queda con el papel que tiene configurado (una A4, o el rollo de 297 mm).
 * Entonces la hoja que armó Chromium —80 × 150 mm, pongamos— es más chica que
 * la del controlador y **Chromium la centra**: quedan dos franjas en blanco
 * iguales, una arriba y otra abajo. Por eso el PDF salía bien (ahí la medida
 * la pone Chromium y nadie la discute) y el papel salía con la mitad vacía.
 *
 * La versión de Python no lo sufría porque Qt dibuja el vale desde el borde
 * de arriba de la hoja, mida lo que mida.
 *
 * La única forma segura de que el ticket empiece arriba de todo es que la
 * hoja mida lo mismo que el papel del controlador, y para eso hay que NO
 * pedir ninguna medida: `undefined` deja mandar a la impresora.
 *
 * `ajustarAlto` vuelve al modo anterior, para los rollos cuyo controlador sí
 * acepta el alto a medida y corta el papel justo donde termina el vale.
 */
function pageSizeParaPrint(
  anchoMm: number,
  altoHojaMm: number,
  ajustarAlto: boolean,
): 'A4' | { width: number; height: number } | undefined {
  if (anchoMm >= 200) return 'A4';
  if (!ajustarAlto) return undefined;
  return {
    width: Math.round(anchoMm * MICRAS_POR_MM),
    height: Math.round(Math.max(altoHojaMm, 40) * MICRAS_POR_MM),
  };
}

/** TRAMPA 2: `printToPDF()` mide en PULGADAS. */
function pageSizeParaPdf(anchoMm: number, altoHojaMm: number): 'A4' | { width: number; height: number } {
  if (anchoMm >= 200) return 'A4';
  return {
    width: anchoMm * PULGADAS_POR_MM,
    height: Math.max(altoHojaMm, 40) * PULGADAS_POR_MM,
  };
}

/** Devuelve el vale renderizado, para la vista previa de la pantalla. */
export async function vistaPrevia(
  c: Comprobante,
  anchoMm: AnchoPapel,
  corrimientoMm = 0,
): Promise<VistaPreviaVale> {
  const v = await abrirVale(c, anchoMm, 'driver', true, corrimientoMm);
  try {
    return {
      html: v.medidas.html,
      anchoMm: v.medidas.anchoMm,
      margenMm: v.medidas.margenMm,
      utilMm: v.medidas.utilMm,
      cols: v.medidas.cols,
      tamLetraPt: v.medidas.tamLetraPt,
      altoHojaMm: v.medidas.altoHojaMm,
      lineaMasLarga: v.medidas.lineaMasLarga,
    };
  } finally {
    cerrarVale(v);
  }
}

/** Manda el vale a la impresora. */
export async function imprimirVale(
  c: Comprobante,
  anchoMm: AnchoPapel,
  deviceName: string,
  copias: number,
  ajustarAlto = false,
  modoMargen: ModoMargen = 'driver',
  corrimientoMm = 0,
): Promise<{ ok: boolean; motivo?: string }> {
  // El A4 sí declara su tamaño; el ticket solo cuando además se le pide la
  // medida a la impresora. Si no, manda el papel del controlador.
  const declararTamano = anchoMm >= 200 || ajustarAlto;
  const v = await abrirVale(c, anchoMm, modoMargen, declararTamano, corrimientoMm);
  try {
    const config: Electron.WebContentsPrintOptions = {
      silent: true,
      deviceName, // TRAMPA 3
      copies: Math.max(1, Number(copias) || 1),
      printBackground: true,
      color: false,
    };
    // TRAMPA 9: si no se pide medida, la hoja es la del controlador y el
    // ticket arranca arriba de todo. Pedirla y que no la respeten es lo que
    // deja el ticket centrado, con media hoja en blanco encima.
    const hoja = pageSizeParaPrint(anchoMm, v.medidas.altoHojaMm, ajustarAlto);
    if (hoja) config.pageSize = hoja;
    // TRAMPA 4
    if (modoMargen === 'driver') config.margins = { marginType: 'none' };

    return await new Promise((resolve) => {
      v.w.webContents.print(config, (ok, motivo) => resolve({ ok, motivo }));
    });
  } finally {
    cerrarVale(v);
  }
}

/**
 * Cuánto blanco queda a cada lado del vale en una hoja de `anchoHojaMm`.
 *
 * Es la comprobación de que el vale arranca SIEMPRE a la misma distancia del
 * borde izquierdo, mida lo que mida la hoja. Hace falta porque el error no se
 * veía en la vista previa: ahí la hoja siempre mide lo que dice el papel, y en
 * la impresora casi nunca. Por eso acá se **emula la impresión**
 * (`media: print`) sobre una hoja del ancho que se pida, que es como
 * reproducir un controlador que declara 74 mm para un rollo de 80 —o los
 * 216 mm de una hoja carta, que es lo que Chromium usa cuando no se le pide
 * ninguna medida (TRAMPA 28).
 *
 * Devuelve milímetros. `izquierdaMm` tiene que dar el margen del papel en los
 * tres casos; si crece con la hoja, el vale se está centrando y se va a salir
 * del rollo.
 */
export async function medirMargenesLaterales(
  c: Comprobante,
  anchoMm: AnchoPapel,
  anchoHojaMm: number,
  corrimientoMm = 0,
): Promise<{ izquierdaMm: number; derechaMm: number; hojaMm: number }> {
  const esA4 = anchoMm >= 200;
  const html = documentoVale({
    anchoMm,
    texto: esA4 ? null : textoDe(c, anchoMm),
    htmlA4: esA4 ? htmlDe(c) : null,
    modoMargen: 'driver',
    declararTamano: false,
    corrimientoMm,
  });
  const carpeta = mkdtempSync(join(tmpdir(), 'sfida-centrado-'));
  const archivo = join(carpeta, 'vale.html');
  writeFileSync(archivo, html, 'utf8');

  valesAbiertos += 1;
  const w = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: Math.round((anchoHojaMm * 96) / 25.4),
    height: 1400,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    await w.loadFile(archivo);
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    let adjunto = false;
    try {
      w.webContents.debugger.attach('1.3');
      adjunto = true;
      await w.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
    } catch {
      /* sin emulación la medida no sirve: se avisa devolviendo NaN */
    }
    const r = (await w.webContents.executeJavaScript(`(function () {
      var MM = 96 / 25.4;
      var caja = document.getElementById('hoja').getBoundingClientRect();
      // clientWidth y no innerWidth: descuenta la barra de desplazamiento, que
      // no existe en el papel y correría la medición.
      var hoja = document.documentElement.clientWidth;
      return {
        izquierdaMm: caja.left / MM,
        derechaMm: (hoja - caja.right) / MM,
        hojaMm: hoja / MM
      };
    })()`)) as { izquierdaMm: number; derechaMm: number; hojaMm: number };
    if (adjunto) w.webContents.debugger.detach();
    return r;
  } finally {
    cerrarVale({ w, carpeta });
  }
}

/**
 * Foto del vale tal como se va a imprimir. Solo para verificar: mirar la
 * imagen es más rápido que abrir el PDF, y es lo que permite comparar contra
 * el ticket que sale de la impresora de verdad.
 */
export async function capturarVale(
  c: Comprobante,
  anchoMm: AnchoPapel,
  ruta: string,
): Promise<boolean> {
  const v = await abrirVale(c, anchoMm);
  try {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        const foto = await v.w.webContents.capturePage();
        writeFileSync(ruta, foto.toPNG());
        return true;
      } catch {
        // UnknownVizError en el primer arranque en frío: reintentar una vez.
        if (intento === 2) return false;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return false;
  } finally {
    cerrarVale(v);
  }
}

/** Guarda el vale como PDF. */
export async function pdfVale(
  c: Comprobante,
  anchoMm: AnchoPapel,
  ruta: string,
  modoMargen: ModoMargen = 'driver',
): Promise<{ ok: boolean; motivo?: string; medidas: Medidas }> {
  const v = await abrirVale(c, anchoMm, modoMargen);
  try {
    const config: Electron.PrintToPDFOptions = {
      printBackground: true,
      pageSize: pageSizeParaPdf(anchoMm, v.medidas.altoHojaMm), // TRAMPA 2
    };
    if (modoMargen === 'driver') config.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    const datosPdf = await v.w.webContents.printToPDF(config);
    writeFileSync(ruta, datosPdf);
    return { ok: true, medidas: v.medidas };
  } catch (e) {
    return { ok: false, motivo: (e as Error)?.message ?? String(e), medidas: v.medidas };
  } finally {
    cerrarVale(v);
  }
}
