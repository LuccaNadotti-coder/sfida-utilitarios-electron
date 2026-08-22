/* ---------------------------------------------------------------------------
 * Controles reutilizables. Equivalen a los de `sfida_estilo.py`.
 *
 * Regla heredada: ninguna pantalla escribe colores sueltos. Todo sale de la
 * paleta declarada en `estilos.css`, que a su vez viene de `sfida_estilo.py`.
 * ------------------------------------------------------------------------- */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAnimaciones } from '../estado/animaciones';

/* ------------------------------------------------------------------ texto */

/** Port de `fmt_num()`. */
export function fmtNum(v: unknown): string {
  const n = Number(v ?? 0) || 0;
  return Math.abs(n - Math.trunc(n)) < 0.0001 ? String(Math.trunc(n)) : n.toFixed(2);
}

const MILES = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Port de `fmt_money()`. */
export function fmtMoney(v: unknown): string {
  return `S/ ${MILES.format(Number(v ?? 0) || 0)}`;
}

/** Port de `fmt_precio()`: guion si nunca tuvo precio, nunca «S/ 0.00». */
export function fmtPrecio(v: unknown): string {
  if (v === null || v === undefined || (Number(v) || 0) <= 0) return '—';
  return fmtMoney(v);
}

/** Port de `fmt_variacion()`. */
export function fmtVariacion(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) < 0.005) return '=';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** «2026-08-22» -> «22/08/2026». */
export function dmy(iso: unknown): string {
  const p = String(iso ?? '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso ?? '');
}

/** Fecha local de hoy en ISO. */
export function hoyIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Port de `categoria_corta()`. */
export function categoriaCorta(nombre: string | null): string {
  if (!nombre) return '-';
  const t = nombre.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
  if (t.includes('LIMPIEZA')) return 'LIMPIEZA';
  if (t.includes('OFICINA')) return 'OFICINA';
  return nombre;
}

/**
 * Port de `color_estado()`. El orden de las condiciones importa.
 * Devuelve [texto, clase de color].
 */
export function estadoStock(stock: number, minimo: number): [string, string] {
  const s = Number(stock);
  const m = Number(minimo || 0);
  if (s <= 0) return ['Sin stock', 'bg-coral-clr text-[#b3282c]'];
  if (m > 0 && s <= m) return ['Bajo mínimo', 'bg-coral-clr text-[#b3282c]'];
  if (m > 0 && s <= m * 1.3) return ['Por agotarse', 'bg-ambar-clr text-ambar-osc'];
  return ['Ok', 'bg-verde-clr text-[#14724a]'];
}

/* ---------------------------------------------------------------- botones */

type Tono = 'azul' | 'verde' | 'rojo' | 'ambar' | 'gris' | 'claro';

const TONOS: Record<Tono, string> = {
  azul: 'bg-azul text-white hover:bg-azul-clr active:bg-azul-osc',
  verde: 'bg-verde text-white hover:bg-[#2bbb7e]',
  rojo: 'bg-coral text-white hover:bg-[#ef6367]',
  ambar: 'bg-ambar text-[#4a3405] hover:bg-[#ffb840]',
  gris: 'bg-separador text-[#3a4553] hover:bg-[#e3e8f0]',
  claro: 'bg-white text-azul border border-[#d9dfe8] hover:bg-gris-fondo hover:border-[#c3ccda]',
};

export function Boton({
  children,
  tono = 'azul',
  onClick,
  type = 'button',
  disabled,
  className = '',
  title,
}: {
  children: ReactNode;
  tono?: Tono;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  title?: string;
}): React.JSX.Element {
  const anim = useAnimaciones();
  return (
    <motion.button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      whileHover={anim && !disabled ? { y: -1 } : undefined}
      whileTap={anim && !disabled ? { scale: 0.97 } : undefined}
      transition={{ duration: 0.12 }}
      className={`cursor-pointer rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-[#cfd7e3] disabled:text-white ${TONOS[tono]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

/** Chips del segmentado (Todos / Bajo el mínimo / Sin stock). */
export function Chips<T extends string>({
  opciones,
  valor,
  alElegir,
}: {
  opciones: Array<{ id: T; texto: string }>;
  valor: T;
  alElegir: (v: T) => void;
}): React.JSX.Element {
  const anim = useAnimaciones();
  return (
    <div className="flex gap-0.5 rounded-[9px] bg-separador p-0.5">
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => alElegir(o.id)}
          className="relative cursor-pointer rounded-[7px] px-4 py-1.5 text-[13px] font-semibold text-[#4a5563] transition-colors"
        >
          {valor === o.id && (
            <motion.span
              layoutId="chip-activo"
              transition={anim ? { type: 'spring', stiffness: 420, damping: 34 } : { duration: 0 }}
              className="absolute inset-0 rounded-[7px] bg-white shadow-sm"
            />
          )}
          <span className={`relative ${valor === o.id ? 'text-azul' : ''}`}>{o.texto}</span>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- campos */

/**
 * Campo de texto.
 *
 * `mayusculas` implementa la regla del sistema: TODO lo que se digita se
 * guarda en MAYÚSCULAS, y se ve así mientras se escribe. El BUSCADOR es la
 * única excepción y por eso no la usa.
 */
export function Campo({
  valor,
  alCambiar,
  placeholder,
  mayusculas = false,
  tipo = 'text',
  className = '',
  autoFocus,
  disabled,
  alEnter,
}: {
  valor: string;
  alCambiar: (v: string) => void;
  placeholder?: string;
  mayusculas?: boolean;
  tipo?: 'text' | 'password' | 'date';
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  alEnter?: () => void;
}): React.JSX.Element {
  // El ancho va en un contenedor, no en el <input>. Si se pusiera en el mismo
  // elemento, `w-full` y el ancho que manda la pantalla compiten y gana el que
  // esté después en la hoja de estilos: eso rompía las barras de filtros, que
  // se partían en varias líneas sin motivo aparente.
  return (
    <div className={className}>
      <input
        type={tipo}
        value={valor}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && alEnter) alEnter();
        }}
        onChange={(e) => alCambiar(mayusculas ? e.target.value.toUpperCase() : e.target.value)}
        className="w-full cursor-text rounded-lg border border-[#d9dfe8] bg-white px-3 py-2.5 text-[14px] outline-none transition-colors select-text placeholder:text-[#a9b3c1] hover:border-[#c3ccda] focus:border-azul focus:ring-1 focus:ring-azul disabled:bg-[#f2f5f9] disabled:text-suave"
      />
    </div>
  );
}

export function Selector<T extends string | number>({
  valor,
  alCambiar,
  opciones,
  className = '',
}: {
  valor: T;
  alCambiar: (v: T) => void;
  opciones: Array<{ id: T; texto: string }>;
  className?: string;
}): React.JSX.Element {
  // Igual que en `Campo`: el ancho va en el contenedor, no en el <select>.
  return (
    <div className={className}>
      <select
        value={String(valor)}
        onChange={(e) => {
          const bruto = e.target.value;
          const encontrada = opciones.find((o) => String(o.id) === bruto);
          alCambiar((encontrada ? encontrada.id : bruto) as T);
        }}
        className="w-full cursor-pointer rounded-lg border border-[#d9dfe8] bg-white px-3 py-2.5 text-[14px] outline-none hover:border-[#c3ccda] focus:border-azul focus:ring-1 focus:ring-azul"
      >
        {opciones.map((o) => (
          <option key={String(o.id)} value={String(o.id)}>
            {o.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Port de `SpinNumero`: cantidad con botones − y +. */
export function SpinNumero({
  valor,
  alCambiar,
  min = 0,
  max = 9999999,
  decimales = 0,
  paso = 1,
  prefijo = '',
  className = '',
}: {
  valor: number;
  alCambiar: (v: number) => void;
  min?: number;
  max?: number;
  decimales?: number;
  paso?: number;
  prefijo?: string;
  className?: string;
}): React.JSX.Element {
  const acotar = (v: number): number => Math.min(max, Math.max(min, v));
  const mostrar = decimales > 0 ? valor.toFixed(decimales) : String(valor);
  return (
    <div
      className={`flex items-center gap-1 rounded-lg border border-[#d9dfe8] bg-white px-1 py-1 ${className}`}
    >
      <button
        onClick={() => alCambiar(acotar(Number((valor - paso).toFixed(4))))}
        className="size-8 shrink-0 cursor-pointer rounded-md bg-separador text-[17px] leading-none font-semibold text-[#3a4553] hover:bg-[#dfe5ee] active:bg-azul active:text-white"
      >
        −
      </button>
      <input
        value={prefijo + mostrar}
        onChange={(e) => {
          const limpio = e.target.value.replace(prefijo, '').replace(',', '.').trim();
          const n = Number(limpio);
          if (Number.isFinite(n)) alCambiar(acotar(n));
          else if (limpio === '') alCambiar(min);
        }}
        className="min-w-0 flex-1 cursor-text border-0 bg-transparent px-1 text-center text-[15px] font-semibold outline-none select-text"
      />
      <button
        onClick={() => alCambiar(acotar(Number((valor + paso).toFixed(4))))}
        className="size-8 shrink-0 cursor-pointer rounded-md bg-separador text-[17px] leading-none font-semibold text-[#3a4553] hover:bg-[#dfe5ee] active:bg-azul active:text-white"
      >
        +
      </button>
    </div>
  );
}

/** El buscador. NO va en mayúsculas: es la excepción a la regla. */
export function Buscador({
  valor,
  alCambiar,
  placeholder,
  className = '',
}: {
  valor: string;
  alCambiar: (v: string) => void;
  placeholder: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-suave"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      >
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="M12.5 12.5 L17 17" strokeLinecap="round" />
      </svg>
      <input
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={placeholder}
        className="w-full cursor-text rounded-lg border border-[#d9dfe8] bg-white py-2.5 pr-3 pl-9 text-[14px] outline-none transition-colors select-text placeholder:text-[#a9b3c1] hover:border-[#c3ccda] focus:border-azul focus:ring-1 focus:ring-azul"
      />
    </div>
  );
}

export function Etiqueta({ children }: { children: ReactNode }): React.JSX.Element {
  return <label className="mb-1.5 block text-[12px] font-medium text-suave">{children}</label>;
}

/* ------------------------------------------------------------------ cajas */

export function Caja({
  titulo,
  children,
  className = '',
  acciones,
}: {
  titulo?: string;
  children: ReactNode;
  className?: string;
  acciones?: ReactNode;
}): React.JSX.Element {
  return (
    <section className={`rounded-xl border border-borde bg-white p-4 ${className}`}>
      {(titulo || acciones) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold">{titulo}</h2>}
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tarjeta({
  titulo,
  valor,
  pie,
  color,
  icono,
}: {
  titulo: string;
  valor: string | number;
  pie: string;
  color: string;
  icono: ReactNode;
}): React.JSX.Element {
  const anim = useAnimaciones();
  return (
    <motion.div
      whileHover={anim ? { y: -2 } : undefined}
      transition={{ duration: 0.15 }}
      className="min-w-0 flex-1 rounded-xl border border-borde bg-white p-3.5"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: `${color}1a`, color }}>
          {icono}
        </span>
        <span className="truncate text-[12px] font-medium text-suave">{titulo}</span>
      </div>
      <div className="mt-1.5 truncate text-[26px] leading-tight font-bold">{valor}</div>
      <div className="truncate text-[11px] text-suave">{pie}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------- tablas */

export interface Columna<T> {
  clave: string;
  titulo: string;
  ancho?: string;
  derecha?: boolean;
  render: (fila: T) => ReactNode;
}

/**
 * Tabla con estados de carga, vacío y filtrado sin resultados.
 *
 * NUNCA muestra una tabla en blanco sin explicación: es requisito de la
 * fase 3 y arregla algo que la versión Qt hacía a medias.
 */
export function Tabla<T>({
  columnas,
  filas,
  clave,
  cargando,
  vacio,
  sinResultados,
  seleccionada,
  alSeleccionar,
  alDobleClic,
  alto = '',
}: {
  columnas: Array<Columna<T>>;
  filas: T[];
  clave: (f: T) => string | number;
  cargando?: boolean;
  vacio?: { titulo: string; detalle: string };
  sinResultados?: { titulo: string; detalle: string };
  seleccionada?: string | number | null;
  alSeleccionar?: (f: T) => void;
  alDobleClic?: (f: T) => void;
  alto?: string;
}): React.JSX.Element {
  if (cargando) {
    return (
      <div className="overflow-hidden rounded-xl border border-borde bg-white p-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="mb-2 h-9 animate-pulse rounded-md bg-gris-cab"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    );
  }

  if (filas.length === 0) {
    const t = sinResultados ?? vacio ?? { titulo: 'Sin datos', detalle: '' };
    return (
      <div className="rounded-xl border border-borde bg-white px-6 py-10 text-center">
        <p className="font-semibold">{t.titulo}</p>
        {t.detalle && <p className="mt-1 text-[13px] text-suave">{t.detalle}</p>}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-borde bg-white ${alto}`}>
      <div className={`overflow-auto ${alto}`}>
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gris-cab text-left text-[12px] font-semibold text-suave">
              {columnas.map((c) => (
                <th
                  key={c.clave}
                  style={c.ancho ? { width: c.ancho } : undefined}
                  className={`px-3 py-2.5 whitespace-nowrap ${c.derecha ? 'text-right' : ''}`}
                >
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const k = clave(f);
              const sel = seleccionada !== undefined && seleccionada === k;
              return (
                <tr
                  key={k}
                  onClick={() => alSeleccionar?.(f)}
                  onDoubleClick={() => alDobleClic?.(f)}
                  className={`border-t border-separador transition-colors ${
                    alSeleccionar ? 'cursor-pointer' : ''
                  } ${sel ? 'bg-celeste' : 'hover:bg-[#f7f9fc]'}`}
                >
                  {columnas.map((c) => (
                    <td
                      key={c.clave}
                      className={`px-3 py-2 ${c.derecha ? 'text-right tabular-nums' : ''}`}
                    >
                      {c.render(f)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Etiqueta redondeada de color, como las de estado en la versión Qt. */
export function Pastilla({ children, clase }: { children: ReactNode; clase: string }): React.JSX.Element {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${clase}`}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- diálogo */

export function Dialogo({
  abierto,
  titulo,
  subtitulo,
  children,
  alCerrar,
  ancho = 'max-w-[560px]',
  pie,
}: {
  abierto: boolean;
  titulo: string;
  subtitulo?: ReactNode;
  children: ReactNode;
  alCerrar: () => void;
  ancho?: string;
  pie?: ReactNode;
}): React.JSX.Element {
  const anim = useAnimaciones();
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [abierto, alCerrar]);

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: anim ? 0.16 : 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) alCerrar();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
        >
          <motion.div
            initial={anim ? { opacity: 0, scale: 0.97, y: 6 } : false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={anim ? { opacity: 0, scale: 0.98, y: 4 } : undefined}
            transition={{ duration: anim ? 0.16 : 0, ease: [0.16, 1, 0.3, 1] }}
            className={`flex max-h-[88vh] w-full ${ancho} flex-col overflow-hidden rounded-2xl bg-gris-fondo shadow-2xl`}
          >
            <div className="border-b border-borde bg-white px-5 py-3.5">
              <h2 className="text-[19px] font-semibold tracking-tight">{titulo}</h2>
              {subtitulo && <div className="mt-0.5 text-[13px] text-suave">{subtitulo}</div>}
            </div>
            <div className="flex-1 overflow-auto p-5">{children}</div>
            {pie && (
              <div className="flex flex-wrap items-center gap-2 border-t border-borde bg-white px-5 py-3">
                {pie}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Confirmación con texto libre, para las acciones peligrosas. */
export function usarConfirmacion(): {
  pedir: (o: { titulo: string; texto: string; palabra?: string; tono?: Tono }) => Promise<boolean>;
  nodo: React.JSX.Element;
} {
  const [estado, setEstado] = useState<{
    titulo: string;
    texto: string;
    palabra?: string;
    tono?: Tono;
    resolver: (v: boolean) => void;
  } | null>(null);
  const [escrito, setEscrito] = useState('');

  const pedir = useMemo(
    () =>
      (o: { titulo: string; texto: string; palabra?: string; tono?: Tono }): Promise<boolean> => {
        setEscrito('');
        return new Promise<boolean>((resolver) => setEstado({ ...o, resolver }));
      },
    [],
  );

  const cerrar = (v: boolean): void => {
    estado?.resolver(v);
    setEstado(null);
  };

  const puede = !estado?.palabra || escrito.trim().toUpperCase() === estado.palabra;

  const nodo = (
    <Dialogo
      abierto={estado !== null}
      titulo={estado?.titulo ?? ''}
      alCerrar={() => cerrar(false)}
      ancho="max-w-[480px]"
      pie={
        <>
          <Boton tono="claro" onClick={() => cerrar(false)}>
            Cancelar
          </Boton>
          <div className="flex-1" />
          <Boton tono={estado?.tono ?? 'rojo'} onClick={() => cerrar(true)} disabled={!puede}>
            Continuar
          </Boton>
        </>
      }
    >
      <p className="text-[14px] whitespace-pre-wrap">{estado?.texto}</p>
      {estado?.palabra && (
        <div className="mt-4">
          <Etiqueta>
            Escriba <b>{estado.palabra}</b> para continuar
          </Etiqueta>
          <Campo valor={escrito} alCambiar={setEscrito} mayusculas autoFocus />
        </div>
      )}
    </Dialogo>
  );

  return { pedir, nodo };
}

/* ------------------------------------------------------------- avisos */

export type TipoAviso = 'ok' | 'err' | 'info';

const AVISO_CLASES: Record<TipoAviso, string> = {
  ok: 'bg-verde-clr text-[#14724a]',
  err: 'bg-coral-clr text-[#b3282c]',
  info: 'bg-ambar-clr text-ambar-osc',
};

export function Avisos({
  avisos,
}: {
  avisos: Array<{ id: number; texto: string; tipo: TipoAviso }>;
}): React.JSX.Element {
  const anim = useAnimaciones();
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-full max-w-[620px] -translate-x-1/2 flex-col gap-2 px-4">
      <AnimatePresence initial={false}>
        {avisos.map((a) => (
          <motion.div
            key={a.id}
            initial={anim ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={anim ? { opacity: 0, y: 6 } : undefined}
            transition={{ duration: anim ? 0.18 : 0 }}
            className={`pointer-events-auto rounded-lg px-4 py-3 text-[13px] font-semibold shadow-lg ${AVISO_CLASES[a.tipo]}`}
          >
            <span className="whitespace-pre-wrap">{a.texto}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Debounce simple para los buscadores. */
export function useDebounce<T>(valor: T, ms = 180): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** Combo de búsqueda de artículo, con lista filtrada. */
export function ComboArticulo({
  articulos,
  valor,
  alElegir,
  placeholder = 'Escriba parte del nombre del artículo…',
}: {
  articulos: Array<{ id: number; codigo: string; nombre: string; unidad: string }>;
  valor: number | null;
  alElegir: (id: number | null) => void;
  placeholder?: string;
}): React.JSX.Element {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const elegido = articulos.find((a) => a.id === valor) ?? null;

  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);

  const sinTildes = (s: string): string =>
    s.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();

  const filtradas = useMemo(() => {
    const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return articulos.slice(0, 60);
    return articulos
      .filter((a) => {
        const blob = sinTildes(`${a.codigo} ${a.nombre} ${a.unidad}`);
        return palabras.every((p) => blob.includes(p));
      })
      .slice(0, 60);
  }, [articulos, texto]);

  return (
    <div ref={caja} className="relative">
      <input
        value={abierto ? texto : elegido ? `${elegido.codigo} | ${elegido.nombre}  ·  ${elegido.unidad}` : texto}
        placeholder={placeholder}
        onFocus={() => {
          setAbierto(true);
          setTexto('');
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (elegido) alElegir(null);
        }}
        className="w-full cursor-text rounded-lg border border-[#d9dfe8] bg-white px-3 py-2.5 text-[14px] outline-none transition-colors select-text placeholder:text-[#a9b3c1] hover:border-[#c3ccda] focus:border-azul focus:ring-1 focus:ring-azul"
      />
      {abierto && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1 max-h-[260px] overflow-auto rounded-lg border border-borde bg-white py-1 shadow-xl">
          {filtradas.length === 0 && (
            <div className="px-3 py-2.5 text-[13px] text-suave">Ningún artículo coincide.</div>
          )}
          {filtradas.map((a) => (
            <button
              key={a.id}
              onMouseDown={(e) => {
                e.preventDefault();
                alElegir(a.id);
                setAbierto(false);
                setTexto('');
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-[13px] hover:bg-celeste"
            >
              <span className="font-medium">{a.codigo}</span> | {a.nombre}
              <span className="text-suave"> · {a.unidad}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
