/* ---------------------------------------------------------------------------
 * Sonda que corre DENTRO de Electron para comprobar que better-sqlite3 carga
 * con el ABI de Electron, no con el de Node.
 *
 * No abre ninguna ventana. La lanza `scripts/verificar-nativos.mjs`.
 * ------------------------------------------------------------------------- */
'use strict';

const { app } = require('electron');

app.whenReady().then(() => {
  const info = {
    electron: process.versions.electron,
    node: process.versions.node,
    modules: process.versions.modules, // NODE_MODULE_VERSION
    napi: process.versions.napi,
  };
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t (a INTEGER)');
    db.prepare('INSERT INTO t (a) VALUES (?)').run(7);
    const fila = db.prepare('SELECT a FROM t').get();
    db.close();
    if (!fila || fila.a !== 7) throw new Error('la consulta de prueba no devolvió lo esperado');
    info.ok = true;
    info.version = require('better-sqlite3/package.json').version;
  } catch (e) {
    info.ok = false;
    info.error = (e && e.message) || String(e);
  }
  process.stdout.write('__SONDA__' + JSON.stringify(info) + '\n');
  app.exit(info.ok ? 0 : 1);
});
