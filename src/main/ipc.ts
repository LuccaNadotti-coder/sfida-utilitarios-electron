/* ---------------------------------------------------------------------------
 * Canales IPC. TODO el acceso a datos pasa por acá.
 *
 * Cada canal devuelve siempre `Respuesta<T>` y NUNCA lanza: así un
 * ErrorNegocio llega a la pantalla como texto para mostrar, y no como una
 * excepción destrozada por la serialización del IPC.
 * ------------------------------------------------------------------------- */
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';

import { dialog, ipcMain, shell } from 'electron';
import type { Database } from 'better-sqlite3';

import { CANALES, type AnchoPapel, type ConsumoSucursal, type DatosEmpresa, type InfoBaseDatos, type MinimoSugerido, type OpcionesImpresion, type Respuesta, type SucursalConTotales, type TipoComprobante } from '../compartido/contrato';
import { vistaPrevia as previaVale, imprimirVale, pdfVale, type Comprobante } from './impresion/imprimir';
import {
  codigoSugerido,
  conteos,
  eliminarArticulo,
  eliminarSucursal,
  guardarArticulo,
  guardarSucursal,
  listarArticulos,
  listarSucursales,
  obtenerArticulo,
  reactivarArticulo,
} from './nucleo/articulos';
import { categoriaCorta, listarCategorias } from './nucleo/categorias';
import {
  animacionesActivas,
  auditar,
  cambiarClave,
  claveEsLaDeFabrica,
  getConfig,
  limpiarAuditoria,
  listarAuditoria,
  setAnimaciones,
  setConfig,
  verificarClave,
} from './nucleo/config';
import { ErrorNegocio, serializarError } from './nucleo/errores';
import {
  CATALOGO_SUGERIDO,
  cargarCatalogoSugerido,
  borrarMovimientos,
  exportarCsv,
  importarArticulosCsv,
  normalizarDatosExistentes,
  plantillaArticulosCsv,
  respaldarBd,
  restaurarBd,
  tamanoBd,
} from './nucleo/mantenimiento';
import type { DatosIngreso, DatosSalida } from './nucleo/movimientos';
import {
  aplicarConteoFisico,
  cabeceraIngreso,
  cabeceraSalida,
  detalleIngreso,
  detalleSalida,
  eliminarIngreso,
  eliminarSalida,
  existeVale,
  listarIngresos,
  listarSalidas,
  registrarAjuste,
  registrarIngreso,
  registrarSalida,
  siguienteNroIngreso,
  siguienteNroVale,
} from './nucleo/movimientos';
import {
  actualizarMinimos,
  articulosMasMovidos,
  consumoPorSucursal,
  detalleConsumoSucursal,
  estadisticasMensuales,
  evolucionValorAlmacen,
  inversionPorSucursal,
  kardex,
  minimosSugeridos,
  sugerenciaCompra,
} from './nucleo/reportes';
import {
  actualizarCostoLinea,
  alertasStockMinimo,
  historialPrecios,
  listarStock,
  nivelesStock,
  resumenPanel,
  resumenPrecios,
  stockDe,
  ultimoPrecio,
} from './nucleo/stock';
import { hoy } from './nucleo/textos';
import { UNIDADES, equivalenciaUnidad, unidadesCompatibles } from './nucleo/unidades';

const req = createRequire(import.meta.url);

/**
 * Carpeta donde se proponen los archivos que exporta la app.
 *
 * Se resuelve tarde (dentro de la función) y no al importar el módulo: en modo
 * captura y en las pruebas, `app` puede no estar lista todavía.
 */
function carpetaDocumentos(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = req('electron') as typeof import('electron');
  try {
    return app.getPath('documents');
  } catch {
    return app.getPath('home');
  }
}

/** Envuelve un manejador para que nunca lance a través del IPC. */
function manejar<T>(canal: string, fn: (...args: never[]) => T | Promise<T>): void {
  ipcMain.handle(canal, async (_e, ...args): Promise<Respuesta<T>> => {
    try {
      return { ok: true, datos: await fn(...(args as never[])) };
    } catch (e) {
      return { ok: false, error: serializarError(e) };
    }
  });
}

export interface ContextoIpc {
  db: Database;
  ruta: string;
  carpeta: string;
  origen: InfoBaseDatos['origen'];
  esProduccion: boolean;
  existiaAntes: boolean;
  respaldo: { hecho: boolean; motivo: string; ruta?: string };
  ventana: () => Electron.BrowserWindow | null;
}

const TIPO_FAMILIA: Record<string, string> = {
  CONTEO: 'Conteo',
  VOLUMEN: 'Volumen',
  PESO: 'Peso',
  LARGO: 'Largo',
};

export function registrarIpc(ctx: ContextoIpc): void {
  const { db } = ctx;

  /* ----------------------------------------------------------- sistema */
  manejar(CANALES.sistemaInfoBd, (): InfoBaseDatos => {
    const sqlite = db.prepare('SELECT sqlite_version() v').get() as { v: string };
    return {
      ruta: ctx.ruta,
      carpeta: ctx.carpeta,
      origen: ctx.origen,
      esProduccion: ctx.esProduccion,
      existiaAntes: ctx.existiaAntes,
      bytes: tamanoBd(ctx.ruta),
      respaldo: ctx.respaldo,
      conteos: conteos(db),
      versionSqlite: sqlite.v,
      versionBetterSqlite3: (req('better-sqlite3/package.json') as { version: string }).version,
      versionElectron: process.versions.electron,
      // Se fija al compilar desde package.json: `app.getVersion()` devuelve la
      // versión de Electron cuando se corre sin empaquetar.
      versionApp: __VERSION_APP__,
    };
  });

  manejar(CANALES.sistemaAnimaciones, () => animacionesActivas(db));
  manejar(CANALES.sistemaSetAnimaciones, (v: boolean) => {
    setAnimaciones(db, v);
    auditar(db, 'ANIMACIONES', v ? 'encendidas' : 'apagadas');
    return v;
  });
  manejar(CANALES.sistemaEmpresa, (): DatosEmpresa => ({
    empresa: getConfig(db, 'empresa', '') ?? '',
    empresa_dir: getConfig(db, 'empresa_dir', '') ?? '',
    empresa_ruc: getConfig(db, 'empresa_ruc', '') ?? '',
  }));
  manejar(CANALES.sistemaGuardarEmpresa, (d: DatosEmpresa) => {
    setConfig(db, 'empresa', d.empresa.trim() || 'SFIDA');
    setConfig(db, 'empresa_dir', d.empresa_dir.trim());
    setConfig(db, 'empresa_ruc', d.empresa_ruc.trim());
    return true as const;
  });
  manejar(CANALES.sistemaAbrirCarpeta, async () => {
    await shell.openPath(ctx.carpeta);
    return true as const;
  });

  /* ------------------------------------------------------------- clave */
  manejar(CANALES.claveVerificar, (clave: string) => {
    const ok = verificarClave(db, clave);
    if (!ok) auditar(db, 'ACCESO DENEGADO', 'clave incorrecta');
    else auditar(db, 'CONTROL MAESTRO', 'acceso concedido');
    return ok;
  });
  manejar(CANALES.claveEsFabrica, () => claveEsLaDeFabrica(db));
  manejar(CANALES.claveCambiar, (actual: string, nueva: string) => {
    cambiarClave(db, actual, nueva);
    return true as const;
  });

  /* --------------------------------------------------------- catálogos */
  manejar(CANALES.catCategorias, () => listarCategorias(db));
  manejar(CANALES.catUnidades, () =>
    UNIDADES.map(([codigo, nombre, familia]) => ({
      codigo,
      nombre,
      familia: TIPO_FAMILIA[familia] ?? familia,
      equivalencia: equivalenciaUnidad(codigo) || 'es la unidad base',
    })),
  );
  manejar(CANALES.catCargarSugerido, () => cargarCatalogoSugerido(db));
  manejar(CANALES.catNormalizar, () => normalizarDatosExistentes(db));

  /* -------------------------------------------------------- artículos */
  manejar(CANALES.artListar, (filtro) => listarArticulos(db, filtro ?? {}));
  manejar(CANALES.artStock, (texto?: string, categoriaId?: number | null, soloBajo?: boolean) =>
    listarStock(db, texto ?? '', categoriaId ?? null, soloBajo ?? false),
  );
  manejar(CANALES.artObtener, (id: number) => {
    const a = obtenerArticulo(db, id);
    if (!a) return null;
    return { ...a, categoria: null, stock: stockDe(db, id) };
  });
  manejar(
    CANALES.artGuardar,
    (a: {
      codigo: string;
      nombre: string;
      categoriaId: number | null;
      unidad: string;
      stockMinimo: number;
      artId?: number | null;
      stockInicial?: number;
    }) => {
      const id = guardarArticulo(
        db,
        a.codigo,
        a.nombre,
        a.categoriaId,
        a.unidad,
        a.stockMinimo,
        1,
        a.artId ?? null,
      );
      if (!a.artId && (a.stockInicial ?? 0) > 0) {
        registrarAjuste(db, id, a.stockInicial!, 'Stock inicial');
      }
      auditar(db, 'ARTICULO', `${a.artId ? 'editado' : 'creado'}: ${a.nombre}`);
      return id;
    },
  );
  manejar(CANALES.artEliminar, (id: number) => eliminarArticulo(db, id));
  manejar(CANALES.artReactivar, (id: number) => {
    reactivarArticulo(db, id);
    return true as const;
  });
  manejar(CANALES.artCodigoSugerido, (prefijo: string) => codigoSugerido(db, prefijo));
  manejar(CANALES.artAjustar, (id: number, cantidadReal: number, motivo: string) => {
    // Se escribe la cantidad REAL contada, no la diferencia.
    const dif = cantidadReal - stockDe(db, id);
    if (Math.abs(dif) < 0.0001) return true as const;
    registrarAjuste(db, id, dif, motivo);
    return true as const;
  });
  manejar(CANALES.artUltimoPrecio, (id: number) => ultimoPrecio(db, id));

  manejar(CANALES.artImportar, async () => {
    const r = await dialog.showOpenDialog(ctx.ventana()!, {
      title: 'Elija el archivo de artículos',
      filters: [{ name: 'Excel / CSV', extensions: ['csv', 'txt'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return importarArticulosCsv(db, r.filePaths[0]);
  });

  manejar(CANALES.artPlantilla, async () => {
    const r = await dialog.showSaveDialog(ctx.ventana()!, {
      title: 'Guardar plantilla',
      defaultPath: join(carpetaDocumentos(), 'plantilla_articulos.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return null;
    return plantillaArticulosCsv(r.filePath);
  });

  /* -------------------------------------------------------- sucursales */
  manejar(CANALES.sucListar, (soloActivas?: boolean): SucursalConTotales[] => {
    const cons = new Map(consumoPorSucursal(db).map((c) => [c.codigo, c]));
    return listarSucursales(db, soloActivas ?? true).map((s) => {
      const c = cons.get(s.codigo);
      const ult = listarSalidas(db, null, null, s.id)[0];
      return {
        ...s,
        vales: c?.vales ?? 0,
        unidades: c?.unidades ?? 0,
        ultimo_reparto: ult?.fecha ?? null,
      };
    });
  });
  manejar(
    CANALES.sucGuardar,
    (s: { codigo: string; nombre: string; direccion: string; responsable: string; sucId?: number | null }) => {
      const id = guardarSucursal(db, s.codigo, s.nombre, s.direccion, s.responsable, 1, s.sucId ?? null);
      auditar(db, 'SUCURSAL', s.nombre);
      return id;
    },
  );
  manejar(CANALES.sucEliminar, (id: number) => eliminarSucursal(db, id));

  /* ---------------------------------------------------------- ingresos */
  manejar(CANALES.ingListar, (texto?: string) => listarIngresos(db, null, null, texto ?? ''));
  manejar(CANALES.ingDetalle, (id: number) => detalleIngreso(db, id));
  manejar(CANALES.ingCabecera, (id: number) => cabeceraIngreso(db, id) ?? null);
  manejar(CANALES.ingSiguienteNro, () => siguienteNroIngreso(db));
  manejar(CANALES.ingRegistrar, (i: DatosIngreso) => registrarIngreso(db, i));
  manejar(CANALES.ingAnular, (id: number) => {
    eliminarIngreso(db, id);
    return true as const;
  });
  manejar(CANALES.ingCorregirPrecio, (detId: number, precio: string) =>
    actualizarCostoLinea(db, detId, precio),
  );

  /* ----------------------------------------------------------- salidas */
  manejar(CANALES.salListar, (texto?: string, sucursalId?: number | null) =>
    listarSalidas(db, null, null, sucursalId ?? null, texto ?? ''),
  );
  manejar(CANALES.salDetalle, (id: number) => detalleSalida(db, id));
  manejar(CANALES.salCabecera, (id: number) => cabeceraSalida(db, id) ?? null);
  manejar(CANALES.salSiguienteVale, () => siguienteNroVale(db));
  manejar(CANALES.salExisteVale, (v: string) => existeVale(db, v));
  manejar(CANALES.salRegistrar, (s: DatosSalida) => registrarSalida(db, s));
  manejar(CANALES.salAnular, (id: number) => {
    eliminarSalida(db, id);
    return true as const;
  });

  /* ------------------------------------------------------------- panel */
  manejar(CANALES.panResumen, () => resumenPanel(db));
  manejar(CANALES.panAlertas, () => alertasStockMinimo(db));
  manejar(CANALES.panNiveles, () => nivelesStock(db));
  manejar(CANALES.panMensual, () => estadisticasMensuales(db, 6));
  manejar(CANALES.panMasMovidos, (limite?: number) => articulosMasMovidos(db, null, null, limite ?? 6));

  /* ---------------------------------------------------------- reportes */
  manejar(CANALES.repConsumo, (desde: string, hasta: string): ConsumoSucursal[] => {
    // El valor se calcula con el ÚLTIMO precio pagado de cada artículo.
    const precios = new Map(listarStock(db).map((a) => [a.codigo, Number(a.ultimo_precio ?? 0)]));
    const sucs = new Map(listarSucursales(db).map((s) => [s.codigo, s.id]));
    return consumoPorSucursal(db, desde, hasta).map((f) => {
      let valor = 0;
      const sid = sucs.get(f.codigo);
      if (sid) {
        for (const a of detalleConsumoSucursal(db, sid, desde, hasta)) {
          valor += Number(a.cantidad) * (precios.get(a.codigo) ?? 0);
        }
      }
      return { ...f, valor };
    });
  });
  manejar(CANALES.repDetalleSuc, (codigo: string, desde: string, hasta: string) => {
    const s = listarSucursales(db).find((x) => x.codigo === codigo);
    return s ? detalleConsumoSucursal(db, s.id, desde, hasta) : [];
  });
  manejar(CANALES.repKardex, (articuloId: number, desde: string, hasta: string) =>
    kardex(db, articuloId, desde, hasta),
  );
  manejar(CANALES.repMasUsados, (desde: string, hasta: string, limite: number) =>
    articulosMasMovidos(db, desde, hasta, limite),
  );
  manejar(CANALES.repHistPrecios, (articuloId: number, desde: string, hasta: string) =>
    historialPrecios(db, articuloId, desde, hasta),
  );
  manejar(CANALES.repResumenPrecios, (articuloId: number, desde: string, hasta: string) =>
    resumenPrecios(db, articuloId, desde, hasta),
  );
  manejar(CANALES.repExportar, async (nombre: string, cabeceras: string[], filas: unknown[][]) => {
    const r = await dialog.showSaveDialog(ctx.ventana()!, {
      title: 'Guardar reporte',
      defaultPath: join(carpetaDocumentos(), `${nombre}_${hoy()}.csv`),
      filters: [{ name: 'Excel / CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return null;
    return exportarCsv(r.filePath, cabeceras, filas);
  });

  /* ----------------------------------------------------------- maestro */
  manejar(CANALES.maeAuditoria, (texto?: string, limite?: number) =>
    listarAuditoria(db, limite ?? 400, texto ?? ''),
  );
  manejar(CANALES.maeLimpiarAud, () => {
    limpiarAuditoria(db, 200);
    return true as const;
  });
  manejar(CANALES.maeMinimos, (meses: number, factor: number): MinimoSugerido[] =>
    minimosSugeridos(db, meses, factor).map((m) => ({
      ...m,
      promedio: m.sugerido / Math.max(factor, 0.01),
    })),
  );
  manejar(CANALES.maeGuardarMinimos, (pares: Array<[number, number]>) => actualizarMinimos(db, pares));
  manejar(CANALES.maeInactivos, () =>
    listarArticulos(db, { soloActivos: false })
      .filter((a) => !a.activo)
      .map((a) => ({ ...a, categoria: categoriaCorta(a.categoria) })),
  );
  manejar(CANALES.maeRespaldar, async () => {
    const r = await dialog.showSaveDialog(ctx.ventana()!, {
      title: 'Guardar copia de seguridad',
      defaultPath: join(carpetaDocumentos(), `respaldo_sfida_${hoy()}.db`),
      filters: [{ name: 'Base de datos', extensions: ['db'] }],
    });
    if (r.canceled || !r.filePath) return null;
    respaldarBd(r.filePath, ctx.ruta);
    auditar(db, 'RESPALDO', basename(r.filePath));
    return r.filePath;
  });
  manejar(CANALES.maeRestaurar, async () => {
    const r = await dialog.showOpenDialog(ctx.ventana()!, {
      title: 'Elija la copia de seguridad',
      filters: [{ name: 'Base de datos', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const destino = restaurarBd(r.filePaths[0], ctx.ruta);
    return destino;
  });
  manejar(CANALES.maeBorrarMov, () => {
    borrarMovimientos(db);
    return true as const;
  });

  /* --------------------------------------------------------- impresión */
  manejar(CANALES.impImpresoras, async () => {
    const v = ctx.ventana();
    if (!v) return [];
    const lista = await v.webContents.getPrintersAsync();
    // TRAMPA: en Electron 43 el tipo `PrinterInfo` ya NO declara `isDefault`
    // ni `status`, pero el runtime SÍ los devuelve (comprobado en la fase 0).
    // Se leen de forma defensiva, cayendo en `options` por si algún día se
    // mueven ahí de verdad. Que el tipo no lo diga no significa que no esté;
    // que esté hoy no significa que esté mañana.
    const leer = (p: Electron.PrinterInfo) => {
      const crudo = p as unknown as Record<string, unknown>;
      const opciones = (crudo.options ?? {}) as Record<string, unknown>;
      const esPredet = crudo.isDefault ?? opciones['printer-is-default'] ?? false;
      const estado = crudo.status ?? opciones['printer-state'] ?? 0;
      return { esPredet: Boolean(esPredet), estado: Number(estado) || 0 };
    };
    const conFlags = lista.map((p) => ({ p, ...leer(p) }));
    const ordenadas = [...conFlags.filter((x) => x.esPredet), ...conFlags.filter((x) => !x.esPredet)];
    return ordenadas.map((x) => ({
      name: x.p.name,
      displayName: x.p.displayName || x.p.name,
      isDefault: x.esPredet,
      status: x.estado,
    }));
  });

  manejar(CANALES.impPreferencias, () => ({
    impresora: getConfig(db, 'impresora_vales', '') ?? '',
    papel: Number(getConfig(db, 'papel_vales', '80') ?? 80) as AnchoPapel,
    ajustarAlto: (getConfig(db, 'ajustar_alto_papel', '0') ?? '0') === '1',
    corrimientoMm: Number(getConfig(db, 'corrimiento_vale_mm', '0') ?? 0) || 0,
  }));

  function membrete(): { empresa: string; empresaDir: string; empresaRuc: string; impresoEl: string } {
    return {
      empresa: getConfig(db, 'empresa', 'SFIDA') ?? 'SFIDA',
      empresaDir: getConfig(db, 'empresa_dir', '') ?? '',
      empresaRuc: getConfig(db, 'empresa_ruc', '') ?? '',
      impresoEl: new Date()
        .toLocaleString('es-PE', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false,
        })
        .replace(',', ''),
    };
  }

  /** Junta todo lo que necesita el comprobante, sea salida o ingreso. */
  function comprobante(tipo: TipoComprobante, id: number): Comprobante {
    if (tipo === 'salida') {
      const cab = cabeceraSalida(db, id);
      if (!cab) throw new ErrorNegocio('El vale ya no existe.');
      return { tipo: 'salida', datos: { cab, det: detalleSalida(db, id), ...membrete() } };
    }
    const cab = cabeceraIngreso(db, id);
    if (!cab) throw new ErrorNegocio('El ingreso ya no existe.');
    const det = detalleIngreso(db, id);
    return {
      tipo: 'ingreso',
      datos: {
        nroDocumento: cab.nro_documento,
        nroProveedor: cab.nro_proveedor,
        tipoDoc: cab.tipo_doc,
        fecha: cab.fecha,
        proveedor: cab.proveedor ?? '',
        observacion: cab.observacion ?? '',
        det,
        total: det.reduce((s, d) => s + d.cantidad * d.costo_unitario, 0),
        ...membrete(),
      },
    };
  }

  manejar(
    CANALES.impVistaPrevia,
    (tipo: TipoComprobante, id: number, anchoMm: AnchoPapel, corrimientoMm?: number) =>
      previaVale(comprobante(tipo, id), anchoMm, Number(corrimientoMm) || 0),
  );

  manejar(CANALES.impImprimir, async (o: OpcionesImpresion) => {
    if (!o.deviceName) throw new ErrorNegocio('Elija una impresora.');
    const c = comprobante(o.tipo, o.id);
    const corrimiento = Number(o.corrimientoMm) || 0;
    const r = await imprimirVale(
      c,
      o.anchoMm,
      o.deviceName,
      o.copias ?? 2,
      o.ajustarAlto ?? false,
      'driver',
      corrimiento,
    );
    if (r.ok) {
      setConfig(db, 'impresora_vales', o.deviceName);
      setConfig(db, 'papel_vales', o.anchoMm);
      setConfig(db, 'ajustar_alto_papel', o.ajustarAlto ? '1' : '0');
      setConfig(db, 'corrimiento_vale_mm', corrimiento);
      const nro = c.tipo === 'salida' ? c.datos.cab.nro_vale : c.datos.nroDocumento;
      auditar(db, 'IMPRESION', `${nro} en ${o.deviceName} (${o.copias ?? 2} copias)`);
    }
    return r;
  });

  manejar(CANALES.impGuardarPdf, async (o: OpcionesImpresion) => {
    const c = comprobante(o.tipo, o.id);
    const nro = c.tipo === 'salida' ? c.datos.cab.nro_vale : c.datos.nroDocumento;
    const r = await dialog.showSaveDialog(ctx.ventana()!, {
      title: 'Guardar el comprobante en PDF',
      defaultPath: join(
        carpetaDocumentos(),
        `${c.tipo}_${String(nro).replace(/[\/]/g, '-')}.pdf`,
      ),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false, motivo: 'cancelado' };
    const res = await pdfVale(c, o.anchoMm, r.filePath);
    setConfig(db, 'papel_vales', o.anchoMm);
    return { ok: res.ok, motivo: res.motivo, ruta: r.filePath };
  });

  /* ------------------------------------------------------- dashboard (v5) */
  manejar(CANALES.repEvolucionValor, (desde: string, hasta: string, puntos?: number) =>
    evolucionValorAlmacen(db, desde, hasta, puntos ?? 12),
  );
  manejar(CANALES.repInversionSucursal, (desde: string, hasta: string) =>
    inversionPorSucursal(db, desde, hasta),
  );
  manejar(CANALES.repSugerenciaCompra, (meses: number, dias: number) =>
    sugerenciaCompra(db, meses, dias),
  );

  /* ------------------------------------------------ unidades compatibles */
  manejar(CANALES.artUnidadesDe, (unidadStock: string) =>
    unidadesCompatibles(unidadStock).map((u) => ({
      codigo: u.codigo,
      nombre: u.nombre,
      familia: TIPO_FAMILIA[u.familia] ?? u.familia,
      equivalencia: equivalenciaUnidad(u.codigo) || 'es la unidad base',
    })),
  );

  /* -------------------------------------------------- conteo fisico (v5) */
  manejar(
    CANALES.maeConteoFisico,
    (contados: Array<{ articuloId: number; contado: number }>, motivo: string) =>
      aplicarConteoFisico(db, contados, motivo),
  );

  // Se referencia para que el bundler no lo descarte del árbol.
  void CATALOGO_SUGERIDO;
}
