/* ---------------------------------------------------------------------------
 * Ingresos (boletas), salidas (vales) y ajustes. Port de `sfida_core.py`.
 *
 * Reglas del negocio que viven acá y NO se pueden romper:
 *   - No se puede registrar dos veces la misma boleta (mismo tipo + número).
 *   - No se puede sacar más de lo que hay, agrupando las líneas repetidas.
 *   - No se puede anular un ingreso si dejaría el stock en negativo.
 *   - Los ajustes no pueden dejar el stock negativo.
 *   - Todo queda en auditoría.
 * ------------------------------------------------------------------------- */
import type { Database } from 'better-sqlite3';

import { obtenerArticulo } from './articulos';
import { auditar } from './config';
import { ErrorNegocio } from './errores';
import { stockDe } from './stock';
import { fmtNum, hoy, norm, normalizarNombre, validaFecha } from './textos';

/** Tolerancia de todas las comparaciones de stock (son flotantes). */
const EPS = 0.0001;

/* ------------------------------------------------------------------ ingresos */

export type LineaIngreso = [articuloId: number, cantidad: number, costoUnitario: number];

export interface Ingreso {
  id: number;
  tipo_doc: string;
  nro_documento: string;
  fecha: string;
  proveedor: string | null;
  observacion: string | null;
  creado_en: string;
}

export interface IngresoListado extends Ingreso {
  items: number;
  unidades: number;
  total: number;
}

export interface DetalleIngreso {
  id: number;
  ingreso_id: number;
  articulo_id: number;
  cantidad: number;
  costo_unitario: number;
  codigo: string;
  nombre: string;
  unidad: string;
}

/**
 * Port de `registrar_ingreso()`.
 *
 * El costo es OPCIONAL: 0 significa «sin precio» y en pantalla se ve un guion,
 * nunca S/ 0.00.
 *
 * OJO — comportamiento no obvio nº 6: la OBSERVACIÓN no se pasa a mayúsculas,
 * solo `strip()`. El CLAUDE.md viejo la enumeraba entre los campos que sí,
 * pero manda el código.
 */
export function registrarIngreso(
  db: Database,
  tipoDoc: unknown,
  nroDocumento: unknown,
  fecha: string,
  proveedor: unknown,
  observacion: unknown,
  items: LineaIngreso[],
): number {
  const nro = norm(nroDocumento).toUpperCase();
  const tipo = norm(tipoDoc).toUpperCase() || 'BOLETA';
  const prov = normalizarNombre(proveedor);

  if (!nro) throw new ErrorNegocio('Escriba el numero de la boleta o factura.');
  validaFecha(fecha);
  if (!items || items.length === 0) throw new ErrorNegocio('Agregue al menos un articulo a la boleta.');
  for (const [, cant, costo] of items) {
    if (Number(cant) <= 0) throw new ErrorNegocio('Las cantidades deben ser mayores a cero.');
    if (Number(costo ?? 0) < 0) throw new ErrorNegocio('El precio no puede ser negativo.');
  }

  const dup = db
    .prepare('SELECT id FROM ingresos WHERE tipo_doc=? AND nro_documento=?')
    .get(tipo, nro);
  if (dup) {
    throw new ErrorNegocio(
      `La ${tipo} N° ${nro} ya fue registrada antes. Revise el historial de ingresos.`,
    );
  }

  const tx = db.transaction(() => {
    const ingId = db
      .prepare(
        `INSERT INTO ingresos (tipo_doc, nro_documento, fecha, proveedor, observacion)
         VALUES (?,?,?,?,?)`,
      )
      .run(tipo, nro, fecha, prov, norm(observacion)).lastInsertRowid as number;
    const insLinea = db.prepare(
      `INSERT INTO ingreso_det (ingreso_id, articulo_id, cantidad, costo_unitario)
       VALUES (?,?,?,?)`,
    );
    for (const [artId, cant, costo] of items) {
      insLinea.run(ingId, artId, Number(cant), Number(costo ?? 0));
    }
    return ingId;
  });

  const ingId = tx();
  auditar(db, 'INGRESO', `${tipo} ${nro} de ${prov || 'sin proveedor'} (${items.length} articulos)`);
  return ingId;
}

export function listarIngresos(
  db: Database,
  desde: string | null = null,
  hasta: string | null = null,
  texto = '',
): IngresoListado[] {
  let sql = `SELECT i.*,
                    (SELECT COUNT(*) FROM ingreso_det d WHERE d.ingreso_id=i.id) AS items,
                    (SELECT COALESCE(SUM(d.cantidad),0) FROM ingreso_det d
                      WHERE d.ingreso_id=i.id) AS unidades,
                    (SELECT COALESCE(SUM(d.cantidad*d.costo_unitario),0)
                       FROM ingreso_det d WHERE d.ingreso_id=i.id) AS total
             FROM ingresos i WHERE 1=1`;
  const par: unknown[] = [];
  if (desde) { sql += ' AND i.fecha >= ?'; par.push(desde); }
  if (hasta) { sql += ' AND i.fecha <= ?'; par.push(hasta); }
  const t = norm(texto);
  if (t) {
    sql += ' AND (i.nro_documento LIKE ? OR i.proveedor LIKE ?)';
    const like = `%${t.toUpperCase()}%`;
    par.push(like, like);
  }
  sql += ' ORDER BY i.fecha DESC, i.id DESC';
  return db.prepare(sql).all(...par) as IngresoListado[];
}

export function cabeceraIngreso(db: Database, ingresoId: number): Ingreso | undefined {
  return db.prepare('SELECT * FROM ingresos WHERE id=?').get(ingresoId) as Ingreso | undefined;
}

export function detalleIngreso(db: Database, ingresoId: number): DetalleIngreso[] {
  return db
    .prepare(
      `SELECT d.*, a.codigo, a.nombre, a.unidad
       FROM ingreso_det d JOIN articulos a ON a.id=d.articulo_id
       WHERE d.ingreso_id=? ORDER BY a.nombre`,
    )
    .all(ingresoId) as DetalleIngreso[];
}

/** Port de `eliminar_ingreso()`. No se permite si dejaría algún stock negativo. */
export function eliminarIngreso(db: Database, ingresoId: number): void {
  for (const d of detalleIngreso(db, ingresoId)) {
    if (stockDe(db, d.articulo_id) - d.cantidad < -EPS) {
      throw new ErrorNegocio(
        `No se puede anular: el articulo ${d.nombre} ya fue repartido y el stock quedaria negativo.`,
      );
    }
  }
  const cab = db
    .prepare('SELECT tipo_doc, nro_documento FROM ingresos WHERE id=?')
    .get(ingresoId) as { tipo_doc: string; nro_documento: string } | undefined;
  db.prepare('DELETE FROM ingresos WHERE id=?').run(ingresoId);
  if (cab) auditar(db, 'ANULA INGRESO', `${cab.tipo_doc} ${cab.nro_documento}`);
}

/* ------------------------------------------------------------------ salidas */

export type LineaSalida = [articuloId: number, cantidad: number];

export interface Salida {
  id: number;
  nro_vale: string;
  fecha: string;
  sucursal_id: number;
  entregado_por: string | null;
  recibido_por: string | null;
  observacion: string | null;
  creado_en: string;
}

export interface SalidaListada extends Salida {
  sucursal: string;
  suc_codigo: string;
  items: number;
  unidades: number;
}

export interface CabeceraSalida extends Salida {
  sucursal: string;
  suc_codigo: string;
  direccion: string | null;
  responsable: string | null;
}

export interface DetalleSalida {
  id: number;
  salida_id: number;
  articulo_id: number;
  cantidad: number;
  codigo: string;
  nombre: string;
  unidad: string;
}

/**
 * Port de `siguiente_nro_vale()`, CON UN CAMBIO DELIBERADO APROBADO.
 *
 * Antes: `COUNT(*) + 1`. Si se anulaba un vale el conteo bajaba y el sistema
 * volvía a proponer un número ya usado, avisando «ya existe» sobre su propia
 * sugerencia.
 *
 * Ahora: el MÁXIMO sufijo del año + 1. Los números no se reusan, igual que en
 * un talonario físico. Ver CAMBIOS_DELIBERADOS.md, punto 1.
 */
export function siguienteNroVale(db: Database, fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const prefijo = `V${anio}-`;
  const filas = db
    .prepare('SELECT nro_vale FROM salidas WHERE nro_vale LIKE ?')
    .all(`${prefijo}%`) as { nro_vale: string }[];

  let max = 0;
  for (const f of filas) {
    const sufijo = String(f.nro_vale).slice(prefijo.length);
    if (/^\d+$/.test(sufijo)) max = Math.max(max, Number(sufijo));
  }
  return `${prefijo}${String(max + 1).padStart(4, '0')}`;
}

export function existeVale(db: Database, nroVale: unknown): boolean {
  return (
    db.prepare('SELECT 1 FROM salidas WHERE nro_vale=?').get(norm(nroVale).toUpperCase()) !== undefined
  );
}

/**
 * Port de `registrar_salida()`. Descuenta stock hacia una sucursal.
 *
 * ORDEN DE VALIDACIÓN, que importa para los mensajes que ve la persona:
 *   1. exige el número de vale
 *   2. valida la fecha
 *   3. exige sucursal
 *   4. exige al menos un ítem
 *   5. AGRUPA las líneas repetidas del mismo artículo
 *   6. valida el stock de la cantidad AGRUPADA
 *   7. recién ahí comprueba que el vale no exista
 *
 * Guarda UNA línea por artículo agrupado, no una por línea escrita.
 */
export function registrarSalida(
  db: Database,
  nroVale: unknown,
  fecha: string,
  sucursalId: number | null,
  entregadoPor: unknown,
  recibidoPor: unknown,
  observacion: unknown,
  items: LineaSalida[],
): number {
  const vale = norm(nroVale).toUpperCase();
  if (!vale) throw new ErrorNegocio('Escriba el numero de vale de salida.');
  validaFecha(fecha);
  if (!sucursalId) throw new ErrorNegocio('Elija la sucursal a la que se reparte.');
  if (!items || items.length === 0) throw new ErrorNegocio('Agregue al menos un articulo al vale.');

  // Suma cantidades del mismo artículo ANTES de validar el stock
  const pedido = new Map<number, number>();
  for (const [artId, cantidad] of items) {
    const cant = Number(cantidad);
    if (cant <= 0) throw new ErrorNegocio('Las cantidades deben ser mayores a cero.');
    pedido.set(artId, (pedido.get(artId) ?? 0) + cant);
  }

  for (const [artId, cant] of pedido) {
    const disp = stockDe(db, artId);
    if (cant > disp + EPS) {
      const art = obtenerArticulo(db, artId);
      throw new ErrorNegocio(
        `Stock insuficiente de ${art?.nombre ?? artId}.\n` +
          `Disponible: ${fmtNum(disp)} ${art?.unidad ?? ''} | Solicitado: ${fmtNum(cant)} ${art?.unidad ?? ''}`,
      );
    }
  }

  if (db.prepare('SELECT id FROM salidas WHERE nro_vale=?').get(vale)) {
    throw new ErrorNegocio(`El vale N° ${vale} ya existe.`);
  }

  const tx = db.transaction(() => {
    const salId = db
      .prepare(
        `INSERT INTO salidas (nro_vale, fecha, sucursal_id, entregado_por, recibido_por, observacion)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(
        vale,
        fecha,
        sucursalId,
        normalizarNombre(entregadoPor),
        normalizarNombre(recibidoPor),
        norm(observacion),
      ).lastInsertRowid as number;
    const insLinea = db.prepare(
      'INSERT INTO salida_det (salida_id, articulo_id, cantidad) VALUES (?,?,?)',
    );
    for (const [artId, cant] of pedido) insLinea.run(salId, artId, cant);
    return salId;
  });

  const salId = tx();
  const suc = db.prepare('SELECT nombre FROM sucursales WHERE id=?').get(sucursalId) as
    | { nombre: string }
    | undefined;
  auditar(db, 'SALIDA', `Vale ${vale} a ${suc?.nombre ?? '?'} (${pedido.size} articulos)`);
  return salId;
}

export function listarSalidas(
  db: Database,
  desde: string | null = null,
  hasta: string | null = null,
  sucursalId: number | null = null,
  texto = '',
): SalidaListada[] {
  let sql = `SELECT s.*, su.nombre AS sucursal, su.codigo AS suc_codigo,
                    (SELECT COUNT(*) FROM salida_det d WHERE d.salida_id=s.id) AS items,
                    (SELECT COALESCE(SUM(d.cantidad),0) FROM salida_det d
                      WHERE d.salida_id=s.id) AS unidades
             FROM salidas s JOIN sucursales su ON su.id=s.sucursal_id
             WHERE 1=1`;
  const par: unknown[] = [];
  if (desde) { sql += ' AND s.fecha >= ?'; par.push(desde); }
  if (hasta) { sql += ' AND s.fecha <= ?'; par.push(hasta); }
  if (sucursalId) { sql += ' AND s.sucursal_id = ?'; par.push(sucursalId); }
  const t = norm(texto);
  if (t) {
    sql += ' AND (s.nro_vale LIKE ? OR s.recibido_por LIKE ?)';
    const like = `%${t.toUpperCase()}%`;
    par.push(like, like);
  }
  sql += ' ORDER BY s.fecha DESC, s.id DESC';
  return db.prepare(sql).all(...par) as SalidaListada[];
}

export function detalleSalida(db: Database, salidaId: number): DetalleSalida[] {
  return db
    .prepare(
      `SELECT d.*, a.codigo, a.nombre, a.unidad
       FROM salida_det d JOIN articulos a ON a.id=d.articulo_id
       WHERE d.salida_id=? ORDER BY a.nombre`,
    )
    .all(salidaId) as DetalleSalida[];
}

/** Incluye los datos de la sucursal: es lo que consume la impresión del vale. */
export function cabeceraSalida(db: Database, salidaId: number): CabeceraSalida | undefined {
  return db
    .prepare(
      `SELECT s.*, su.nombre AS sucursal, su.codigo AS suc_codigo,
              su.direccion, su.responsable
       FROM salidas s JOIN sucursales su ON su.id=s.sucursal_id
       WHERE s.id=?`,
    )
    .get(salidaId) as CabeceraSalida | undefined;
}

/** Devolver stock nunca lo deja negativo, así que no valida nada. */
export function eliminarSalida(db: Database, salidaId: number): void {
  const cab = cabeceraSalida(db, salidaId);
  db.prepare('DELETE FROM salidas WHERE id=?').run(salidaId);
  if (cab) auditar(db, 'ANULA SALIDA', `Vale ${cab.nro_vale} de ${cab.sucursal}`);
}

/* ------------------------------------------------------------------ ajustes */

/** Port de `registrar_ajuste()`. Cantidad CON SIGNO: positivo suma, negativo resta. */
export function registrarAjuste(
  db: Database,
  articuloId: number,
  cantidad: number,
  motivo: unknown,
  fecha: string | null = null,
): void {
  const cant = Number(cantidad);
  if (cant === 0) throw new ErrorNegocio('La cantidad del ajuste no puede ser cero.');
  const f = fecha || hoy();
  validaFecha(f);
  if (stockDe(db, articuloId) + cant < -EPS) {
    throw new ErrorNegocio('El ajuste dejaria el stock en negativo.');
  }
  db.prepare('INSERT INTO ajustes (fecha, articulo_id, cantidad, motivo) VALUES (?,?,?,?)').run(
    f,
    articuloId,
    cant,
    norm(motivo),
  );
  const a = obtenerArticulo(db, articuloId);
  auditar(
    db,
    'AJUSTE',
    `${a?.nombre ?? articuloId}: ${cant > 0 ? '+' : ''}${fmtNum(cant)} (${norm(motivo)})`,
  );
}
