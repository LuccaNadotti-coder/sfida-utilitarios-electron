/* ---------------------------------------------------------------------------
 * Port del BLOQUE 2 de `test_core.py` — TODO SE GUARDA EN MAYÚSCULAS.
 *
 * Regla única del sistema: cualquier texto que escribe la persona se guarda en
 * MAYÚSCULAS, conservando tildes y Ñ y colapsando espacios. Así no existe dos
 * veces el mismo artículo por haberlo escrito distinto.
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import {
  guardarArticulo,
  guardarSucursal,
  listarArticulos,
  listarSucursales,
  obtenerArticulo,
} from '../src/main/nucleo/articulos';
import { CAT_OFICINA, idCategoria } from '../src/main/nucleo/categorias';
import { listarAuditoria } from '../src/main/nucleo/config';
import {
  CATALOGO_SUGERIDO,
  cargarCatalogoSugerido,
  normalizarDatosExistentes,
} from '../src/main/nucleo/mantenimiento';
import { listarIngresos, listarSalidas, registrarIngreso, registrarSalida } from '../src/main/nucleo/movimientos';
import { listarStock } from '../src/main/nucleo/stock';
import { hoy, normalizarNombre } from '../src/main/nucleo/textos';
import { carpetaTemporal } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let aid: number;
let sid: number;

beforeAll(() => {
  tmp = carpetaTemporal();
  db = conectar(join(tmp.ruta, 'textos.db'), false).db;
  const cid = idCategoria(db, CAT_OFICINA);
  aid = guardarArticulo(db, 'coc-0001', 'olla de acero 2L', cid, 'unidad', 2);
  sid = guardarSucursal(db, 'suc09', 'tienda del centro', 'Av. Lima 1', 'jose perez');
  registrarIngreso(db, 'BOLETA', 'b002-0001', hoy(), 'importaciones del norte', '', [[aid, 5, 30]]);
  registrarSalida(db, 'v-t-1', hoy(), sid, 'almacen central', 'maria lopez', '', [[aid, 1]]);
});

afterAll(() => {
  db.close();
  tmp.borrar();
});

describe('normalizar_nombre', () => {
  const casos: Array<[string, string]> = [
    ['Lapicero Azul Faber', 'LAPICERO AZUL FABER'],
    ['  papel   bond   a4  ', 'PAPEL BOND A4'],
    ['Paño de Microfibra', 'PAÑO DE MICROFIBRA'],
    ['jabon liquido para manos', 'JABON LIQUIDO PARA MANOS'],
    ['Lejía en galonera', 'LEJÍA EN GALONERA'],
    ['cinta 3m', 'CINTA 3M'],
    ['ofi-0001', 'OFI-0001'],
    ['b001-4521', 'B001-4521'],
    ['v2026-0001', 'V2026-0001'],
    ['grapas 26/6', 'GRAPAS 26/6'],
    ['', ''],
  ];

  it('pasa todo a MAYUSCULAS y quita espacios de mas', () => {
    const malos = casos.filter(([a, b]) => normalizarNombre(a) !== b);
    expect(malos).toEqual([]);
  });

  it('conserva las tildes y la enie', () => {
    expect(normalizarNombre('paño de limpieza')).toBe('PAÑO DE LIMPIEZA');
  });
});

describe('se aplica al guardar', () => {
  it('guardar_articulo deja nombre y codigo en MAYUSCULAS', () => {
    const art = obtenerArticulo(db, aid)!;
    expect(art.nombre).toBe('OLLA DE ACERO 2L');
    expect(art.codigo).toBe('COC-0001');
  });

  it('guardar_sucursal deja nombre y responsable en MAYUSCULAS', () => {
    const suc = listarSucursales(db).find((s) => s.id === sid)!;
    expect(suc.nombre).toBe('TIENDA DEL CENTRO');
    expect(suc.responsable).toBe('JOSE PEREZ');
    expect(suc.codigo).toBe('SUC09');
  });

  it('guardar_sucursal tambien deja la direccion en MAYUSCULAS', () => {
    const suc = listarSucursales(db).find((s) => s.id === sid)!;
    expect(suc.direccion).toBe('AV. LIMA 1');
  });

  it('el proveedor y el numero de documento quedan en MAYUSCULAS', () => {
    const ing = listarIngresos(db)[0]!;
    expect(ing.proveedor).toBe('IMPORTACIONES DEL NORTE');
    expect(ing.nro_documento).toBe('B002-0001');
  });

  it('quien entrega, quien recibe y el numero de vale quedan en MAYUSCULAS', () => {
    const sal = listarSalidas(db)[0]!;
    expect(sal.entregado_por).toBe('ALMACEN CENTRAL');
    expect(sal.recibido_por).toBe('MARIA LOPEZ');
    expect(sal.nro_vale).toBe('V-T-1');
  });

  it('la busqueda sigue sin distinguir mayusculas', () => {
    expect(listarStock(db, 'OLLA')).toHaveLength(1);
    expect(listarStock(db, 'olla')).toHaveLength(1);
  });

  it('la busqueda de listar_stock tampoco distingue tildes', () => {
    // `listarStock` filtra en memoria con coincide(): tolera tildes.
    expect(listarStock(db, 'ACERO')).toHaveLength(1);
  });

  it('la OBSERVACION no se pasa a mayusculas (manda el codigo, no el CLAUDE.md)', () => {
    // Comportamiento no obvio nº 6 del inventario: `observacion` solo lleva
    // strip(), aunque el CLAUDE.md viejo la enumeraba entre los campos que sí.
    registrarIngreso(db, 'BOLETA', 'obs-0001', hoy(), 'prov', '  texto en minusculas  ', [
      [aid, 1, 0],
    ]);
    const ing = listarIngresos(db).find((i) => i.nro_documento === 'OBS-0001')!;
    expect(ing.observacion).toBe('texto en minusculas');
  });
});

describe('migracion de lo ya cargado', () => {
  it('normalizar_datos_existentes avisa cuantos registros cambio', () => {
    db.prepare('UPDATE articulos SET nombre=? WHERE id=?').run('Olla de Acero 2L', aid);
    db.prepare('UPDATE sucursales SET nombre=?, responsable=? WHERE id=?').run(
      'Tienda del Centro',
      'Jose Perez',
      sid,
    );
    db.prepare("UPDATE ingresos SET proveedor='Importaciones del Norte'").run();
    // 1 artículo + 1 sucursal + 2 ingresos (el de la prueba de observación también)
    expect(normalizarDatosExistentes(db)).toBe(4);
  });

  it('normalizar_datos_existentes reescribe articulos', () => {
    expect(obtenerArticulo(db, aid)!.nombre).toBe('OLLA DE ACERO 2L');
  });

  it('normalizar_datos_existentes reescribe sucursales y proveedores', () => {
    expect(listarSucursales(db).find((s) => s.id === sid)!.nombre).toBe('TIENDA DEL CENTRO');
    expect(listarIngresos(db)[0]!.proveedor).toBe('IMPORTACIONES DEL NORTE');
  });

  it('normalizar_datos_existentes no cambia nada si ya esta en mayusculas', () => {
    expect(normalizarDatosExistentes(db)).toBe(0);
  });

  it('la migracion queda registrada en la auditoria', () => {
    expect(listarAuditoria(db, 20).some((a) => a.accion === 'ORDENAR TEXTOS')).toBe(true);
  });

  it('normalizar_datos_existentes NO toca el codigo del articulo', () => {
    // Comportamiento no obvio nº 8 del inventario.
    db.prepare('UPDATE articulos SET codigo=? WHERE id=?').run('coc-0001', aid);
    normalizarDatosExistentes(db);
    expect(obtenerArticulo(db, aid)!.codigo).toBe('coc-0001');
    db.prepare('UPDATE articulos SET codigo=? WHERE id=?').run('COC-0001', aid);
  });
});

describe('catalogo sugerido', () => {
  let db4: Database;
  let tmp4: ReturnType<typeof carpetaTemporal>;

  beforeAll(() => {
    tmp4 = carpetaTemporal();
    db4 = conectar(join(tmp4.ruta, 'catalogo.db'), false).db;
  });
  afterAll(() => {
    db4.close();
    tmp4.borrar();
  });

  it('el catalogo sugerido usa solo las dos categorias', () => {
    const nuevos = cargarCatalogoSugerido(db4);
    expect(nuevos).toBe(CATALOGO_SUGERIDO.length);
    expect(db4.prepare('SELECT COUNT(*) c FROM categorias').get()).toEqual({ c: 2 });
  });

  it('el catalogo sugerido ya viene en MAYUSCULAS', () => {
    expect(listarArticulos(db4).every((a) => a.nombre === normalizarNombre(a.nombre))).toBe(true);
  });

  it('cargar el catalogo dos veces no duplica', () => {
    expect(cargarCatalogoSugerido(db4)).toBe(0);
  });
});
