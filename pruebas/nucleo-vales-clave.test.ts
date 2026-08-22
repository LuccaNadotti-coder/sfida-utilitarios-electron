/* ---------------------------------------------------------------------------
 * Numeración de vales (CAMBIO DELIBERADO nº 1), clave del Control Maestro,
 * auditoría y mantenimiento.
 *
 * La parte de la clave no tiene equivalente directo en `test_core.py` pero sí
 * es una regla del negocio documentada, y encima es CRÍTICA para la
 * compatibilidad: si alguien ya cambió la clave desde la app vieja, tiene que
 * seguir entrando desde la nueva.
 * ------------------------------------------------------------------------- */
import { pbkdf2Sync } from 'node:crypto';
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { conectar } from '../src/main/db/conexion';
import { guardarArticulo, guardarSucursal } from '../src/main/nucleo/articulos';
import {
  CLAVE_POR_DEFECTO,
  animacionesActivas,
  auditar,
  cambiarClave,
  claveEsLaDeFabrica,
  getConfig,
  limpiarAuditoria,
  listarAuditoria,
  setAnimaciones,
  setConfig,
  verificarClave,
} from '../src/main/nucleo/config';
import { ErrorNegocio } from '../src/main/nucleo/errores';
import { borrarMovimientos } from '../src/main/nucleo/mantenimiento';
import {
  eliminarSalida,
  existeVale,
  siguienteNroIngreso,
  siguienteNroVale,
} from '../src/main/nucleo/movimientos';
import { stockDe } from '../src/main/nucleo/stock';
import { carpetaTemporal, ingresarStock, sacarStock } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let art: number;
let suc: number;

beforeEach(() => {
  tmp = carpetaTemporal();
  db = conectar(join(tmp.ruta, 'vales.db'), false).db;
  art = guardarArticulo(db, 'OFI-0001', 'LAPICERO', null, 'UND', 0);
  suc = guardarSucursal(db, 'SUC01', 'CENTRAL');
  ingresarStock(db, [[art, 1000, 1]], { nroProveedor: 'B-1', proveedor: 'PROV' });
});

afterEach(() => {
  db.close();
  tmp.borrar();
});

describe('numeracion de vales (MAX, no COUNT)', () => {
  const ANIO = new Date().getFullYear();

  it('el primer vale del año es 0001', () => {
    expect(siguienteNroVale(db)).toBe(`V${ANIO}-0001`);
  });

  it('avanza con cada vale registrado', () => {
    sacarStock(db, suc, [[art, 1]]);
    expect(siguienteNroVale(db)).toBe(`V${ANIO}-0002`);
  });

  it('CAMBIO DELIBERADO: anular un vale del medio ya no propone un numero ocupado', () => {
    // ESTE es el problema que se venía a arreglar. En la versión Python el
    // correlativo era COUNT(*)+1: al anular un vale del medio, el conteo bajaba
    // y el sistema proponía un número que SÍ existía, avisando «ya existe»
    // sobre su propia sugerencia. Ver CAMBIOS_DELIBERADOS.md punto 1.
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(sacarStock(db, suc, [[art, 1]]));
    }
    // quedan 0001, 0002, 0003 -> se anula el del medio
    eliminarSalida(db, ids[1]!);

    const propuesto = siguienteNroVale(db);
    expect(propuesto).toBe(`V${ANIO}-0004`); // con COUNT(*) habría propuesto 0003
    expect(existeVale(db, propuesto)).toBe(false); // y sobre todo: NO está ocupado
  });

  it('LÍMITE CONOCIDO: anular el ULTIMO vale sí libera su numero', () => {
    // MAX se calcula sobre los vales que existen. Si se anula el más alto, ese
    // número vuelve a estar disponible y se propone de nuevo.
    //
    // NO es el bug que se venía a arreglar: el número queda libre de verdad,
    // así que no hay contradicción ni aviso de «ya existe». Pero tampoco es un
    // talonario estricto. Se deja así porque es exactamente lo aprobado (MAX
    // del sufijo); si hiciera falta que nunca se reuse, habría que guardar un
    // contador en `config` que solo suba, y eso es otra decisión.
    const v1 = sacarStock(db, suc, [[art, 1]]);
    const v2n = siguienteNroVale(db);
    const v2 = sacarStock(db, suc, [[art, 1]]);
    expect(v2n).toBe(`V${ANIO}-0002`);

    eliminarSalida(db, v2);
    expect(siguienteNroVale(db)).toBe(`V${ANIO}-0002`); // vuelve a estar libre
    expect(existeVale(db, `V${ANIO}-0002`)).toBe(false); // y de verdad lo está
    expect(v1).toBeGreaterThan(0);
  });

  it('v5: el numero YA NO se puede escribir a mano', () => {
    // `registrarSalida` ni siquiera recibe el número: lo asigna el sistema.
    // Antes se podía escribir el de una boleta física; ahora no.
    const id = sacarStock(db, suc, [[art, 2]]);
    const vale = db.prepare('SELECT nro_vale FROM salidas WHERE id=?').get(id) as {
      nro_vale: string;
    };
    expect(vale.nro_vale).toBe(`V${ANIO}-0001`);
    expect(existeVale(db, vale.nro_vale)).toBe(true);
    expect(existeVale(db, vale.nro_vale.toLowerCase())).toBe(true); // se normaliza al comparar
  });

  it('dos salidas seguidas nunca chocan de numero', () => {
    const a = sacarStock(db, suc, [[art, 1]]);
    const b = sacarStock(db, suc, [[art, 1]]);
    const nros = db
      .prepare('SELECT nro_vale FROM salidas WHERE id IN (?,?)')
      .all(a, b) as Array<{ nro_vale: string }>;
    expect(new Set(nros.map((n) => n.nro_vale)).size).toBe(2);
  });
});

describe('numeracion de ingresos (v5)', () => {
  const ANIO = new Date().getFullYear();

  it('el N° interno es automatico y correlativo', () => {
    // El del beforeEach ya consumió el 0001.
    expect(siguienteNroIngreso(db)).toBe(`I${ANIO}-0002`);
    ingresarStock(db, [[art, 1, 1]], { nroProveedor: 'B-2', proveedor: 'PROV' });
    expect(siguienteNroIngreso(db)).toBe(`I${ANIO}-0003`);
  });

  it('el N° del proveedor se guarda aparte y no choca con el interno', () => {
    const cab = db
      .prepare('SELECT nro_documento, nro_proveedor FROM ingresos ORDER BY id LIMIT 1')
      .get() as { nro_documento: string; nro_proveedor: string };
    expect(cab.nro_documento).toBe(`I${ANIO}-0001`);
    expect(cab.nro_proveedor).toBe('B-1');
  });
});

describe('clave del Control Maestro', () => {
  it('de fabrica es sfida2026', () => {
    expect(verificarClave(db, CLAVE_POR_DEFECTO)).toBe(true);
    expect(claveEsLaDeFabrica(db)).toBe(true);
  });

  it('rechaza una clave incorrecta', () => {
    expect(verificarClave(db, 'otra')).toBe(false);
  });

  it('se puede cambiar y despues entra con la nueva', () => {
    cambiarClave(db, CLAVE_POR_DEFECTO, 'nuevaclave');
    expect(verificarClave(db, 'nuevaclave')).toBe(true);
    expect(verificarClave(db, CLAVE_POR_DEFECTO)).toBe(false);
    expect(claveEsLaDeFabrica(db)).toBe(false);
  });

  it('se guarda encriptada, nunca en claro', () => {
    cambiarClave(db, CLAVE_POR_DEFECTO, 'secreto123');
    const guardado = getConfig(db, 'clave_maestra')!;
    expect(guardado).not.toContain('secreto123');
    expect(guardado).toMatch(/^[0-9a-f]{64}$/); // PBKDF2-SHA256, 32 bytes en hex
    expect(getConfig(db, 'clave_sal')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('exige la clave actual correcta para cambiarla', () => {
    expect(() => cambiarClave(db, 'equivocada', 'loquesea')).toThrow(ErrorNegocio);
  });

  it('la clave nueva necesita al menos 4 caracteres', () => {
    expect(() => cambiarClave(db, CLAVE_POR_DEFECTO, 'abc')).toThrow(ErrorNegocio);
  });

  it('COMPATIBILIDAD: verifica un hash generado por la version Python', () => {
    // Valores calculados con el mismo algoritmo de sfida_core.py:
    //   hashlib.pbkdf2_hmac("sha256", b"claveprueba", b"0123456789abcdef", 120000).hex()
    // Si alguien cambió la clave desde la app vieja, tiene que entrar acá.
    setConfig(db, 'clave_sal', '0123456789abcdef');
    setConfig(
      db,
      'clave_maestra',
      hashDeReferencia(),
    );
    expect(verificarClave(db, 'claveprueba')).toBe(true);
    expect(verificarClave(db, 'otracosa')).toBe(false);
  });
});

/**
 * El mismo cálculo que hace Python, hecho acá con node:crypto. Si los dos
 * lados coinciden, la clave guardada por la app vieja sirve en la nueva.
 */
function hashDeReferencia(): string {
  return pbkdf2Sync(
    Buffer.from('claveprueba', 'utf8'),
    Buffer.from('0123456789abcdef', 'utf8'),
    120000,
    32,
    'sha256',
  ).toString('hex');
}

describe('animaciones', () => {
  it('de fabrica vienen encendidas', () => {
    expect(animacionesActivas(db)).toBe(true);
  });

  it('se pueden apagar y prender', () => {
    setAnimaciones(db, false);
    expect(animacionesActivas(db)).toBe(false);
    setAnimaciones(db, true);
    expect(animacionesActivas(db)).toBe(true);
  });
});

describe('auditoria', () => {
  it('registra las acciones', () => {
    expect(listarAuditoria(db).some((a) => a.accion === 'INGRESO')).toBe(true);
  });

  it('el detalle se trunca a 400 caracteres', () => {
    auditar(db, 'PRUEBA', 'x'.repeat(1000));
    const f = listarAuditoria(db, 5).find((a) => a.accion === 'PRUEBA')!;
    expect(f.detalle!.length).toBe(400);
  });

  it('auditar nunca rompe la operacion aunque falle', () => {
    // Se le pasa una acción imposible de insertar (NOT NULL) y no debe lanzar.
    expect(() => auditar(db, null as unknown as string, 'x')).not.toThrow();
  });

  it('limpiar_auditoria deja solo los ultimos N', () => {
    for (let i = 0; i < 20; i++) auditar(db, 'RELLENO', String(i));
    limpiarAuditoria(db, 5);
    expect(listarAuditoria(db, 999)).toHaveLength(5);
  });

  it('la busqueda filtra por accion y detalle', () => {
    auditar(db, 'BUSCABLE', 'algo distinto');
    expect(listarAuditoria(db, 99, 'BUSCABLE')).toHaveLength(1);
  });
});

describe('borrar movimientos', () => {
  it('borra ingresos, salidas y ajustes pero conserva articulos y sucursales', () => {
    sacarStock(db, suc, [[art, 5]]);
    borrarMovimientos(db);
    expect(stockDe(db, art)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM articulos').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM sucursales').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM ingresos').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) c FROM salidas').get()).toEqual({ c: 0 });
  });
});
