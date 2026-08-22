/* ---------------------------------------------------------------------------
 * Panel de control. Port de `PanelPage` de `sfida_paginas.py`.
 *
 * De arriba a abajo: 6 tarjetas, dona de nivel + movimiento mensual, artículos
 * más repartidos + necesitan reposición, y últimos movimientos.
 * ------------------------------------------------------------------------- */
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

import type {
  DetalleConsumo,
  EstadisticaMes,
  FilaAlerta,
  Niveles,
  ResumenPanel,
} from '../../../compartido/contrato';
import type { ClavePagina } from '../App';
import { useAnimaciones } from '../estado/animaciones';
import { useApp } from '../estado/app';
import { Caja, Pastilla, Tabla, Tarjeta, dmy, fmtMoney, fmtNum } from '../ui/base';
import { Icono } from '../ui/iconos';

const VERDE = '#22a06b';
const AMBAR = '#f5a623';
const ROJO = '#e5484d';
const AZUL = '#2f6fed';

interface Movimiento {
  id: string;
  fecha: string;
  tipo: 'Ingreso' | 'Salida';
  documento: string;
  detalle: string;
  unidades: number;
}

export function PaginaPanel({ irA }: { irA: (d: ClavePagina) => void }): React.JSX.Element {
  const { pedir, refrescos } = useApp();
  const [resumen, setResumen] = useState<ResumenPanel | null>(null);
  const [alertas, setAlertas] = useState<FilaAlerta[]>([]);
  const [niveles, setNiveles] = useState<Niveles | null>(null);
  const [mensual, setMensual] = useState<EstadisticaMes[]>([]);
  const [top, setTop] = useState<DetalleConsumo[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [r, a, n, m, t, ing, sal] = await Promise.all([
        pedir(window.sfida.panel.resumen()),
        pedir(window.sfida.panel.alertas()),
        pedir(window.sfida.panel.niveles()),
        pedir(window.sfida.panel.mensual()),
        pedir(window.sfida.panel.masMovidos(6)),
        pedir(window.sfida.ingresos.listar()),
        pedir(window.sfida.salidas.listar()),
      ]);
      if (!vivo) return;
      setResumen(r);
      setAlertas(a ?? []);
      setNiveles(n);
      setMensual(m ?? []);
      setTop(t ?? []);

      const juntos: Movimiento[] = [
        ...(ing ?? []).slice(0, 12).map((i) => ({
          id: `i${i.id}`,
          fecha: i.fecha,
          tipo: 'Ingreso' as const,
          documento: `${i.tipo_doc} ${i.nro_documento}`,
          detalle: i.proveedor || '-',
          unidades: i.unidades,
        })),
        ...(sal ?? []).slice(0, 12).map((s) => ({
          id: `s${s.id}`,
          fecha: s.fecha,
          tipo: 'Salida' as const,
          documento: `Vale ${s.nro_vale}`,
          detalle: s.sucursal,
          unidades: s.unidades,
        })),
      ];
      juntos.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0));
      setMovs(juntos.slice(0, 10));
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [pedir, refrescos]);

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap gap-3">
        <Tarjeta titulo="Artículos" valor={resumen?.articulos ?? '—'} pie="activos en el almacén" color={AZUL} icono={<Icono nombre="caja" tam={15} />} />
        <Tarjeta titulo="Sucursales" valor={resumen?.sucursales ?? '—'} pie="locales atendidos" color="#5a8df3" icono={<Icono nombre="tienda" tam={15} />} />
        <Tarjeta titulo="Ingresos" valor={resumen?.ingresos ?? '—'} pie="boletas registradas" color={VERDE} icono={<Icono nombre="entrada" tam={15} />} />
        <Tarjeta titulo="Salidas" valor={resumen?.salidas ?? '—'} pie="vales de reparto" color={AZUL} icono={<Icono nombre="salida" tam={15} />} />
        <Tarjeta
          titulo="Alertas"
          valor={resumen?.alertas ?? '—'}
          pie={alertas.length ? 'artículos por comprar' : 'todo abastecido'}
          color={ROJO}
          icono={<Icono nombre="alerta" tam={15} />}
        />
        <Tarjeta titulo="Valorizado" valor={resumen ? fmtMoney(resumen.valorizado) : '—'} pie="según el último precio" color="#a76c05" icono={<Icono nombre="etiqueta" tam={15} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-9">
        <Caja titulo="Nivel del inventario" className="xl:col-span-4">
          <Dona niveles={niveles} />
        </Caja>
        <Caja titulo="Movimiento de los últimos 6 meses" className="xl:col-span-5">
          <Barras datos={mensual} />
        </Caja>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-11">
        <Caja titulo="Artículos más repartidos" className="xl:col-span-5">
          <Proporciones datos={top} />
        </Caja>
        <Caja titulo="Necesitan reposición" className="xl:col-span-6">
          <Tabla
            columnas={[
              { clave: 'codigo', titulo: 'Código', ancho: '95px', render: (a: FilaAlerta) => a.codigo },
              { clave: 'nombre', titulo: 'Artículo', render: (a) => a.nombre },
              { clave: 'stock', titulo: 'Stock', ancho: '70px', derecha: true, render: (a) => <span className="font-semibold text-coral">{fmtNum(a.stock)}</span> },
              { clave: 'min', titulo: 'Mínimo', ancho: '70px', derecha: true, render: (a) => fmtNum(a.stock_minimo) },
              { clave: 'faltan', titulo: 'Faltan', ancho: '70px', derecha: true, render: (a) => <span className="font-semibold text-coral">{fmtNum(Math.max(0, a.stock_minimo - a.stock))}</span> },
            ]}
            filas={alertas}
            clave={(a) => a.codigo}
            cargando={cargando}
            vacio={{ titulo: 'Sin alertas', detalle: 'Todo el stock está sobre el mínimo.' }}
            alto="max-h-[240px]"
          />
        </Caja>
      </div>

      <Caja
        titulo="Últimos movimientos"
        acciones={
          <button onClick={() => irA('salidas')} className="cursor-pointer text-[12px] font-semibold text-azul hover:underline">
            Ver salidas
          </button>
        }
      >
        <Tabla
          columnas={[
            { clave: 'fecha', titulo: 'Fecha', ancho: '110px', render: (m: Movimiento) => dmy(m.fecha) },
            { clave: 'tipo', titulo: 'Tipo', ancho: '110px', render: (m) => <Pastilla clase={m.tipo === 'Ingreso' ? 'bg-verde-clr text-[#14724a]' : 'bg-celeste text-azul'}>{m.tipo}</Pastilla> },
            { clave: 'doc', titulo: 'Documento', ancho: '190px', render: (m) => m.documento },
            { clave: 'det', titulo: 'Detalle', render: (m) => m.detalle },
            { clave: 'und', titulo: 'Unidades', ancho: '100px', derecha: true, render: (m) => fmtNum(m.unidades) },
          ]}
          filas={movs}
          clave={(m) => m.id}
          cargando={cargando}
          vacio={{ titulo: 'Todavía no hay movimientos', detalle: 'Registrá un ingreso o una salida para verlos acá.' }}
        />
      </Caja>
    </div>
  );
}

/* ------------------------------------------------------------- gráficos */

function Dona({ niveles }: { niveles: Niveles | null }): React.JSX.Element {
  const anim = useAnimaciones();
  const datos = [
    { texto: 'En buen nivel', valor: niveles?.ok ?? 0, color: VERDE },
    { texto: 'Por agotarse', valor: niveles?.por_agotarse ?? 0, color: AMBAR },
    { texto: 'Bajo el mínimo', valor: niveles?.bajo_minimo ?? 0, color: ROJO },
  ];
  const total = datos.reduce((s, d) => s + d.valor, 0);

  if (total === 0) {
    return (
      <div className="flex h-[168px] items-center justify-center text-center text-[13px] text-suave">
        Todavía no hay artículos cargados.
      </div>
    );
  }

  const R = 54;
  const CIRC = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative size-[136px] shrink-0">
        <svg viewBox="0 0 140 140" className="-rotate-90">
          {datos.map((d) => {
            const frac = d.valor / total;
            const largo = frac * CIRC;
            const offset = acumulado;
            acumulado += largo;
            if (d.valor === 0) return null;
            return (
              <motion.circle
                key={d.texto}
                cx="70" cy="70" r={R}
                fill="none" stroke={d.color} strokeWidth="17"
                strokeDasharray={`${largo} ${CIRC - largo}`}
                strokeDashoffset={-offset}
                initial={anim ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[24px] leading-none font-bold">
              {total ? Math.round(((niveles?.ok ?? 0) / total) * 100) : 0}%
            </div>
            <div className="text-[11px] text-suave">en buen nivel</div>
          </div>
        </div>
      </div>
      <ul className="min-w-[150px] flex-1 space-y-2">
        {datos.map((d) => (
          <li key={d.texto} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="flex-1 truncate">{d.texto}</span>
            <span className="font-semibold tabular-nums">{d.valor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Barras({ datos }: { datos: EstadisticaMes[] }): React.JSX.Element {
  const anim = useAnimaciones();
  const max = Math.max(1, ...datos.flatMap((d) => [d.entradas, d.salidas]));
  if (datos.every((d) => d.entradas === 0 && d.salidas === 0)) {
    return (
      <div className="flex h-[168px] items-center justify-center text-center text-[13px] text-suave">
        Todavía no hay movimientos en los últimos 6 meses.
      </div>
    );
  }
  return (
    <div>
      <div className="flex h-[150px] items-end gap-3">
        {datos.map((d) => (
          <div key={d.mes} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-[128px] w-full items-end justify-center gap-1">
              {(['entradas', 'salidas'] as const).map((k) => (
                <motion.div
                  key={k}
                  className="w-1/2 max-w-[20px] rounded-t"
                  style={{ background: k === 'entradas' ? VERDE : AZUL }}
                  initial={anim ? { height: 0 } : false}
                  animate={{ height: `${(d[k] / max) * 100}%` }}
                  transition={{ duration: anim ? 0.35 : 0, ease: [0.33, 1, 0.68, 1] }}
                  title={`${k}: ${fmtNum(d[k])}`}
                />
              ))}
            </div>
            <span className="text-[11px] text-suave">{d.mes}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[12px] text-suave">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: VERDE }} />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: AZUL }} />Salidas</span>
      </div>
    </div>
  );
}

function Proporciones({ datos }: { datos: DetalleConsumo[] }): React.JSX.Element {
  const anim = useAnimaciones();
  if (datos.length === 0) {
    return (
      <div className="flex h-[168px] items-center justify-center text-center text-[13px] text-suave">
        Todavía no se repartió nada.
      </div>
    );
  }
  const max = Math.max(...datos.map((d) => d.cantidad));
  return (
    <ul className="space-y-2.5">
      {datos.map((d) => (
        <li key={d.codigo}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
            <span className="truncate">{d.nombre}</span>
            <span className="shrink-0 text-[12px] text-suave">
              {fmtNum(d.cantidad)} {d.unidad.toLowerCase()}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-separador">
            <motion.div
              className="h-full rounded-full bg-azul"
              initial={anim ? { width: 0 } : false}
              animate={{ width: `${(d.cantidad / max) * 100}%` }}
              transition={{ duration: anim ? 0.4 : 0, ease: [0.33, 1, 0.68, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
