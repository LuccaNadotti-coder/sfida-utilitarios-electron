/* ---------------------------------------------------------------------------
 * Texto, búsqueda y formato. Port de `sfida_core.py`.
 *
 * REGLA ÚNICA DEL SISTEMA: todo lo que digita la persona se guarda en
 * MAYÚSCULAS, conservando tildes y Ñ y colapsando los espacios sobrantes. Así
 * no existe dos veces el mismo artículo por haberlo escrito distinto.
 *
 * Las BÚSQUEDAS son la excepción: siguen sin distinguir mayúsculas ni tildes.
 * ------------------------------------------------------------------------- */
import { ErrorNegocio } from './errores';

/** Port de `hoy()`: fecha LOCAL en ISO. */
export function hoy(fecha: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

/** Port de `ahora()`: «AAAA-MM-DD HH:MM» local. */
export function ahora(fecha: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${hoy(fecha)} ${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}

/**
 * Port de `sin_tildes()`: quita tildes y pasa a MAYÚSCULAS.
 *
 * Es para COMPARAR, no para guardar: también le saca la virgulilla a la Ñ
 * (Ñ -> N), igual que la versión Python.
 */
export function sinTildes(txt: unknown): string {
  return String(txt ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase();
}

/**
 * Port de `coincide()`: true si TODAS las palabras buscadas aparecen en alguno
 * de los campos. Búsqueda vacía devuelve true.
 */
export function coincide(textoBusqueda: unknown, ...campos: unknown[]): boolean {
  const palabras = sinTildes(textoBusqueda).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const blob = campos.map((c) => sinTildes(c)).join(' ');
  return palabras.every((p) => blob.includes(p));
}

/** Port de `_norm()`: strip tolerante a null. */
export function norm(txt: unknown): string {
  return String(txt ?? '').trim();
}

/**
 * Port de `normalizar_nombre()`.
 *
 * MAYÚSCULAS + colapsa espacios. Conserva tildes y Ñ (a diferencia de
 * `sinTildes`, que es solo para comparar).
 */
export function normalizarNombre(texto: unknown): string {
  return String(texto ?? '')
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Port de `_valida_fecha()`: exige AAAA-MM-DD. */
export function validaFecha(f: unknown): void {
  const t = String(f ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(a, mes - 1, dia);
    if (d.getFullYear() === a && d.getMonth() === mes - 1 && d.getDate() === dia) return;
  }
  throw new ErrorNegocio(`La fecha debe tener el formato AAAA-MM-DD (ej. ${hoy()}).`);
}

/** Port de `fmt_num()`: entero si la parte decimal es despreciable. */
export function fmtNum(v: unknown): string {
  const n = Number(v ?? 0) || 0;
  return Math.abs(n - Math.trunc(n)) < 0.0001 ? String(Math.trunc(n)) : n.toFixed(2);
}

const MILES = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Port de `fmt_money()`: «S/ 1,234.56». */
export function fmtMoney(v: unknown): string {
  return `S/ ${MILES.format(Number(v ?? 0) || 0)}`;
}

/**
 * Port de `fmt_precio()`.
 *
 * Si nunca tuvo precio muestra un guion, NUNCA «S/ 0.00». El precio de una
 * compra es opcional y 0 significa «sin precio», no «gratis».
 */
export function fmtPrecio(v: unknown): string {
  if (v === null || v === undefined || (Number(v) || 0) <= 0) return '—';
  return fmtMoney(v);
}

/** Port de `fmt_variacion()`: «+10.3%», «-25.0%», «=» o «—». */
export function fmtVariacion(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) < 0.005) return '=';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}
