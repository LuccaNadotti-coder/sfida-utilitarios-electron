/* ---------------------------------------------------------------------------
 * Puente entre la ventana y el proceso principal.
 *
 * contextIsolation: true y nodeIntegration: false, igual que va a ser en la
 * app de verdad. La pantalla no ve `require` ni `ipcRenderer`: solo estas
 * cinco funciones.
 * ------------------------------------------------------------------------- */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sfida', {
  impresoras: () => ipcRenderer.invoke('impresoras'),
  previsualizar: (opciones) => ipcRenderer.invoke('previsualizar', opciones),
  imprimir: (opciones) => ipcRenderer.invoke('imprimir', opciones),
  imprimirConDialogo: (opciones) => ipcRenderer.invoke('imprimir-con-dialogo', opciones),
  guardarPdf: (opciones) => ipcRenderer.invoke('pdf', opciones),
  abrirArchivo: (ruta) => ipcRenderer.invoke('abrir-archivo', ruta),
});
