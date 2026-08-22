/* ---------------------------------------------------------------------------
 * Stock y precios. Port de `sfida_core.py`.
 *
 * EL STOCK NUNCA SE GUARDA COMO COLUMNA: se calcula sumando ingresos, menos
 * salidas, más ajustes. Agregar un campo `stock` en `articulos` rompería el
 * kardex.
 *
 * EL PRECIO TAMPOCO vive en el artículo: pertenece a cada línea de la boleta.
 * Cada compra puede tener un precio distinto.
 * ------------------------------------------------------------------------- */
import type { Database } from 'better-sqlite3';

import { auditar } from './config';
import { ErrorNegocio } from './errores';
import { coincide, fmtPrecio, norm } from './textos';

/** Port literal de `_SQL_STOCK`. */
export const SQL_STOCK = `
    SELECT articulo_id, SUM(cant) AS stock FROM (
        SELECT articulo_id,  cantidad AS cant FROM ingreso_det
        UNION ALL
        SELECT articulo_id, -cantidad AS cant FROM salida_det
        UNION ALL
        SELECT articulo_id,  cantidad AS cant FROM ajustes
    ) GROUP BY articulo_id
`;

/**
 * Port literal de `_SQL_ULT_PRECIO`.
 *
 * El inventario se valoriza con el ÚLTIMO precio pagado, NO con un promedio.
 * Solo cuentan las líneas que tienen precio cargado (costo_unitario > 0).
 */
export const SQL_ULT_PRECIO = `
    SELECT d.articulo_id AS articulo_id,
           d.costo_unitario AS precio,
           i.fecha AS fecha
    FROM ingreso_det d
    JOIN ingresos i ON i.id = d.ingreso_id
    WHERE d.costo_unitario > 0
      AND d.id = (SELECT d2.id
                    FROM ingreso_det d2 JOIN ingresos i2 ON i2.id = d2.ingreso_id
                   WHERE d2.articulo_id = d.articulo_id AND d2.costo_unitario > 0
                   ORDER BY i2.fecha DESC, i2.id DESC, d2.id DESC LIMIT 1)
`;

export interface FilaStock {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  stock_minimo: number;
  categoria: string | null;
  stock: number;
  ultimo_precio: number | null;
  ultima_fecha: string | null;
}

export function stockDe(db: Database, articuloId: number): number {
  const fila = db
    .prepare(`SELECT COALESCE(stock,0) s FROM (${SQL_STOCK}) WHERE articulo_id=?`)
    .get(articuloId) as { s: number } | undefined;
  return fila ? Number(fila.s) : 0;
}

/**
 * Port de `listar_stock()`.
 *
 * OJO — comportamiento no obvio nº 9: el filtro de texto se aplica EN MEMORIA
 * con `coincide()`, no en SQL. Por eso tolera tildes y palabras sueltas, a
 * diferencia de `listarArticulos()`, que usa LIKE. Son dos búsquedas
 * distintas a propósito.
 *
 * `soloBajoMinimo` usa `stock <= stock_minimo`: INCLUYE el igual.
 */
export function listarStock(
  db: Database,
  texto = '',
  categoriaId: number | null = null,
  soloBajoMinimo = false,
): FilaStock[] {
  let sql = `SELECT a.id, a.codigo, a.nombre, a.unidad, a.stock_minimo,
                    c.nombre AS categoria,
                    COALESCE(st.stock,0) AS stock,
                    up.precio AS ultimo_precio,
                    up.fecha  AS ultima_fecha
             FROM articulos a
             LEFT JOIN categorias c ON c.id=a.categoria_id
             LEFT JOIN (${SQL_STOCK}) st ON st.articulo_id=a.id
             LEFT JOIN (${SQL_ULT_PRECIO}) up ON up.articulo_id=a.id
             WHERE a.activo=1`;
  const par: unknown[] = [];
  if (categoriaId) {
    sql += ' AND a.categoria_id=?';
    par.push(categoriaId);
  }
  if (soloBajoMinimo) sql += ' AND COALESCE(st.stock,0) <= a.stock_minimo';
  sql += ' ORDER BY a.nombre';

  let filas = db.prepare(sql).all(...par) as FilaStock[];
  if (norm(texto)) {
    filas = filas.filter((f) => coincide(texto, f.codigo, f.nombre, f.categoria ?? '', f.unidad));
  }
  return filas;
}

export interface FilaAlerta {
  codigo: string;
  nombre: string;
  unidad: string;
  stock_minimo: number;
  stock: number;
}

/** Port de `alertas_stock_minimo()`. Ordena primero el más urgente. */
export function alertasStockMinimo(db: Database): FilaAlerta[] {
  return db
    .prepare(
      `SELECT a.codigo, a.nombre, a.unidad, a.stock_minimo,
              COALESCE(st.stock,0) AS stock
       FROM articulos a
       LEFT JOIN (${SQL_STOCK}) st ON st.articulo_id=a.id
       WHERE a.activo=1 AND a.stock_minimo > 0
         AND COALESCE(st.stock,0) <= a.stock_minimo
       ORDER BY (COALESCE(st.stock,0) - a.stock_minimo), a.nombre`,
    )
    .all() as FilaAlerta[];
}

export interface Niveles {
  ok: number;
  por_agotarse: number;
  bajo_minimo: number;
}

/**
 * Port de `niveles_stock()` — lo que alimenta la dona del panel.
 *
 * OJO: agrupa «sin stock» y «bajo mínimo» en un solo segmento, a diferencia de
 * `colorEstado()`, que los distingue. Son dos clasificaciones distintas con la
 * misma matemática.
 */
export function nivelesStock(db: Database): Niveles {
  let ok = 0;
  let agotarse = 0;
  let bajo = 0;
  for (const f of listarStock(db)) {
    const s = Number(f.stock);
    const m = Number(f.stock_minimo ?? 0);
    if (s <= 0 || (m > 0 && s <= m)) bajo += 1;
    else if (m > 0 && s <= m * 1.3) agotarse += 1;
    else ok += 1;
  }
  return { ok, por_agotarse: agotarse, bajo_minimo: bajo };
}

export interface ResumenPanel {
  articulos: number;
  sucursales: number;
  ingresos: number;
  salidas: number;
  alertas: number;
  valorizado: number;
}

/** Port de `resumen_panel()`. El valorizado usa el ÚLTIMO precio. */
export function resumenPanel(db: Database): ResumenPanel {
  const q = (s: string): number => Object.values(db.prepare(s).get() as object)[0] as number;
  const val = db
    .prepare(
      `SELECT COALESCE(SUM(st.stock*up.precio),0) v
       FROM articulos a
       LEFT JOIN (${SQL_STOCK}) st ON st.articulo_id=a.id
       LEFT JOIN (${SQL_ULT_PRECIO}) up ON up.articulo_id=a.id
       WHERE a.activo=1`,
    )
    .get() as { v: number };
  return {
    articulos: q('SELECT COUNT(*) FROM articulos WHERE activo=1'),
    sucursales: q('SELECT COUNT(*) FROM sucursales WHERE activo=1'),
    ingresos: q('SELECT COUNT(*) FROM ingresos'),
    salidas: q('SELECT COUNT(*) FROM salidas'),
    alertas: alertasStockMinimo(db).length,
    valorizado: Number(val.v ?? 0),
  };
}

/* ------------------------------------------------------------------ precios */

export interface UltimoPrecio {
  precio: number;
  fecha: string;
  proveedor: string;
  documento: string;
}

/** Port de `ultimo_precio()`. `null` si nunca tuvo precio. */
export function ultimoPrecio(db: Database, articuloId: number): UltimoPrecio | null {
  const f = db
    .prepare(
      `SELECT d.costo_unitario AS precio, i.fecha AS fecha,
              COALESCE(i.proveedor,'') AS proveedor,
              i.tipo_doc || ' ' || i.nro_documento AS documento
       FROM ingreso_det d JOIN ingresos i ON i.id = d.ingreso_id
       WHERE d.articulo_id = ? AND d.costo_unitario > 0
       ORDER BY i.fecha DESC, i.id DESC, d.id DESC LIMIT 1`,
    )
    .get(articuloId) as UltimoPrecio | undefined;
  if (!f) return null;
  return { precio: Number(f.precio), fecha: f.fecha, proveedor: f.proveedor, documento: f.documento };
}

export interface FilaHistorialPrecio {
  det_id: number;
  ingreso_id: number;
  fecha: string;
  documento: string;
  proveedor: string;
  cantidad: number;
  precio: number | null;
  variacion: number | null;
}

/**
 * Port de `historial_precios()`.
 *
 * Recorre de la MÁS VIEJA a la más nueva para calcular la variación, y recién
 * al final invierte. El filtro por fechas se aplica DESPUÉS de calcular las
 * variaciones, así la primera fila del período conserva su variación real
 * contra la compra anterior aunque esa compra quede fuera del período.
 *
 * Las líneas sin precio quedan con `precio: null` y NO rompen la cadena de
 * comparación: el «anterior» sigue siendo el último precio real.
 */
export function historialPrecios(
  db: Database,
  articuloId: number,
  desde: string | null = null,
  hasta: string | null = null,
): FilaHistorialPrecio[] {
  const filas = db
    .prepare(
      `SELECT d.id AS det_id, d.ingreso_id, d.cantidad,
              d.costo_unitario AS precio, i.fecha,
              i.tipo_doc || ' ' || i.nro_documento AS documento,
              COALESCE(i.proveedor,'') AS proveedor
       FROM ingreso_det d JOIN ingresos i ON i.id = d.ingreso_id
       WHERE d.articulo_id = ?
       ORDER BY i.fecha, i.id, d.id`,
    )
    .all(articuloId) as Array<{
    det_id: number;
    ingreso_id: number;
    cantidad: number;
    precio: number;
    fecha: string;
    documento: string;
    proveedor: string;
  }>;

  const salida: FilaHistorialPrecio[] = [];
  let anterior: number | null = null;
  for (const f of filas) {
    const crudo = Number(f.precio ?? 0);
    const precio = crudo > 0 ? crudo : null;
    let variacion: number | null = null;
    if (precio !== null && anterior) variacion = ((precio - anterior) / anterior) * 100;
    if (precio !== null) anterior = precio;
    salida.push({
      det_id: f.det_id,
      ingreso_id: f.ingreso_id,
      fecha: f.fecha,
      documento: f.documento,
      proveedor: f.proveedor,
      cantidad: Number(f.cantidad),
      precio,
      variacion,
    });
  }

  let out = salida;
  if (desde) out = out.filter((s) => s.fecha >= desde);
  if (hasta) out = out.filter((s) => s.fecha <= hasta);
  out.reverse(); // la más nueva primero
  return out;
}

export interface ResumenPrecios {
  minimo: number | null;
  maximo: number | null;
  promedio: number | null;
  compras: number;
}

export function resumenPrecios(
  db: Database,
  articuloId: number,
  desde: string | null = null,
  hasta: string | null = null,
): ResumenPrecios {
  const precios = historialPrecios(db, articuloId, desde, hasta)
    .map((h) => h.precio)
    .filter((p): p is number => p !== null);
  if (precios.length === 0) return { minimo: null, maximo: null, promedio: null, compras: 0 };
  return {
    minimo: Math.min(...precios),
    maximo: Math.max(...precios),
    promedio: precios.reduce((a, b) => a + b, 0) / precios.length,
    compras: precios.length,
  };
}

/**
 * Port de `actualizar_costo_linea()`.
 *
 * Devuelve `false` SIN tocar nada si la diferencia es despreciable. Queda en
 * la auditoría con el valor anterior y el nuevo.
 */
export function actualizarCostoLinea(db: Database, ingresoDetId: number, nuevoCosto: unknown): boolean {
  const crudo = String(nuevoCosto ?? '').replace(',', '.');
  const valor = crudo === '' ? 0 : Number(crudo);
  if (!Number.isFinite(valor)) throw new ErrorNegocio('El precio debe ser un numero.');
  if (valor < 0) throw new ErrorNegocio('El precio no puede ser negativo.');

  const f = db
    .prepare(
      `SELECT d.costo_unitario AS antes, a.nombre AS articulo,
              i.tipo_doc || ' ' || i.nro_documento AS documento
       FROM ingreso_det d
       JOIN articulos a ON a.id = d.articulo_id
       JOIN ingresos  i ON i.id = d.ingreso_id
       WHERE d.id = ?`,
    )
    .get(ingresoDetId) as { antes: number; articulo: string; documento: string } | undefined;
  if (!f) throw new ErrorNegocio('No se encontro esa linea del ingreso.');

  const antes = Number(f.antes ?? 0);
  if (Math.abs(antes - valor) < 0.0001) return false;

  db.prepare('UPDATE ingreso_det SET costo_unitario=? WHERE id=?').run(valor, ingresoDetId);
  auditar(
    db,
    'PRECIO CORREGIDO',
    `${f.articulo} en ${f.documento}: antes ${fmtPrecio(antes)}, ahora ${fmtPrecio(valor)}`,
  );
  return true;
}
