/* ---------------------------------------------------------------------------
 * Respaldo automático antes de la primera escritura.
 * ------------------------------------------------------------------------- */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { CLAVE_MARCA_RESPALDO, respaldarAntesDePrimeraEscritura } from '../src/main/db/respaldo';
import { carpetaTemporal } from './ayudas';

/** Crea una base "de la versión Python" con un artículo adentro. */
function baseDePython(ruta: string): void {
  const db = new Database(ruta);
  db.exec(`
    CREATE TABLE categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
    CREATE TABLE articulos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
      categoria_id INTEGER REFERENCES categorias(id), unidad TEXT NOT NULL DEFAULT 'UNIDAD',
      stock_minimo REAL NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO categorias(nombre) VALUES ('ÚTILES DE OFICINA');
    INSERT INTO articulos(codigo,nombre,categoria_id,unidad,stock_minimo)
      VALUES ('OFI-9999','ARTICULO DE PYTHON',1,'UND',5);
  `);
  db.close();
}

describe('respaldo previo', () => {
  it('copia la base heredada de Python antes de escribirle', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);

      const { db, respaldo } = conectar(ruta);
      expect(respaldo.hecho).toBe(true);
      expect(respaldo.ruta).toBeTruthy();
      expect(existsSync(respaldo.ruta!)).toBe(true);

      // El respaldo tiene los datos de antes y se puede abrir
      const copia = new Database(respaldo.ruta!, { readonly: true });
      const f = copia.prepare('SELECT codigo FROM articulos').get() as { codigo: string };
      expect(f.codigo).toBe('OFI-9999');
      copia.close();
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('no vuelve a respaldar en las aperturas siguientes', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);

      const primera = conectar(ruta);
      expect(primera.respaldo.hecho).toBe(true);
      primera.db.close();

      const segunda = conectar(ruta);
      expect(segunda.respaldo.hecho).toBe(false);
      expect(segunda.respaldo.motivo).toBe('ya existía la marca');
      segunda.db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('una base nueva no genera respaldo (no hay nada que perder)', () => {
    const tmp = carpetaTemporal();
    try {
      const { db, respaldo } = conectar(join(tmp.ruta, 'nueva.db'));
      expect(respaldo.hecho).toBe(false);
      expect(respaldo.motivo).toBe('base nueva, no hay nada que respaldar');
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('deja la marca en config recién DESPUÉS de copiar', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);
      const { db, respaldo } = conectar(ruta);
      const marca = db.prepare('SELECT valor FROM config WHERE clave = ?').get(CLAVE_MARCA_RESPALDO) as
        | { valor: string }
        | undefined;
      expect(marca?.valor).toContain(respaldo.ruta!);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('también copia los -journal/-wal/-shm (si no, se pierde la última operación)', () => {
    // Se prueba la función pura, sin abrir la base: así se verifica la copia
    // de los archivos auxiliares sin que SQLite tenga ninguno tomado.
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);
      writeFileSync(ruta + '-wal', 'contenido del wal');
      writeFileSync(ruta + '-shm', 'contenido del shm');

      let marca: string | null = null;
      const r = respaldarAntesDePrimeraEscritura(
        ruta,
        true,
        () => marca,
        (v) => {
          marca = v;
        },
        new Date('2026-08-22T03:15:00'),
      );

      expect(r.hecho).toBe(true);
      expect(r.ruta).toContain('_antes_de_electron_2026-08-22_0315.db');
      expect(existsSync(r.ruta! + '-wal')).toBe(true);
      expect(readFileSync(r.ruta! + '-wal', 'utf8')).toBe('contenido del wal');
      expect(readFileSync(r.ruta! + '-shm', 'utf8')).toBe('contenido del shm');
      expect(marca).toContain(r.ruta!);
    } finally {
      tmp.borrar();
    }
  });
});
