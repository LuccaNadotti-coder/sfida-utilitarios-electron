/* ---------------------------------------------------------------------------
 * Egresos a sucursal (en el codigo siguen llamandose salidas).
 *
 * CAMBIOS DE LA v5:
 *   - El N° de vale lo genera el sistema y YA NO es editable.
 *   - «Quién entrega» y «quién recibe» salieron de la pantalla: en el ticket
 *     van como renglones en blanco para llenar a mano sobre la firma.
 *   - Se puede elegir la unidad de cada línea (reparto 500 ML de algo cuyo
 *     stock se lleva en litros).
 *
 * Reglas que NO cambian:
 *   - Nunca se puede sacar más de lo que hay. Se valida DOS veces: al agregar
 *     la línea y otra vez al guardar (esa segunda la hace el núcleo).
 *   - La casilla «Imprimir el vale al guardar» viene MARCADA de fábrica.
 * ------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react';

import type { ArticuloListado, SalidaListada, SucursalConTotales } from '../../../compartido/contrato';
import { convertirAStock, juntarEnVale } from '../../../compartido/conversion';
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
  POR_PAGINA,
  Selector,
  SelectorUnidad,
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
  unidad: string;
}

export function PaginaSalidas({ extra }: { extra: DestinoExtra | null }): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const { pedir: confirmar, nodo: nodoConfirmacion } = usarConfirmacion();

  const [vale, setVale] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [sucursalId, setSucursalId] = useState<number | 0>(0);
  const [observacion, setObservacion] = useState('');

  const [sucursales, setSucursales] = useState<SucursalConTotales[]>([]);
  const [articulos, setArticulos] = useState<ArticuloListado[]>([]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(0);
  const [unidad, setUnidad] = useState('');
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
    if (v) setVale(v);
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

  useEffect(() => {
    setUnidad(elegido ? (articuloDe(elegido)?.unidad ?? '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido, articulos]);

  /**
   * Stock disponible, en la unidad de STOCK, descontando lo ya cargado en el
   * vale en curso (que puede estar en otra unidad).
   */
  const disponible = (id: number): number => {
    const a = articuloDe(id);
    if (!a) return 0;
    const ya = lineas
      .filter((l) => l.articuloId === id)
      .reduce((s, l) => s + convertirAStock(l.cantidad, l.unidad, a.unidad), 0);
    return a.stock - ya;
  };

  function agregar(): void {
    if (!elegido) return avisar('Elija un artículo de la lista.', 'err');
    if (cantidad <= 0) return avisar('La cantidad debe ser mayor a cero.', 'err');
    const a = articuloDe(elegido)!;
    const u = unidad || a.unidad;
    // El disponible se compara en la unidad de STOCK: si se piden 500 ML de
    // algo que se lleva en litros, hay que convertir antes de comparar.
    const enStock = convertirAStock(cantidad, u, a.unidad);
    const disp = disponible(elegido);
    if (enStock > disp + 0.0001) {
      return avisar(
        `Stock insuficiente: solo quedan ${fmtNum(disp)} ${a.unidad} de ${a.nombre}.`,
        'err',
      );
    }
    // Un artículo no puede aparecer dos veces en el mismo vale: se suma a la
    // fila que ya está.
    //
    // No es cosmético. El núcleo YA suma las filas repetidas antes de guardar,
    // así que dos renglones de BORRADOR terminaban siendo uno solo en la base
    // y en el ticket: la pantalla mostraba una cosa y se guardaba otra. Y peor,
    // el control de «cuánto queda» se leía mal, porque el descuento estaba
    // repartido en dos renglones.
    //
    // En INGRESOS sí se puede repetir, y es a propósito: la misma boleta puede
    // traer el mismo artículo a dos precios distintos.
    const yaEsta = lineas.findIndex((l) => l.articuloId === elegido);
    if (yaEsta >= 0) {
      const previa = lineas[yaEsta]!;
      const mismaUnidad = previa.unidad === u;
      const nueva = juntarEnVale(previa, { cantidad, unidad: u }, a.unidad);
      setLineas((prev) => prev.map((l, i) => (i === yaEsta ? nueva : l)));
      avisar(
        mismaUnidad
          ? `${a.nombre} ya estaba en el vale: se sumó a esa fila (${fmtNum(nueva.cantidad)} ${nueva.unidad}).`
          : `${a.nombre} ya estaba en el vale en otra unidad: se juntó todo en ${fmtNum(nueva.cantidad)} ${a.unidad}.`,
        'info',
      );
      setElegido(null);
      setCantidad(0);
      return;
    }

    setLineas((prev) => [...prev, { articuloId: elegido, cantidad, unidad: u }]);
    setElegido(null);
    setCantidad(0);
  }

  function limpiar(): void {
    setLineas([]);
    setObservacion('');
    setFecha(hoyIso());
    void proponerVale();
  }

  async function guardar(): Promise<void> {
    const id = await pedir(
      window.sfida.salidas.registrar({
        fecha,
        sucursalId: sucursalId || null,
        observacion,
        items: lineas.map((l) => ({
          articuloId: l.articuloId,
          cantidad: l.cantidad,
          unidad: l.unidad,
        })),
      }),
    );
    if (id === null) return;
    const nombreSuc = sucursales.find((s) => s.id === sucursalId)?.nombre ?? '';
    const deseaImprimir = imprimirAlGuardar;
    limpiar();
    avisar(`Vale ${vale} guardado y entregado a ${nombreSuc}.`, 'ok');
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
      <Caja titulo="Vale de egreso">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <Etiqueta>N° de vale</Etiqueta>
            {/* v5: lo genera el sistema, ya no se escribe a mano. */}
            <div className="rounded-lg border border-[#d9dfe8] bg-[#f2f5f9] px-3 py-2.5 text-[14px] font-semibold text-texto">
              {vale || '…'}
            </div>
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
            <Etiqueta>Observación</Etiqueta>
            <Campo valor={observacion} alCambiar={setObservacion} placeholder="Opcional, sale impresa" />
          </div>
        </div>
        <p className="mt-2 text-[12px] text-suave">
          Quién entrega y quién recibe se escriben a mano sobre las firmas del ticket impreso.
        </p>
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
          <div className="w-[140px]">
            <Etiqueta>Cantidad</Etiqueta>
            <SpinNumero valor={cantidad} alCambiar={setCantidad} decimales={2} />
          </div>
          <div className="w-[170px]">
            <Etiqueta>Unidad</Etiqueta>
            <SelectorUnidad
              unidadStock={artElegido?.unidad ?? null}
              valor={unidad}
              alCambiar={setUnidad}
            />
          </div>
          <Boton tono="verde" onClick={agregar}>Agregar</Boton>
        </div>

        <div className="mt-3">
          <Tabla
            columnas={[
              { clave: 'art', titulo: 'Artículo', render: (l: Linea) => { const a = articuloDe(l.articuloId); return a ? `${a.codigo} | ${a.nombre}` : '?'; } },
              { clave: 'cant', titulo: 'Cantidad', ancho: '110px', derecha: true, render: (l) => fmtNum(l.cantidad) },
              { clave: 'uni', titulo: 'Unidad', ancho: '100px', render: (l) => l.unidad },
              {
                clave: 'conv', titulo: 'Sale del stock', ancho: '130px', derecha: true,
                render: (l) => {
                  const a = articuloDe(l.articuloId);
                  if (!a || l.unidad === a.unidad) return <span className="text-suave">—</span>;
                  return (
                    <span className="text-suave">
                      {fmtNum(convertirAStock(l.cantidad, l.unidad, a.unidad))} {a.unidad}
                    </span>
                  );
                },
              },
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
            // El artículo alcanza como clave: en un vale no se repite.
            clave={(l) => l.articuloId}
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
          <Boton tono="verde" onClick={guardar} disabled={lineas.length === 0}>Guardar egreso</Boton>
        </div>
      </Caja>

      <Caja
        titulo="Historial de repartos"
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            {/* El buscador mira el N° de vale y el nombre de la sucursal, que
                es lo que hace `listarSalidas()`. Antes decía «o quién recibió»
                y eso nunca fue cierto: buscar un nombre no devolvía nada. */}
            <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar por N° de vale o sucursal…" className="w-[240px]" />
            <Selector
              valor={filtroSuc}
              alCambiar={setFiltroSuc}
              opciones={[{ id: 0, texto: 'Todas las sucursales' }, ...sucursales.map((s) => ({ id: s.id, texto: `${s.codigo} - ${s.nombre}` }))]}
              className="w-[210px]"
            />
            <Boton tono="claro" onClick={() => (sel ? setViendo(sel) : avisar('Seleccione un vale del historial.', 'info'))}>Ver detalle</Boton>
            <Boton tono="azul" onClick={() => (sel ? setImprimiendo(sel) : avisar('Seleccione el vale que desea imprimir.', 'info'))}>Imprimir vale</Boton>
            <Boton tono="rojo" onClick={() => (sel ? setPidiendoClave(true) : avisar('Seleccione el vale que desea anular.', 'info'))}>Anular egreso</Boton>
          </div>
        }
      >
        <Tabla
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: '110px', render: (s: SalidaListada) => dmy(s.fecha) },
            { clave: 'vale', titulo: 'Vale', ancho: '135px', render: (s) => <span className="font-medium">{s.nro_vale}</span> },
            { clave: 'suc', titulo: 'Sucursal', render: (s) => `${s.suc_codigo} - ${s.sucursal}` },
            // Los vales de la v5 ya no guardan quién recibió: ese nombre se
            // escribe a mano sobre la firma del papel. La columna se conserva
            // porque los vales VIEJOS sí lo tienen y sería raro esconderlo;
            // para los nuevos muestra «—», que es la verdad.
            { clave: 'rec', titulo: 'Recibió', ancho: '175px', render: (s) => s.recibido_por || '—' },
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
          // Igual que el historial de ingresos: paginado, porque los vales se
          // acumulan y la lista completa no la mira nadie.
          porPagina={POR_PAGINA}
        />
      </Caja>

      <DlgDetalleSalida abierto={viendo !== null} salidaId={viendo} alCerrar={() => setViendo(null)} />
      <DlgImprimir
        abierto={imprimiendo !== null}
        tipo="salida"
        id={imprimiendo}
        alCerrar={() => setImprimiendo(null)}
      />
      <DlgClave
        abierto={pidiendoClave}
        motivo="anular un vale de egreso"
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
