/* ---------------------------------------------------------------------------
 * Búsqueda general (Ctrl+B). Port de `DlgBusquedaGlobal` de `sfida_dialogos.py`.
 *
 * Busca a la vez en artículos, boletas y vales. Exige 2 letras mínimo.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type { ClavePagina, DestinoExtra } from '../App';
import { useApp } from '../estado/app';
import { Buscador, Dialogo, dmy, fmtNum, useDebounce } from '../ui/base';
import { Icono, type NombreIcono } from '../ui/iconos';

interface Resultado {
  id: string;
  icono: NombreIcono;
  color: string;
  titulo: string;
  detalle: string;
  destino: ClavePagina;
  extra: DestinoExtra;
}

export function DlgBusquedaGlobal({
  abierto,
  alCerrar,
  irA,
}: {
  abierto: boolean;
  alCerrar: () => void;
  irA: (d: ClavePagina, e?: DestinoExtra) => void;
}): React.JSX.Element {
  const { pedir } = useApp();
  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto, 160);
  const [resultados, setResultados] = useState<Resultado[]>([]);

  useEffect(() => {
    if (!abierto) setTexto('');
  }, [abierto]);

  const suficiente = busqueda.trim().length >= 2;

  useEffect(() => {
    if (!abierto || !suficiente) {
      setResultados([]);
      return;
    }
    let vivo = true;
    void (async () => {
      const t = busqueda.trim();
      const [arts, ings, sals] = await Promise.all([
        pedir(window.sfida.articulos.stock(t)),
        pedir(window.sfida.ingresos.listar()),
        pedir(window.sfida.salidas.listar()),
      ]);
      if (!vivo) return;

      const sin = (s: string): string => s.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
      const palabras = sin(t).split(/\s+/).filter(Boolean);
      const coincide = (...campos: string[]): boolean => {
        const blob = sin(campos.join(' '));
        return palabras.every((p) => blob.includes(p));
      };

      const out: Resultado[] = [];
      for (const a of (arts ?? []).slice(0, 12)) {
        out.push({
          id: `a${a.id}`,
          icono: 'caja',
          color: '#2f6fed',
          titulo: `${a.codigo} | ${a.nombre}`,
          detalle: `Artículo · stock: ${fmtNum(a.stock)} ${a.unidad}`,
          destino: 'stock',
          extra: { tipo: 'seleccionar', id: a.id },
        });
      }
      for (const i of (ings ?? []).slice(0, 40)) {
        if (!coincide(i.nro_documento, i.proveedor ?? '', i.tipo_doc)) continue;
        out.push({
          id: `i${i.id}`,
          icono: 'entrada',
          color: '#22a06b',
          titulo: `${i.tipo_doc} ${i.nro_documento}`,
          detalle: `Ingreso · ${i.proveedor || '-'} · ${dmy(i.fecha)}`,
          destino: 'ingresos',
          extra: { tipo: 'seleccionar', id: i.id },
        });
      }
      for (const s of (sals ?? []).slice(0, 40)) {
        if (!coincide(s.nro_vale, s.sucursal, s.recibido_por ?? '')) continue;
        out.push({
          id: `s${s.id}`,
          icono: 'salida',
          color: '#2f6fed',
          titulo: `Vale ${s.nro_vale}`,
          detalle: `Salida · ${s.sucursal} · ${dmy(s.fecha)}`,
          destino: 'salidas',
          extra: { tipo: 'seleccionar', id: s.id },
        });
      }
      setResultados(out);
    })();
    return () => {
      vivo = false;
    };
  }, [abierto, busqueda, suficiente, pedir]);

  const mensaje = useMemo(() => {
    if (!suficiente) return 'Escriba al menos 2 letras…';
    if (resultados.length === 0) return `Sin resultados para «${busqueda.trim()}»`;
    return null;
  }, [suficiente, resultados, busqueda]);

  return (
    <Dialogo abierto={abierto} titulo="Búsqueda general" alCerrar={alCerrar} ancho="max-w-[700px]">
      <p className="mb-3 text-[13px] text-suave">
        Escriba un artículo, un número de boleta, un proveedor, un vale o una sucursal.
      </p>
      <Buscador valor={texto} alCambiar={setTexto} placeholder="Ej. papel, B001-4521, tienda norte…" />

      <div className="mt-3 max-h-[46vh] overflow-auto rounded-lg border border-borde bg-white">
        {mensaje ? (
          <div className="px-4 py-8 text-center text-[13px] text-suave">{mensaje}</div>
        ) : (
          resultados.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                irA(r.destino, r.extra);
                alCerrar();
              }}
              className="flex w-full cursor-pointer items-center gap-3 border-b border-separador px-4 py-2.5 text-left last:border-0 hover:bg-celeste"
            >
              <span className="shrink-0" style={{ color: r.color }}>
                <Icono nombre={r.icono} tam={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{r.titulo}</span>
                <span className="block truncate text-[12px] text-suave">{r.detalle}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </Dialogo>
  );
}
