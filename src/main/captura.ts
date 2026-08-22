/* ---------------------------------------------------------------------------
 * Modo captura: abre la app, recorre las pantallas, saca fotos y se cierra.
 *
 * Es lo que produce las capturas de cada pantalla en 1366×768 y en 1920×1080.
 * 1366×768 es lo que hay en el almacén y es donde la versión Qt se rompía: los
 * botones se montaban encima de las tablas. Cada captura hay que MIRARLA, no
 * solo comprobar que el archivo existe.
 *
 * Se activa con SFIDA_CAPTURA=<carpeta>. Sin esa variable, no hace nada.
 *
 * Por qué una ventana APARTE y oculta: para pedir un tamaño exacto. Una
 * ventana visible la recorta el sistema al tamaño del monitor, así que en una
 * pantalla de 1366 no se podría capturar 1920 de ancho.
 * ------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';

export interface OpcionesCaptura {
  cargar: (v: BrowserWindow) => Promise<void>;
  preload: string;
}

/**
 * Hace clic en la pestaña (chip) que dice ese texto.
 *
 * Se busca por el texto visible y no por posición: si mañana se agrega otra
 * pestaña, la captura sigue apuntando a la correcta en vez de sacar la foto
 * equivocada sin avisar.
 */
const clicEnPestana = (texto: string): string => `(() => {
  const b = [...document.querySelectorAll('button')].find(
    (x) => x.textContent.trim() === ${JSON.stringify(texto)},
  );
  if (!b) return 'no se encontro la pestaña ${texto}';
  b.click();
  return 'ok';
})()`;

/** Pantallas a recorrer: clave del menú + nombre del archivo. */
const PANTALLAS: Array<{ clave: string; archivo: string; antes?: string }> = [
  { clave: 'panel', archivo: '1-panel' },
  { clave: 'stock', archivo: '2-articulos-y-stock' },
  // Las dos pestañas nuevas de la v5, dentro de la misma pantalla de stock.
  { clave: 'stock', archivo: '2b-que-comprar', antes: clicEnPestana('Qué comprar') },
  { clave: 'stock', archivo: '2c-conteo-fisico', antes: clicEnPestana('Conteo físico') },
  { clave: 'ingresos', archivo: '3-ingresos' },
  { clave: 'salidas', archivo: '4-salidas' },
  { clave: 'sucursales', archivo: '5-sucursales' },
  // Reportes abre en el panel nuevo de valor e inversión.
  { clave: 'reportes', archivo: '6-reportes-valor-e-inversion' },
  { clave: 'reportes', archivo: '6b-reportes-consumo', antes: clicEnPestana('Consumo por sucursal') },
  { clave: 'maestro', archivo: '7-maestro-bloqueado' },
  // La misma pantalla, ya desbloqueada con la clave de fábrica.
  {
    clave: 'maestro',
    archivo: '8-maestro-abierto',
    antes: `(() => {
      const campo = document.querySelector('input[type=password]');
      if (!campo) return 'sin campo';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(campo, 'sfida2026');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      const botones = [...document.querySelectorAll('button')];
      const entrar = botones.find((b) => b.textContent.trim() === 'Entrar');
      if (entrar) entrar.click();
      return 'ok';
    })()`,
  },
];

function leerTamanos(): Array<[number, number]> {
  const crudo = process.env.SFIDA_CAPTURA_TAMANOS || '1366x768';
  const salida: Array<[number, number]> = [];
  for (const parte of crudo.split(',')) {
    const m = /^\s*(\d+)\s*x\s*(\d+)\s*$/.exec(parte);
    if (m) salida.push([Number(m[1]), Number(m[2])]);
  }
  return salida.length ? salida : [[1366, 768]];
}

export function capturaActiva(): boolean {
  return Boolean((process.env.SFIDA_CAPTURA || '').trim());
}

/**
 * true mientras se están sacando capturas.
 *
 * TRAMPA (la misma que en el prototipo de impresión): al destruir la última
 * BrowserWindow, Electron dispara 'window-all-closed' y cierra la app. Sacando
 * capturas de a un tamaño por vez, en cuanto se destruye la primera ventana no
 * queda ninguna viva y el proceso se va: las capturas siguientes nunca se
 * sacan y NO hay ningún error, simplemente faltan archivos.
 */
let capturando = false;
export function estaCapturando(): boolean {
  return capturando;
}

async function esperar(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Saca todas las capturas y cierra la aplicación. */
export async function correrCapturas(op: OpcionesCaptura): Promise<string[]> {
  const carpeta = (process.env.SFIDA_CAPTURA || '').trim();
  // 900 ms alcanzaba hasta la v4. Con el panel de valor e inversión, Reportes
  // hace dos consultas pesadas y la foto salía con las tarjetas en cero: no
  // fallaba nada, simplemente se fotografiaba la pantalla antes de tiempo. Es
  // el tipo de error que se ve solo MIRANDO la captura.
  const esperaMs = Number(process.env.SFIDA_CAPTURA_ESPERA || 1600);
  mkdirSync(carpeta, { recursive: true });

  capturando = true;
  const rutas: string[] = [];

  for (const [ancho, alto] of leerTamanos()) {
    const v = new BrowserWindow({
      width: ancho,
      height: alto,
      show: false,
      backgroundColor: '#f6f8fb',
      webPreferences: {
        preload: op.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    // Lo que importa es el tamaño del CONTENIDO, no el de la ventana con su
    // marco: si se captura el marco, 1366 y 1920 no comparan.
    v.setContentSize(ancho, alto);

    await op.cargar(v);
    await esperar(esperaMs + 700); // primer pintado + datos

    for (const p of PANTALLAS) {
      try {
        await v.webContents.executeJavaScript(
          `(() => { const b = document.querySelector('[data-pagina="${p.clave}"]'); if (b) b.click(); return !!b; })()`,
        );
        await esperar(esperaMs);
        if (p.antes) {
          await v.webContents.executeJavaScript(p.antes);
          await esperar(esperaMs);
        }

        let hecho = false;
        for (let intento = 1; intento <= 2 && !hecho; intento++) {
          try {
            const foto = await v.webContents.capturePage();
            const ruta = join(carpeta, `${p.archivo}_${ancho}x${alto}.png`);
            writeFileSync(ruta, foto.toPNG());
            rutas.push(ruta);
            console.log('[captura]', ruta);
            hecho = true;
          } catch (e) {
            // capturePage puede fallar con UnknownVizError en el primer
            // arranque en frío. Es un tropiezo del compositor, no del contenido.
            if (intento === 2) console.log('[captura] falló ' + p.archivo + ':', (e as Error)?.message);
            else await esperar(400);
          }
        }
      } catch (e) {
        console.log('[captura] error en ' + p.archivo + ':', (e as Error)?.message);
      }
    }

    // Verificación de layout: nada puede desbordar a lo ancho. Es el bug que
    // arrastraba la versión Qt y no se puede repetir.
    try {
      const informe = (await v.webContents.executeJavaScript(
        `JSON.stringify({
           anchoDoc: document.documentElement.scrollWidth,
           anchoVista: document.documentElement.clientWidth,
           desbordes: [...document.querySelectorAll('*')]
             .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1)
             .slice(0, 5)
             .map((e) => e.tagName + '.' + String(e.className).slice(0, 40))
         })`,
      )) as string;
      console.log('[layout]', ancho + 'x' + alto, informe);
    } catch {
      /* si no se puede leer, las capturas igual quedaron */
    }

    v.destroy();
  }

  capturando = false;
  app.quit();
  return rutas;
}
