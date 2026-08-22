/* ---------------------------------------------------------------------------
 * Dónde vive el archivo de la base de datos.
 *
 * Port de `carpeta_datos()` / `ruta_bd()` de `sfida_core.py`.
 *
 * REGLA DE ORO, heredada del proyecto Python: **nunca calcular la ruta de la
 * base a partir de la ubicación del código**. En la versión Qt eso causó una
 * pérdida total de datos: con PyInstaller --onefile el .exe corría desde
 * %TEMP%\_MEIxxxxx, que Windows borra al cerrar, y la base se perdía entera en
 * cada cierre.
 *
 * El equivalente peligroso en Electron es `app.getAppPath()` o
 * `process.resourcesPath`: apuntan adentro de la instalación (y en producción
 * adentro del asar, que es de solo lectura). No se usan acá.
 *
 * OJO con `app.getPath('userData')`: en Windows devuelve %APPDATA% (Roaming),
 * NO %LOCALAPPDATA%. La app de Python guarda en %LOCALAPPDATA%\SFIDA\ y las
 * dos tienen que abrir el MISMO archivo, así que la ruta se arma explícita.
 * ------------------------------------------------------------------------- */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { NOMBRE_BD } from './db/esquema';

/** Cómo se resolvió la ruta, para poder mostrarlo y auditarlo. */
export type OrigenRuta = 'variable de entorno' | 'copia de desarrollo' | 'perfil del usuario';

export interface RutaResuelta {
  /** Ruta completa del archivo .db */
  ruta: string;
  /** Carpeta que lo contiene */
  carpeta: string;
  /** De dónde salió */
  origen: OrigenRuta;
  /** true si apunta a la base real de producción (la que usa la app de Python) */
  esProduccion: boolean;
}

/**
 * `%LOCALAPPDATA%\SFIDA\` — exactamente lo que hace la versión Python:
 *   base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
 *   carpeta = os.path.join(base, "SFIDA")
 */
export function carpetaDatosProduccion(): string {
  const base = process.env.LOCALAPPDATA || homedir();
  return join(base, 'SFIDA');
}

/**
 * Resuelve contra qué base hay que trabajar.
 *
 * Prioridad:
 *   1. SFIDA_DB           — ruta explícita al archivo .db (para alternar entre
 *                           la copia de desarrollo y la real, y para las pruebas)
 *   2. desarrollo         — datos/sfida_dev.db dentro del proyecto
 *   3. producción         — %LOCALAPPDATA%\SFIDA\sfida_inventario.db
 *
 * @param empaquetada  `app.isPackaged`. Se recibe por parámetro para que esto
 *                     se pueda probar sin arrancar Electron.
 * @param raizProyecto Carpeta del proyecto, para ubicar `datos/`.
 */
export function resolverRutaBd(empaquetada: boolean, raizProyecto: string): RutaResuelta {
  const explicita = (process.env.SFIDA_DB || '').trim();
  if (explicita) {
    const ruta = resolve(explicita);
    return {
      ruta,
      carpeta: join(ruta, '..'),
      origen: 'variable de entorno',
      esProduccion: mismaRuta(ruta, join(carpetaDatosProduccion(), NOMBRE_BD)),
    };
  }

  if (!empaquetada) {
    // En desarrollo NUNCA se toca la base real: la app de Python sigue en uso
    // y una prueba no puede corromper datos de verdad.
    const carpeta = join(raizProyecto, 'datos');
    return {
      ruta: join(carpeta, 'sfida_dev.db'),
      carpeta,
      origen: 'copia de desarrollo',
      esProduccion: false,
    };
  }

  const carpeta = carpetaDatosProduccion();
  return {
    ruta: join(carpeta, NOMBRE_BD),
    carpeta,
    origen: 'perfil del usuario',
    esProduccion: true,
  };
}

/**
 * Los modos de verificación NUNCA pueden correr contra la base de producción.
 *
 * Por qué existe esto: probando la app EMPAQUETADA, una variable de entorno
 * quedó vacía por un error del script y la app hizo lo correcto — resolver la
 * ruta de producción — y le escribió a la base real. No se perdió nada (el
 * respaldo automático hizo su trabajo), pero una prueba jamás debería poder
 * tocar datos de verdad.
 *
 * La app empaquetada abre producción EN SILENCIO y está bien que lo haga: es
 * su trabajo. El que tiene que ser explícito es el que la usa para probar.
 */
export function verificarModoSeguro(r: RutaResuelta, modo: string): void {
  if (!r.esProduccion) return;
  throw new Error(
    `Se pidió el modo «${modo}» pero la base resuelta es la de PRODUCCIÓN:\n  ${r.ruta}\n\n` +
      'Los modos de verificación no pueden tocar datos reales. Indicá una base ' +
      'de prueba con la variable SFIDA_DB.',
  );
}

/** Crea la carpeta si no existe, como hace `carpeta_datos()`. */
export function asegurarCarpeta(carpeta: string): void {
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
}

function mismaRuta(a: string, b: string): boolean {
  // Windows no distingue mayúsculas en las rutas
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}
