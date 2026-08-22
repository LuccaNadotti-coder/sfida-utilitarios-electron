/* ---------------------------------------------------------------------------
 * postinstall: comprueba que better-sqlite3 CARGA de verdad dentro de Electron.
 *
 * POR QUE ESTO Y NO @electron/rebuild
 * -----------------------------------
 * El plan original era poner `electron-rebuild` en el postinstall, porque
 * historicamente better-sqlite3 habia que recompilarlo para el ABI de Electron
 * (si no, el famoso error de NODE_MODULE_VERSION).
 *
 * Eso ya no aplica: better-sqlite3 13.x usa N-API (node-addon-api), que es
 * estable entre Node y Electron, y trae un unico binario por plataforma en
 * `prebuilds/` que sirve para los dos. Probado: carga en Electron 43.2.0 sin
 * recompilar nada.
 *
 * Peor todavia, al probar @electron/rebuild 4.2.0 contra better-sqlite3 13.0.3
 * dijo «✔ Rebuild Complete» y NO genero ningun .node: dejo un `build/Release/`
 * con un marcador y una carpeta `obj` vacia. O sea que da un OK falso. Una
 * herramienta que dice que funciono sin haber hecho nada es peor que no
 * tenerla, porque tapa el problema que venia a resolver.
 *
 * Asi que en vez de recompilar a ciegas, esto COMPRUEBA. Abre Electron de
 * verdad, carga el modulo, hace una consulta y mira el resultado. Si algun dia
 * se cambia de version de Electron o de better-sqlite3 y hace falta recompilar,
 * este script lo va a decir con todas las letras el dia que pase.
 * ------------------------------------------------------------------------- */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');

const c = {
  gris: (t) => `\x1b[90m${t}\x1b[0m`,
  verde: (t) => `\x1b[32m${t}\x1b[0m`,
  rojo: (t) => `\x1b[31m${t}\x1b[0m`,
  ambar: (t) => `\x1b[33m${t}\x1b[0m`,
  negrita: (t) => `\x1b[1m${t}\x1b[0m`,
};

function aviso(texto) {
  console.log('\n' + c.ambar('  ⚠  ' + texto) + '\n');
}

// --- 1. ¿esta el binario de Electron? -------------------------------------
const rutaPathTxt = join(raiz, 'node_modules', 'electron', 'path.txt');
if (!existsSync(rutaPathTxt)) {
  aviso('Electron todavía no se descargó: no puedo verificar better-sqlite3.');
  console.log(c.gris('     npm 11 bloquea los scripts de instalación de los paquetes.'));
  console.log(c.gris('     Descargalo con:  ') + c.negrita('node node_modules/electron/install.js'));
  console.log(c.gris('     Y después:       ') + c.negrita('npm run verificar:nativos') + '\n');
  process.exit(0);   // no romper el install por esto
}

const nombreExe = readFileSync(rutaPathTxt, 'utf8').trim();
const rutaElectron = join(raiz, 'node_modules', 'electron', 'dist', nombreExe);
if (!existsSync(rutaElectron)) {
  aviso('No encuentro el ejecutable de Electron en node_modules/electron/dist.');
  console.log(c.gris('     Probá:  ') + c.negrita('node node_modules/electron/install.js') + '\n');
  process.exit(0);
}

// --- 2. correr la sonda dentro de Electron --------------------------------
const sonda = join(aqui, '_sonda-nativos.cjs');
const r = spawnSync(rutaElectron, [sonda], {
  encoding: 'utf8',
  windowsHide: true,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
});

const salida = (r.stdout || '') + (r.stderr || '');
const marca = salida.split('__SONDA__')[1];
let info = null;
try {
  info = marca ? JSON.parse(marca.split('\n')[0]) : null;
} catch {
  info = null;
}

if (!info) {
  console.log(c.rojo('\n  ✖  No se pudo verificar better-sqlite3 dentro de Electron.\n'));
  console.log(c.gris(salida.trim().split('\n').slice(-12).join('\n')) + '\n');
  process.exit(1);
}

if (info.ok) {
  console.log(
    '\n  ' + c.verde('✔') + '  better-sqlite3 ' + c.negrita(info.version) +
    ' carga en Electron ' + c.negrita(info.electron) + ' sin recompilar.'
  );
  console.log(
    c.gris(`     N-API ${info.napi} · NODE_MODULE_VERSION ${info.modules} · Node ${info.node}`)
  );
  console.log(c.gris('     (usa prebuilds/, que es ABI-estable: no hace falta @electron/rebuild)') + '\n');
  process.exit(0);
}

console.log(c.rojo('\n  ✖  better-sqlite3 NO carga dentro de Electron.\n'));
console.log('     ' + info.error + '\n');
if (/NODE_MODULE_VERSION|was compiled against a different/i.test(info.error || '')) {
  console.log(c.ambar('     Esto es el problema clásico del ABI: el binario está compilado'));
  console.log(c.ambar('     para Node y no para Electron. Ya no debería pasar con'));
  console.log(c.ambar('     better-sqlite3 13.x (N-API), así que algo cambió de versión.'));
  console.log(c.gris('\n     Salida posible:  npx @electron/rebuild -v ' + info.electron + ' -f -w better-sqlite3'));
  console.log(c.gris('     Ojo: comprobá que realmente genere un .node en'));
  console.log(c.gris('     node_modules/better-sqlite3/build/Release/. Puede decir que sí sin hacerlo.\n'));
}
process.exit(1);
