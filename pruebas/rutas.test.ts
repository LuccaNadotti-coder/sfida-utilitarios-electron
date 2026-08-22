/* ---------------------------------------------------------------------------
 * Dónde vive la base.
 *
 * Es el equivalente del bloque «ubicacion de la base de datos» de
 * `test_core.py`, que existe porque una vez se perdieron todos los datos por
 * calcular la ruta desde la ubicación del código.
 * ------------------------------------------------------------------------- */
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { carpetaDatosProduccion, resolverRutaBd, verificarModoSeguro } from '../src/main/rutas';

const ENTORNO = { ...process.env };

beforeEach(() => {
  delete process.env.SFIDA_DB;
});
afterEach(() => {
  process.env = { ...ENTORNO };
});

describe('ruta de la base de datos', () => {
  it('en desarrollo usa la COPIA, nunca la base real', () => {
    const r = resolverRutaBd(false, 'C:\\proyecto');
    expect(r.ruta).toBe(join('C:\\proyecto', 'datos', 'sfida_dev.db'));
    expect(r.esProduccion).toBe(false);
    expect(r.origen).toBe('copia de desarrollo');
  });

  it('empaquetada usa %LOCALAPPDATA%\\SFIDA, igual que la versión Python', () => {
    process.env.LOCALAPPDATA = 'C:\\Users\\alguien\\AppData\\Local';
    const r = resolverRutaBd(true, 'C:\\proyecto');
    expect(r.ruta).toBe('C:\\Users\\alguien\\AppData\\Local\\SFIDA\\sfida_inventario.db');
    expect(r.esProduccion).toBe(true);
  });

  it('la ruta empaquetada NO cae dentro de la carpeta del programa', () => {
    // La regla que costó una pérdida total de datos: la base nunca puede
    // quedar donde está el ejecutable (ni en una carpeta temporal).
    process.env.LOCALAPPDATA = 'C:\\Users\\alguien\\AppData\\Local';
    const r = resolverRutaBd(true, 'C:\\Program Files\\SFIDA');
    expect(r.ruta.toLowerCase()).not.toContain('program files');
    expect(r.ruta.toLowerCase()).not.toContain('temp');
    expect(r.ruta.toLowerCase()).not.toContain('_mei');
  });

  it('SFIDA_DB manda por encima de todo', () => {
    process.env.SFIDA_DB = 'D:\\pruebas\\otra.db';
    const r = resolverRutaBd(true, 'C:\\proyecto');
    expect(r.ruta).toBe('D:\\pruebas\\otra.db');
    expect(r.origen).toBe('variable de entorno');
  });

  it('SFIDA_DB apuntando a la base real se reconoce como producción', () => {
    process.env.LOCALAPPDATA = 'C:\\Users\\alguien\\AppData\\Local';
    process.env.SFIDA_DB = 'C:\\Users\\ALGUIEN\\AppData\\Local\\SFIDA\\sfida_inventario.db';
    const r = resolverRutaBd(false, 'C:\\proyecto');
    // Windows no distingue mayúsculas en las rutas: tiene que detectarlo igual.
    expect(r.esProduccion).toBe(true);
  });

  it('sin LOCALAPPDATA cae en la carpeta del usuario, no falla', () => {
    delete process.env.LOCALAPPDATA;
    expect(carpetaDatosProduccion()).toMatch(/SFIDA$/);
  });
});

describe('salvaguarda de los modos de verificación', () => {
  it('un modo de verificación NO puede correr contra producción', () => {
    // Pasó de verdad: una variable quedó vacía por un error del script y la
    // app empaquetada le escribió a la base real. No se perdió nada, pero una
    // prueba jamás debería poder tocar datos de verdad.
    process.env.LOCALAPPDATA = 'C:\\Users\\alguien\\AppData\\Local';
    const r = resolverRutaBd(true, 'C:\\proyecto');
    expect(() => verificarModoSeguro(r, 'captura')).toThrow(/PRODUCCIÓN/);
  });

  it('contra una base de prueba, deja pasar', () => {
    const r = resolverRutaBd(false, 'C:\\proyecto');
    expect(() => verificarModoSeguro(r, 'captura')).not.toThrow();
  });

  it('SFIDA_DB apuntando a producción tampoco pasa', () => {
    process.env.LOCALAPPDATA = 'C:\\Users\\alguien\\AppData\\Local';
    process.env.SFIDA_DB = 'C:\\Users\\alguien\\AppData\\Local\\SFIDA\\sfida_inventario.db';
    const r = resolverRutaBd(false, 'C:\\proyecto');
    expect(() => verificarModoSeguro(r, 'verificación de impresión')).toThrow(/PRODUCCIÓN/);
  });
});
