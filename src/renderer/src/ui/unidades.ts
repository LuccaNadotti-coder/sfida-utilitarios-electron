/* ---------------------------------------------------------------------------
 * Conversión de unidades del lado de la pantalla.
 *
 * El núcleo ya convierte al guardar; esto es SOLO para mostrar en vivo cuánto
 * va a salir del stock y para comparar contra el disponible antes de agregar
 * la línea. La cuenta que vale es siempre la del proceso principal.
 *
 * El catálogo está duplicado a propósito: el renderer no puede importar del
 * `main` (son dos bundles distintos y uno usa Node). Si se agrega una unidad
 * hay que tocarlo en los dos lados — la prueba `unidades.test.ts` lo vigila.
 * ------------------------------------------------------------------------- */

/** (codigo, familia, factor contra la base de su familia) */
const UNIDADES: ReadonlyArray<readonly [string, string, number]> = [
  ['UND', 'CONTEO', 1], ['PAR', 'CONTEO', 2], ['DOC', 'CONTEO', 12],
  ['CTO', 'CONTEO', 100], ['MLL', 'CONTEO', 1000], ['CJA', 'CONTEO', 1],
  ['PQT', 'CONTEO', 1], ['BOL', 'CONTEO', 1], ['JGO', 'CONTEO', 1],
  ['ROL', 'CONTEO', 1], ['BLQ', 'CONTEO', 1],
  ['ML', 'VOLUMEN', 0.001], ['L', 'VOLUMEN', 1], ['GAL', 'VOLUMEN', 3.785],
  ['BD5', 'VOLUMEN', 5], ['BD20', 'VOLUMEN', 20],
  ['GR', 'PESO', 0.001], ['KG', 'PESO', 1], ['SAC', 'PESO', 50],
  ['MM', 'LARGO', 0.001], ['CM', 'LARGO', 0.01], ['M', 'LARGO', 1],
];

const MAPA = new Map(UNIDADES.map(([c, f, k]) => [c, { familia: f, factor: k }]));

/**
 * Pasa una cantidad de una unidad a otra de la MISMA familia.
 * Si las familias no coinciden devuelve la cantidad sin tocar: el combo solo
 * ofrece unidades compatibles, así que eso no debería pasar.
 */
export function convertirAStock(cantidad: number, desde: string, hacia: string): number {
  const a = MAPA.get(desde);
  const b = MAPA.get(hacia);
  if (!a || !b || a.familia !== b.familia) return Number(cantidad) || 0;
  return ((Number(cantidad) || 0) * a.factor) / b.factor;
}
