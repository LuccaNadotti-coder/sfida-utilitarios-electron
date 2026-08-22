/* ---------------------------------------------------------------------------
 * Migración de una base v4 (compatible con Python) a la v5.
 *
 * Es la parte más delicada del cambio: toca datos que ya existen. Si sale mal,
 * el stock del almacén queda mal y nadie se entera hasta que falta mercadería.
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { VERSION_ESQUEMA } from '../src/main/db/esquema';
import { versionDe } from '../src/main/db/migraciones';
import { listarAuditoria } from '../src/main/nucleo/config';
import { detalleIngreso } from '../src/main/nucleo/movimientos';
import { stockDe, ultimoPrecio } from '../src/main/nucleo/stock';
import { carpetaTemporal } from './ayudas';

/**
 * Crea una base como la dejaba la versión Python: sin `nro_proveedor`, sin
 * columnas de unidad de origen, y con un artículo medido en GALONES.
 */
function baseV4(ruta: string): void {
  const db = new Database(ruta);
  db.exec(`
    CREATE TABLE categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE);
    CREATE TABLE articulos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
      categoria_id INTEGER REFERENCES categorias(id), unidad TEXT NOT NULL DEFAULT 'UNIDAD',
      stock_minimo REAL NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE TABLE sucursales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
      direccion TEXT DEFAULT '', responsable TEXT DEFAULT '', activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE TABLE ingresos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tipo_doc TEXT NOT NULL DEFAULT 'BOLETA',
      nro_documento TEXT NOT NULL, fecha TEXT NOT NULL, proveedor TEXT DEFAULT '',
      observacion TEXT DEFAULT '', creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE (tipo_doc, nro_documento));
    CREATE TABLE ingreso_det (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingreso_id INTEGER NOT NULL REFERENCES ingresos(id) ON DELETE CASCADE,
      articulo_id INTEGER NOT NULL REFERENCES articulos(id),
      cantidad REAL NOT NULL CHECK (cantidad > 0), costo_unitario REAL NOT NULL DEFAULT 0);
    CREATE TABLE salidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nro_vale TEXT NOT NULL UNIQUE, fecha TEXT NOT NULL,
      sucursal_id INTEGER NOT NULL REFERENCES sucursales(id), entregado_por TEXT DEFAULT '',
      recibido_por TEXT DEFAULT '', observacion TEXT DEFAULT '',
      creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE TABLE salida_det (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salida_id INTEGER NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
      articulo_id INTEGER NOT NULL REFERENCES articulos(id),
      cantidad REAL NOT NULL CHECK (cantidad > 0));
    CREATE TABLE ajustes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL,
      articulo_id INTEGER NOT NULL REFERENCES articulos(id), cantidad REAL NOT NULL,
      motivo TEXT DEFAULT '', creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')));
    CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      momento TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      accion TEXT NOT NULL, detalle TEXT DEFAULT '');

    INSERT INTO categorias(nombre) VALUES ('ÚTILES DE LIMPIEZA');
    -- LEJÍA medida en GALONES, como en la v4.
    INSERT INTO articulos(id,codigo,nombre,categoria_id,unidad,stock_minimo)
      VALUES (1,'LIM-0005','LEJIA',1,'GAL',12);
    -- LAPICERO en unidades: no debe tocarse.
    INSERT INTO articulos(id,codigo,nombre,categoria_id,unidad,stock_minimo)
      VALUES (2,'OFI-0001','LAPICERO',1,'UND',50);
    INSERT INTO sucursales(id,codigo,nombre) VALUES (1,'SUC01','CENTRAL');

    INSERT INTO ingresos(id,tipo_doc,nro_documento,fecha,proveedor)
      VALUES (1,'BOLETA','B001-4521','2026-01-10','DISTRIBUIDORA LIMA');
    -- 10 galones a S/ 22.71 el galón
    INSERT INTO ingreso_det(ingreso_id,articulo_id,cantidad,costo_unitario)
      VALUES (1,1,10,22.71);
    INSERT INTO ingreso_det(ingreso_id,articulo_id,cantidad,costo_unitario)
      VALUES (1,2,500,0.80);

    INSERT INTO salidas(id,nro_vale,fecha,sucursal_id) VALUES (1,'V2026-0001','2026-02-01',1);
    INSERT INTO salida_det(salida_id,articulo_id,cantidad) VALUES (1,1,4);
    INSERT INTO salida_det(salida_id,articulo_id,cantidad) VALUES (1,2,100);

    INSERT INTO ajustes(fecha,articulo_id,cantidad,motivo) VALUES ('2026-03-01',1,-1,'MERMA');
  `);
  db.close();
}

describe('migración v4 -> v5', () => {
  it('detecta que la base es v4 antes de migrar', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const cruda = new Database(ruta);
      expect(versionDe(cruda)).toBe(4);
      cruda.close();
    } finally {
      tmp.borrar();
    }
  });

  it('migra sola al abrir y queda marcada', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db, migracion, version } = conectar(ruta, false);
      expect(migracion).not.toBeNull();
      expect(migracion!.desde).toBe(4);
      expect(version).toBe(VERSION_ESQUEMA);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('convierte el artículo de GALONES a LITROS sin perder cantidad', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);

      // Antes: 10 GAL - 4 GAL - 1 GAL = 5 GAL.
      // Después tiene que ser lo MISMO expresado en litros: 5 × 3.785.
      const art = db.prepare('SELECT unidad, stock_minimo FROM articulos WHERE id=1').get() as {
        unidad: string;
        stock_minimo: number;
      };
      expect(art.unidad).toBe('L');
      expect(stockDe(db, 1)).toBeCloseTo(5 * 3.785, 4);
      // El mínimo también se reescala: 12 GAL eran 45.42 L.
      expect(art.stock_minimo).toBeCloseTo(12 * 3.785, 4);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('reescala el precio para que la valorización no se dispare', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);
      // S/ 22.71 el galón pasa a S/ 6.00 el litro.
      expect(ultimoPrecio(db, 1)!.precio).toBeCloseTo(22.71 / 3.785, 4);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('NO toca los artículos que ya estaban en su unidad base', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);
      const art = db.prepare('SELECT unidad, stock_minimo FROM articulos WHERE id=2').get() as {
        unidad: string;
        stock_minimo: number;
      };
      expect(art.unidad).toBe('UND');
      expect(art.stock_minimo).toBe(50);
      expect(stockDe(db, 2)).toBe(400); // 500 - 100
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('guarda la cantidad original para poder auditarla', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);
      const det = detalleIngreso(db, 1).find((d) => d.articulo_id === 1)!;
      expect(det.cantidad_origen).toBe(10);
      expect(det.unidad_origen).toBe('GAL');
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('el N° del proveedor pasa a su columna y el interno se genera', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);
      const cab = db
        .prepare('SELECT nro_documento, nro_proveedor FROM ingresos WHERE id=1')
        .get() as { nro_documento: string; nro_proveedor: string };
      expect(cab.nro_proveedor).toBe('B001-4521');
      expect(cab.nro_documento).toBe('I2026-0001');
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('la base migrada sigue sin dejar repetir el N° interno', () => {
    // En la v4 el UNIQUE era (tipo_doc, nro_documento) y ALTER TABLE no puede
    // cambiarlo. Por eso la regla vive en un índice único, que la migración
    // sí puede crear. Sin esto, una base migrada aceptaría dos ingresos con el
    // mismo I2026-0001 y el correlativo dejaría de servir.
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);
      expect(() =>
        db
          .prepare('INSERT INTO ingresos(tipo_doc,nro_documento,fecha) VALUES (?,?,?)')
          .run('FACTURA', 'I2026-0001', '2026-05-05'),
      ).toThrow(/UNIQUE/i);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('deja constancia en la auditoría', () => {
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);
      const { db } = conectar(ruta, false);
      expect(listarAuditoria(db, 20).some((a) => a.accion === 'MIGRACION ESQUEMA')).toBe(true);
      db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('correrla dos veces no vuelve a convertir nada', () => {
    // Si no fuera idempotente, cada apertura multiplicaría el stock por 3.785.
    const tmp = carpetaTemporal();
    try {
      const ruta = join(tmp.ruta, 'v4.db');
      baseV4(ruta);

      const primera = conectar(ruta, false);
      const stockTrasMigrar = stockDe(primera.db, 1);
      primera.db.close();

      const segunda = conectar(ruta, false);
      expect(segunda.migracion).toBeNull();
      expect(stockDe(segunda.db, 1)).toBeCloseTo(stockTrasMigrar, 6);
      segunda.db.close();
    } finally {
      tmp.borrar();
    }
  });

  it('una base nueva nace en la v5 y no migra nada', () => {
    const tmp = carpetaTemporal();
    try {
      const { db, migracion, version } = conectar(join(tmp.ruta, 'nueva.db'), false);
      expect(migracion).toBeNull();
      expect(version).toBe(VERSION_ESQUEMA);
      db.close();
    } finally {
      tmp.borrar();
    }
  });
});
