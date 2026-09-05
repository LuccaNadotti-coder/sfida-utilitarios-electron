/* ---------------------------------------------------------------------------
 * Búsqueda de artículos para los combos de ingresos, egresos y reportes.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * El combo filtraba exigiendo que TODAS las palabras escritas estuvieran, tal
 * cual, dentro del nombre. Mientras se escriben dos o tres palabras eso anda;
 * pero al escribir el nombre completo —justo cuando el texto ya no entra en el
 * renglón— basta UNA palabra de más («DE», «X», un plural, una letra mal
 * tipeada) para que la lista quede en cero y parezca que la búsqueda
 * inteligente se apagó sola.
 *
 * Acá se puntúa en vez de filtrar:
 *   - se aceptan palabras cortadas por la mitad («ARCHIV» encuentra ARCHIVADOR»),
 *   - se perdona una letra de diferencia en las palabras largas (plurales y
 *     tipeos: «ARCHIVADORES» encuentra «ARCHIVADOR»),
 *   - y si con TODAS las palabras no queda nada, se muestran los artículos que
 *     más palabras cumplen, marcados como aproximados.
 *
 * Los números NUNCA se perdonan: «75 GR» y «70 GR» son artículos distintos y
 * una letra de tolerancia los volvería el mismo.
 *
 * Vive en `compartido/` por el mismo motivo que `conversion.ts`: así lo ven los
 * tres lados y lo pueden importar las pruebas sin abrir ninguna ventana.
 * ------------------------------------------------------------------------- */

export interface ArticuloBuscable {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
}

export interface ResultadoBusqueda<T> {
  /** Los artículos a mostrar, ya ordenados por parecido. */
  filas: T[];
  /**
   * `true` cuando no hubo ninguno que cumpliera todo lo escrito y lo que se
   * muestra son los más parecidos. La pantalla lo avisa con un rótulo: nunca
   * hay que hacer pasar una aproximación por una coincidencia exacta.
   */
  aproximada: boolean;
}

/** MAYÚSCULAS y sin tildes, para comparar. Igual criterio que `coincide()`. */
export function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
}

/** Palabras de la búsqueda: separa por espacio y por los signos del código. */
function palabrasDe(texto: string): string[] {
  return sinTildes(texto)
    .split(/[^0-9A-ZÑ]+/u)
    .filter(Boolean);
}

const TIENE_DIGITO = /[0-9]/;

/**
 * ¿Son la misma palabra salvo UNA letra? (agregada, faltante o cambiada).
 *
 * Corte en 4 letras y sin dígitos: con palabras cortas o con números, una letra
 * de tolerancia junta cosas que no son lo mismo («GR» con «KG», «75» con «76»).
 */
function casiIgual(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (TIENE_DIGITO.test(a) || TIENE_DIGITO.test(b)) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let fallas = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++fallas > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return fallas + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Cuánto vale una palabra escrita contra un artículo. 0 = no aparece.
 *
 * Se puntúa de más a menos exacto para que el orden de la lista tenga sentido:
 * primero lo que empieza igual, después lo que contiene, y al final lo que se
 * parece.
 */
function puntajePalabra(palabra: string, blob: string, tokens: string[]): number {
  for (const t of tokens) {
    if (t === palabra) return 4;
  }
  for (const t of tokens) {
    if (t.startsWith(palabra)) return 3;
  }
  if (blob.includes(palabra)) return 2;
  // Al revés: se escribió de más. Es el caso del plural («ARCHIVADORES»
  // contra «ARCHIVADOR»), que por dos letras no lo agarra `casiIgual`.
  for (const t of tokens) {
    if (t.length >= 4 && palabra.startsWith(t) && palabra.length - t.length <= 2) return 2;
  }
  for (const t of tokens) {
    if (casiIgual(t, palabra)) return 1;
  }
  return 0;
}

/**
 * Filtra y ordena los artículos por parecido con lo escrito.
 *
 * Sin texto devuelve los primeros `tope` tal como vienen (ya ordenados por
 * nombre desde el SQL).
 */
export function buscarArticulos<T extends ArticuloBuscable>(
  articulos: readonly T[],
  texto: string,
  tope = 60,
): ResultadoBusqueda<T> {
  const palabras = palabrasDe(texto);
  if (palabras.length === 0) return { filas: articulos.slice(0, tope), aproximada: false };

  const evaluados = articulos.map((a) => {
    const blob = sinTildes(`${a.codigo} ${a.nombre} ${a.unidad}`);
    const tokens = blob.split(/[^0-9A-ZÑ]+/u).filter(Boolean);
    let puntos = 0;
    let cumplidas = 0;
    for (const p of palabras) {
      const v = puntajePalabra(p, blob, tokens);
      if (v > 0) cumplidas++;
      puntos += v;
    }
    return { art: a, puntos, cumplidas };
  });

  const mejor = evaluados.reduce((m, e) => Math.max(m, e.cumplidas), 0);
  if (mejor === 0) return { filas: [], aproximada: false };

  // Con todas las palabras cumplidas es una coincidencia de verdad. Si no la
  // hay, se muestran los que más palabras cumplen antes que dejar la lista
  // vacía: quien escribe el nombre completo tiene que seguir viendo su
  // artículo.
  const exacta = mejor === palabras.length;
  const filas = evaluados
    .filter((e) => e.cumplidas === mejor)
    .sort((x, y) => y.puntos - x.puntos || x.art.nombre.localeCompare(y.art.nombre))
    .slice(0, tope)
    .map((e) => e.art);

  return { filas, aproximada: !exacta };
}
