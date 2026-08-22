/* ---------------------------------------------------------------------------
 * Salidas a sucursal. Port de `SalidaPage` de `sfida_paginas.py`.
 *
 * Reglas propias de esta pantalla:
 *  - El número de vale es EDITABLE. Se propone un correlativo, pero se puede
 *    escribir el de una boleta física; avisa si ese número ya existe.
 *  - Nunca se puede sacar más de lo que hay. Se valida DOS veces: al agregar
 *    la línea y otra vez al guardar (esa segunda la hace el núcleo).
 *  - La casilla «Imprimir el vale al guardar» viene MARCADA de fábrica.
 *  - La observación ahora sí se guarda (CAMBIOS_DELIBERADOS.md punto 2).
 * ------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react';

import type { ArticuloListado, SalidaListada, SucursalConTotales } from '../../../compartido/contrato';
import type { DestinoExtra } from '../App';
import { DlgClave } from '../dialogos/Clave';
import { DlgDetalleSalida } from '../dialogos/DetalleSalida';
import { DlgImprimir } from '../dialogos/Imprimir';
import { useApp } from '../estado/app';
import {
  Boton,
  Buscador,
  Caja,
  Campo,
  ComboArticulo,
  Etiqueta,
  Selector,
  SpinNumero,
  Tabla,
  dmy,
  fmtNum,
  hoyIso,
  useDebounce,
  usarConfirmacion,
} from '../ui/base';

interface Linea {
  articuloId: number;
  cantidad: number;
}

export function PaginaSalidas({ extra }: { extra: DestinoExtra | null }): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const { pedir: confirmar, nodo: nodoConfirmacion } = usarConfirmacion();

  const [vale, setVale] = useState('');
  const [valeManual, setValeManual] = useState(false);
  const [valeExiste, setValeExiste] = useState(false);
  const [fecha, setFecha] = useState(hoyIso());
  const [sucursalId, setSucursalId] = useState<number | 0>(0);
  const [entrega, setEntrega] = useState('');
  const [recibe, setRecibe] = useState('');
  const [observacion, setObservacion] = useState('');

  const [sucursales, setSucursales] = useState<SucursalConTotales[]>([]);
  const [articulos, setArticulos] = useState<ArticuloListado[]>([]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(0);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [imprimirAlGuardar, setImprimirAlGuardar] = useState(true);

  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [filtroSuc, setFiltroSuc] = useState<number | 0>(0);
  const [historial, setHistorial] = useState<SalidaListada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<number | null>(extra?.id ?? null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [imprimiendo, setImprimiendo] = useState<number | null>(null);
  const [pidiendoClave, setPidiendoClave] = useState(false);

  const proponerVale = useCallback(async () => {
    const v = await pedir(window.sfida.salidas.siguienteVale());
    if (v) {
      setVale(v);
      setValeManual(false);
    }
  }, [pedir]);

  useEffect(() => {
    void (async () => {
      const [s, a] = await Promise.all([
        pedir(window.sfida.sucursales.listar()),
        pedir(window.sfida.articulos.listar({})),
      ]);
      setSucursales(s ?? []);
      setArticulos(a ?? []);
      if (s && s.length && !sucursalId) setSucursalId(s[0]!.id);
    })();
  }, [pedir, refrescos, sucursalId]);

  useEffect(() => {
    if (!vale) void proponerVale();
  }, [vale, proponerVale]);

  // Avisa al toque si ese número de vale ya está usado.
  useEffect(() => {
    if (!vale.trim()) {
      setValeExiste(false);
      return;
    }
    void pedir(window.sfida.salidas.existeVale(vale)).then((e) => setValeExiste(Boolean(e)));
  }, [vale, pedir, refrescos]);

  useEffect(() => {
    let vivo = true;
    void pedir(window.sfida.salidas.listar(busqueda, filtroSuc || null)).then((h) => {
      if (!vivo) return;
      setHistorial(h ?? []);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [pedir, busqueda, filtroSuc, refrescos]);

  const articuloDe = (id: number): ArticuloListado | undefined => articulos.find((a) => a.id === id);

  /** Stock disponible descontando lo ya cargado en el vale en curso. */
  const disponible = (id: number): number => {
    const a = articuloDe(id);
    const ya = lineas.filter((l) => l.articuloId === id).reduce((s, l) => s + l.cantidad, 0);
    return (a?.stock ?? 0) - ya;
  };

  function agregar(): void {
    if (!elegido) return avisar('Elija un artículo de la lista.', 'err');
    if (cantidad <= 0) return avisar('La cantidad debe ser mayor a cero.', 'err');
    const disp = disponible(elegido);
    const a = articuloDe(elegido);
    if (cantidad > disp + 0.0001) {
      return avisar(`Stock insuficiente: solo quedan ${fmtNum(disp)} ${a?.unidad ?? ''} de ${a?.nombre}.`, 'err');
    }
    setLineas((prev) => [...prev, { articuloId: elegido, cantidad }]);
    setElegido(null);
    setCantidad(0);
  }

  function limpiar(): void {
    setLineas([]);
    setRecibe('');
    setObservacion('');
    setFecha(hoyIso());
    void proponerVale();
  }

  async function guardar(): Promise<void> {
    const id = await pedir(
      window.sfida.salidas.registrar({
        nroVale: vale,
        fecha,
        sucursalId: sucursalId || null,
        entregadoPor: entrega,
        recibidoPor: recibe,
        observacion,
        items: lineas.map((l) => [l.articuloId, l.cantidad] as [number, number]),
      }),
    );
    if (id === null) return;
    const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
    const nombreSuc = sucursales.find((s) => s.id === sucursalId)?.nombre ?? '';
    const deseaImprimir = imprimirAlGuardar;
    limpiar();
    avisar(`Vale guardado: ${fmtNum(unidades)} unidades entregadas a ${nombreSuc}.`, 'ok');
    refrescarTodo();
    if (deseaImprimir) setImprimiendo(id);
  }

  const dispElegido = elegido ? disponible(elegido) : null;
  const artElegido = elegido ? articuloDe(elegido) : null;
  const colorDisp =
    dispElegido === null
      ? 'text-suave'
      : dispElegido <= 0
        ? 'text-coral'
        : dispElegido <= (artElegido?.stock_minimo ?? 0)
          ? 'text-ambar-osc'
          : 'text-verde';

  return (
    <div className="flex flex-col gap-4 p-5">
      <Caja titulo="Vale de salida">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div>
            <Etiqueta>N° de vale (editable)</Etiqueta>
            <Campo
              valor={vale}
              alCambiar={(v) => {
                setVale(v);
                setValeManual(true);
              }}
              mayusculas
            />
          </div>
          <div>
            <Etiqueta>Fecha</Etiqueta>
            <Campo valor={fecha} alCambiar={setFecha} tipo="date" />
          </div>
          <div>
            <Etiqueta>Sucursal destino</Etiqueta>
            <Selector
              valor={sucursalId}
              alCambiar={setSucursalId}
              opciones={
                sucursales.length
                  ? sucursales.map((s) => ({ id: s.id, texto: `${s.codigo} - ${s.nombre}` }))
                  : [{ id: 0, texto: 'No hay sucursales cargadas' }]
              }
            />
          </div>
          <div>
            <Etiqueta>Entregado por</Etiqueta>
            <Campo valor={entrega} alCambiar={setEntrega} mayusculas placeholder="QUIÉN ENTREGA" />
          </div>
          <div>
            <Etiqueta>Recibido por</Etiqueta>
            <Campo valor={recibe} alCambiar={setRecibe} mayusculas placeholder="QUIÉN RECIBE" />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className={`text-[12px] ${!vale.trim() || valeExiste ? 'text-coral' : 'text-suave'}`}>
            {!vale.trim()
              ? 'Escriba el número del vale.'
              : valeExiste
                ? `Ojo: el vale ${vale} ya fue registrado antes.`
                : valeManual
                  ? 'Número escrito a mano (el de su boleta física).'
                  : 'Correlativo del sistema. Puede cambiarlo si su boleta física tiene otro número.'}
          </p>
          <Boton tono="claro" onClick={proponerVale}>Usar el correlativo del sistema</Boton>
          <div className="min-w-[240px] flex-1">
            {/* La observación ahora SÍ se guarda y sale impresa en el vale. */}
            <Campo valor={observacion} alCambiar={setObservacion} placeholder="Observación (opcional, sale impresa en el vale)" />
          </div>
        </div>
      </Caja>

      <Caja titulo="Artículos que se reparten">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <ComboArticulo articulos={articulos} valor={elegido} alElegir={setElegido} />
          </div>
          <div className="min-w-[200px] rounded-lg bg-separador px-3 py-2.5 text-center">
            <span className={`text-[13px] font-bold ${colorDisp}`}>
              {dispElegido === null
                ? '—'
                : `Disponible: ${fmtNum(dispElegido)} ${artElegido?.unidad ?? ''}`}
            </span>
          </div>
          <div className="w-[150px]">
            <Etiqueta>Cantidad</Etiqueta>
            <SpinNumero valor={cantidad} alCambiar={setCantidad} />
          </div>
          <Boton tono="verde" onClick={agregar}>Agregar</Boton>
        </div>

        <div className="mt-3">
          <Tabla
            columnas={[
              { clave: 'art', titulo: 'Artículo', render: (l: Linea) => { const a = articuloDe(l.articuloId); return a ? `${a.codigo} | ${a.nombre}` : '?'; } },
              { clave: 'cant', titulo: 'Cantidad', ancho: '110px', derecha: true, render: (l) => fmtNum(l.cantidad) },
              { clave: 'uni', titulo: 'Unidad', ancho: '110px', render: (l) => articuloDe(l.articuloId)?.unidad ?? '' },
              { clave: 'queda', titulo: 'Queda en almacén', ancho: '150px', derecha: true, render: (l) => fmtNum(disponible(l.articuloId)) },
              {
                clave: 'quitar', titulo: '', ancho: '80px',
                render: (l) => (
                  <button
                    onClick={() => setLineas((prev) => prev.filter((x) => x !== l))}
                    className="cursor-pointer text-[12px] font-semibold text-coral hover:underline"
                  >
                    Quitar
                  </button>
                ),
              },
            ]}
            filas={lineas}
            clave={(l) => `${l.articuloId}-${lineas.indexOf(l)}`}
            vacio={{ titulo: 'Todavía no agregaste ningún artículo', detalle: 'Elegí uno arriba, poné la cantidad y tocá «Agregar».' }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex-1" />
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" checked={imprimirAlGuardar} onChange={(e) => setImprimirAlGuardar(e.target.checked)} />
            Imprimir el vale al guardar
          </label>
          <Boton tono="gris" onClick={limpiar}>Limpiar</Boton>
          <Boton tono="verde" onClick={guardar} disabled={lineas.length === 0}>Guardar salida</Boton>
        </div>
      </Caja>

      <Caja
        titulo="Historial de repartos"
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar por vale o quién recibió…" className="w-[240px]" />
            <Selector
              valor={filtroSuc}
              alCambiar={setFiltroSuc}
              opciones={[{ id: 0, texto: 'Todas las sucursales' }, ...sucursales.map((s) => ({ id: s.id, texto: `${s.codigo} - ${s.nombre}` }))]}
              className="w-[210px]"
            />
            <Boton tono="claro" onClick={() => (sel ? setViendo(sel) : avisar('Seleccione un vale del historial.', 'info'))}>Ver detalle</Boton>
            <Boton tono="azul" onClick={() => (sel ? setImprimiendo(sel) : avisar('Seleccione el vale que desea imprimir.', 'info'))}>Imprimir vale</Boton>
            <Boton tono="rojo" onClick={() => (sel ? setPidiendoClave(true) : avisar('Seleccione el vale que desea anular.', 'info'))}>Anular salida</Boton>
          </div>
        }
      >
        <Tabla
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: '110px', render: (s: SalidaListada) => dmy(s.fecha) },
            { clave: 'vale', titulo: 'Vale', ancho: '135px', render: (s) => <span className="font-medium">{s.nro_vale}</span> },
            { clave: 'suc', titulo: 'Sucursal', render: (s) => `${s.suc_codigo} - ${s.sucursal}` },
            { clave: 'rec', titulo: 'Recibió', ancho: '175px', render: (s) => s.recibido_por || '-' },
            { clave: 'items', titulo: 'Ítems', ancho: '85px', derecha: true, render: (s) => s.items },
            { clave: 'und', titulo: 'Unidades', ancho: '105px', derecha: true, render: (s) => fmtNum(s.unidades) },
          ]}
          filas={historial}
          clave={(s) => s.id}
          cargando={cargando}
          seleccionada={sel}
          alSeleccionar={(s) => setSel(s.id)}
          alDobleClic={(s) => setViendo(s.id)}
          vacio={{ titulo: 'Todavía no hay vales registrados', detalle: 'Armá el primero con el formulario de arriba.' }}
          sinResultados={texto || filtroSuc ? { titulo: 'Ningún vale coincide', detalle: 'Probá con otro número, otra persona u otra sucursal.' } : undefined}
          alto="max-h-[320px]"
        />
      </Caja>

      <DlgDetalleSalida abierto={viendo !== null} salidaId={viendo} alCerrar={() => setViendo(null)} />
      <DlgImprimir abierto={imprimiendo !== null} salidaId={imprimiendo} alCerrar={() => setImprimiendo(null)} />
      <DlgClave
        abierto={pidiendoClave}
        motivo="anular un vale de salida"
        alCerrar={async (autorizado) => {
          setPidiendoClave(false);
          if (!autorizado || !sel) return;
          const seguro = await confirmar({
            titulo: 'Anular vale',
            texto: '¿Anular este vale?\nLos artículos volverán al stock.',
          });
          if (!seguro) return;
          const r = await pedir(window.sfida.salidas.anular(sel));
          if (r === null) return;
          avisar('Vale anulado y stock devuelto.', 'ok');
          setSel(null);
          refrescarTodo();
        }}
      />
      {nodoConfirmacion}
    </div>
  );
}
