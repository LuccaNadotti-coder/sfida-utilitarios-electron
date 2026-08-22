/* ---------------------------------------------------------------------------
 * Los dos respaldos:
 *   - el de UNA vez, antes de la primera escritura sobre una base de Python;
 *   - el de CADA apertura, que conserva las últimas 10 copias (v5).
 * ------------------------------------------------------------------------- */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import {
  CLAVE_MARCA_RESPALDO,
  respaldarAntesDePrimeraEscritura,
  respaldoAutomatico,
} from '../src/main/db/respaldo';
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

/* -------------------------------------------- respaldo de cada apertura (v5) */

describe('respaldo automático de cada apertura', () => {
  /** Carpeta `respaldos/` de una base. */
  const dirRespaldos = (ruta: string): string => join(ruta, '..', 'respaldos');

  const listar = (carpeta: string): string[] =>
    existsSync(carpeta) ? readdirSync(carpeta).filter((f) => f.endsWith('.db')).sort() : [];

  it('copia la base al abrir y la copia se puede leer', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);

      const r = respaldoAutomatico(ruta, 10, new Date('2026-08-22T03:15:00'));
      expect(r.hecho).toBe(true);
      expect(existsSync(r.ruta!)).toBe(true);

      const copia = new Database(r.ruta!, { readonly: true });
      const a = copia.prepare('SELECT nombre FROM articulos').get() as { nombre: string };
      expect(a.nombre).toBe('ARTICULO DE PYTHON');
      copia.close();
    } finally {
      tmp.borrar();
    }
  });

  it('las copias van a una subcarpeta, no sueltas junto a la base', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);
      const r = respaldoAutomatico(ruta, 10, new Date('2026-08-22T03:15:00'));
      expect(r.ruta).toContain('respaldos');
    } finally {
      tmp.borrar();
    }
  });

  it('conserva solo las ultimas N y borra las viejas', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);

      // 15 aperturas, una por día. Se guardan 10.
      for (let d = 1; d <= 15; d += 1) {
        respaldoAutomatico(ruta, 10, new Date(`2026-08-${String(d).padStart(2, '0')}T09:00:00`));
      }

      const copias = listar(dirRespaldos(ruta));
      expect(copias).toHaveLength(10);
      // Las que quedan son las MÁS NUEVAS: del 6 al 15.
      expect(copias[0]).toContain('2026-08-06');
      expect(copias[9]).toContain('2026-08-15');
    } finally {
      tmp.borrar();
    }
  });

  it('dos aperturas en el mismo minuto no se pisan', () => {
    // Pasa de verdad: se abre la app, se cierra y se vuelve a abrir enseguida.
    // Si se sobrescribiera, esa segunda apertura destruiría el respaldo bueno.
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'sfida_inventario.db');
      baseDePython(ruta);
      const cuando = new Date('2026-08-22T03:15:00');

      const a = respaldoAutomatico(ruta, 10, cuando);
      const b = respaldoAutomatico(ruta, 10, cuando);

      expect(a.ruta).not.toBe(b.ruta);
      expect(listar(dirRespaldos(ruta))).toHaveLength(2);
    } finally {
      tmp.borrar();
    }
  });

  it('no toca los respaldos de OTRA base que viva en la misma carpeta', () => {
    const tmp = carpetaTemporal();
    try {
      const uno = join(tmp.ruta, 'sfida_inventario.db');
      const otro = join(tmp.ruta, 'otra_base.db');
      baseDePython(uno);
      baseDePython(otro);

      for (let d = 1; d <= 12; d += 1) {
        respaldoAutomatico(uno, 3, new Date(`2026-08-${String(d).padStart(2, '0')}T09:00:00`));
      }
      respaldoAutomatico(otro, 3, new Date('2026-08-01T09:00:00'));

      const copias = listar(dirRespaldos(uno));
      // 3 de la base principal + 1 de la otra, que no se cuenta ni se borra.
      expect(copias.filter((f) => f.includes('otra_base'))).toHaveLength(1);
      expect(copias.filter((f) => f.includes('sfida_inventario'))).toHaveLength(3);
    } finally {
      tmp.borrar();
    }
  });

  it('una base que todavia no existe no genera copia ni revienta', () => {
    const tmp = carpetaTemporal();
    try {
      const r = respaldoAutomatico(join(tmp.ruta, 'no-existe.db'));
      expect(r.hecho).toBe(false);
      expect(r.borrados).toEqual([]);
    } finally {
      tmp.borrar();
    }
  });

  it('conectar() lo dispara solo, y NO sobre una base recien creada', () => {
    const tmp = carpetaTemporal();
    try {
      // Base nueva: no hay nada que respaldar todavía.
      const nueva = conectar(join(tmp.ruta, 'nueva.db'));
      expect(nueva.respaldoAuto).toBeNull();
      nueva.db.close();

      // Volver a abrirla SÍ genera copia: ahora ya tiene datos.
      const otra = conectar(join(tmp.ruta, 'nueva.db'));
      expect(otra.respaldoAuto?.hecho).toBe(true);
      expect(existsSync(otra.respaldoAuto!.ruta!)).toBe(true);
      otra.db.close();
    } finally {
      tmp.borrar();
    }
  });
});
