/* ---------------------------------------------------------------------------
 * Genera los PDF de los tres formatos desde un vale real de la base de
 * demostración y comprueba las medidas.
 *
 * Uso:  npm run verificar:impresion
 * ------------------------------------------------------------------------- */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const salida = join(raiz, 'salida-impresion');

const rutaPathTxt = join(raiz, 'node_modules', 'electron', 'path.txt');
if (!existsSync(rutaPathTxt)) {
  console.error('Electron no está descargado. Corré: node node_modules/electron/install.js');
  process.exit(1);
}
const electron = join(raiz, 'node_modules', 'electron', 'dist', readFileSync(rutaPathTxt, 'utf8').trim());

const demo = join(raiz, 'datos', 'sfida_demo.db');
if (!existsSync(demo)) {
  console.error('Falta la base de demostración. Corré: node scripts/sembrar-demo.mjs');
  process.exit(1);
}

const r = spawnSync(electron, [join(raiz, 'out', 'main', 'index.js')], {
  encoding: 'utf8',
  windowsHide: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    SFIDA_DB: demo,
    SFIDA_VERIFICAR_IMPRESION: salida,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
});

process.exit(r.status ?? 1);
