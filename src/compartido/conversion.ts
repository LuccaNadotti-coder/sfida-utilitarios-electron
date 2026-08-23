/* ---------------------------------------------------------------------------
 * Conversión de unidades para la PANTALLA.
 *
 * El núcleo ya convierte al guardar; esto es SOLO para mostrar en vivo cuánto
 * va a salir del stock y para comparar contra el disponible antes de agregar
 * la línea. La cuenta que vale es siempre la del proceso principal.
 *
 * Vive en `compartido/` y no en `renderer/` por dos motivos:
 *   1. El renderer no puede importar del `main` (son dos bundles distintos y
 *      uno usa Node), pero `compartido/` sí lo ven los tres lados.
 *   2. Así las pruebas pueden importarlo. Estaba en `renderer/ui/` y no se
 *      podía probar sin romper el límite entre los dos proyectos de
 *      TypeScript.
 *
 * El catálogo sigue duplicado contra `main/nucleo/unidades.ts`, que tiene
 * además familias y equivalencias. Si se agrega una unidad hay que tocar los
 * dos lados — la prueba `unidades.test.ts` lo vigila.
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

/* ------------------------------------------------- líneas de un vale (v5) */

/** Una línea tal como se ve en la tabla del vale. */
export interface LineaVale {
  articuloId: number;
  cantidad: number;
  unidad: string;
}

/**
 * Junta una línea nueva con la que ya estaba, para el MISMO artículo.
 *
 * En un vale de salida un artículo no puede aparecer dos veces. El núcleo ya
 * sumaba las repetidas antes de guardar, así que dos renglones de BORRADOR
 * terminaban siendo uno solo en la base y en el ticket: la pantalla mostraba
 * una cosa y se guardaba otra.
 *
 * Si las dos vienen en la misma unidad se suma y se conserva esa unidad. Si
 * no, se pasa todo a la unidad de stock: no hay forma de escribir «1 GAL más
 * 500 ML» en un solo renglón sin inventar un número.
 *
 * (En los INGRESOS no se junta nada: la misma boleta puede traer el mismo
 * artículo a dos precios distintos, y son dos líneas legítimas.)
 */
export function juntarEnVale(
  previa: LineaVale,
  nueva: { cantidad: number; unidad: string },
  unidadStock: string,
): LineaVale {
  if (previa.unidad === nueva.unidad) {
    return { ...previa, cantidad: previa.cantidad + nueva.cantidad };
  }
  return {
    articuloId: previa.articuloId,
    unidad: unidadStock,
    cantidad:
      convertirAStock(previa.cantidad, previa.unidad, unidadStock) +
      convertirAStock(nueva.cantidad, nueva.unidad, unidadStock),
  };
}
