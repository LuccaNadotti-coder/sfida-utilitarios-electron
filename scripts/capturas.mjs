/* ---------------------------------------------------------------------------
 * Saca capturas de la app ya compilada, en los tamaños que interesan.
 *
 * 1366×768 es lo que hay en el almacén y es donde la versión Qt se rompía:
 * los botones se montaban encima de las tablas. Cada captura que se genere
 * acá hay que MIRARLA, no solo comprobar que el archivo existe.
 *
 * Uso:  npm run capturas
 * ------------------------------------------------------------------------- */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const carpeta = join(raiz, 'capturas');

const rutaPathTxt = join(raiz, 'node_modules', 'electron', 'path.txt');
if (!existsSync(rutaPathTxt)) {
  console.error('Electron no está descargado. Corré: node node_modules/electron/install.js');
  process.exit(1);
}
const electron = join(
  raiz,
  'node_modules',
  'electron',
  'dist',
  readFileSync(rutaPathTxt, 'utf8').trim(),
);

// Las capturas se sacan contra la base de DEMOSTRACIÓN, no contra la de
// desarrollo ni la real: así muestran pantallas con datos y no vacías.
const demo = join(raiz, 'datos', 'sfida_demo.db');
if (!existsSync(demo)) {
  console.error('Falta la base de demostración. Corré primero: node scripts/sembrar-demo.mjs');
  process.exit(1);
}

const r = spawnSync(electron, [join(raiz, 'out', 'main', 'index.js')], {
  encoding: 'utf8',
  windowsHide: true,
  env: {
    ...process.env,
    SFIDA_DB: demo,
    SFIDA_CAPTURA: carpeta,
    SFIDA_CAPTURA_TAMANOS: process.env.SFIDA_CAPTURA_TAMANOS || '1366x768,1920x1080',
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
});

const salida = ((r.stdout || '') + (r.stderr || ''))
  .split('\n')
  .filter((l) => /\[SFIDA\]|\[captura\]|\[layout\]/.test(l))
  .join('\n');

console.log(salida || '(sin salida)');

if (!/\[captura\].*\.png/.test(salida)) {
  console.error('\nNo se generó ninguna captura.');
  process.exit(1);
}
console.log('\nCapturas en: ' + carpeta);
