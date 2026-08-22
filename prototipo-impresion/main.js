/* ---------------------------------------------------------------------------
 * SFIDA - FASE 0: prototipo de impresion termica.
 *
 * Una sola ventana, sin base de datos. Lo unico que prueba es lo que puede
 * hacer fracasar la migracion entera: que el vale salga bien en la GOOJPRT de
 * 80 mm del almacen (y en 58 mm y A4).
 *
 * Tres cosas que NO son obvias y estan marcadas donde aparecen:
 *   1. webContents.print()      -> pageSize en MICRONES  (80 mm = 80000)
 *   2. webContents.printToPDF() -> pageSize en PULGADAS  (80 mm = 3.1496)
 *   3. silent:true necesita deviceName explicito, y margins:{marginType:'none'}
 *      es lo que evita que el driver termico agregue margenes propios.
 * ------------------------------------------------------------------------- */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const MICRAS_POR_MM = 1000;
const PULGADAS_POR_MM = 1 / 25.4;

let ventana = null;

// Cuantas ventanas ocultas de vale hay abiertas ahora mismo.
//
// TRAMPA: si se destruye la ultima BrowserWindow, Electron dispara
// 'window-all-closed' y la app se cierra. Como el vale se arma en una ventana
// oculta aparte, en cuanto esa ventana se destruye y no queda ninguna otra
// viva, el proceso se va y la siguiente carga falla con ERR_FAILED (-2).
// Cuesta reconocerlo porque el error habla de la carga del archivo y no tiene
// nada que ver con el archivo. Por eso se lleva la cuenta.
let valesAbiertos = 0;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'SFIDA · Prototipo de impresión (fase 0)',
    backgroundColor: '#f6f8fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ventana.setMenuBarVisibility(false);
  ventana.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  // `npm run verificar` no abre la interfaz: genera los PDF de los tres
  // formatos, imprime las medidas y cierra. Sirve para comprobar el resultado
  // mirando los archivos, que es la unica forma seria de validar esto.
  if (process.argv.includes('--verificar')) {
    await verificar();
    app.quit();
    return;
  }
  crearVentana();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  // No cerrar mientras haya un vale en curso: ver el comentario de `valesAbiertos`.
  if (valesAbiertos > 0) return;
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------- impresoras
ipcMain.handle('impresoras', async () => {
  if (!ventana) return [];
  const lista = await ventana.webContents.getPrintersAsync();
  // La predeterminada primero, igual que en la version Qt.
  const predet = lista.find((i) => i.isDefault);
  const resto = lista.filter((i) => !i.isDefault);
  return (predet ? [predet] : []).concat(resto).map((i) => ({
    name: i.name,
    displayName: i.displayName || i.name,
    description: i.description || '',
    status: i.status,
    isDefault: !!i.isDefault,
  }));
});

// -------------------------------------------------------- ventana del vale
/**
 * Abre la ventana OCULTA con el vale ya armado y devuelve sus medidas.
 * Nunca se imprime la ventana de la interfaz: saldrian los botones en el papel.
 */
async function abrirVale({ anchoMm, modoMargen, regla }) {
  valesAbiertos += 1;
  const w = new BrowserWindow({
    show: false,
    // El ancho de la ventana no cambia la impresion (eso lo manda @page y
    // pageSize), pero si el recorte de capturePage(): si la ventana es mas
    // angosta que la hoja, la foto de verificacion sale cortada.
    width: Math.round(anchoMm * 96 / 25.4) + 60,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // que la ventana oculta igual haga layout
      backgroundThrottling: false,
    },
  });

  const ahora = new Date().toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');

  await w.loadFile(path.join(__dirname, 'print.html'), {
    query: {
      mm: String(anchoMm),
      margen: modoMargen,
      regla: regla ? '1' : '0',
      ahora,
    },
  });

  try {
    // Esperar a que las fuentes esten listas antes de medir: si se mide con la
    // fuente de reserva, el alto sale mal y el rollo bota papel de mas.
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const medidas = await w.webContents.executeJavaScript('window.__medidas()');
    return { w, medidas };
  } catch (e) {
    cerrarVale(w);
    throw e;
  }
}

/** Cierra la ventana del vale llevando la cuenta (ver `valesAbiertos`). */
function cerrarVale(w) {
  if (w && !w.isDestroyed()) w.destroy();
  valesAbiertos = Math.max(0, valesAbiertos - 1);
}

/** Traduce el ancho de papel a lo que espera webContents.print() (MICRONES). */
function pageSizeParaPrint(anchoMm, altoHojaMm) {
  if (anchoMm >= 200) return 'A4';
  return {
    width: Math.round(anchoMm * MICRAS_POR_MM),                    // 80 mm -> 80000
    height: Math.round(Math.max(altoHojaMm, 40) * MICRAS_POR_MM),  // el rollo mide justo
  };
}

/** Traduce el ancho de papel a lo que espera printToPDF() (PULGADAS). */
function pageSizeParaPdf(anchoMm, altoHojaMm) {
  if (anchoMm >= 200) return 'A4';
  return {
    width: anchoMm * PULGADAS_POR_MM,
    height: Math.max(altoHojaMm, 40) * PULGADAS_POR_MM,
  };
}

// ------------------------------------------------------------- vista previa
ipcMain.handle('previsualizar', async (_e, opciones) => {
  const { w, medidas } = await abrirVale(opciones);
  const html = await w.webContents.executeJavaScript(
    'document.getElementById("hoja").outerHTML');
  const fuente = await w.webContents.executeJavaScript(
    'getComputedStyle(document.getElementById("hoja")).fontFamily');
  cerrarVale(w);
  return { medidas, html, fuente };
});

// ------------------------------------------------------------------ imprimir
ipcMain.handle('imprimir', async (_e, opciones) => {
  const { anchoMm, modoMargen, deviceName, copias } = opciones;
  const { w, medidas } = await abrirVale(opciones);

  const config = {
    silent: true,
    deviceName,                 // silent:true necesita la impresora explicita
    copies: Math.max(1, Number(copias) || 1),
    printBackground: true,
    color: false,
    pageSize: pageSizeParaPrint(anchoMm, medidas.altoHojaMm),
  };
  // marginType 'none' evita que el driver termico agregue margenes propios.
  // En modo «css» se deja que mande la regla @page del documento.
  if (modoMargen === 'driver') config.margins = { marginType: 'none' };

  const resultado = await new Promise((resolve) => {
    w.webContents.print(config, (ok, motivo) => resolve({ ok, motivo }));
  });
  cerrarVale(w);
  return { ...resultado, medidas, config: describir(config) };
});

// ---------------------------------------------------- dialogo del sistema
ipcMain.handle('imprimir-con-dialogo', async (_e, opciones) => {
  const { anchoMm, modoMargen } = opciones;
  const { w, medidas } = await abrirVale(opciones);

  const config = {
    silent: false,
    printBackground: true,
    color: false,
    pageSize: pageSizeParaPrint(anchoMm, medidas.altoHojaMm),
  };
  if (modoMargen === 'driver') config.margins = { marginType: 'none' };

  const resultado = await new Promise((resolve) => {
    w.webContents.print(config, (ok, motivo) => resolve({ ok, motivo }));
  });
  cerrarVale(w);
  return { ...resultado, medidas, config: describir(config) };
});

// --------------------------------------------------------------- guardar PDF
ipcMain.handle('pdf', async (_e, opciones) => {
  const { anchoMm, modoMargen } = opciones;
  const sugerido = 'vale_ejemplo_' + anchoMm + 'mm_' + modoMargen + '.pdf';
  const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
    title: 'Guardar el vale en PDF',
    defaultPath: path.join(app.getPath('desktop'), sugerido),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { ok: false, motivo: 'cancelado' };

  const { w, medidas } = await abrirVale(opciones);
  const config = {
    printBackground: true,
    // OJO: printToPDF mide en PULGADAS, no en micrones como print()
    pageSize: pageSizeParaPdf(anchoMm, medidas.altoHojaMm),
  };
  if (modoMargen === 'driver') {
    config.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  }

  try {
    const datos = await w.webContents.printToPDF(config);
    fs.writeFileSync(filePath, datos);
    cerrarVale(w);
    return { ok: true, ruta: filePath, medidas, config: describir(config) };
  } catch (e) {
    cerrarVale(w);
    return { ok: false, motivo: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle('abrir-archivo', async (_e, ruta) => {
  await shell.openPath(ruta);
});

/** Deja la configuracion legible para mostrarla en el registro de la pantalla. */
function describir(config) {
  const copia = JSON.parse(JSON.stringify(config));
  return JSON.stringify(copia, null, 2);
}

// ============================================================== verificacion
/**
 * Genera los PDF de los tres formatos (en los dos modos de margen para el
 * ticket) y deja las medidas por consola. No imprime ni abre ventanas visibles.
 */
async function verificar() {
  const carpeta = path.join(__dirname, 'salida');
  fs.mkdirSync(carpeta, { recursive: true });

  // Ventana ancla: en modo verificacion no hay interfaz, asi que sin esto,
  // apenas se destruye la ventana del primer vale no queda ninguna viva,
  // Electron cierra la app y el vale siguiente falla con ERR_FAILED (-2).
  const ancla = new BrowserWindow({ show: false });
  await ancla.loadURL('data:text/html,<title>ancla</title>');

  const casos = [
    { anchoMm: 80, modoMargen: 'driver', regla: true },
    { anchoMm: 80, modoMargen: 'css', regla: true },
    { anchoMm: 58, modoMargen: 'driver', regla: true },
    { anchoMm: 58, modoMargen: 'css', regla: true },
    { anchoMm: 210, modoMargen: 'css', regla: false },
  ];

  let fallas = 0;
  console.log('\n=== SFIDA · verificacion del prototipo de impresion ===\n');

  for (const caso of casos) {
    const etiqueta = caso.anchoMm + 'mm/' + caso.modoMargen;
    let w;
    try {
      const abierto = await abrirVale(caso);
      w = abierto.w;
      const m = abierto.medidas;

      const config = {
        printBackground: true,
        pageSize: pageSizeParaPdf(caso.anchoMm, m.altoHojaMm),
      };
      if (caso.modoMargen === 'driver') {
        config.margins = { top: 0, bottom: 0, left: 0, right: 0 };
      }
      const datos = await w.webContents.printToPDF(config);
      const ruta = path.join(carpeta,
        'vale_' + caso.anchoMm + 'mm_' + caso.modoMargen + '.pdf');
      fs.writeFileSync(ruta, datos);

      // Ademas del PDF, una foto de como quedo: se mira mas rapido y sirve
      // para comparar contra el ticket que sale de la impresora de verdad.
      //
      // capturePage() puede fallar con «UnknownVizError» en el primer arranque
      // en frio (es un tropiezo del compositor de Chromium, visto con Electron
      // 43). NO participa de la impresion: es solo diagnostico, asi que un
      // fallo aca no puede contar como problema del vale ni frenar el resto.
      const rutaPng = ruta.replace(/\.pdf$/, '.png');
      let capturado = false;
      for (let intento = 1; intento <= 2 && !capturado; intento++) {
        try {
          const foto = await w.webContents.capturePage();
          fs.writeFileSync(rutaPng, foto.toPNG());
          capturado = true;
        } catch (err) {
          if (intento === 2) {
            console.log('  (aviso: no se pudo capturar el PNG: '
              + (err && err.message ? err.message : err) + ' — el PDF sí se generó)');
          } else {
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      }

      const entra = m.lineaMasLarga == null || m.lineaMasLarga <= m.cols;
      if (!entra) fallas++;

      console.log('--- ' + etiqueta + ' ---');
      console.log('  ancho util          : ' + m.utilMm.toFixed(2) + ' mm');
      console.log('  columnas            : ' + m.cols);
      console.log('  letra medida        : ' + m.tamLetraPt.toFixed(2) + ' pt');
      console.log('  alto de la hoja     : ' + m.altoHojaMm.toFixed(2) + ' mm'
        + (m.lineas ? '  (' + m.lineas + ' lineas)' : ''));
      if (m.lineaMasLarga != null) {
        console.log('  linea mas larga     : ' + m.lineaMasLarga + ' de ' + m.cols
          + (entra ? '   OK' : '   ¡SE PASA DEL PAPEL!'));
      }
      console.log('  pageSize print()    : '
        + JSON.stringify(pageSizeParaPrint(caso.anchoMm, m.altoHojaMm)) + '   (micrones)');
      console.log('  pageSize printToPDF : ' + JSON.stringify(config.pageSize) + '   (pulgadas)');
      console.log('  PDF                 : ' + ruta + '\n');
    } catch (e) {
      fallas++;
      console.log('--- ' + etiqueta + ' --- ERROR: ' + (e && e.message ? e.message : e) + '\n');
    } finally {
      if (w) cerrarVale(w);
    }
  }

  // Las impresoras que ve el sistema
  try {
    const lista = await ancla.webContents.getPrintersAsync();
    console.log('=== Impresoras que ve Electron (' + lista.length + ') ===');
    for (const i of lista) {
      console.log('  ' + (i.isDefault ? '*' : ' ') + ' ' + i.name
        + (i.displayName && i.displayName !== i.name ? '   [' + i.displayName + ']' : '')
        + '   estado=' + i.status);
    }
  } catch (e) {
    console.log('No se pudo listar impresoras: ' + e.message);
  }
  ancla.destroy();

  console.log('\nResultado: ' + (fallas ? fallas + ' problema(s)' : 'sin problemas')
    + '. Abri los PDF de ' + carpeta + ' y miralos.\n');
  process.exitCode = fallas ? 1 : 0;
}
