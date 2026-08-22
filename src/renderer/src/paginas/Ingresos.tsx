/* ---------------------------------------------------------------------------
 * Ingresos por boleta. Port de `IngresoPage` de `sfida_paginas.py`.
 *
 * El precio es OPCIONAL: si queda en 0, la línea queda «sin precio» y se ve un
 * guion, nunca S/ 0.00. El último precio pagado se muestra SOLO como ayuda: el
 * campo nunca se rellena solo.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import type { ArticuloListado, IngresoListado } from '../../../compartido/contrato';
import type { DestinoExtra } from '../App';
import { DlgArticulo } from '../dialogos/Articulo';
import { DlgClave } from '../dialogos/Clave';
import { DlgDetalleIngreso } from '../dialogos/DetalleIngreso';
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
  costo: number;
}

const TIPOS = ['BOLETA', 'FACTURA', 'GUÍA', 'OTRO'];

export function PaginaIngresos({ extra }: { extra: DestinoExtra | null }): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const { pedir: confirmar, nodo: nodoConfirmacion } = usarConfirmacion();

  const [tipo, setTipo] = useState(TIPOS[0]!);
  const [nro, setNro] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [proveedor, setProveedor] = useState('');
  const [observacion, setObservacion] = useState('');

  const [articulos, setArticulos] = useState<ArticuloListado[]>([]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(0);
  const [costo, setCosto] = useState(0);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [ultimo, setUltimo] = useState<string>('');
  const [creando, setCreando] = useState(false);

  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [historial, setHistorial] = useState<IngresoListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<number | null>(extra?.id ?? null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [pidiendoClave, setPidiendoClave] = useState(false);

  useEffect(() => {
    void pedir(window.sfida.articulos.listar({})).then((a) => setArticulos(a ?? []));
  }, [pedir, refrescos]);

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

  // El último precio es SOLO informativo: no rellena el campo.
  useEffect(() => {
    if (!elegido) {
      setUltimo('');
      return;
    }
    void pedir(window.sfida.articulos.ultimoPrecio(elegido)).then((u) => {
      setUltimo(
        u
          ? `Último precio: ${fmtMoney(u.precio)} · ${u.proveedor || 'sin proveedor'} · ${dmy(u.fecha)}`
          : 'Sin precio registrado',
      );
    });
  }, [elegido, pedir]);

  const total = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const nombreDe = (id: number): ArticuloListado | undefined => articulos.find((a) => a.id === id);

  function agregar(): void {
    if (!elegido) return avisar('Elija un artículo de la lista.', 'err');
    if (cantidad <= 0) return avisar('La cantidad debe ser mayor a cero.', 'err');
    setLineas((prev) => [...prev, { articuloId: elegido, cantidad, costo }]);
    setElegido(null);
    setCantidad(0);
    setCosto(0);
    setUltimo('');
  }

  function limpiar(): void {
    setLineas([]);
    setNro('');
    setProveedor('');
    setObservacion('');
    setFecha(hoyIso());
    setUltimo('');
  }

  async function guardar(): Promise<void> {
    const id = await pedir(
      window.sfida.ingresos.registrar({
        tipoDoc: tipo,
        nroDocumento: nro,
        fecha,
        proveedor,
        observacion,
        items: lineas.map((l) => [l.articuloId, l.cantidad, l.costo] as [number, number, number]),
      }),
    );
    if (id === null) return;
    const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
    const sinPrecio = lineas.filter((l) => !l.costo).length;
    limpiar();
    avisar(
      `Ingreso guardado: ${fmtNum(unidades)} unidades sumadas al stock.` +
        (sinPrecio ? ` ${sinPrecio} línea(s) quedaron sin precio.` : ''),
      'ok',
    );
    refrescarTodo();
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <Caja titulo="Datos del documento de compra">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div>
            <Etiqueta>Tipo</Etiqueta>
            <Selector valor={tipo} alCambiar={setTipo} opciones={TIPOS.map((t) => ({ id: t, texto: t }))} />
          </div>
          <div>
            <Etiqueta>N° de documento</Etiqueta>
            <Campo valor={nro} alCambiar={setNro} mayusculas placeholder="B001-1234" />
          </div>
          <div>
            <Etiqueta>Fecha</Etiqueta>
            <Campo valor={fecha} alCambiar={setFecha} tipo="date" />
          </div>
          <div>
            <Etiqueta>Proveedor</Etiqueta>
            <Campo valor={proveedor} alCambiar={setProveedor} mayusculas placeholder="NOMBRE DEL PROVEEDOR" />
          </div>
          <div>
            <Etiqueta>Observación</Etiqueta>
            {/* La observación NO va en mayúsculas: manda el código viejo. */}
            <Campo valor={observacion} alCambiar={setObservacion} placeholder="Observación (opcional)" />
          </div>
        </div>
      </Caja>

      <Caja titulo="Artículos que ingresan">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <ComboArticulo articulos={articulos} valor={elegido} alElegir={setElegido} />
          </div>
          <Boton tono="claro" onClick={() => setCreando(true)} title="Crear un artículo que todavía no existe">
            +
          </Boton>
          <div className="w-[150px]">
            <Etiqueta>Cantidad</Etiqueta>
            <SpinNumero valor={cantidad} alCambiar={setCantidad} />
          </div>
          <div className="w-[170px]">
            <Etiqueta>Precio (opcional)</Etiqueta>
            <SpinNumero valor={costo} alCambiar={setCosto} decimales={2} paso={0.5} prefijo="S/ " />
          </div>
          <Boton tono="verde" onClick={agregar}>Agregar</Boton>
        </div>
        {ultimo && <p className="mt-2 text-[12px] text-suave">{ultimo}</p>}

        <div className="mt-3">
          <Tabla
            columnas={[
              { clave: 'art', titulo: 'Artículo', render: (l: Linea) => { const a = nombreDe(l.articuloId); return a ? `${a.codigo} | ${a.nombre}` : '?'; } },
              { clave: 'cant', titulo: 'Cantidad', ancho: '100px', derecha: true, render: (l) => fmtNum(l.cantidad) },
              { clave: 'uni', titulo: 'Unidad', ancho: '90px', render: (l) => nombreDe(l.articuloId)?.unidad ?? '' },
              { clave: 'precio', titulo: 'Precio unit.', ancho: '120px', derecha: true, render: (l) => fmtPrecio(l.costo) },
              { clave: 'sub', titulo: 'Subtotal', ancho: '120px', derecha: true, render: (l) => (l.costo ? (l.cantidad * l.costo).toFixed(2) : '—') },
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex-1" />
          <span className="text-[18px] font-semibold">Total: {fmtMoney(total)}</span>
          <Boton tono="gris" onClick={limpiar}>Limpiar</Boton>
          <Boton tono="verde" onClick={guardar} disabled={lineas.length === 0}>Guardar ingreso</Boton>
        </div>
      </Caja>

      <Caja
        titulo="Historial de ingresos"
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar por documento o proveedor…" className="w-[260px]" />
            <Boton tono="claro" onClick={() => (sel ? setViendo(sel) : avisar('Seleccione un ingreso del historial.', 'info'))}>
              Ver detalle
            </Boton>
            <Boton tono="rojo" onClick={() => (sel ? setPidiendoClave(true) : avisar('Seleccione el ingreso que desea anular.', 'info'))}>
              Anular ingreso
            </Boton>
          </div>
        }
      >
        <Tabla
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: '110px', render: (i: IngresoListado) => dmy(i.fecha) },
            { clave: 'doc', titulo: 'Documento', ancho: '180px', render: (i) => `${i.tipo_doc} ${i.nro_documento}` },
            { clave: 'prov', titulo: 'Proveedor', render: (i) => i.proveedor || '-' },
            { clave: 'items', titulo: 'Ítems', ancho: '85px', derecha: true, render: (i) => i.items },
            { clave: 'und', titulo: 'Unidades', ancho: '105px', derecha: true, render: (i) => fmtNum(i.unidades) },
            { clave: 'total', titulo: 'Total S/', ancho: '115px', derecha: true, render: (i) => (i.total ? i.total.toFixed(2) : '—') },
          ]}
          filas={historial}
          clave={(i) => i.id}
          cargando={cargando}
          seleccionada={sel}
          alSeleccionar={(i) => setSel(i.id)}
          alDobleClic={(i) => setViendo(i.id)}
          vacio={{ titulo: 'Todavía no hay boletas registradas', detalle: 'Cargá la primera con el formulario de arriba.' }}
          sinResultados={texto ? { titulo: 'Ningún ingreso coincide', detalle: 'Probá con otro número o proveedor.' } : undefined}
          alto="max-h-[340px]"
        />
      </Caja>

      <DlgArticulo abierto={creando} artId={null} alCerrar={(c) => { setCreando(false); if (c) refrescarTodo(); }} />
      <DlgDetalleIngreso
        abierto={viendo !== null}
        ingresoId={viendo}
        alCerrar={(c) => { setViendo(null); if (c) refrescarTodo(); }}
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
