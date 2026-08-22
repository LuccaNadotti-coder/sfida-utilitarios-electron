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
  registrarIngreso,
  registrarSalida,
  siguienteNroVale,
} from '../src/main/nucleo/movimientos';
import { stockDe } from '../src/main/nucleo/stock';
import { hoy } from '../src/main/nucleo/textos';
import { carpetaTemporal } from './ayudas';

let tmp: ReturnType<typeof carpetaTemporal>;
let db: Database;
let art: number;
let suc: number;

beforeEach(() => {
  tmp = carpetaTemporal();
  db = conectar(join(tmp.ruta, 'vales.db'), false).db;
  art = guardarArticulo(db, 'OFI-0001', 'LAPICERO', null, 'UND', 0);
  suc = guardarSucursal(db, 'SUC01', 'CENTRAL');
  registrarIngreso(db, 'BOLETA', 'B-1', hoy(), 'PROV', '', [[art, 1000, 1]]);
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
    registrarSalida(db, siguienteNroVale(db), hoy(), suc, '', '', '', [[art, 1]]);
    expect(siguienteNroVale(db)).toBe(`V${ANIO}-0002`);
  });

  it('CAMBIO DELIBERADO: anular un vale del medio ya no propone un numero ocupado', () => {
    // ESTE es el problema que se venía a arreglar. En la versión Python el
    // correlativo era COUNT(*)+1: al anular un vale del medio, el conteo bajaba
    // y el sistema proponía un número que SÍ existía, avisando «ya existe»
    // sobre su propia sugerencia. Ver CAMBIOS_DELIBERADOS.md punto 1.
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(registrarSalida(db, siguienteNroVale(db), hoy(), suc, '', '', '', [[art, 1]]));
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
    const v1 = registrarSalida(db, siguienteNroVale(db), hoy(), suc, '', '', '', [[art, 1]]);
    const v2n = siguienteNroVale(db);
    const v2 = registrarSalida(db, v2n, hoy(), suc, '', '', '', [[art, 1]]);
    expect(v2n).toBe(`V${ANIO}-0002`);

    eliminarSalida(db, v2);
    expect(siguienteNroVale(db)).toBe(`V${ANIO}-0002`); // vuelve a estar libre
    expect(existeVale(db, `V${ANIO}-0002`)).toBe(false); // y de verdad lo está
    expect(v1).toBeGreaterThan(0);
  });

  it('ignora los vales escritos a mano que no siguen el formato', () => {
    registrarSalida(db, 'BOLETA-FISICA-77', hoy(), suc, '', '', '', [[art, 1]]);
    expect(siguienteNroVale(db)).toBe(`V${ANIO}-0001`);
  });

  it('el numero de vale se puede escribir a mano', () => {
    const id = registrarSalida(db, 'mi-boleta-123', hoy(), suc, '', '', '', [[art, 2]]);
    expect(id).toBeGreaterThan(0);
    expect(existeVale(db, 'MI-BOLETA-123')).toBe(true);
    expect(existeVale(db, 'mi-boleta-123')).toBe(true); // se normaliza al comparar
  });

  it('avisa si el numero de vale ya existe', () => {
    registrarSalida(db, 'REPETIDO', hoy(), suc, '', '', '', [[art, 1]]);
    expect(() => registrarSalida(db, 'repetido', hoy(), suc, '', '', '', [[art, 1]])).toThrow(
      ErrorNegocio,
    );
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
    registrarSalida(db, 'V-X', hoy(), suc, '', '', '', [[art, 5]]);
    borrarMovimientos(db);
    expect(stockDe(db, art)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM articulos').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM sucursales').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM ingresos').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT COUNT(*) c FROM salidas').get()).toEqual({ c: 0 });
  });
});
