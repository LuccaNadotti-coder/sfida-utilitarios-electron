/* ---------------------------------------------------------------------------
 * El chasis: barra lateral, encabezado, transición entre pantallas y avisos.
 *
 * La transición sigue el orden del menú: bajando la página nueva entra por la
 * derecha, subiendo por la izquierda. 220 ms con curva de salida suave, igual
 * que `transicion_paginas()` en la versión Qt.
 * ------------------------------------------------------------------------- */
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ProveedorApp, useApp } from './estado/app';
import { ProveedorAnimaciones, useAnimaciones } from './estado/animaciones';
import { DlgBusquedaGlobal } from './dialogos/BusquedaGlobal';
import { PaginaIngresos } from './paginas/Ingresos';
import { PaginaMaestro } from './paginas/Maestro';
import { PaginaPanel } from './paginas/Panel';
import { PaginaReportes } from './paginas/Reportes';
import { PaginaSalidas } from './paginas/Salidas';
import { PaginaStock } from './paginas/Stock';
import { PaginaSucursales } from './paginas/Sucursales';
import { Avisos } from './ui/base';
import { Icono, type NombreIcono } from './ui/iconos';

export type ClavePagina =
  | 'panel' | 'stock' | 'ingresos' | 'salidas' | 'sucursales' | 'reportes' | 'maestro';

/** Mismo orden y mismos textos que el `MENU` de `SFIDA.py`. */
const MENU: Array<{
  clave: ClavePagina;
  menu: string;
  titulo: string;
  subtitulo: string;
  icono: NombreIcono;
}> = [
  { clave: 'panel', menu: 'Panel', titulo: 'Panel de control', subtitulo: 'Resumen del almacén al día de hoy', icono: 'panel' },
  { clave: 'stock', menu: 'Artículos y stock', titulo: 'Artículos y stock', subtitulo: 'Todo lo que hay en el almacén', icono: 'caja' },
  { clave: 'ingresos', menu: 'Ingresos (boletas)', titulo: 'Ingresos por boleta', subtitulo: 'Mercadería que entra al almacén', icono: 'entrada' },
  { clave: 'salidas', menu: 'Salidas a sucursal', titulo: 'Salidas a sucursal', subtitulo: 'Reparto de mercadería a los locales', icono: 'salida' },
  { clave: 'sucursales', menu: 'Sucursales', titulo: 'Sucursales', subtitulo: 'Locales a los que se reparte la mercadería', icono: 'tienda' },
  { clave: 'reportes', menu: 'Reportes', titulo: 'Reportes', subtitulo: 'Consumo por sucursal, kardex, ranking e historial de precios', icono: 'reporte' },
  { clave: 'maestro', menu: 'Control Maestro', titulo: 'Control Maestro', subtitulo: 'Sección restringida: solo con contraseña', icono: 'candado' },
];

const ORDEN = MENU.map((m) => m.clave);

export function App(): React.JSX.Element {
  return (
    <ProveedorAnimaciones>
      <ProveedorApp>
        <Chasis />
      </ProveedorApp>
    </ProveedorAnimaciones>
  );
}

/** Navegación con un dato extra (ir a un artículo, a un vale...). */
export interface DestinoExtra {
  tipo: 'kardex' | 'precios' | 'seleccionar';
  id: number;
}

function Chasis(): React.JSX.Element {
  const { avisos, setMaestroAbierto } = useApp();
  const anim = useAnimaciones();
  const [pagina, setPagina] = useState<ClavePagina>('panel');
  const [direccion, setDireccion] = useState(1);
  const [extra, setExtra] = useState<DestinoExtra | null>(null);
  const [buscando, setBuscando] = useState(false);

  const irA = useCallback(
    (destino: ClavePagina, conExtra?: DestinoExtra) => {
      setPagina((actual) => {
        setDireccion(ORDEN.indexOf(destino) >= ORDEN.indexOf(actual) ? 1 : -1);
        // El Control Maestro se vuelve a bloquear al salir de la sección.
        if (actual === 'maestro' && destino !== 'maestro') setMaestroAbierto(false);
        return destino;
      });
      setExtra(conExtra ?? null);
    },
    [setMaestroAbierto],
  );

  // Atajos: Ctrl+B / Ctrl+F búsqueda, Ctrl+1..7 secciones.
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.ctrlKey && (e.key === 'b' || e.key === 'f')) {
        e.preventDefault();
        setBuscando(true);
        return;
      }
      if (e.ctrlKey && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        irA(ORDEN[Number(e.key) - 1]!);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [irA]);

  const actual = MENU.find((m) => m.clave === pagina)!;

  return (
    <div className="flex h-full overflow-hidden">
      <BarraLateral pagina={pagina} irA={irA} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-4 border-b border-borde bg-white px-6 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-[21px] leading-tight font-semibold tracking-tight">
              {actual.titulo}
            </h1>
            <p className="truncate text-[13px] text-suave">{actual.subtitulo}</p>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setBuscando(true)}
            title="Buscar en todo el sistema (Ctrl+B)"
            className="flex max-w-[320px] min-w-[210px] cursor-pointer items-center gap-2 rounded-lg border border-[#d9dfe8] bg-white px-3 py-2 text-[13px] text-suave transition-colors hover:border-[#c3ccda]"
          >
            <Icono nombre="buscar" tam={16} />
            <span className="truncate">Buscar en todo el sistema</span>
            <span className="ml-auto shrink-0 rounded bg-separador px-1.5 py-0.5 text-[10px] font-semibold">
              Ctrl+B
            </span>
          </button>
          <span className="shrink-0 text-[13px] text-suave">
            {new Date().toLocaleDateString('es-PE')}
          </span>
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={direccion}>
            <motion.div
              key={pagina}
              custom={direccion}
              initial={anim ? { opacity: 0, x: direccion * 34 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={anim ? { opacity: 0, x: direccion * -34 } : undefined}
              // 220 ms y curva de salida suave, igual que la versión Qt.
              transition={{ duration: anim ? 0.22 : 0, ease: [0.33, 1, 0.68, 1] }}
              className="absolute inset-0 overflow-auto"
            >
              <Pagina clave={pagina} irA={irA} extra={extra} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Avisos avisos={avisos} />
      <DlgBusquedaGlobal abierto={buscando} alCerrar={() => setBuscando(false)} irA={irA} />
    </div>
  );
}

function Pagina({
  clave,
  irA,
  extra,
}: {
  clave: ClavePagina;
  irA: (d: ClavePagina, e?: DestinoExtra) => void;
  extra: DestinoExtra | null;
}): React.JSX.Element {
  switch (clave) {
    case 'panel':
      return <PaginaPanel irA={irA} />;
    case 'stock':
      return <PaginaStock irA={irA} extra={extra} />;
    case 'ingresos':
      return <PaginaIngresos extra={extra} />;
    case 'salidas':
      return <PaginaSalidas extra={extra} />;
    case 'sucursales':
      return <PaginaSucursales />;
    case 'reportes':
      return <PaginaReportes extra={extra} />;
    case 'maestro':
      return <PaginaMaestro />;
  }
}

/* ---------------------------------------------------------- barra lateral */

function BarraLateral({
  pagina,
  irA,
}: {
  pagina: ClavePagina;
  irA: (d: ClavePagina) => void;
}): React.JSX.Element {
  const anim = useAnimaciones();
  const [rutaBd, setRutaBd] = useState('');
  const [version, setVersion] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);
  const [pastilla, setPastilla] = useState<{ top: number; alto: number } | null>(null);
  const refs = useRef(new Map<ClavePagina, HTMLButtonElement>());

  useEffect(() => {
    void window.sfida.sistema.infoBaseDatos().then((r) => {
      if (r.ok) {
        setRutaBd(r.datos.ruta);
        setVersion(r.datos.versionApp);
      }
    });
  }, []);

  // La pastilla se posiciona midiendo el botón activo. useLayoutEffect para
  // que no se vea un salto en el primer pintado.
  useLayoutEffect(() => {
    const b = refs.current.get(pagina);
    const cont = contenedor.current;
    if (!b || !cont) return;
    setPastilla({ top: b.offsetTop, alto: b.offsetHeight });
  }, [pagina]);

  return (
    <aside className="flex w-[238px] shrink-0 flex-col bg-lateral">
      <div className="px-5 pt-5 pb-4">
        <div className="text-[23px] leading-none font-bold text-white">SFIDA</div>
        <div className="mt-1 text-[12px] text-lateral-txt">Control de útiles</div>
      </div>

      <nav ref={contenedor} className="relative px-3">
        {pastilla && (
          <motion.div
            className="absolute right-3 left-3 rounded-lg bg-coral"
            initial={false}
            animate={{ top: pastilla.top, height: pastilla.alto }}
            transition={anim ? { duration: 0.22, ease: [0.33, 1, 0.68, 1] } : { duration: 0 }}
          />
        )}
        {MENU.map((m, i) => {
          const activo = m.clave === pagina;
          return (
            <button
              key={m.clave}
              // `data-pagina` lo usa el modo captura para recorrer las
              // pantallas sin depender del texto visible.
              data-pagina={m.clave}
              ref={(el) => {
                if (el) refs.current.set(m.clave, el);
              }}
              onClick={() => irA(m.clave)}
              className={`relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors ${
                activo ? 'font-semibold text-white' : 'text-lateral-txt hover:bg-lateral-hov hover:text-white'
              } ${i === 6 ? 'mt-3' : ''}`}
            >
              <span className="shrink-0">
                <Icono nombre={m.icono} tam={19} />
              </span>
              <span className="truncate">{m.menu}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />
      <div className="px-5 py-3 text-[11px] text-[#6d7f99]" title={rutaBd}>
        SFIDA v{version}
        <br />
        Base de datos local
      </div>
    </aside>
  );
}
