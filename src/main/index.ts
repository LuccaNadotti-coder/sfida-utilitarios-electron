/* ---------------------------------------------------------------------------
 * Proceso principal.
 *
 * FASE 1: abre la ventana, abre la base y expone los dos canales que hacen
 * falta para listar artículos. La lógica de negocio (el port de sfida_core.py)
 * es la fase 2 y vive en `src/main/nucleo/`, sin importar nada de Electron,
 * para que se pueda probar sin abrir ninguna ventana.
 * ------------------------------------------------------------------------- */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { app, BrowserWindow, dialog, shell } from 'electron';
import type { Database } from 'better-sqlite3';

import { capturaActiva, correrCapturas, estaCapturando } from './captura';
import { hayValesAbiertos } from './impresion/imprimir';
import { verificacionImpresionActiva, verificarImpresion } from './impresion/verificar';
import { conectar } from './db/conexion';
import { registrarIpc } from './ipc';
import { resolverRutaBd, verificarModoSeguro } from './rutas';

const __dirname_ = dirname(fileURLToPath(import.meta.url));

/** Raíz del proyecto en desarrollo (out/main/index.js -> ../../). */
const RAIZ_PROYECTO = join(__dirname_, '..', '..');

let ventana: BrowserWindow | null = null;
let db: Database | null = null;

const RUTA_PRELOAD = join(__dirname_, '..', 'preload', 'index.mjs');

/** Carga la pantalla: el servidor de Vite en desarrollo, el archivo si no. */
async function cargarPantalla(v: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await v.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await v.loadFile(join(__dirname_, '..', 'renderer', 'index.html'));
  }
}

function abrirBase(): void {
  const rutaResuelta = resolverRutaBd(app.isPackaged, RAIZ_PROYECTO);

  // Salvaguarda: ningún modo de verificación puede tocar la base real.
  // Se comprueba ANTES de abrirla, no después.
  if (capturaActiva()) verificarModoSeguro(rutaResuelta, 'captura');
  if (verificacionImpresionActiva()) verificarModoSeguro(rutaResuelta, 'verificación de impresión');

  const apertura = conectar(rutaResuelta.ruta);
  db = apertura.db;

  console.log('[SFIDA] base de datos:', apertura.ruta);
  console.log('[SFIDA] origen de la ruta:', rutaResuelta.origen,
    rutaResuelta.esProduccion ? '(PRODUCCIÓN)' : '(no es la de producción)');
  if (apertura.respaldo.hecho) {
    console.log('[SFIDA] respaldo previo creado:', apertura.respaldo.ruta);
  }
  if (apertura.respaldoAuto?.hecho) {
    console.log('[SFIDA] respaldo de esta apertura:', apertura.respaldoAuto.ruta);
    if (apertura.respaldoAuto.borrados.length) {
      console.log('[SFIDA] respaldos viejos borrados:', apertura.respaldoAuto.borrados.length);
    }
  }
  if (apertura.migracion) {
    const m = apertura.migracion;
    console.log(
      `[SFIDA] base migrada de la v${m.desde} a la v${m.hasta}: ` +
        `${m.columnasAgregadas} columnas, ${m.articulosConvertidos} articulos a unidad chica, ` +
        `${m.ingresosNumerados} ingresos numerados`,
    );
  }

  registrarIpc({
    db: apertura.db,
    ruta: apertura.ruta,
    carpeta: rutaResuelta.carpeta,
    origen: rutaResuelta.origen,
    esProduccion: rutaResuelta.esProduccion,
    existiaAntes: apertura.existiaAntes,
    respaldo: {
      hecho: apertura.respaldo.hecho,
      motivo: apertura.respaldo.motivo,
      ruta: apertura.respaldo.ruta,
    },
    ventana: () => ventana,
  });
}

function crearVentana(): void {
  ventana = new BrowserWindow({
    // 1366x768 es lo que hay en el almacén: la ventana no puede nacer más
    // grande que la pantalla ni exigir más de lo que esa pantalla da.
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 640,
    show: false,
    backgroundColor: '#f6f8fb',
    title: 'SFIDA · Control de Útiles',
    webPreferences: {
      preload: RUTA_PRELOAD,
      contextIsolation: true,   // NO desactivar
      nodeIntegration: false,   // NO desactivar
      sandbox: false,           // el preload necesita require() del bridge
    },
  });

  // Abrir ya maximizada-adaptada: nunca más grande que el área disponible.
  ventana.once('ready-to-show', () => {
    ventana?.show();
  });

  // Cualquier enlace externo se abre en el navegador, no adentro de la app.
  //
  // Y SOLO si es http/https. `shell.openExternal()` le entrega la dirección al
  // sistema operativo, que sabe abrir muchas más cosas que páginas web: con
  // `file:` abre un archivo del disco, y hay esquemas que directamente lanzan
  // programas. Como los datos del almacén entran por CSV, alcanzaría con que
  // alguien pusiera una dirección rara en un nombre para tener un clic que
  // ejecuta algo. Con la lista blanca, ese clic no hace nada.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // La ventana NO navega a ningún lado. Esta app es una sola pantalla: si algo
  // la hiciera cargar otra dirección, esa página quedaría corriendo CON el
  // preload puesto, o sea con acceso a `window.sfida` y a toda la base.
  // Cargar el archivo propio (y recargarlo en desarrollo) sigue permitido.
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (url !== ventana?.webContents.getURL()) evento.preventDefault();
  });

  void cargarPantalla(ventana);
}

app.whenReady().then(async () => {
  // TODO el arranque va dentro del try. Sin esto, si algo falla acá la
  // promesa queda rechazada sin que nadie la atienda: Electron NO cierra
  // (no hay ventanas que cerrar, así que 'window-all-closed' nunca se
  // dispara) y el proceso se queda colgado para siempre, sin ventana y sin
  // mensaje. Costó un proceso zombi descubrirlo.
  try {
    abrirBase();

    // Modo captura: no abre la ventana normal, saca las fotos y cierra.
    if (capturaActiva()) {
      await correrCapturas({ cargar: cargarPantalla, preload: RUTA_PRELOAD });
      return;
    }

    // Modo verificación de impresión: genera los PDF y cierra.
    if (verificacionImpresionActiva() && db) {
      await verificarImpresion(db);
      return;
    }

    crearVentana();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error('\n[SFIDA] no se pudo arrancar:\n' + mensaje + '\n');
    // En modo verificación alcanza con la consola; con interfaz, la persona
    // del almacén necesita ver algo en pantalla y no una ventana que no abre.
    if (!capturaActiva() && !verificacionImpresionActiva()) {
      dialog.showErrorBox('SFIDA no pudo abrirse', mensaje);
    }
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  // No cerrar entre una captura y la siguiente: ver `estaCapturando()`.
  if (estaCapturando()) return;
  // Tampoco mientras hay un vale armándose en su ventana oculta.
  if (hayValesAbiertos()) return;
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  try {
    db?.close();
  } catch {
    /* cerrando: no hay nada que hacer si falla */
  }
});
