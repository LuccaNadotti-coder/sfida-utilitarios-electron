import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// `app.getVersion()` devuelve la versión de Electron cuando se corre desde el
// código (no empaquetado), así que en desarrollo mostraba «SFIDA v43.2.0».
// La versión de verdad se fija en tiempo de compilación desde package.json.
const pkg = createRequire(import.meta.url)('./package.json') as { version: string };
const VERSION_APP = JSON.stringify(pkg.version);

export default defineConfig({
  main: {
    define: { __VERSION_APP__: VERSION_APP },
    // externalizeDepsPlugin deja `better-sqlite3` FUERA del bundle.
    //
    // Es imprescindible: es un módulo nativo y su binario .node se carga en
    // tiempo de ejecución desde node_modules/better-sqlite3/prebuilds/. Si el
    // empaquetador lo metiera adentro del bundle, el require del .node se
    // rompería con un error que no se parece en nada al problema real.
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@compartido': resolve('src/compartido'),
      },
    },
    plugins: [react(), tailwind()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
      },
    },
  },
});
