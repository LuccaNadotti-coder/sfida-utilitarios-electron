/* ---------------------------------------------------------------------------
 * Ingresos (boletas), salidas (vales) y ajustes.
 *
 * CAMBIOS DE LA v5, todos aprobados (ver CAMBIOS_DELIBERADOS.md):
 *   - El N° de ingreso y el N° de vale los genera el sistema y NO son
 *     editables. El número del proveedor va en su propio campo.
 *   - Las líneas se digitan en cualquier unidad de la familia y se guardan
 *     convertidas a la unidad de stock del artículo.
 *   - «Quién entrega» y «quién recibe» salieron de la pantalla: en el ticket
 *     van como renglones en blanco para llenar a mano.
 *
 * Reglas que NO cambian:
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
import { aUnidadStock, infoUnidad } from './unidades';

/** Tolerancia de todas las comparaciones de stock (son flotantes). */
const EPS = 0.0001;

/**
 * Una línea tal como se digita en la pantalla: la cantidad va en la unidad
 * que eligió la persona, no necesariamente la de stock.
 */
export interface LineaDigitada {
  articuloId: number;
  cantidad: number;
  /** Unidad elegida. Si se omite, se asume la de stock del artículo. */
  unidad?: string;
  /** Solo para ingresos. Precio POR LA UNIDAD DIGITADA. */
  costo?: number;
}

interface LineaConvertida {
  articuloId: number;
  /** Cantidad ya en la unidad de stock. */
  cantidad: number;
  /** Costo ya por unidad de stock. */
  costo: number;
  /**
   * Lo que se digitó de verdad, para poder imprimirlo.
   *
   * Va en NULL cuando no hay una sola respuesta honesta: por ejemplo al juntar
   * «1 GAL» con «500 ML» del mismo artículo. Ahí el ticket imprime la unidad
   * de stock, que siempre es correcta.
   */
  cantidadOrigen: number | null;
  unidadOrigen: string | null;
}

/**
 * Pasa una línea digitada a la unidad de stock del artículo.
 *
 * El PRECIO también se convierte: si un galón cuesta S/ 22 y el stock va en
 * litros, el litro cuesta 22 / 3.785. Si no se convirtiera, la valorización
 * del inventario saldría multiplicada por 3.785.
 */
function convertirLinea(db: Database, l: LineaDigitada): LineaConvertida {
  const art = obtenerArticulo(db, l.articuloId);
  if (!art) throw new ErrorNegocio('El articulo ya no existe.');

  const unidadStock = art.unidad;
  const unidadOrigen = infoUnidad(l.unidad || unidadStock).codigo;
  const cantidad = Number(l.cantidad);

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new ErrorNegocio('Las cantidades deben ser mayores a cero.');
  }

  const enStock = aUnidadStock(cantidad, unidadOrigen, unidadStock);
  if (enStock === null) {
    throw new ErrorNegocio(
      `No se puede convertir ${unidadOrigen} a ${unidadStock}: son medidas distintas ` +
        `(no se puede pasar de litros a kilos).`,
    );
  }

  const costoDigitado = Number(l.costo ?? 0);
  if (costoDigitado < 0) throw new ErrorNegocio('El precio no puede ser negativo.');
  // El costo viene por unidad digitada; se pasa a costo por unidad de stock.
  const factor = enStock / cantidad;
  const costoStock = factor > 0 ? costoDigitado / factor : costoDigitado;

  return {
    articuloId: l.articuloId,
    cantidad: enStock,
    costo: costoStock,
    cantidadOrigen: cantidad,
    unidadOrigen,
  };
}

/* ------------------------------------------------------------------ ingresos */

export interface Ingreso {
  id: number;
  tipo_doc: string;
  nro_documento: string;
  nro_proveedor: string;
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
  cantidad_origen: number | null;
  unidad_origen: string | null;
  codigo: string;
  nombre: string;
  unidad: string;
}

/**
 * Siguiente número INTERNO de ingreso: `I{año}-{0000}`.
 * Igual que los vales, usa el MÁXIMO sufijo del año, no el conteo.
 */
export function siguienteNroIngreso(db: Database, fecha: Date = new Date()): string {
  return siguienteCorrelativo(db, 'ingresos', 'nro_documento', 'I', fecha);
}

function siguienteCorrelativo(
  db: Database,
  tabla: string,
  columna: string,
  letra: string,
  fecha: Date,
): string {
  const anio = fecha.getFullYear();
  const prefijo = `${letra}${anio}-`;
  const filas = db
    .prepare(`SELECT ${columna} AS n FROM ${tabla} WHERE ${columna} LIKE ?`)
    .all(`${prefijo}%`) as Array<{ n: string }>;
  let max = 0;
  for (const f of filas) {
    const sufijo = String(f.n).slice(prefijo.length);
    if (/^\d+$/.test(sufijo)) max = Math.max(max, Number(sufijo));
  }
  return `${prefijo}${String(max + 1).padStart(4, '0')}`;
}

export interface DatosIngreso {
  tipoDoc: string;
  /** El número que figura en la boleta del proveedor. Opcional. */
  nroProveedor: string;
  fecha: string;
  proveedor: string;
  observacion: string;
  items: LineaDigitada[];
}

/**
 * Registra un ingreso. El N° interno lo genera el sistema.
 *
 * La regla de «no registrar dos veces la misma boleta» ahora se apoya en
 * (proveedor + nro_proveedor), que es lo que de verdad identifica el papel.
 * Antes se apoyaba en el número de documento, que ahora es interno y por
 * definición nunca se repite.
 */
export function registrarIngreso(db: Database, d: DatosIngreso): number {
  const tipo = norm(d.tipoDoc).toUpperCase() || 'BOLETA';
  const prov = normalizarNombre(d.proveedor);
  const nroProv = norm(d.nroProveedor).toUpperCase();

  validaFecha(d.fecha);
  if (!d.items || d.items.length === 0) {
    throw new ErrorNegocio('Agregue al menos un articulo a la boleta.');
  }

  // Misma boleta del mismo proveedor: se rechaza. Sin número de proveedor no
  // se puede comprobar, y se deja pasar (hay boletas sin número legible).
  if (nroProv && prov) {
    const dup = db
      .prepare('SELECT nro_documento FROM ingresos WHERE proveedor = ? AND nro_proveedor = ?')
      .get(prov, nroProv) as { nro_documento: string } | undefined;
    if (dup) {
      throw new ErrorNegocio(
        `La ${tipo} N° ${nroProv} de ${prov} ya fue registrada antes ` +
          `(ingreso ${dup.nro_documento}). Revise el historial.`,
      );
    }
  }

  const lineas = d.items.map((l) => convertirLinea(db, l));

  const tx = db.transaction(() => {
    const nroInterno = siguienteNroIngreso(db);
    const ingId = db
      .prepare(
        `INSERT INTO ingresos (tipo_doc, nro_documento, nro_proveedor, fecha, proveedor, observacion)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(tipo, nroInterno, nroProv, d.fecha, prov, norm(d.observacion)).lastInsertRowid as number;

    const insLinea = db.prepare(
      `INSERT INTO ingreso_det
         (ingreso_id, articulo_id, cantidad, costo_unitario, cantidad_origen, unidad_origen)
       VALUES (?,?,?,?,?,?)`,
    );
    for (const l of lineas) {
      insLinea.run(ingId, l.articuloId, l.cantidad, l.costo, l.cantidadOrigen, l.unidadOrigen);
    }
    return { ingId, nroInterno };
  });

  const { ingId, nroInterno } = tx();
  auditar(
    db,
    'INGRESO',
    `${nroInterno} · ${tipo} ${nroProv || 's/n'} de ${prov || 'sin proveedor'} (${lineas.length} articulos)`,
  );
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
    sql += ' AND (i.nro_documento LIKE ? OR i.nro_proveedor LIKE ? OR i.proveedor LIKE ?)';
    const like = `%${t.toUpperCase()}%`;
    par.push(like, like, like);
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

/** No se permite si dejaría algún stock en negativo. */
export function eliminarIngreso(db: Database, ingresoId: number): void {
  for (const d of detalleIngreso(db, ingresoId)) {
    if (stockDe(db, d.articulo_id) - d.cantidad < -EPS) {
      throw new ErrorNegocio(
        `No se puede anular: el articulo ${d.nombre} ya fue repartido y el stock quedaria negativo.`,
      );
    }
  }
  const cab = cabeceraIngreso(db, ingresoId);
  db.prepare('DELETE FROM ingresos WHERE id=?').run(ingresoId);
  if (cab) auditar(db, 'ANULA INGRESO', `${cab.nro_documento} (${cab.tipo_doc} ${cab.nro_proveedor})`);
}

/* ------------------------------------------------------------------ salidas */

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

export interface CabeceraSalida extends SalidaListada {
  direccion: string | null;
  responsable: string | null;
}

export interface DetalleSalida {
  id: number;
  salida_id: number;
  articulo_id: number;
  cantidad: number;
  cantidad_origen: number | null;
  unidad_origen: string | null;
  codigo: string;
  nombre: string;
  unidad: string;
}

/** Siguiente número de vale: `V{año}-{0000}`, con el MÁXIMO sufijo del año. */
export function siguienteNroVale(db: Database, fecha: Date = new Date()): string {
  return siguienteCorrelativo(db, 'salidas', 'nro_vale', 'V', fecha);
}

export function existeVale(db: Database, nroVale: unknown): boolean {
  return (
    db.prepare('SELECT 1 FROM salidas WHERE nro_vale=?').get(norm(nroVale).toUpperCase()) !== undefined
  );
}

export interface DatosSalida {
  fecha: string;
  sucursalId: number | null;
  observacion: string;
  items: LineaDigitada[];
}

/**
 * Registra una salida. El N° de vale lo genera el sistema y no es editable.
 *
 * ORDEN DE VALIDACIÓN, que importa para los mensajes que ve la persona:
 *   fecha -> sucursal -> ítems -> convertir unidades -> AGRUPAR repetidos ->
 *   validar stock de la cantidad agrupada.
 */
export function registrarSalida(db: Database, d: DatosSalida): number {
  validaFecha(d.fecha);
  if (!d.sucursalId) throw new ErrorNegocio('Elija la sucursal a la que se reparte.');
  if (!d.items || d.items.length === 0) {
    throw new ErrorNegocio('Agregue al menos un articulo al vale.');
  }

  const lineas = d.items.map((l) => convertirLinea(db, l));

  // Suma las cantidades del mismo artículo ANTES de validar el stock: si no,
  // dos filas de 6 pasarían el control teniendo 10, y recién al guardar se
  // descubriría que el stock quedó negativo.
  const pedido = new Map<number, LineaConvertida>();
  for (const l of lineas) {
    const ya = pedido.get(l.articuloId);
    if (!ya) {
      pedido.set(l.articuloId, { ...l });
      continue;
    }
    // La cantidad de stock SIEMPRE se puede sumar: las dos están en la misma
    // unidad porque `convertirLinea()` ya las pasó a la del artículo.
    ya.cantidad += l.cantidad;

    // Lo digitado, en cambio, solo se puede sumar si las dos filas venían en
    // la MISMA unidad. Sumar «1 GAL» con «500 ML» daba 501 con la etiqueta
    // GAL, y el ticket salía impreso diciendo 501 galones. Cuando no coinciden
    // se descarta el origen y el ticket cae en la unidad de stock, que no
    // miente.
    if (ya.unidadOrigen !== null && ya.unidadOrigen === l.unidadOrigen && ya.cantidadOrigen !== null && l.cantidadOrigen !== null) {
      ya.cantidadOrigen += l.cantidadOrigen;
    } else {
      ya.cantidadOrigen = null;
      ya.unidadOrigen = null;
    }
  }

  for (const [artId, l] of pedido) {
    const disp = stockDe(db, artId);
    if (l.cantidad > disp + EPS) {
      const art = obtenerArticulo(db, artId);
      throw new ErrorNegocio(
        `Stock insuficiente de ${art?.nombre ?? artId}.\n` +
          `Disponible: ${fmtNum(disp)} ${art?.unidad ?? ''} | ` +
          `Solicitado: ${fmtNum(l.cantidad)} ${art?.unidad ?? ''}`,
      );
    }
  }

  const tx = db.transaction(() => {
    const vale = siguienteNroVale(db);
    const salId = db
      .prepare(
        `INSERT INTO salidas (nro_vale, fecha, sucursal_id, entregado_por, recibido_por, observacion)
         VALUES (?,?,?,?,?,?)`,
      )
      .run(vale, d.fecha, d.sucursalId, '', '', norm(d.observacion)).lastInsertRowid as number;

    const insLinea = db.prepare(
      `INSERT INTO salida_det (salida_id, articulo_id, cantidad, cantidad_origen, unidad_origen)
       VALUES (?,?,?,?,?)`,
    );
    for (const [artId, l] of pedido) {
      insLinea.run(salId, artId, l.cantidad, l.cantidadOrigen, l.unidadOrigen);
    }
    return { salId, vale };
  });

  const { salId, vale } = tx();
  const suc = db.prepare('SELECT nombre FROM sucursales WHERE id=?').get(d.sucursalId) as
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
    sql += ' AND (s.nro_vale LIKE ? OR su.nombre LIKE ?)';
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
              su.direccion, su.responsable,
              (SELECT COUNT(*) FROM salida_det d WHERE d.salida_id=s.id) AS items,
              (SELECT COALESCE(SUM(d.cantidad),0) FROM salida_det d WHERE d.salida_id=s.id) AS unidades
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

/** Cantidad CON SIGNO, en la unidad de stock: positivo suma, negativo resta. */
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

/**
 * Conteo físico guiado: aplica varios ajustes de una sola vez.
 *
 * Se le pasa lo CONTADO de cada artículo y el sistema calcula la diferencia.
 * Los artículos sin diferencia se saltean. Todo va con el mismo motivo y en
 * una sola transacción: o entra todo o no entra nada.
 */
export function aplicarConteoFisico(
  db: Database,
  contados: Array<{ articuloId: number; contado: number }>,
  motivo: string,
  fecha: string | null = null,
): { aplicados: number; sinCambio: number } {
  const f = fecha || hoy();
  validaFecha(f);
  // El motivo va en MAYÚSCULAS acá y no en `registrarAjuste`, que se mantiene
  // igual a la versión Python (solo recorta espacios). En la app vieja las
  // mayúsculas las forzaba el combo de la pantalla; esta función es nueva y no
  // tiene ninguna pantalla vieja que respetar, así que la regla se aplica
  // donde no se puede saltear.
  const m = normalizarNombre(motivo) || 'INVENTARIO FÍSICO';

  const pendientes: Array<{ articuloId: number; dif: number; nombre: string }> = [];
  for (const c of contados) {
    const actual = stockDe(db, c.articuloId);
    const dif = Number(c.contado) - actual;
    if (Math.abs(dif) < EPS) continue;
    if (actual + dif < -EPS) {
      const a = obtenerArticulo(db, c.articuloId);
      throw new ErrorNegocio(`El conteo de ${a?.nombre ?? c.articuloId} dejaria el stock negativo.`);
    }
    pendientes.push({ articuloId: c.articuloId, dif, nombre: obtenerArticulo(db, c.articuloId)?.nombre ?? '' });
  }

  const tx = db.transaction(() => {
    const ins = db.prepare(
      'INSERT INTO ajustes (fecha, articulo_id, cantidad, motivo) VALUES (?,?,?,?)',
    );
    for (const p of pendientes) ins.run(f, p.articuloId, p.dif, m);
  });
  tx();

  if (pendientes.length) {
    auditar(db, 'CONTEO FISICO', `${pendientes.length} articulos ajustados (${m})`);
  }
  return { aplicados: pendientes.length, sinCambio: contados.length - pendientes.length };
}
