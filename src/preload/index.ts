/* ---------------------------------------------------------------------------
 * Preload: el único puente entre la pantalla y el proceso principal.
 *
 * Con contextIsolation: true la pantalla NO ve `require`, ni `ipcRenderer`, ni
 * Node. Solo ve `window.sfida`, que es exactamente lo declarado en
 * `src/compartido/contrato.ts`.
 *
 * Nada de exponer `ipcRenderer` entero: sería darle al renderer la llave de
 * todos los canales, incluidos los que todavía no existen.
 * ------------------------------------------------------------------------- */
import { contextBridge, ipcRenderer } from 'electron';

import { CANALES, type ApiSfida } from '../compartido/contrato';

/** Atajo tipado: cada método del contrato es un `invoke` a su canal. */
const i = (canal: string) => (...args: unknown[]) => ipcRenderer.invoke(canal, ...args);

const api: ApiSfida = {
  sistema: {
    infoBaseDatos: i(CANALES.sistemaInfoBd),
    animaciones: i(CANALES.sistemaAnimaciones),
    setAnimaciones: i(CANALES.sistemaSetAnimaciones),
    empresa: i(CANALES.sistemaEmpresa),
    guardarEmpresa: i(CANALES.sistemaGuardarEmpresa),
    abrirCarpetaDatos: i(CANALES.sistemaAbrirCarpeta),
  },
  clave: {
    verificar: i(CANALES.claveVerificar),
    esDeFabrica: i(CANALES.claveEsFabrica),
    cambiar: i(CANALES.claveCambiar),
  },
  catalogos: {
    categorias: i(CANALES.catCategorias),
    unidades: i(CANALES.catUnidades),
    cargarSugerido: i(CANALES.catCargarSugerido),
    normalizarTextos: i(CANALES.catNormalizar),
  },
  articulos: {
    listar: i(CANALES.artListar),
    stock: i(CANALES.artStock),
    obtener: i(CANALES.artObtener),
    guardar: i(CANALES.artGuardar),
    eliminar: i(CANALES.artEliminar),
    reactivar: i(CANALES.artReactivar),
    codigoSugerido: i(CANALES.artCodigoSugerido),
    ajustar: i(CANALES.artAjustar),
    unidadesDe: i(CANALES.artUnidadesDe),
    ultimoPrecio: i(CANALES.artUltimoPrecio),
    importarCsv: i(CANALES.artImportar),
    plantillaCsv: i(CANALES.artPlantilla),
  },
  sucursales: {
    listar: i(CANALES.sucListar),
    guardar: i(CANALES.sucGuardar),
    eliminar: i(CANALES.sucEliminar),
  },
  ingresos: {
    listar: i(CANALES.ingListar),
    detalle: i(CANALES.ingDetalle),
    cabecera: i(CANALES.ingCabecera),
    siguienteNro: i(CANALES.ingSiguienteNro),
    registrar: i(CANALES.ingRegistrar),
    anular: i(CANALES.ingAnular),
    corregirPrecio: i(CANALES.ingCorregirPrecio),
  },
  salidas: {
    listar: i(CANALES.salListar),
    detalle: i(CANALES.salDetalle),
    cabecera: i(CANALES.salCabecera),
    siguienteVale: i(CANALES.salSiguienteVale),
    existeVale: i(CANALES.salExisteVale),
    registrar: i(CANALES.salRegistrar),
    anular: i(CANALES.salAnular),
  },
  panel: {
    resumen: i(CANALES.panResumen),
    alertas: i(CANALES.panAlertas),
    niveles: i(CANALES.panNiveles),
    mensual: i(CANALES.panMensual),
    masMovidos: i(CANALES.panMasMovidos),
  },
  reportes: {
    consumoSucursal: i(CANALES.repConsumo),
    detalleSucursal: i(CANALES.repDetalleSuc),
    kardex: i(CANALES.repKardex),
    masUsados: i(CANALES.repMasUsados),
    historialPrecios: i(CANALES.repHistPrecios),
    resumenPrecios: i(CANALES.repResumenPrecios),
    exportar: i(CANALES.repExportar),
    evolucionValor: i(CANALES.repEvolucionValor),
    inversionSucursal: i(CANALES.repInversionSucursal),
    sugerenciaCompra: i(CANALES.repSugerenciaCompra),
  },
  maestro: {
    auditoria: i(CANALES.maeAuditoria),
    limpiarAuditoria: i(CANALES.maeLimpiarAud),
    minimosSugeridos: i(CANALES.maeMinimos),
    guardarMinimos: i(CANALES.maeGuardarMinimos),
    articulosInactivos: i(CANALES.maeInactivos),
    respaldar: i(CANALES.maeRespaldar),
    restaurar: i(CANALES.maeRestaurar),
    borrarMovimientos: i(CANALES.maeBorrarMov),
    conteoFisico: i(CANALES.maeConteoFisico),
  },
  impresion: {
    impresoras: i(CANALES.impImpresoras),
    preferencias: i(CANALES.impPreferencias),
    vistaPrevia: i(CANALES.impVistaPrevia),
    imprimir: i(CANALES.impImprimir),
    guardarPdf: i(CANALES.impGuardarPdf),
  },
} as ApiSfida;

contextBridge.exposeInMainWorld('sfida', api);
