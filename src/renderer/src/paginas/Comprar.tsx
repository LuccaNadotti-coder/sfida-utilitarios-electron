/* ---------------------------------------------------------------------------
 * «Qué comprar» — sugerencia de compra. Nuevo en la v5.
 *
 * No es un pronóstico ni nada sofisticado: mira lo que salió del almacén en
 * los últimos meses, saca el promedio por día y calcula cuánto hace falta para
 * cubrir los próximos N días sin quedarse corto. El mínimo del artículo sigue
 * mandando: nunca sugiere menos que eso.
 *
 * A propósito NO compra ni registra nada. Solo dice qué falta, para que la
 * persona decida. Lo que sí hace es armar la lista para exportarla y llevarla
 * al proveedor.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type { SugerenciaCompra } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import {
  Boton,
  Buscador,
  Caja,
  Chips,
  Etiqueta,
  POR_PAGINA,
  Pastilla,
  Selector,
  Tabla,
  Tarjeta,
  fmtMoney,
  fmtNum,
  fmtPrecio,
  useDebounce,
} from '../ui/base';
import { Icono } from '../ui/iconos';

type Filtro = 'todos' | 'ahora' | 'pronto';

/** Cada urgencia con su color y su explicación en palabras. */
const URGENCIA: Record<SugerenciaCompra['urgencia'], { texto: string; clase: string }> = {
  'sin stock': { texto: 'Sin stock', clase: 'bg-coral-clr text-[#b3282c]' },
  urgente: { texto: 'Urgente', clase: 'bg-coral-clr text-[#b3282c]' },
  pronto: { texto: 'Pronto', clase: 'bg-ambar-clr text-ambar-osc' },
  holgado: { texto: 'Puede esperar', clase: 'bg-verde-clr text-verde' },
};

export function PanelComprar(): React.JSX.Element {
  const { pedir, avisar, refrescos } = useApp();
  const [meses, setMeses] = useState(3);
  const [dias, setDias] = useState(30);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [filas, setFilas] = useState<SugerenciaCompra[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    void pedir(window.sfida.reportes.sugerenciaCompra(meses, dias)).then((r) => {
      setFilas(r ?? []);
      setCargando(false);
    });
  }, [pedir, meses, dias, refrescos]);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro === 'ahora' && f.urgencia !== 'sin stock' && f.urgencia !== 'urgente') return false;
      if (filtro === 'pronto' && f.urgencia === 'holgado') return false;
      if (!t) return true;
      return `${f.codigo} ${f.nombre}`.toLowerCase().includes(t);
    });
  }, [filas, filtro, busqueda]);

  const total = useMemo(() => {
    const costo = visibles.reduce((s, f) => s + f.costoEstimado, 0);
    const sinPrecio = visibles.filter((f) => f.ultimoPrecio === null).length;
    const urgentes = filas.filter((f) => f.urgencia === 'sin stock' || f.urgencia === 'urgente').length;
    return { costo, sinPrecio, urgentes };
  }, [visibles, filas]);

  async function exportar(): Promise<void> {
    if (visibles.length === 0) return avisar('No hay nada que exportar.', 'info');
    const r = await pedir(
      window.sfida.reportes.exportar(
        'sugerencia_de_compra',
        ['Código', 'Artículo', 'Unidad', 'Stock', 'Mínimo', 'Consumo mensual', 'Días que quedan', 'Comprar', 'Último precio', 'Costo estimado S/', 'Urgencia'],
        visibles.map((f) => [
          f.codigo, f.nombre, f.unidad, fmtNum(f.stock), fmtNum(f.stock_minimo),
          fmtNum(f.consumoMensual), f.diasRestantes ?? '', fmtNum(f.sugerido),
          f.ultimoPrecio ? f.ultimoPrecio.toFixed(2) : '',
          f.costoEstimado ? f.costoEstimado.toFixed(2) : '',
          URGENCIA[f.urgencia].texto,
        ]),
      ),
    );
    if (r) avisar(`Lista guardada en ${r}. Se abre con Excel.`, 'ok');
  }

  return (
    <div className="flex flex-col gap-4">
      <Caja>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Etiqueta>Buscar</Etiqueta>
            <Buscador valor={texto} alCambiar={setTexto} placeholder="Nombre o código…" />
          </div>
          <div className="w-[210px]">
            <Etiqueta>Mirar el consumo de</Etiqueta>
            <Selector
              valor={meses}
              alCambiar={setMeses}
              opciones={[
                { id: 1, texto: 'El último mes' },
                { id: 3, texto: 'Los últimos 3 meses' },
                { id: 6, texto: 'Los últimos 6 meses' },
                { id: 12, texto: 'El último año' },
              ]}
            />
          </div>
          <div className="w-[190px]">
            <Etiqueta>Quiero cubrir</Etiqueta>
            <Selector
              valor={dias}
              alCambiar={setDias}
              opciones={[
                { id: 15, texto: '15 días' },
                { id: 30, texto: '1 mes' },
                { id: 60, texto: '2 meses' },
                { id: 90, texto: '3 meses' },
              ]}
            />
          </div>
          <Chips
            valor={filtro}
            alElegir={setFiltro}
            opciones={[
              { id: 'todos', texto: 'Todo' },
              { id: 'pronto', texto: 'Falta pronto' },
              { id: 'ahora', texto: 'Falta ya' },
            ]}
          />
          <div className="flex-1" />
          <Boton tono="claro" onClick={exportar}>Exportar la lista</Boton>
        </div>
      </Caja>

      <div className="flex flex-wrap gap-3">
        <Tarjeta
          orden={0}
          titulo="Artículos por comprar"
          valor={visibles.length}
          pie={`de ${filas.length} con faltante`}
          color="#2f6fed"
          icono={<Icono nombre="carrito" tam={15} />}
        />
        <Tarjeta
          orden={1}
          titulo="Hacen falta ya"
          valor={total.urgentes}
          pie="sin stock o menos de 7 días"
          color="#e5484d"
          icono={<Icono nombre="alerta" tam={15} />}
        />
        <Tarjeta
          orden={2}
          titulo="Costo estimado"
          valor={fmtMoney(total.costo)}
          pie={total.sinPrecio ? `${total.sinPrecio} sin precio conocido` : 'al último precio pagado'}
          color="#22a06b"
          icono={<Icono nombre="etiqueta" tam={15} />}
        />
      </div>

      <Tabla
        columnas={[
          { clave: 'cod', titulo: 'Código', ancho: '100px', render: (f: SugerenciaCompra) => <span className="font-medium">{f.codigo}</span> },
          { clave: 'art', titulo: 'Artículo', render: (f) => f.nombre },
          { clave: 'stock', titulo: 'Hay', ancho: '95px', derecha: true, render: (f) => `${fmtNum(f.stock)} ${f.unidad}` },
          { clave: 'min', titulo: 'Mínimo', ancho: '85px', derecha: true, render: (f) => <span className="text-suave">{fmtNum(f.stock_minimo)}</span> },
          { clave: 'cons', titulo: 'Gasta al mes', ancho: '110px', derecha: true, render: (f) => <span className="text-suave">{fmtNum(f.consumoMensual)}</span> },
          {
            clave: 'dias', titulo: 'Alcanza para', ancho: '115px', derecha: true,
            render: (f) =>
              f.diasRestantes === null ? (
                <span className="text-suave">—</span>
              ) : (
                <span className={f.diasRestantes <= 7 ? 'font-semibold text-coral' : ''}>
                  {f.diasRestantes} {f.diasRestantes === 1 ? 'día' : 'días'}
                </span>
              ),
          },
          { clave: 'sug', titulo: 'Comprar', ancho: '110px', derecha: true, render: (f) => <span className="font-bold text-azul">{fmtNum(f.sugerido)} {f.unidad}</span> },
          { clave: 'precio', titulo: 'Último precio', ancho: '115px', derecha: true, render: (f) => fmtPrecio(f.ultimoPrecio) },
          { clave: 'costo', titulo: 'Saldría', ancho: '110px', derecha: true, render: (f) => (f.costoEstimado ? fmtMoney(f.costoEstimado) : <span className="text-suave">—</span>) },
          {
            clave: 'urg', titulo: 'Urgencia', ancho: '125px',
            render: (f) => <Pastilla clase={URGENCIA[f.urgencia].clase}>{URGENCIA[f.urgencia].texto}</Pastilla>,
          },
        ]}
        filas={visibles}
        clave={(f) => f.id}
        cargando={cargando}
        vacio={{
          titulo: 'No hace falta comprar nada',
          detalle: 'Todos los artículos tienen stock de sobra para el período elegido.',
        }}
        sinResultados={
          texto || filtro !== 'todos'
            ? { titulo: 'Ningún artículo coincide', detalle: 'Probá con otra palabra u otro filtro.' }
            : undefined
        }
        porPagina={POR_PAGINA}
      />

      <p className="text-[12px] text-suave">
        La cuenta es simple: lo que salió en {meses === 1 ? 'el último mes' : `los últimos ${meses} meses`}{' '}
        dividido por los días de ese período da el gasto por día. Con eso se calcula cuánto hace
        falta para {dias} días, y se resta lo que ya hay. Nunca se sugiere menos que el stock
        mínimo del artículo. El costo sale del <b>último precio pagado</b>, así que es una
        referencia, no una cotización.
      </p>
    </div>
  );
}
