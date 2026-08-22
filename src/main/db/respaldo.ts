/* ---------------------------------------------------------------------------
 * Respaldo automático antes de la primera escritura de la versión Electron.
 *
 * Las dos apps comparten el mismo archivo .db. La primera vez que la versión
 * nueva toca una base que venía de la versión Python, se guarda una copia con
 * fecha. Si algo sale mal, el archivo de antes sigue estando.
 *
 * Se hace UNA sola vez y queda marcado en la tabla `config`. El orden importa:
 * primero se copia el archivo, después se escribe la marca. Si se hiciera al
 * revés y la copia fallara, quedaría marcado como respaldado sin estarlo.
 *
 * Se copian también los archivos auxiliares de SQLite (-journal, -wal, -shm),
 * igual que hace `migrar_bd_anterior()` en la versión Python: sin ellos se
 * puede perder la última operación si el programa anterior se cerró de golpe.
 * ------------------------------------------------------------------------- */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { Database } from 'better-sqlite3';

/** Clave en `config` que marca que ya se hizo el respaldo. */
export const CLAVE_MARCA_RESPALDO = 'respaldo_pre_electron';

export interface ResultadoRespaldo {
  hecho: boolean;
  motivo: 'ya existía la marca' | 'base nueva, no hay nada que respaldar' | 'respaldo creado';
  ruta?: string;
  bytes?: number;
}

/** `respaldo_2026-08-22_0315` — fecha y hora locales, para que ordene solo. */
function sello(ahora: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}` +
    `_${p(ahora.getHours())}${p(ahora.getMinutes())}`
  );
}

/**
 * Copia la base antes de que la versión Electron le escriba por primera vez.
 *
 * @param rutaBd     archivo .db que se va a usar
 * @param existiaAntes  si el archivo ya estaba ANTES de que lo abriéramos
 *                      (una base recién creada por nosotros no necesita copia)
 * @param leerMarca  devuelve el valor actual de la marca en `config`
 * @param escribirMarca  guarda la marca en `config`
 */
export function respaldarAntesDePrimeraEscritura(
  rutaBd: string,
  existiaAntes: boolean,
  leerMarca: () => string | null,
  escribirMarca: (valor: string) => void,
  ahora: Date = new Date(),
): ResultadoRespaldo {
  if (!existiaAntes) {
    return { hecho: false, motivo: 'base nueva, no hay nada que respaldar' };
  }
  if (leerMarca()) {
    return { hecho: false, motivo: 'ya existía la marca' };
  }

  const carpeta = dirname(rutaBd);
  const nombre = basename(rutaBd).replace(/\.db$/i, '');
  const destino = join(carpeta, `${nombre}_antes_de_electron_${sello(ahora)}.db`);

  // 1. copiar primero
  copyFileSync(rutaBd, destino);
  for (const extra of ['-journal', '-wal', '-shm']) {
    if (existsSync(rutaBd + extra)) copyFileSync(rutaBd + extra, destino + extra);
  }

  // 2. recién ahora marcar
  escribirMarca(`${destino} (${ahora.toISOString()})`);

  return {
    hecho: true,
    motivo: 'respaldo creado',
    ruta: destino,
    bytes: statSync(destino).size,
  };
}

/* ------------------------------------------------- respaldo de cada apertura
 *
 * El de arriba se hace UNA vez en la vida de la base. Éste se hace CADA VEZ
 * que se abre la aplicación, y conserva las últimas N copias.
 *
 * Es la red de seguridad para el error humano, que es el que de verdad pasa:
 * alguien borra un vale que no era, anula la boleta equivocada, o carga un
 * conteo físico mal. Nadie se acuerda de hacer respaldos a mano.
 *
 * Va a una subcarpeta `respaldos/` para no llenar de archivos la carpeta de
 * datos, y el nombre lleva fecha y hora para que ordene solo.
 * ------------------------------------------------------------------------- */

/** Cuántas copias se conservan. Más viejas que eso, se borran solas. */
export const RESPALDOS_QUE_SE_GUARDAN = 10;

export interface ResultadoRespaldoAuto {
  hecho: boolean;
  ruta?: string;
  bytes?: number;
  borrados: string[];
  motivo?: string;
}

const PREFIJO = 'respaldo_';

/**
 * Copia la base a `respaldos/` y borra las que sobran.
 *
 * @param rutaBd    archivo .db abierto
 * @param cuantas   cuántas copias conservar
 * @param ahora     para poder probarlo con una fecha fija
 */
export function respaldoAutomatico(
  rutaBd: string,
  cuantas: number = RESPALDOS_QUE_SE_GUARDAN,
  ahora: Date = new Date(),
): ResultadoRespaldoAuto {
  if (!existsSync(rutaBd)) {
    return { hecho: false, borrados: [], motivo: 'todavía no hay base que copiar' };
  }

  const carpeta = join(dirname(rutaBd), 'respaldos');
  mkdirSync(carpeta, { recursive: true });

  const nombre = basename(rutaBd).replace(/\.db$/i, '');
  let destino = join(carpeta, `${PREFIJO}${nombre}_${sello(ahora)}.db`);

  // Dos aperturas dentro del mismo minuto pisarían el mismo archivo. Se le
  // agrega un sufijo en vez de sobrescribir: el respaldo anterior de ese
  // minuto también sirve.
  if (existsSync(destino)) {
    let n = 2;
    while (existsSync(destino.replace(/\.db$/, `_${n}.db`)) && n < 100) n += 1;
    destino = destino.replace(/\.db$/, `_${n}.db`);
  }

  copyFileSync(rutaBd, destino);

  // Se borran las más viejas. El nombre lleva la fecha en formato ISO, así que
  // ordenar por nombre es ordenar por antigüedad — y no depende de la fecha
  // del sistema de archivos, que se pierde al copiar la carpeta a un pendrive.
  const propias = readdirSync(carpeta)
    .filter((f) => f.startsWith(`${PREFIJO}${nombre}_`) && f.endsWith('.db'))
    .sort();

  const borrados: string[] = [];
  const sobran = Math.max(0, propias.length - Math.max(1, cuantas));
  for (const viejo of propias.slice(0, sobran)) {
    try {
      rmSync(join(carpeta, viejo), { force: true });
      borrados.push(viejo);
    } catch {
      // Si Windows lo tiene tomado, se borrará en la próxima apertura. No es
      // motivo para que la aplicación no arranque.
    }
  }

  return { hecho: true, ruta: destino, bytes: statSync(destino).size, borrados };
}

/** Envoltorio con la conexión ya abierta. */
export function respaldarConBase(
  db: Database,
  rutaBd: string,
  existiaAntes: boolean,
  ahora: Date = new Date(),
): ResultadoRespaldo {
  return respaldarAntesDePrimeraEscritura(
    rutaBd,
    existiaAntes,
    () => {
      const f = db.prepare('SELECT valor FROM config WHERE clave = ?').get(CLAVE_MARCA_RESPALDO) as
        | { valor: string | null }
        | undefined;
      return f?.valor ?? null;
    },
    (valor) => {
      db.prepare(
        'INSERT INTO config(clave, valor) VALUES(?, ?) ' +
          'ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
      ).run(CLAVE_MARCA_RESPALDO, valor);
    },
    ahora,
  );
}
