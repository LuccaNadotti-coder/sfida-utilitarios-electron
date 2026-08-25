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
 *  - Dentro de un mismo día, AJUSTE va antes que INGRESO y este antes que
 *    EGRESO. El orden NO puede salir del alfabeto: al pasar de «SALIDA» a
 *    «EGRESO» los egresos se habrían adelantado a los ingresos y el saldo del
 *    día se leería en negativo. Por eso va un orden explícito.
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
      // La unión va dentro de un SELECT envolvente porque el ORDER BY de un
      // compuesto solo acepta columnas del resultado, no una expresión.
      `SELECT * FROM (
         SELECT i.fecha AS fecha, 'INGRESO' AS tipo,
                i.tipo_doc || ' ' || i.nro_documento AS documento,
                COALESCE(i.proveedor,'') AS referencia,
                d.cantidad AS entrada, 0 AS salida
         FROM ingreso_det d JOIN ingresos i ON i.id=d.ingreso_id
         WHERE d.articulo_id=?
         UNION ALL
         SELECT s.fecha, 'EGRESO', 'VALE ' || s.nro_vale, su.nombre, 0, d.cantidad
         FROM salida_det d JOIN salidas s ON s.id=d.salida_id
              JOIN sucursales su ON su.id=s.sucursal_id
         WHERE d.articulo_id=?
         UNION ALL
         SELECT j.fecha, 'AJUSTE', 'AJUSTE', COALESCE(j.motivo,''),
                CASE WHEN j.cantidad>0 THEN j.cantidad ELSE 0 END,
                CASE WHEN j.cantidad<0 THEN -j.cantidad ELSE 0 END
         FROM ajustes j WHERE j.articulo_id=?
       )
       ORDER BY fecha,
                CASE tipo WHEN 'AJUSTE' THEN 0 WHEN 'INGRESO' THEN 1 ELSE 2 END`,
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

/* =========================================================================
 * DASHBOARD (v5)
 * ========================================================================= */

export interface PuntoValor {
  fecha: string;
  /** Valor del inventario a esa fecha, con el precio vigente a esa fecha. */
  valor: number;
  /** Unidades en stock a esa fecha. */
  unidades: number;
}

/**
 * Evolución del valor del almacén a lo largo del período.
 *
 * Para cada punto se calcula el stock ACUMULADO hasta esa fecha y se valoriza
 * con el último precio de compra conocido HASTA ESA MISMA FECHA. Usar el
 * precio de hoy para valorizar el stock de hace seis meses daría un gráfico
 * bonito pero falso.
 */
export function evolucionValorAlmacen(
  db: Database,
  desde: string,
  hasta: string,
  puntos = 12,
): PuntoValor[] {
  const fechas = repartirFechas(desde, hasta, puntos);

  const stockHasta = db.prepare(`
    SELECT articulo_id, SUM(cant) AS stock FROM (
      SELECT d.articulo_id, d.cantidad AS cant FROM ingreso_det d
        JOIN ingresos i ON i.id = d.ingreso_id WHERE i.fecha <= ?
      UNION ALL
      SELECT d.articulo_id, -d.cantidad FROM salida_det d
        JOIN salidas s ON s.id = d.salida_id WHERE s.fecha <= ?
      UNION ALL
      SELECT j.articulo_id, j.cantidad FROM ajustes j WHERE j.fecha <= ?
    ) GROUP BY articulo_id`);

  const precioHasta = db.prepare(`
    SELECT d.costo_unitario AS precio
      FROM ingreso_det d JOIN ingresos i ON i.id = d.ingreso_id
     WHERE d.articulo_id = ? AND d.costo_unitario > 0 AND i.fecha <= ?
     ORDER BY i.fecha DESC, i.id DESC, d.id DESC LIMIT 1`);

  return fechas.map((fecha) => {
    const filas = stockHasta.all(fecha, fecha, fecha) as Array<{
      articulo_id: number;
      stock: number;
    }>;
    let valor = 0;
    let unidades = 0;
    for (const f of filas) {
      const s = Number(f.stock);
      if (s <= 0) continue;
      unidades += s;
      const p = precioHasta.get(f.articulo_id, fecha) as { precio: number } | undefined;
      if (p) valor += s * Number(p.precio);
    }
    return { fecha, valor, unidades };
  });
}

export interface InversionSucursal {
  codigo: string;
  sucursal: string;
  unidades: number;
  vales: number;
  /** Valor de lo despachado, con el precio vigente al momento de cada salida. */
  invertido: number;
}

/**
 * Cuánto se «invirtió» en cada sucursal en el período: el valor de lo que se
 * le despachó, tomando el precio vigente EN LA FECHA DE CADA SALIDA.
 */
export function inversionPorSucursal(
  db: Database,
  desde: string,
  hasta: string,
): InversionSucursal[] {
  const salidas = db
    .prepare(
      `SELECT su.codigo, su.nombre AS sucursal, s.id AS salida_id, s.fecha,
              d.articulo_id, d.cantidad
         FROM salidas s
         JOIN sucursales su ON su.id = s.sucursal_id
         JOIN salida_det d ON d.salida_id = s.id
        WHERE s.fecha BETWEEN ? AND ? AND su.activo = 1`,
    )
    .all(desde, hasta) as Array<{
    codigo: string;
    sucursal: string;
    salida_id: number;
    fecha: string;
    articulo_id: number;
    cantidad: number;
  }>;

  const precioEn = db.prepare(`
    SELECT d.costo_unitario AS precio
      FROM ingreso_det d JOIN ingresos i ON i.id = d.ingreso_id
     WHERE d.articulo_id = ? AND d.costo_unitario > 0 AND i.fecha <= ?
     ORDER BY i.fecha DESC, i.id DESC, d.id DESC LIMIT 1`);

  const acum = new Map<string, InversionSucursal & { _vales: Set<number> }>();
  for (const f of salidas) {
    let a = acum.get(f.codigo);
    if (!a) {
      a = { codigo: f.codigo, sucursal: f.sucursal, unidades: 0, vales: 0, invertido: 0, _vales: new Set() };
      acum.set(f.codigo, a);
    }
    a.unidades += Number(f.cantidad);
    a._vales.add(f.salida_id);
    const p = precioEn.get(f.articulo_id, f.fecha) as { precio: number } | undefined;
    if (p) a.invertido += Number(f.cantidad) * Number(p.precio);
  }

  // Las sucursales sin movimientos también aparecen, con cero.
  for (const s of db.prepare('SELECT codigo, nombre FROM sucursales WHERE activo=1').all() as Array<{
    codigo: string;
    nombre: string;
  }>) {
    if (!acum.has(s.codigo)) {
      acum.set(s.codigo, {
        codigo: s.codigo, sucursal: s.nombre, unidades: 0, vales: 0, invertido: 0, _vales: new Set(),
      });
    }
  }

  return [...acum.values()]
    .map(({ _vales, ...r }) => ({ ...r, vales: _vales.size }))
    .sort((a, b) => b.invertido - a.invertido);
}

export interface SugerenciaCompra {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  stock: number;
  stock_minimo: number;
  /** Consumo promedio por mes en el período analizado. */
  consumoMensual: number;
  /** Para cuántos días alcanza el stock actual. `null` si no hay consumo. */
  diasRestantes: number | null;
  /** Cuánto conviene comprar para cubrir el objetivo. */
  sugerido: number;
  ultimoPrecio: number | null;
  costoEstimado: number;
  urgencia: 'sin stock' | 'urgente' | 'pronto' | 'holgado';
}

/**
 * Qué y cuánto comprar, calculado con el consumo real.
 *
 * `mesesAnalizados` es la ventana de consumo que se mira hacia atrás;
 * `diasCobertura` es para cuántos días se quiere tener stock.
 *
 * El objetivo de cada artículo es el mayor entre su stock mínimo y lo que
 * consume en el período de cobertura. Así, un artículo que se mueve mucho se
 * pide aunque su mínimo esté bajo, y uno que casi no se mueve no se pide de
 * más solo porque tiene un mínimo alto.
 */
export function sugerenciaCompra(
  db: Database,
  mesesAnalizados = 3,
  diasCobertura = 30,
  referencia: Date = new Date(),
): SugerenciaCompra[] {
  const d = new Date(referencia.getTime() - 30 * mesesAnalizados * 86400000);
  const p = (n: number): string => String(n).padStart(2, '0');
  const desde = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

  const filas = db
    .prepare(
      `SELECT a.id, a.codigo, a.nombre, a.unidad, a.stock_minimo,
              COALESCE(st.stock, 0) AS stock,
              COALESCE(cons.total, 0) AS consumido,
              up.precio AS ultimo_precio
         FROM articulos a
         LEFT JOIN (
            SELECT articulo_id, SUM(cant) AS stock FROM (
              SELECT articulo_id, cantidad AS cant FROM ingreso_det
              UNION ALL SELECT articulo_id, -cantidad FROM salida_det
              UNION ALL SELECT articulo_id, cantidad FROM ajustes
            ) GROUP BY articulo_id
         ) st ON st.articulo_id = a.id
         LEFT JOIN (
            SELECT d.articulo_id, SUM(d.cantidad) AS total
              FROM salida_det d JOIN salidas s ON s.id = d.salida_id
             WHERE s.fecha >= ?
             GROUP BY d.articulo_id
         ) cons ON cons.articulo_id = a.id
         LEFT JOIN (
            SELECT d.articulo_id, d.costo_unitario AS precio
              FROM ingreso_det d JOIN ingresos i ON i.id = d.ingreso_id
             WHERE d.costo_unitario > 0
               AND d.id = (SELECT d2.id FROM ingreso_det d2
                             JOIN ingresos i2 ON i2.id = d2.ingreso_id
                            WHERE d2.articulo_id = d.articulo_id AND d2.costo_unitario > 0
                            ORDER BY i2.fecha DESC, i2.id DESC, d2.id DESC LIMIT 1)
         ) up ON up.articulo_id = a.id
        WHERE a.activo = 1
        ORDER BY a.nombre`,
    )
    .all(desde) as Array<{
    id: number;
    codigo: string;
    nombre: string;
    unidad: string;
    stock_minimo: number;
    stock: number;
    consumido: number;
    ultimo_precio: number | null;
  }>;

  const salida: SugerenciaCompra[] = [];
  for (const f of filas) {
    const consumoMensual = Number(f.consumido) / Math.max(1, mesesAnalizados);
    const consumoDiario = consumoMensual / 30;
    const stock = Number(f.stock);
    const minimo = Number(f.stock_minimo);

    const diasRestantes = consumoDiario > 0 ? stock / consumoDiario : null;
    const objetivo = Math.max(minimo, consumoDiario * diasCobertura);
    const sugerido = Math.max(0, objetivo - stock);

    let urgencia: SugerenciaCompra['urgencia'];
    if (stock <= 0) urgencia = 'sin stock';
    else if (diasRestantes !== null && diasRestantes <= 7) urgencia = 'urgente';
    else if (stock <= minimo || (diasRestantes !== null && diasRestantes <= diasCobertura)) urgencia = 'pronto';
    else urgencia = 'holgado';

    // Solo se sugiere lo que hace falta comprar.
    if (sugerido <= 0.0001) continue;

    const precio = f.ultimo_precio === null ? null : Number(f.ultimo_precio);
    // El costo se calcula sobre la cantidad REDONDEADA, que es la que se ve en
    // pantalla. Si se usara la cruda, la cuenta no cerraría contra el papel y
    // habría que explicar una diferencia de centavos que no existe.
    const aPedir = Math.ceil(sugerido * 100) / 100;
    salida.push({
      id: f.id,
      codigo: f.codigo,
      nombre: f.nombre,
      unidad: f.unidad,
      stock,
      stock_minimo: minimo,
      consumoMensual,
      diasRestantes: diasRestantes === null ? null : Math.round(diasRestantes),
      sugerido: aPedir,
      ultimoPrecio: precio,
      costoEstimado: precio ? aPedir * precio : 0,
      urgencia,
    });
  }

  const orden = { 'sin stock': 0, urgente: 1, pronto: 2, holgado: 3 };
  return salida.sort((a, b) => orden[a.urgencia] - orden[b.urgencia] || b.costoEstimado - a.costoEstimado);
}

/** Reparte N fechas entre dos extremos, inclusive. */
function repartirFechas(desde: string, hasta: string, puntos: number): string[] {
  const a = new Date(`${desde}T00:00:00`);
  const b = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return [hasta];
  const total = b.getTime() - a.getTime();
  const n = Math.max(2, Math.min(puntos, 40));
  const p = (x: number): string => String(x).padStart(2, '0');
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(a.getTime() + (total * i) / (n - 1));
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return [...new Set(out)];
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
