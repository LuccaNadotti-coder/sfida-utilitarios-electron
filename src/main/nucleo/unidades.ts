/* ---------------------------------------------------------------------------
 * Unidades de medida con equivalencia. Port de `sfida_core.py`.
 *
 * El artículo NO guarda un texto libre: guarda el CÓDIGO de una unidad de este
 * catálogo cerrado. La familia agrupa lo que se puede convertir entre sí, y la
 * base de cada familia es la unidad cuyo factor es 1.
 *
 * Para agregar una unidad: se suma la tupla acá y listo.
 * ------------------------------------------------------------------------- */
import { fmtNum, sinTildes } from './textos';

export type Familia = 'CONTEO' | 'VOLUMEN' | 'PESO' | 'LARGO';

/** (codigo, nombre para mostrar, familia, cuánto vale en la unidad base) */
export const UNIDADES: ReadonlyArray<readonly [string, string, Familia, number]> = [
  // --- conteo -------------------------------------------------------
  ['UND', 'Unidad', 'CONTEO', 1.0],
  ['PAR', 'Par', 'CONTEO', 2.0],
  ['DOC', 'Docena', 'CONTEO', 12.0],
  ['CTO', 'Ciento', 'CONTEO', 100.0],
  ['MLL', 'Millar', 'CONTEO', 1000.0],
  ['CJA', 'Caja', 'CONTEO', 1.0],
  ['PQT', 'Paquete', 'CONTEO', 1.0],
  ['BOL', 'Bolsa', 'CONTEO', 1.0],
  ['JGO', 'Juego', 'CONTEO', 1.0],
  ['ROL', 'Rollo', 'CONTEO', 1.0],
  ['BLQ', 'Blíster', 'CONTEO', 1.0],
  // --- volumen (base: litro) ----------------------------------------
  ['ML', 'Mililitro', 'VOLUMEN', 0.001],
  ['L', 'Litro', 'VOLUMEN', 1.0],
  ['GAL', 'Galón', 'VOLUMEN', 3.785],
  ['BD5', 'Bidón de 5 litros', 'VOLUMEN', 5.0],
  ['BD20', 'Bidón de 20 litros', 'VOLUMEN', 20.0],
  // --- peso (base: kilo) --------------------------------------------
  ['GR', 'Gramo', 'PESO', 0.001],
  ['KG', 'Kilogramo', 'PESO', 1.0],
  ['SAC', 'Saco de 50 kilos', 'PESO', 50.0],
  // --- largo (base: metro) ------------------------------------------
  ['MM', 'Milímetro', 'LARGO', 0.001],
  ['CM', 'Centímetro', 'LARGO', 0.01],
  ['M', 'Metro', 'LARGO', 1.0],
] as const;

export const BASE_FAMILIA: Record<Familia, string> = {
  CONTEO: 'UND',
  VOLUMEN: 'L',
  PESO: 'KG',
  LARGO: 'M',
};

export interface InfoUnidad {
  codigo: string;
  nombre: string;
  familia: Familia;
  factor: number;
}

const _UNI: Record<string, InfoUnidad> = {};
for (const [codigo, nombre, familia, factor] of UNIDADES) {
  _UNI[codigo] = { codigo, nombre, familia, factor };
}

/** Nombres antiguos o escritos a mano que se traducen al código nuevo. */
export const ALIAS_UNIDAD: Record<string, string> = {
  UNIDAD: 'UND', UNIDADES: 'UND', U: 'UND', UN: 'UND', PZA: 'UND',
  PIEZA: 'UND', CAJA: 'CJA', CAJAS: 'CJA', PAQUETE: 'PQT',
  PAQ: 'PQT', PAQUETES: 'PQT', DOCENA: 'DOC', DOCENAS: 'DOC',
  CIENTO: 'CTO', MILLAR: 'MLL', BOLSA: 'BOL', BOLSAS: 'BOL',
  JUEGO: 'JGO', SET: 'JGO', ROLLO: 'ROL', ROLLOS: 'ROL',
  PARES: 'PAR', BLISTER: 'BLQ',
  LITRO: 'L', LITROS: 'L', LT: 'L', LTS: 'L', MILILITRO: 'ML',
  MILILITROS: 'ML', CC: 'ML',
  GALON: 'GAL', GALONES: 'GAL', GALONERA: 'GAL', GLN: 'GAL',
  BIDON: 'BD20', 'BIDON DE 5': 'BD5', 'BIDON DE 20': 'BD20',
  KILO: 'KG', KILOS: 'KG', KILOGRAMO: 'KG', KGS: 'KG',
  GRAMO: 'GR', GRAMOS: 'GR', G: 'GR', SACO: 'SAC',
  METRO: 'M', METROS: 'M', MT: 'M', MTS: 'M',
  CENTIMETRO: 'CM', MILIMETRO: 'MM',
};

/**
 * Port de `normalizar_unidad()`.
 *
 * Orden: código exacto → alias → nombre completo sin tildes → UND.
 * NUNCA falla: si no reconoce nada devuelve UND.
 */
export function normalizarUnidad(texto: unknown): string {
  const t = sinTildes(texto).trim();
  if (!t) return 'UND';
  if (_UNI[t]) return t;
  const alias = ALIAS_UNIDAD[t];
  if (alias) return alias;
  for (const info of Object.values(_UNI)) {
    if (sinTildes(info.nombre) === t) return info.codigo;
  }
  return 'UND';
}

/** Port de `info_unidad()`. */
export function infoUnidad(codigo: unknown): InfoUnidad {
  return _UNI[normalizarUnidad(codigo)] ?? _UNI.UND!;
}

/**
 * Port de `equivalencia_unidad()`: «1 GAL = 3.785 L».
 *
 * Devuelve CADENA VACÍA si la unidad ya es la base o su factor es 1. Por eso
 * CJA, PQT, BOL, JGO, ROL y BLQ no muestran equivalencia aunque no sean la
 * base de su familia.
 */
export function equivalenciaUnidad(codigo: unknown): string {
  const u = infoUnidad(codigo);
  const base = BASE_FAMILIA[u.familia];
  if (u.codigo === base || u.factor === 1.0) return '';
  const f = u.factor;
  const txt =
    Math.abs(f - Math.round(f)) < 0.0005 ? String(Math.round(f)) : f.toFixed(3).replace(/0+$/, '');
  return `1 ${u.codigo} = ${txt} ${base}`;
}

/** Port de `etiqueta_unidad()`: «GAL · Galón  (1 GAL = 3.785 L)». */
export function etiquetaUnidad(codigo: unknown): string {
  const u = infoUnidad(codigo);
  const eq = equivalenciaUnidad(u.codigo);
  return `${u.codigo} · ${u.nombre}${eq ? `  (${eq})` : ''}`;
}

/** Port de `convertir_a_base()`: 2 GAL -> [7.57, 'L']. */
export function convertirABase(cantidad: unknown, codigo: unknown): [number, string] {
  const u = infoUnidad(codigo);
  return [(Number(cantidad ?? 0) || 0) * u.factor, BASE_FAMILIA[u.familia]];
}

/** Port de `fmt_cantidad()`: «3 GAL (11.36 L)», o solo «3 L» si ya es la base. */
export function fmtCantidad(cantidad: unknown, codigo: unknown, conEquivalencia = true): string {
  const u = infoUnidad(codigo);
  const txt = `${fmtNum(cantidad)} ${u.codigo}`;
  if (!conEquivalencia) return txt;
  const base = BASE_FAMILIA[u.familia];
  if (u.codigo === base || u.factor === 1.0) return txt;
  const [valor] = convertirABase(cantidad, u.codigo);
  return `${txt} (${fmtNum(valor)} ${base})`;
}
