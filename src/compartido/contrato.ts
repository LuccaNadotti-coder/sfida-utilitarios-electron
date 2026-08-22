/* ---------------------------------------------------------------------------
 * Contrato entre el proceso principal y la pantalla.
 *
 * Es el ÚNICO lugar donde se declaran los canales IPC y sus tipos. Lo importan
 * los tres lados (main, preload y renderer), así que si cambia una firma el
 * compilador rompe en los tres a la vez, en vez de fallar en el almacén.
 *
 * Acá no puede entrar nada de Node ni de Electron: este archivo lo lee también
 * el renderer, que corre con contextIsolation y no tiene acceso a ninguno.
 * ------------------------------------------------------------------------- */

/* ------------------------------------------------------------------- datos */

export interface ArticuloListado {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string | null;
  categoria_id: number | null;
  unidad: string;
  stock: number;
  stock_minimo: number;
  activo: number;
}

export interface FiltroArticulos {
  texto?: string;
  soloActivos?: boolean;
  categoriaId?: number | null;
}

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

export interface Categoria {
  id: number;
  nombre: string;
}

export interface Sucursal {
  id: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  responsable: string | null;
  activo: number;
}

export interface SucursalConTotales extends Sucursal {
  vales: number;
  unidades: number;
  ultimo_reparto: string | null;
}

export interface IngresoListado {
  id: number;
  tipo_doc: string;
  nro_documento: string;
  fecha: string;
  proveedor: string | null;
  observacion: string | null;
  items: number;
  unidades: number;
  total: number;
}

export interface DetalleIngreso {
  id: number;
  articulo_id: number;
  cantidad: number;
  costo_unitario: number;
  codigo: string;
  nombre: string;
  unidad: string;
}

export interface SalidaListada {
  id: number;
  nro_vale: string;
  fecha: string;
  sucursal_id: number;
  entregado_por: string | null;
  recibido_por: string | null;
  observacion: string | null;
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
  articulo_id: number;
  cantidad: number;
  codigo: string;
  nombre: string;
  unidad: string;
}

export interface FilaAlerta {
  codigo: string;
  nombre: string;
  unidad: string;
  stock_minimo: number;
  stock: number;
}

export interface ResumenPanel {
  articulos: number;
  sucursales: number;
  ingresos: number;
  salidas: number;
  alertas: number;
  valorizado: number;
}

export interface Niveles {
  ok: number;
  por_agotarse: number;
  bajo_minimo: number;
}

export interface EstadisticaMes {
  mes: string;
  entradas: number;
  salidas: number;
}

export interface MovimientoKardex {
  fecha: string;
  tipo: string;
  documento: string;
  referencia: string;
  entrada: number;
  salida: number;
  saldo: number;
}

export interface ConsumoSucursal {
  codigo: string;
  sucursal: string;
  vales: number;
  unidades: number;
  valor: number;
}

export interface DetalleConsumo {
  codigo: string;
  nombre: string;
  unidad: string;
  cantidad: number;
}

export interface UltimoPrecio {
  precio: number;
  fecha: string;
  proveedor: string;
  documento: string;
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

export interface ResumenPrecios {
  minimo: number | null;
  maximo: number | null;
  promedio: number | null;
  compras: number;
}

export interface FilaAuditoria {
  id: number;
  momento: string;
  accion: string;
  detalle: string | null;
}

export interface MinimoSugerido {
  id: number;
  nombre: string;
  actual: number;
  sugerido: number;
  promedio: number;
}

export interface UnidadCatalogo {
  codigo: string;
  nombre: string;
  familia: string;
  equivalencia: string;
}

export interface DatosEmpresa {
  empresa: string;
  empresa_dir: string;
  empresa_ruc: string;
}

export interface InfoBaseDatos {
  ruta: string;
  carpeta: string;
  origen: 'variable de entorno' | 'copia de desarrollo' | 'perfil del usuario';
  esProduccion: boolean;
  existiaAntes: boolean;
  bytes: number;
  respaldo: { hecho: boolean; motivo: string; ruta?: string };
  conteos: Record<string, number>;
  versionSqlite: string;
  versionBetterSqlite3: string;
  versionElectron: string;
  versionApp: string;
}

export interface ResultadoImportacion {
  nuevos: number;
  actualizados: number;
  errores: string[];
}

/* ------------------------------------------------------------- impresión */

export type AnchoPapel = 80 | 58 | 210;

export interface OpcionesImpresion {
  salidaId: number;
  anchoMm: AnchoPapel;
  deviceName?: string;
  copias?: number;
}

export interface Impresora {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
}

export interface VistaPreviaVale {
  html: string;
  anchoMm: number;
  margenMm: number;
  utilMm: number;
  cols: number;
  tamLetraPt: number;
  altoHojaMm: number;
  lineaMasLarga: number | null;
}

export interface ResultadoImpresion {
  ok: boolean;
  motivo?: string;
  ruta?: string;
}

/* ---------------------------------------------------------------- errores */

/**
 * Error de negocio: el equivalente de `sc.ErrorNegocio`.
 *
 * Viaja por IPC como objeto plano porque una excepción de JavaScript no
 * sobrevive el cruce entre procesos. La pantalla lo tiene que poder distinguir
 * de un error de programación, igual que en la versión Qt, donde ErrorNegocio
 * se mostraba con `aviso(texto, "err")` y nunca como traceback.
 */
export interface ErrorNegocioSerializado {
  __errorNegocio: true;
  mensaje: string;
}

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: ErrorNegocioSerializado };

/* -------------------------------------------------------------- la API */

export interface ApiSfida {
  sistema: {
    infoBaseDatos(): Promise<Respuesta<InfoBaseDatos>>;
    animaciones(): Promise<Respuesta<boolean>>;
    setAnimaciones(v: boolean): Promise<Respuesta<boolean>>;
    empresa(): Promise<Respuesta<DatosEmpresa>>;
    guardarEmpresa(d: DatosEmpresa): Promise<Respuesta<true>>;
    abrirCarpetaDatos(): Promise<Respuesta<true>>;
  };
  clave: {
    verificar(clave: string): Promise<Respuesta<boolean>>;
    esDeFabrica(): Promise<Respuesta<boolean>>;
    cambiar(actual: string, nueva: string): Promise<Respuesta<true>>;
  };
  catalogos: {
    categorias(): Promise<Respuesta<Categoria[]>>;
    unidades(): Promise<Respuesta<UnidadCatalogo[]>>;
    cargarSugerido(): Promise<Respuesta<number>>;
    normalizarTextos(): Promise<Respuesta<number>>;
  };
  articulos: {
    listar(filtro?: FiltroArticulos): Promise<Respuesta<ArticuloListado[]>>;
    stock(texto?: string, categoriaId?: number | null, soloBajoMinimo?: boolean): Promise<Respuesta<FilaStock[]>>;
    obtener(id: number): Promise<Respuesta<ArticuloListado | null>>;
    guardar(a: {
      codigo: string;
      nombre: string;
      categoriaId: number | null;
      unidad: string;
      stockMinimo: number;
      artId?: number | null;
      stockInicial?: number;
    }): Promise<Respuesta<number>>;
    eliminar(id: number): Promise<Respuesta<'desactivado' | 'eliminado'>>;
    reactivar(id: number): Promise<Respuesta<true>>;
    codigoSugerido(prefijo: string): Promise<Respuesta<string>>;
    ajustar(id: number, cantidadReal: number, motivo: string): Promise<Respuesta<true>>;
    ultimoPrecio(id: number): Promise<Respuesta<UltimoPrecio | null>>;
    importarCsv(): Promise<Respuesta<ResultadoImportacion | null>>;
    plantillaCsv(): Promise<Respuesta<string | null>>;
  };
  sucursales: {
    listar(soloActivas?: boolean): Promise<Respuesta<SucursalConTotales[]>>;
    guardar(s: {
      codigo: string;
      nombre: string;
      direccion: string;
      responsable: string;
      sucId?: number | null;
    }): Promise<Respuesta<number>>;
    eliminar(id: number): Promise<Respuesta<'desactivada' | 'eliminada'>>;
  };
  ingresos: {
    listar(texto?: string): Promise<Respuesta<IngresoListado[]>>;
    detalle(id: number): Promise<Respuesta<DetalleIngreso[]>>;
    cabecera(id: number): Promise<Respuesta<IngresoListado | null>>;
    registrar(i: {
      tipoDoc: string;
      nroDocumento: string;
      fecha: string;
      proveedor: string;
      observacion: string;
      items: Array<[number, number, number]>;
    }): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<true>>;
    corregirPrecio(detId: number, precio: string): Promise<Respuesta<boolean>>;
  };
  salidas: {
    listar(texto?: string, sucursalId?: number | null): Promise<Respuesta<SalidaListada[]>>;
    detalle(id: number): Promise<Respuesta<DetalleSalida[]>>;
    cabecera(id: number): Promise<Respuesta<CabeceraSalida | null>>;
    siguienteVale(): Promise<Respuesta<string>>;
    existeVale(v: string): Promise<Respuesta<boolean>>;
    registrar(s: {
      nroVale: string;
      fecha: string;
      sucursalId: number | null;
      entregadoPor: string;
      recibidoPor: string;
      observacion: string;
      items: Array<[number, number]>;
    }): Promise<Respuesta<number>>;
    anular(id: number): Promise<Respuesta<true>>;
  };
  panel: {
    resumen(): Promise<Respuesta<ResumenPanel>>;
    alertas(): Promise<Respuesta<FilaAlerta[]>>;
    niveles(): Promise<Respuesta<Niveles>>;
    mensual(): Promise<Respuesta<EstadisticaMes[]>>;
    masMovidos(limite?: number): Promise<Respuesta<DetalleConsumo[]>>;
  };
  reportes: {
    consumoSucursal(desde: string, hasta: string): Promise<Respuesta<ConsumoSucursal[]>>;
    detalleSucursal(codigo: string, desde: string, hasta: string): Promise<Respuesta<DetalleConsumo[]>>;
    kardex(articuloId: number, desde: string, hasta: string): Promise<Respuesta<MovimientoKardex[]>>;
    masUsados(desde: string, hasta: string, limite: number): Promise<Respuesta<DetalleConsumo[]>>;
    historialPrecios(articuloId: number, desde: string, hasta: string): Promise<Respuesta<FilaHistorialPrecio[]>>;
    resumenPrecios(articuloId: number, desde: string, hasta: string): Promise<Respuesta<ResumenPrecios>>;
    exportar(nombre: string, cabeceras: string[], filas: unknown[][]): Promise<Respuesta<string | null>>;
  };
  maestro: {
    auditoria(texto?: string, limite?: number): Promise<Respuesta<FilaAuditoria[]>>;
    limpiarAuditoria(): Promise<Respuesta<true>>;
    minimosSugeridos(meses: number, factor: number): Promise<Respuesta<MinimoSugerido[]>>;
    guardarMinimos(pares: Array<[number, number]>): Promise<Respuesta<number>>;
    articulosInactivos(): Promise<Respuesta<ArticuloListado[]>>;
    respaldar(): Promise<Respuesta<string | null>>;
    restaurar(): Promise<Respuesta<string | null>>;
    borrarMovimientos(): Promise<Respuesta<true>>;
  };
  impresion: {
    impresoras(): Promise<Respuesta<Impresora[]>>;
    preferencias(): Promise<Respuesta<{ impresora: string; papel: AnchoPapel }>>;
    vistaPrevia(salidaId: number, anchoMm: AnchoPapel): Promise<Respuesta<VistaPreviaVale>>;
    imprimir(o: OpcionesImpresion): Promise<Respuesta<ResultadoImpresion>>;
    guardarPdf(o: OpcionesImpresion): Promise<Respuesta<ResultadoImpresion>>;
  };
}

/** Nombres de canal. Se usan en main y preload; nunca se escriben a mano. */
export const CANALES = {
  sistemaInfoBd: 'sistema:info-bd',
  sistemaAnimaciones: 'sistema:animaciones',
  sistemaSetAnimaciones: 'sistema:set-animaciones',
  sistemaEmpresa: 'sistema:empresa',
  sistemaGuardarEmpresa: 'sistema:guardar-empresa',
  sistemaAbrirCarpeta: 'sistema:abrir-carpeta',

  claveVerificar: 'clave:verificar',
  claveEsFabrica: 'clave:es-fabrica',
  claveCambiar: 'clave:cambiar',

  catCategorias: 'cat:categorias',
  catUnidades: 'cat:unidades',
  catCargarSugerido: 'cat:cargar-sugerido',
  catNormalizar: 'cat:normalizar',

  artListar: 'art:listar',
  artStock: 'art:stock',
  artObtener: 'art:obtener',
  artGuardar: 'art:guardar',
  artEliminar: 'art:eliminar',
  artReactivar: 'art:reactivar',
  artCodigoSugerido: 'art:codigo-sugerido',
  artAjustar: 'art:ajustar',
  artUltimoPrecio: 'art:ultimo-precio',
  artImportar: 'art:importar',
  artPlantilla: 'art:plantilla',

  sucListar: 'suc:listar',
  sucGuardar: 'suc:guardar',
  sucEliminar: 'suc:eliminar',

  ingListar: 'ing:listar',
  ingDetalle: 'ing:detalle',
  ingCabecera: 'ing:cabecera',
  ingRegistrar: 'ing:registrar',
  ingAnular: 'ing:anular',
  ingCorregirPrecio: 'ing:corregir-precio',

  salListar: 'sal:listar',
  salDetalle: 'sal:detalle',
  salCabecera: 'sal:cabecera',
  salSiguienteVale: 'sal:siguiente-vale',
  salExisteVale: 'sal:existe-vale',
  salRegistrar: 'sal:registrar',
  salAnular: 'sal:anular',

  panResumen: 'pan:resumen',
  panAlertas: 'pan:alertas',
  panNiveles: 'pan:niveles',
  panMensual: 'pan:mensual',
  panMasMovidos: 'pan:mas-movidos',

  repConsumo: 'rep:consumo',
  repDetalleSuc: 'rep:detalle-suc',
  repKardex: 'rep:kardex',
  repMasUsados: 'rep:mas-usados',
  repHistPrecios: 'rep:hist-precios',
  repResumenPrecios: 'rep:resumen-precios',
  repExportar: 'rep:exportar',

  maeAuditoria: 'mae:auditoria',
  maeLimpiarAud: 'mae:limpiar-aud',
  maeMinimos: 'mae:minimos',
  maeGuardarMinimos: 'mae:guardar-minimos',
  maeInactivos: 'mae:inactivos',
  maeRespaldar: 'mae:respaldar',
  maeRestaurar: 'mae:restaurar',
  maeBorrarMov: 'mae:borrar-mov',

  impImpresoras: 'imp:impresoras',
  impPreferencias: 'imp:preferencias',
  impVistaPrevia: 'imp:vista-previa',
  impImprimir: 'imp:imprimir',
  impGuardarPdf: 'imp:guardar-pdf',
} as const;
