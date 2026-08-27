/* ---------------------------------------------------------------------------
 * Ingresos por boleta.
 *
 * CAMBIOS DE LA v5:
 *   - El N° de ingreso lo genera el sistema y se muestra de solo lectura.
 *   - Campo nuevo: el N° de la boleta DEL PROVEEDOR, que es el del papel.
 *   - Se puede elegir la unidad de cada línea (compro en GAL, el stock va en L).
 *   - El precio se escribe suelto, con «S/» fijo al costado.
 *   - Al guardar sale el comprobante impreso «INGRESOS ALMACEN UTILITARIOS».
 * ------------------------------------------------------------------------- */
import { useCallback, useEffect, useState } from 'react';

import type { ArticuloListado, IngresoListado } from '../../../compartido/contrato';
import type { DestinoExtra } from '../App';
import { DlgArticulo } from '../dialogos/Articulo';
import { DlgClave } from '../dialogos/Clave';
import { DlgDetalleIngreso } from '../dialogos/DetalleIngreso';
import { DlgImprimir } from '../dialogos/Imprimir';
import { useApp } from '../estado/app';
import {
  Boton,
  Buscador,
  Caja,
  Campo,
  CampoPrecio,
  ComboArticulo,
  Etiqueta,
  POR_PAGINA,
  Selector,
  SelectorUnidad,
  SpinNumero,
  Tabla,
  dmy,
  fmtMoney,
  fmtNum,
  fmtPrecio,
  hoyIso,
  useDebounce,
  usarConfirmacion,
} from '../ui/base';

interface Linea {
  articuloId: number;
  cantidad: number;
  unidad: string;
  costo: number;
}

const TIPOS = ['BOLETA', 'FACTURA', 'GUÍA', 'OTRO'];

export function PaginaIngresos({ extra }: { extra: DestinoExtra | null }): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const { pedir: confirmar, nodo: nodoConfirmacion } = usarConfirmacion();

  const [nroInterno, setNroInterno] = useState('');
  const [tipo, setTipo] = useState(TIPOS[0]!);
  const [nroProveedor, setNroProveedor] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [proveedor, setProveedor] = useState('');
  const [observacion, setObservacion] = useState('');

  const [articulos, setArticulos] = useState<ArticuloListado[]>([]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(0);
  const [unidad, setUnidad] = useState('');
  const [costo, setCosto] = useState(0);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ultimo, setUltimo] = useState('');
  const [creando, setCreando] = useState(false);
  const [imprimirAlGuardar, setImprimirAlGuardar] = useState(true);

  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [historial, setHistorial] = useState<IngresoListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<number | null>(extra?.id ?? null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [imprimiendo, setImprimiendo] = useState<number | null>(null);
  const [pidiendoClave, setPidiendoClave] = useState(false);

  const articuloDe = (id: number | null): ArticuloListado | undefined =>
    articulos.find((a) => a.id === id);

  const pedirNumero = useCallback(async () => {
    const n = await pedir(window.sfida.ingresos.siguienteNro());
    if (n) setNroInterno(n);
  }, [pedir]);

  useEffect(() => {
    void pedir(window.sfida.articulos.listar({})).then((a) => setArticulos(a ?? []));
    void pedirNumero();
  }, [pedir, pedirNumero, refrescos]);

  useEffect(() => {
    let vivo = true;
    void pedir(window.sfida.ingresos.listar(busqueda)).then((h) => {
      if (!vivo) return;
      setHistorial(h ?? []);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [pedir, busqueda, refrescos]);

  // Al elegir artículo, la unidad arranca en la de stock.
  useEffect(() => {
    const a = articuloDe(elegido);
    setUnidad(a?.unidad ?? '');
    if (!elegido) {
      setUltimo('');
      return;
    }
    void pedir(window.sfida.articulos.ultimoPrecio(elegido)).then((u) => {
      setUltimo(
        u
          ? `Último precio: ${fmtMoney(u.precio)} por ${a?.unidad} · ${u.proveedor || 'sin proveedor'} · ${dmy(u.fecha)}`
          : 'Sin precio registrado',
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegido, pedir]);

  const total = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);

  function agregar(): void {
    if (!elegido) return avisar('Elija un artículo de la lista.', 'err');
    if (cantidad <= 0) return avisar('La cantidad debe ser mayor a cero.', 'err');
    const a = articuloDe(elegido)!;
    setLineas((prev) => [...prev, { articuloId: elegido, cantidad, unidad: unidad || a.unidad, costo }]);
    setElegido(null);
    setCantidad(0);
    setCosto(0);
    setUltimo('');
  }

  function limpiar(): void {
    setLineas([]);
    setNroProveedor('');
    setProveedor('');
    setObservacion('');
    setFecha(hoyIso());
    setUltimo('');
    void pedirNumero();
  }

  async function guardar(): Promise<void> {
    const id = await pedir(
      window.sfida.ingresos.registrar({
        tipoDoc: tipo,
        nroProveedor,
        fecha,
        proveedor,
        observacion,
        items: lineas.map((l) => ({
          articuloId: l.articuloId,
          cantidad: l.cantidad,
          unidad: l.unidad,
          costo: l.costo,
        })),
      }),
    );
    if (id === null) return;
    const sinPrecio = lineas.filter((l) => !l.costo).length;
    const deseaImprimir = imprimirAlGuardar;
    limpiar();
    avisar(
      `Ingreso guardado.` + (sinPrecio ? ` ${sinPrecio} línea(s) quedaron sin precio.` : ''),
      'ok',
    );
    refrescarTodo();
    if (deseaImprimir) setImprimiendo(id);
  }

  const artElegido = articuloDe(elegido);

  return (
    <div className="flex flex-col gap-4 p-5">
      <Caja titulo="Datos del documento de compra">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div>
            <Etiqueta>N° de ingreso</Etiqueta>
            {/* Lo genera el sistema: no se digita. */}
            <div className="rounded-lg border border-[#d9dfe8] bg-[#f2f5f9] px-3 py-2.5 text-[14px] font-semibold text-texto">
              {nroInterno || '…'}
            </div>
          </div>
          <div>
            <Etiqueta>Tipo</Etiqueta>
            <Selector valor={tipo} alCambiar={setTipo} opciones={TIPOS.map((t) => ({ id: t, texto: t }))} />
          </div>
          <div>
            <Etiqueta>N° boleta del proveedor</Etiqueta>
            <Campo valor={nroProveedor} alCambiar={setNroProveedor} mayusculas placeholder="B001-1234" />
          </div>
          <div>
            <Etiqueta>Fecha</Etiqueta>
            <Campo valor={fecha} alCambiar={setFecha} tipo="date" />
          </div>
          <div>
            <Etiqueta>Proveedor</Etiqueta>
            {/* Corto a propósito: en 1366 px la columna no da para más y el
                texto de ejemplo salía cortado a la mitad. */}
            <Campo valor={proveedor} alCambiar={setProveedor} mayusculas placeholder="Ej: DISTRIBUIDORA LIMA" />
          </div>
          <div>
            <Etiqueta>Observación</Etiqueta>
            <Campo valor={observacion} alCambiar={setObservacion} placeholder="Opcional" />
          </div>
        </div>
      </Caja>

      <Caja titulo="Artículos que ingresan">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <Etiqueta>Artículo</Etiqueta>
            <ComboArticulo articulos={articulos} valor={elegido} alElegir={setElegido} />
          </div>
          <Boton tono="claro" onClick={() => setCreando(true)} title="Crear un artículo que todavía no existe">
            +
          </Boton>
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
          <div className="w-[150px]">
            <Etiqueta>Precio por {unidad || artElegido?.unidad || 'unidad'}</Etiqueta>
            <CampoPrecio valor={costo} alCambiar={setCosto} />
          </div>
          <Boton tono="verde" onClick={agregar}>Agregar</Boton>
        </div>

        {artElegido && unidad && unidad !== artElegido.unidad && (
          <p className="mt-2 text-[12px] text-azul">
            El stock de este artículo se lleva en <b>{artElegido.unidad}</b>: al guardar, el sistema
            convierte lo que cargues.
          </p>
        )}
        {ultimo && <p className="mt-1 text-[12px] text-suave">{ultimo}</p>}

        <div className="mt-3">
          <Tabla
            columnas={[
              { clave: 'art', titulo: 'Artículo', render: (l: Linea) => { const a = articuloDe(l.articuloId); return a ? `${a.codigo} | ${a.nombre}` : '?'; } },
              { clave: 'cant', titulo: 'Cantidad', ancho: '100px', derecha: true, render: (l) => fmtNum(l.cantidad) },
              { clave: 'uni', titulo: 'Unidad', ancho: '90px', render: (l) => l.unidad },
              {
                clave: 'stock', titulo: 'Entra al stock', ancho: '140px', derecha: true,
                render: (l) => {
                  const a = articuloDe(l.articuloId);
                  if (!a || l.unidad === a.unidad) return <span className="text-suave">—</span>;
                  return <span className="text-suave">se convierte a {a.unidad}</span>;
                },
              },
              { clave: 'precio', titulo: 'Precio unit.', ancho: '110px', derecha: true, render: (l) => fmtPrecio(l.costo) },
              { clave: 'sub', titulo: 'Subtotal', ancho: '110px', derecha: true, render: (l) => (l.costo ? (l.cantidad * l.costo).toFixed(2) : '—') },
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
          <span className="text-[18px] font-semibold">Total: {fmtMoney(total)}</span>
          <label className="flex cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" checked={imprimirAlGuardar} onChange={(e) => setImprimirAlGuardar(e.target.checked)} />
            Imprimir el comprobante al guardar
          </label>
          <Boton tono="gris" onClick={limpiar}>Limpiar</Boton>
          <Boton tono="verde" onClick={guardar} disabled={lineas.length === 0}>Guardar ingreso</Boton>
        </div>
      </Caja>

      <Caja
        titulo="Historial de ingresos"
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar por N° o proveedor…" className="w-[240px]" />
            <Boton tono="claro" onClick={() => (sel ? setViendo(sel) : avisar('Seleccione un ingreso del historial.', 'info'))}>
              Ver detalle
            </Boton>
            <Boton tono="azul" onClick={() => (sel ? setImprimiendo(sel) : avisar('Seleccione el ingreso que desea imprimir.', 'info'))}>
              Imprimir
            </Boton>
            <Boton tono="rojo" onClick={() => (sel ? setPidiendoClave(true) : avisar('Seleccione el ingreso que desea anular.', 'info'))}>
              Anular
            </Boton>
          </div>
        }
      >
        <Tabla
          columnas={[
            { clave: 'nro', titulo: 'N° ingreso', ancho: '120px', render: (i: IngresoListado) => <span className="font-medium">{i.nro_documento}</span> },
            { clave: 'fecha', titulo: 'Fecha', ancho: '105px', render: (i) => dmy(i.fecha) },
            { clave: 'doc', titulo: 'Doc. proveedor', ancho: '160px', render: (i) => (i.nro_proveedor ? `${i.tipo_doc} ${i.nro_proveedor}` : <span className="text-suave">s/n</span>) },
            { clave: 'prov', titulo: 'Proveedor', render: (i) => i.proveedor || '-' },
            { clave: 'items', titulo: 'Ítems', ancho: '80px', derecha: true, render: (i) => i.items },
            { clave: 'total', titulo: 'Total S/', ancho: '110px', derecha: true, render: (i) => (i.total ? i.total.toFixed(2) : '—') },
          ]}
          filas={historial}
          clave={(i) => i.id}
          cargando={cargando}
          seleccionada={sel}
          alSeleccionar={(i) => setSel(i.id)}
          alDobleClic={(i) => setViendo(i.id)}
          vacio={{ titulo: 'Todavía no hay boletas registradas', detalle: 'Cargá la primera con el formulario de arriba.' }}
          sinResultados={texto ? { titulo: 'Ningún ingreso coincide', detalle: 'Probá con otro número o proveedor.' } : undefined}
          // Paginado en vez de alto fijo: el historial crece sin techo y con
          // los años la tabla entera se volvía pesada de dibujar.
          porPagina={POR_PAGINA}
        />
      </Caja>

      <DlgArticulo abierto={creando} artId={null} alCerrar={(c) => { setCreando(false); if (c) refrescarTodo(); }} />
      <DlgDetalleIngreso
        abierto={viendo !== null}
        ingresoId={viendo}
        alCerrar={(c) => { setViendo(null); if (c) refrescarTodo(); }}
      />
      <DlgImprimir
        abierto={imprimiendo !== null}
        tipo="ingreso"
        id={imprimiendo}
        alCerrar={() => setImprimiendo(null)}
      />
      <DlgClave
        abierto={pidiendoClave}
        motivo="anular un ingreso"
        alCerrar={async (autorizado) => {
          setPidiendoClave(false);
          if (!autorizado || !sel) return;
          const seguro = await confirmar({
            titulo: 'Anular ingreso',
            texto: '¿Anular este ingreso?\nSe descontará del stock lo que ingresó.',
          });
          if (!seguro) return;
          const r = await pedir(window.sfida.ingresos.anular(sel));
          if (r === null) return;
          avisar('Ingreso anulado.', 'ok');
          setSel(null);
          refrescarTodo();
        }}
      />
      {nodoConfirmacion}
    </div>
  );
}
