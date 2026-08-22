/* ---------------------------------------------------------------------------
 * Catálogo sugerido, import/export CSV, respaldos y mantenimiento.
 * Port de `sfida_core.py`.
 * ------------------------------------------------------------------------- */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import Database from 'better-sqlite3';
import type { Database as BaseDatos } from 'better-sqlite3';

import { codigoSugerido } from './articulos';
import { CAT_LIMPIEZA, CAT_OFICINA, idCategoria } from './categorias';
import { auditar } from './config';
import { ErrorNegocio } from './errores';
import { normalizarNombre, sinTildes } from './textos';
import { normalizarUnidad } from './unidades';

/* -------------------------------------------------------- catálogo sugerido */

const OFICINA = CAT_OFICINA;
const LIMPIEZA = CAT_LIMPIEZA;

/** (codigo, nombre, categoria, unidad, stock minimo sugerido) */
export const CATALOGO_SUGERIDO: ReadonlyArray<readonly [string, string, string, string, number]> = [
  ['OFI-0001', 'LAPICERO AZUL', OFICINA, 'UND', 50],
  ['OFI-0002', 'LAPICERO NEGRO', OFICINA, 'UND', 50],
  ['OFI-0003', 'LAPICERO ROJO', OFICINA, 'UND', 20],
  ['OFI-0004', 'LÁPIZ 2B', OFICINA, 'UND', 30],
  ['OFI-0005', 'BORRADOR BLANCO', OFICINA, 'UND', 20],
  ['OFI-0006', 'TAJADOR', OFICINA, 'UND', 15],
  ['OFI-0007', 'CORRECTOR LÍQUIDO', OFICINA, 'UND', 10],
  ['OFI-0008', 'RESALTADOR', OFICINA, 'UND', 15],
  ['OFI-0009', 'PLUMÓN PARA PIZARRA', OFICINA, 'UND', 12],
  ['OFI-0010', 'PAPEL BOND A4 75GR', OFICINA, 'MLL', 5],
  ['OFI-0011', 'CUADERNO A4', OFICINA, 'UND', 10],
  ['OFI-0012', 'ARCHIVADOR DE PALANCA', OFICINA, 'UND', 10],
  ['OFI-0013', 'FÓLDER MANILA A4', OFICINA, 'CTO', 3],
  ['OFI-0014', 'GRAPAS 26/6', OFICINA, 'CJA', 10],
  ['OFI-0015', 'CLIPS METÁLICOS', OFICINA, 'CJA', 10],
  ['OFI-0016', 'CINTA ADHESIVA TRANSPARENTE', OFICINA, 'UND', 12],
  ['OFI-0017', 'TINTA PARA IMPRESORA', OFICINA, 'UND', 4],
  ['OFI-0018', 'NOTAS ADHESIVAS', OFICINA, 'UND', 15],
  ['LIM-0001', 'PAPEL HIGIÉNICO JUMBO', LIMPIEZA, 'PQT', 20],
  ['LIM-0002', 'PAPEL TOALLA', LIMPIEZA, 'PQT', 15],
  ['LIM-0003', 'JABÓN LÍQUIDO', LIMPIEZA, 'GAL', 10],
  ['LIM-0004', 'DETERGENTE EN POLVO', LIMPIEZA, 'KG', 10],
  ['LIM-0005', 'LEJÍA', LIMPIEZA, 'GAL', 12],
  ['LIM-0006', 'DESINFECTANTE PINO', LIMPIEZA, 'GAL', 12],
  ['LIM-0007', 'AMBIENTADOR EN SPRAY', LIMPIEZA, 'UND', 10],
  ['LIM-0008', 'BOLSA NEGRA GRANDE', LIMPIEZA, 'PQT', 20],
  ['LIM-0009', 'BOLSA NEGRA MEDIANA', LIMPIEZA, 'PQT', 20],
  ['LIM-0010', 'ESCOBA', LIMPIEZA, 'UND', 5],
  ['LIM-0011', 'RECOGEDOR', LIMPIEZA, 'UND', 5],
  ['LIM-0012', 'TRAPEADOR', LIMPIEZA, 'UND', 5],
  ['LIM-0013', 'ESPONJA VERDE', LIMPIEZA, 'UND', 12],
  ['LIM-0014', 'PAÑO DE MICROFIBRA', LIMPIEZA, 'UND', 10],
  ['LIM-0015', 'GUANTES DE LIMPIEZA', LIMPIEZA, 'PAR', 8],
  ['LIM-0016', 'ALCOHOL EN GEL', LIMPIEZA, 'L', 8],
] as const;

/** Port de `cargar_catalogo_sugerido()`: no duplica por código NI por nombre. */
export function cargarCatalogoSugerido(db: BaseDatos): number {
  let nuevos = 0;
  const buscar = db.prepare('SELECT 1 FROM articulos WHERE codigo=? OR nombre=? COLLATE NOCASE');
  const insertar = db.prepare(
    `INSERT INTO articulos (codigo, nombre, categoria_id, unidad, stock_minimo, activo)
     VALUES (?,?,?,?,?,1)`,
  );
  for (const [codigo, nombreCrudo, cat, unidad, minimo] of CATALOGO_SUGERIDO) {
    const nombre = normalizarNombre(nombreCrudo);
    if (buscar.get(codigo, nombre)) continue;
    insertar.run(codigo, nombre, idCategoria(db, cat), normalizarUnidad(unidad), minimo);
    nuevos += 1;
  }
  return nuevos;
}

/* ------------------------------------------------------------ CSV */

/**
 * Port de `exportar_csv()`.
 *
 * Delimitador `;` y codificación utf-8 CON BOM, para que Excel en español lo
 * abra bien de un doble clic.
 */
/**
 * Un texto que Excel interpretaría como FÓRMULA en vez de como dato.
 *
 * Excel y LibreOffice tratan como fórmula todo lo que empieza con `=`, `+`,
 * `@` o `-`, y algunas fórmulas pueden ejecutar programas. Los nombres de los
 * artículos entran por CSV, así que un nombre como `=algo` volvería a salir en
 * el reporte exportado y se ejecutaría al abrirlo. Es rebuscado, pero el
 * remedio son dos líneas y toda esta app termina en Excel.
 *
 * Los números negativos legítimos (-5, -3.5) NO cuentan: son datos.
 */
function pareceFormula(t: string): boolean {
  if (!/^[=+@\t\r-]/.test(t)) return false;
  return !/^-?\d+([.,]\d+)?$/.test(t);
}

export function exportarCsv(ruta: string, encabezados: string[], filas: unknown[][]): string {
  const escapar = (v: unknown): string => {
    let t = String(v ?? '');
    // El apóstrofo delante le dice a la planilla «esto es texto, no cuenta».
    if (pareceFormula(t)) t = `'${t}`;
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [encabezados.map(escapar).join(';')];
  for (const f of filas) lineas.push(f.map(escapar).join(';'));
  writeFileSync(ruta, '﻿' + lineas.join('\r\n') + '\r\n', 'utf8');
  return ruta;
}

export function plantillaArticulosCsv(ruta: string): string {
  return exportarCsv(
    ruta,
    ['Código', 'Nombre', 'Categoría', 'Unidad', 'Stock mínimo'],
    [
      ['OFI-0001', 'Lapicero Azul', OFICINA, 'UNIDAD', 50],
      ['LIM-0001', 'Papel Higiénico Jumbo', LIMPIEZA, 'PAQUETE', 20],
      ['', 'Escoba (sin código: se genera solo)', LIMPIEZA, 'UNIDAD', 5],
    ],
  );
}

/** Detecta el delimitador entre `;`, `,`, tab y `|`, cayendo en `;`. */
function detectarDelimitador(muestra: string): string {
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ';';
  let max = 0;
  for (const c of candidatos) {
    const n = (muestra.match(new RegExp(`\\${c}`, 'g')) ?? []).length;
    if (n > max) { max = n; mejor = c; }
  }
  return mejor;
}

function partirLinea(linea: string, delim: string): string[] {
  const salida: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i]!;
    if (ch === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else entreComillas = !entreComillas;
    } else if (ch === delim && !entreComillas) {
      salida.push(actual);
      actual = '';
    } else {
      actual += ch;
    }
  }
  salida.push(actual);
  return salida;
}

export interface ResultadoImportacion {
  nuevos: number;
  actualizados: number;
  errores: string[];
}

/**
 * Port de `importar_articulos_csv()`.
 *
 * - Descarta la primera fila si contiene NOMBRE / ARTICULO / DESCRIPCION.
 * - La categoría es LIMPIEZA solo si el texto contiene «LIMPIEZA»; si no,
 *   OFICINA.
 * - Busca por código O por nombre (COLLATE NOCASE): si existe ACTUALIZA y lo
 *   REACTIVA; si no, inserta generando ART-000N cuando el código viene vacío.
 */
export function importarArticulosCsv(db: BaseDatos, ruta: string): ResultadoImportacion {
  const bruto = readFileSync(ruta, 'utf8').replace(/^﻿/, '');
  const delim = detectarDelimitador(bruto.slice(0, 4096));
  let filas = bruto
    .split(/\r?\n/)
    .map((l) => partirLinea(l, delim).map((x) => x.trim()))
    .filter((f) => f.some((x) => x !== ''));

  if (filas.length === 0) throw new ErrorNegocio('El archivo esta vacio.');

  const cab = sinTildes(filas[0]!.join(' '));
  if (cab.includes('NOMBRE') || cab.includes('ARTICULO') || cab.includes('DESCRIPCION')) {
    filas = filas.slice(1);
  }

  let nuevos = 0;
  let actualizados = 0;
  const errores: string[] = [];

  filas.forEach((crudo, idx) => {
    const n = idx + 2;
    const f = [...crudo, '', '', '', '', ''];
    const codigo = f[0]!;
    let nombre = f[1]!;
    const catTexto = f[2]!;
    const unidadTexto = f[3]!;
    const minimoTexto = f[4]!;

    if (!nombre) {
      errores.push(`Fila ${n}: sin nombre de articulo`);
      return;
    }
    nombre = normalizarNombre(nombre);
    const cat = sinTildes(catTexto).includes('LIMPIEZA') ? CAT_LIMPIEZA : CAT_OFICINA;
    const unidad = normalizarUnidad(unidadTexto);
    let minimo = Number(String(minimoTexto).replace(',', '.'));
    if (!Number.isFinite(minimo)) minimo = 0;

    const catId = idCategoria(db, cat);
    const ya = db
      .prepare('SELECT id FROM articulos WHERE codigo=? OR nombre=? COLLATE NOCASE')
      .get(codigo.toUpperCase(), nombre) as { id: number } | undefined;

    try {
      if (ya) {
        db.prepare(
          `UPDATE articulos SET nombre=?, categoria_id=?, unidad=?, stock_minimo=?, activo=1
           WHERE id=?`,
        ).run(nombre, catId, unidad, minimo, ya.id);
        actualizados += 1;
      } else {
        const cod = codigo.toUpperCase() || codigoSugerido(db, 'ART');
        db.prepare(
          `INSERT INTO articulos (codigo, nombre, categoria_id, unidad, stock_minimo, activo)
           VALUES (?,?,?,?,?,1)`,
        ).run(cod, nombre, catId, unidad, minimo);
        nuevos += 1;
      }
    } catch (e) {
      errores.push(`Fila ${n} (${nombre}): ${(e as Error).message}`);
    }
  });

  auditar(db, 'IMPORTACION', `${nuevos} nuevos, ${actualizados} actualizados desde ${basename(ruta)}`);
  return { nuevos, actualizados, errores };
}

/* ------------------------------------------------- normalización masiva */

/**
 * Port de `normalizar_datos_existentes()`.
 *
 * Reescribe en MAYÚSCULAS 5 tablas / 13 campos. Si una fila chocaría con un
 * UNIQUE, la deja como está y sigue. Devuelve cuántas FILAS cambiaron.
 *
 * NO toca `articulos.codigo` (comportamiento no obvio nº 8).
 */
export function normalizarDatosExistentes(db: BaseDatos): number {
  const tareas: Array<[string, string[]]> = [
    ['categorias', ['nombre']],
    ['articulos', ['nombre']],
    ['sucursales', ['nombre', 'responsable', 'direccion']],
    ['ingresos', ['proveedor', 'nro_documento', 'tipo_doc', 'observacion']],
    ['salidas', ['entregado_por', 'recibido_por', 'nro_vale', 'observacion']],
  ];

  let cambios = 0;
  for (const [tabla, campos] of tareas) {
    const filas = db.prepare(`SELECT id, ${campos.join(', ')} FROM ${tabla}`).all() as Array<
      Record<string, unknown>
    >;
    for (const fila of filas) {
      const nuevos: Record<string, string> = {};
      let cambioFila = false;
      for (const campo of campos) {
        const actual = (fila[campo] as string | null) ?? '';
        const nuevo = normalizarNombre(actual);
        if (nuevo !== actual) cambioFila = true;
        nuevos[campo] = nuevo;
      }
      if (!cambioFila) continue;
      const sets = campos.map((c) => `${c}=?`).join(', ');
      try {
        db.prepare(`UPDATE ${tabla} SET ${sets} WHERE id=?`).run(
          ...campos.map((c) => nuevos[c]!),
          fila.id,
        );
        cambios += 1;
      } catch {
        // dos registros que quedarían con el mismo nombre único: se deja
      }
    }
  }
  auditar(db, 'ORDENAR TEXTOS', `Se reescribieron ${cambios} registros`);
  return cambios;
}

/**
 * Port de `_migrar_unidades()`: traduce las unidades viejas a los códigos
 * nuevos. Corre sola al abrir la base.
 */
export function migrarUnidades(db: BaseDatos): number {
  const filas = db.prepare('SELECT id, unidad FROM articulos').all() as Array<{
    id: number;
    unidad: string | null;
  }>;
  let cambios = 0;
  const upd = db.prepare('UPDATE articulos SET unidad=? WHERE id=?');
  for (const f of filas) {
    const nueva = normalizarUnidad(f.unidad);
    if (nueva !== (f.unidad ?? '')) {
      upd.run(nueva, f.id);
      cambios += 1;
    }
  }
  return cambios;
}

/* ---------------------------------------------------------------- respaldos */

export function respaldarBd(destino: string, origen: string): string {
  copyFileSync(origen, destino);
  return destino;
}

/**
 * Port de `restaurar_bd()`.
 *
 * Valida que el archivo sea un respaldo de SFIDA de verdad y, ANTES de pisar,
 * guarda lo actual como `<destino>.antes_de_restaurar`.
 */
export function restaurarBd(origen: string, destino: string): string {
  if (!existsSync(origen)) throw new ErrorNegocio('No se encontro el archivo de respaldo.');
  try {
    const prueba = new Database(origen, { readonly: true, fileMustExist: true });
    prueba.prepare('SELECT COUNT(*) FROM articulos').get();
    prueba.close();
  } catch {
    throw new ErrorNegocio('Ese archivo no es un respaldo valido de SFIDA.');
  }
  mkdirSync(dirname(destino), { recursive: true });
  if (existsSync(destino)) copyFileSync(destino, `${destino}.antes_de_restaurar`);
  copyFileSync(origen, destino);
  return destino;
}

/** Port de `borrar_movimientos()`. Conserva artículos, sucursales y config. */
export function borrarMovimientos(db: BaseDatos): void {
  db.exec(`DELETE FROM ingreso_det; DELETE FROM ingresos;
           DELETE FROM salida_det;  DELETE FROM salidas;
           DELETE FROM ajustes;`);
  auditar(db, 'BORRADO TOTAL', 'Se borraron todos los movimientos');
}

/** Tamaño del archivo, para mostrarlo en Control Maestro. */
export function tamanoBd(ruta: string): number {
  try {
    return statSync(ruta).size;
  } catch {
    return 0;
  }
}
