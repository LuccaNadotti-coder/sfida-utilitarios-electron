/* ---------------------------------------------------------------------------
 * Reportes: kardex, consumo por sucursal, ranking, estadísticas y mínimos.
 * Port de `sfida_core.py`.
 * ------------------------------------------------------------------------- */
import type { Database } from 'better-sqlite3';

import { auditar } from './config';

export interface MovimientoKardex {
  fecha: string;
  tipo: string;
  documento: string;
  referencia: string;
  entrada: number;
  salida: number;
  saldo: number;
}

/**
 * Port de `kardex()`.
 *
 * DOS COSAS NO OBVIAS:
 *  - Ordena por `fecha, tipo` ALFABÉTICO: dentro de un mismo día, AJUSTE va
 *    antes que INGRESO y este antes que SALIDA.
 *  - El saldo se acumula sobre TODOS los movimientos y recién después se
 *    filtra por fecha, así el saldo arrastrado de la primera fila del período
 *    es el correcto.
 */
export function kardex(
  db: Database,
  articuloId: number,
  desde: string | null = null,
  hasta: string | null = null,
): MovimientoKardex[] {
  const filas = db
    .prepare(
      `SELECT i.fecha AS fecha, 'INGRESO' AS tipo,
              i.tipo_doc || ' ' || i.nro_documento AS documento,
              COALESCE(i.proveedor,'') AS referencia,
              d.cantidad AS entrada, 0 AS salida
       FROM ingreso_det d JOIN ingresos i ON i.id=d.ingreso_id
       WHERE d.articulo_id=?
       UNION ALL
       SELECT s.fecha, 'SALIDA', 'VALE ' || s.nro_vale, su.nombre, 0, d.cantidad
       FROM salida_det d JOIN salidas s ON s.id=d.salida_id
            JOIN sucursales su ON su.id=s.sucursal_id
       WHERE d.articulo_id=?
       UNION ALL
       SELECT j.fecha, 'AJUSTE', 'AJUSTE', COALESCE(j.motivo,''),
              CASE WHEN j.cantidad>0 THEN j.cantidad ELSE 0 END,
              CASE WHEN j.cantidad<0 THEN -j.cantidad ELSE 0 END
       FROM ajustes j WHERE j.articulo_id=?
       ORDER BY fecha, tipo`,
    )
    .all(articuloId, articuloId, articuloId) as Array<{
    fecha: string;
    tipo: string;
    documento: string;
    referencia: string;
    entrada: number;
    salida: number;
  }>;

  const salida: MovimientoKardex[] = [];
  let saldo = 0;
  for (const f of filas) {
    saldo += Number(f.entrada) - Number(f.salida);
    if (desde && f.fecha < desde) continue;
    if (hasta && f.fecha > hasta) continue;
    salida.push({
      fecha: f.fecha,
      tipo: f.tipo,
      documento: f.documento,
      referencia: f.referencia,
      entrada: Number(f.entrada),
      salida: Number(f.salida),
      saldo,
    });
  }
  return salida;
}

export interface ConsumoSucursal {
  codigo: string;
  sucursal: string;
  vales: number;
  unidades: number;
}

/**
 * Port de `consumo_por_sucursal()`.
 *
 * LEFT JOIN desde `sucursales`: las que no tuvieron movimientos aparecen con 0.
 */
export function consumoPorSucursal(
  db: Database,
  desde: string | null = null,
  hasta: string | null = null,
): ConsumoSucursal[] {
  let sql = `SELECT su.codigo, su.nombre AS sucursal,
                    COUNT(DISTINCT s.id) AS vales,
                    COALESCE(SUM(d.cantidad),0) AS unidades
             FROM sucursales su
             LEFT JOIN salidas s ON s.sucursal_id=su.id`;
  const par: unknown[] = [];
  const cond: string[] = [];
  if (desde) { cond.push('s.fecha >= ?'); par.push(desde); }
  if (hasta) { cond.push('s.fecha <= ?'); par.push(hasta); }
  if (cond.length) sql += ` AND ${cond.join(' AND ')}`;
  sql += ` LEFT JOIN salida_det d ON d.salida_id=s.id
           WHERE su.activo=1
           GROUP BY su.id ORDER BY unidades DESC, su.nombre`;
  return db.prepare(sql).all(...par) as ConsumoSucursal[];
}

export interface DetalleConsumo {
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad: number;
}

export function detalleConsumoSucursal(
  db: Database,
  sucursalId: number,
  desde: string | null = null,
  hasta: string | null = null,
): DetalleConsumo[] {
  let sql = `SELECT a.codigo, a.nombre, a.unidad, SUM(d.cantidad) AS cantidad
             FROM salida_det d
             JOIN salidas s ON s.id=d.salida_id
             JOIN articulos a ON a.id=d.articulo_id
             WHERE s.sucursal_id=?`;
  const par: unknown[] = [sucursalId];
  if (desde) { sql += ' AND s.fecha >= ?'; par.push(desde); }
  if (hasta) { sql += ' AND s.fecha <= ?'; par.push(hasta); }
  sql += ' GROUP BY a.id ORDER BY cantidad DESC';
  return db.prepare(sql).all(...par) as DetalleConsumo[];
}

export function articulosMasMovidos(
  db: Database,
  desde: string | null = null,
  hasta: string | null = null,
  limite = 15,
): DetalleConsumo[] {
  let sql = `SELECT a.codigo, a.nombre, a.unidad, SUM(d.cantidad) AS cantidad
             FROM salida_det d JOIN salidas s ON s.id=d.salida_id
             JOIN articulos a ON a.id=d.articulo_id WHERE 1=1`;
  const par: unknown[] = [];
  if (desde) { sql += ' AND s.fecha >= ?'; par.push(desde); }
  if (hasta) { sql += ' AND s.fecha <= ?'; par.push(hasta); }
  sql += ' GROUP BY a.id ORDER BY cantidad DESC LIMIT ?';
  par.push(limite);
  return db.prepare(sql).all(...par) as DetalleConsumo[];
}

export interface EstadisticaMes {
  mes: string;
  entradas: number;
  salidas: number;
}

/** Port de `estadisticas_mensuales()`: del mes más viejo al actual. */
export function estadisticasMensuales(
  db: Database,
  meses = 6,
  referencia: Date = new Date(),
): EstadisticaMes[] {
  const out: EstadisticaMes[] = [];
  const p = (n: number): string => String(n).padStart(2, '0');
  for (let i = meses - 1; i >= 0; i--) {
    let y = referencia.getFullYear();
    let m = referencia.getMonth() + 1 - i;
    while (m <= 0) { m += 12; y -= 1; }
    const ini = `${y}-${p(m)}-01`;
    const finDate = new Date(y, m, 0); // día 0 del mes siguiente = último del actual
    const fin = `${y}-${p(m)}-${p(finDate.getDate())}`;

    const e = db
      .prepare(
        `SELECT COALESCE(SUM(d.cantidad),0) t FROM ingreso_det d
         JOIN ingresos i ON i.id=d.ingreso_id
         WHERE i.fecha BETWEEN ? AND ?`,
      )
      .get(ini, fin) as { t: number };
    const s = db
      .prepare(
        `SELECT COALESCE(SUM(d.cantidad),0) t FROM salida_det d
         JOIN salidas v ON v.id=d.salida_id
         WHERE v.fecha BETWEEN ? AND ?`,
      )
      .get(ini, fin) as { t: number };

    out.push({
      mes: `${p(m)}/${String(y).slice(2)}`,
      entradas: Number(e.t),
      salidas: Number(s.t),
    });
  }
  return out;
}

export interface MinimoSugerido {
  id: number;
  nombre: string;
  actual: number;
  sugerido: number;
}

/** Port de `minimos_sugeridos()`: según el consumo promedio mensual real. */
export function minimosSugeridos(
  db: Database,
  meses = 3,
  factor = 1.0,
  referencia: Date = new Date(),
): MinimoSugerido[] {
  const d = new Date(referencia.getTime() - 30 * meses * 24 * 60 * 60 * 1000);
  const p = (n: number): string => String(n).padStart(2, '0');
  const desde = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

  const filas = db
    .prepare(
      `SELECT a.id, a.nombre, a.stock_minimo, COALESCE(SUM(d.cantidad),0) AS total
       FROM articulos a
       LEFT JOIN salida_det d ON d.articulo_id=a.id
       LEFT JOIN salidas s ON s.id=d.salida_id AND s.fecha >= ?
       WHERE a.activo=1
       GROUP BY a.id ORDER BY a.nombre`,
    )
    .all(desde) as Array<{ id: number; nombre: string; stock_minimo: number; total: number }>;

  return filas.map((f) => {
    const prom = Number(f.total) / Math.max(1, meses);
    return {
      id: f.id,
      nombre: f.nombre,
      actual: Number(f.stock_minimo),
      sugerido: Math.round(prom * factor),
    };
  });
}

/** Port de `actualizar_minimos()`: edición en lote. */
export function actualizarMinimos(db: Database, pares: Array<[number, number]>): number {
  const upd = db.prepare('UPDATE articulos SET stock_minimo=? WHERE id=?');
  const tx = db.transaction(() => {
    for (const [artId, minimo] of pares) upd.run(Number(minimo), artId);
  });
  tx();
  auditar(db, 'STOCK MINIMO', `Se actualizaron ${pares.length} articulos`);
  return pares.length;
}
