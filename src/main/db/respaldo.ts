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
import { copyFileSync, existsSync, statSync } from 'node:fs';
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
