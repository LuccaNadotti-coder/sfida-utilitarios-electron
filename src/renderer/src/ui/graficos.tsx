/* ---------------------------------------------------------------------------
 * Gráficos interactivos, dibujados a mano con SVG.
 *
 * ¿Por qué no una librería de gráficos? Porque las que sirven pesan entre 400
 * KB y 1 MB, y acá hacen falta exactamente dos formas: una línea con área y
 * unas barras. Todo lo demás de esas librerías (mapas, velas, radares, temas)
 * viajaría en el instalador que tiene que correr en la PC vieja del almacén.
 *
 * Los dos gráficos:
 *   - se adaptan al ancho de su caja (ResizeObserver, no un ancho fijo);
 *   - responden al mouse: guía, punto resaltado y globo con el detalle;
 *   - respetan `useAnimaciones()`, o sea el interruptor de Control Maestro y
 *     el «reducir movimiento» de Windows.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import { CURVA, PAUSADO, RAPIDO, cascada, useAnimaciones } from '../estado/animaciones';

/** Ancho vivo de un elemento. Empieza en 0 hasta que el navegador lo mide. */
function useAncho(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setAncho(e.contentRect.width);
    });
    ro.observe(el);
    setAncho(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  return [ref, ancho];
}

/**
 * Escala «bonita» para el eje: 1, 2, 2.5 o 5 por potencia de diez.
 *
 * Sin esto el eje queda con números como 13.847, que nadie lee de un vistazo.
 */
function escalaLinda(max: number, divisiones = 4): number[] {
  if (max <= 0) return [0, 1];
  const bruto = max / divisiones;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / pot;
  const paso = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
  const tope = Math.ceil(max / paso) * paso;
  const marcas: number[] = [];
  for (let v = 0; v <= tope + paso / 2; v += paso) marcas.push(Number(v.toFixed(6)));
  return marcas;
}

/** Números cortos para los ejes: 12.4 k, 1.2 M. */
export function corto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)} M`;
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10_000 ? 0 : 1)} k`;
  if (a >= 100 || Number.isInteger(v)) return String(Math.round(v));
  return v.toFixed(2);
}

/* -------------------------------------------------------------- el globo */

function Globo({
  x,
  y,
  ancho,
  children,
}: {
  x: number;
  y: number;
  ancho: number;
  children: ReactNode;
}): React.JSX.Element {
  // Se voltea solo cerca del borde derecho, para no salirse de la caja.
  const derecha = x > ancho - 150;
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-borde bg-white px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg"
      style={{
        left: derecha ? undefined : x + 12,
        right: derecha ? ancho - x + 12 : undefined,
        top: Math.max(4, y - 34),
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------- gráfico de línea */

export interface PuntoGrafico {
  etiqueta: string;
  valor: number;
  /** Segunda cifra, solo para el globo (por ejemplo las unidades). */
  detalle?: string;
}

export function GraficoLinea({
  puntos,
  alto = 230,
  color = '#2f6fed',
  prefijo = '',
  vacio = 'Sin datos en el período',
}: {
  puntos: PuntoGrafico[];
  alto?: number;
  color?: string;
  prefijo?: string;
  vacio?: string;
}): React.JSX.Element {
  const [caja, ancho] = useAncho();
  const anim = useAnimaciones();
  const [sobre, setSobre] = useState<number | null>(null);

  const M = { arriba: 12, derecha: 12, abajo: 26, izquierda: 52 };
  const w = Math.max(0, ancho - M.izquierda - M.derecha);
  const h = alto - M.arriba - M.abajo;

  const marcas = useMemo(
    () => escalaLinda(Math.max(...puntos.map((p) => p.valor), 0)),
    [puntos],
  );
  const tope = marcas[marcas.length - 1] || 1;

  const xy = useMemo(() => {
    if (puntos.length === 0 || w <= 0) return [];
    const paso = puntos.length === 1 ? 0 : w / (puntos.length - 1);
    return puntos.map((p, i) => ({
      x: M.izquierda + i * paso,
      y: M.arriba + h - (p.valor / tope) * h,
      p,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, w, h, tope]);

  const linea = xy.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  const area =
    xy.length > 0
      ? `${linea} L${xy[xy.length - 1]!.x.toFixed(1)},${M.arriba + h} L${xy[0]!.x.toFixed(1)},${M.arriba + h} Z`
      : '';

  // Cuántas etiquetas del eje X entran sin encimarse.
  const cadaCuantas = Math.max(1, Math.ceil(puntos.length / Math.max(2, Math.floor(w / 74))));

  /**
   * La última fecha SIEMPRE se dibuja. Las intermedias van salteadas, pero la
   * anteúltima puede caer pegada a la última y quedar «15/08/202622/08/2026»
   * — que es lo que pasaba, porque el salteo no sabe dónde termina la serie.
   */
  const seDibuja = (i: number): boolean => {
    const ultima = xy.length - 1;
    if (i === ultima) return true;
    if (i % cadaCuantas !== 0) return false;
    return xy[ultima]!.x - xy[i]!.x >= 74;
  };

  function alMover(e: React.MouseEvent<SVGRectElement>): void {
    if (xy.length === 0) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left + M.izquierda;
    let mejor = 0;
    for (let i = 1; i < xy.length; i += 1) {
      if (Math.abs(xy[i]!.x - x) < Math.abs(xy[mejor]!.x - x)) mejor = i;
    }
    setSobre(mejor);
  }

  const act = sobre !== null ? xy[sobre] : undefined;

  return (
    <div ref={caja} className="relative w-full" style={{ height: alto }}>
      {puntos.length === 0 ? (
        <div className="grid h-full place-items-center text-[13px] text-suave">{vacio}</div>
      ) : (
        <>
          <svg width={ancho} height={alto} className="overflow-visible">
            <defs>
              <linearGradient id="degradadoArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={color} stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* rejilla y eje de valores */}
            {marcas.map((m) => {
              const y = M.arriba + h - (m / tope) * h;
              return (
                <g key={m}>
                  <line x1={M.izquierda} y1={y} x2={M.izquierda + w} y2={y} stroke="#eef1f6" />
                  <text x={M.izquierda - 8} y={y + 4} textAnchor="end" className="fill-suave text-[10px]">
                    {corto(m)}
                  </text>
                </g>
              );
            })}

            {/* eje de fechas */}
            {xy.map((q, i) =>
              seDibuja(i) ? (
                <text
                  key={q.p.etiqueta + i}
                  x={q.x}
                  y={alto - 8}
                  textAnchor={i === 0 ? 'start' : i === xy.length - 1 ? 'end' : 'middle'}
                  className="fill-suave text-[10px]"
                >
                  {q.p.etiqueta}
                </text>
              ) : null,
            )}

            <path d={area} fill="url(#degradadoArea)" />
            <motion.path
              d={linea}
              fill="none"
              stroke={color}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              // La línea se dibuja de izquierda a derecha, como si alguien la
              // trazara. Es el único movimiento largo de la app y se justifica:
              // es lo que hace mirar el gráfico en vez de saltearlo.
              initial={anim ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: anim ? PAUSADO * 1.6 : 0, ease: CURVA }}
            />

            {/* guía y punto resaltado */}
            {act && (
              <g>
                <line
                  x1={act.x}
                  y1={M.arriba}
                  x2={act.x}
                  y2={M.arriba + h}
                  stroke={color}
                  strokeOpacity={0.28}
                  strokeDasharray="3 3"
                />
                <circle cx={act.x} cy={act.y} r={5.5} fill="white" stroke={color} strokeWidth={2.25} />
              </g>
            )}

            {/* capa transparente que captura el mouse */}
            <rect
              x={M.izquierda}
              y={M.arriba}
              width={Math.max(0, w)}
              height={h}
              fill="transparent"
              onMouseMove={alMover}
              onMouseLeave={() => setSobre(null)}
            />
          </svg>

          <AnimatePresence>
            {act && (
              <motion.div
                initial={anim ? { opacity: 0, y: 4 } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={anim ? { opacity: 0 } : undefined}
                transition={{ duration: anim ? RAPIDO : 0, ease: CURVA }}
              >
                <Globo x={act.x} y={act.y} ancho={ancho}>
                  <div className="font-semibold">{act.p.etiqueta}</div>
                  <div style={{ color }} className="font-bold">
                    {prefijo}
                    {act.p.valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  {act.p.detalle && <div className="text-suave">{act.p.detalle}</div>}
                </Globo>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ gráfico de barras */

export interface BarraGrafico {
  id: string;
  etiqueta: string;
  valor: number;
  detalle?: string;
}

export function GraficoBarras({
  barras,
  color = '#2f6fed',
  prefijo = 'S/ ',
  seleccionada,
  alElegir,
  vacio = 'Sin datos en el período',
}: {
  barras: BarraGrafico[];
  color?: string;
  prefijo?: string;
  seleccionada?: string | null;
  alElegir?: (id: string) => void;
  vacio?: string;
}): React.JSX.Element {
  const anim = useAnimaciones();
  const max = Math.max(...barras.map((b) => b.valor), 0);

  if (barras.length === 0) {
    return <div className="grid h-[160px] place-items-center text-[13px] text-suave">{vacio}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {barras.map((b, i) => {
        const pct = max > 0 ? (b.valor / max) * 100 : 0;
        const elegida = seleccionada === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => alElegir?.(b.id)}
            className={`group w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
              elegida ? 'bg-celeste' : 'hover:bg-gris-cab'
            } ${alElegir ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12px] font-medium">{b.etiqueta}</span>
              <span className="shrink-0 text-[12px] font-bold" style={{ color }}>
                {prefijo}
                {b.valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gris-cab">
              <motion.div
                className="h-full rounded-full"
                style={{ background: color }}
                initial={anim ? { width: 0 } : false}
                animate={{ width: `${pct}%` }}
                transition={{
                  duration: anim ? PAUSADO : 0,
                  delay: anim ? cascada(i, 0.05, 8) : 0,
                  ease: CURVA,
                }}
              />
            </div>
            {b.detalle && <div className="mt-0.5 text-[11px] text-suave">{b.detalle}</div>}
          </button>
        );
      })}
    </div>
  );
}
