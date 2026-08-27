/* ---------------------------------------------------------------------------
 * Sucursales. Port de `SucursalPage` de `sfida_paginas.py`.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type { SucursalConTotales } from '../../../compartido/contrato';
import { DlgSucursal } from '../dialogos/Sucursal';
import { useApp } from '../estado/app';
import { Boton, Buscador, Caja, POR_PAGINA, Tabla, dmy, fmtNum, useDebounce } from '../ui/base';

export function PaginaSucursales(): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [filas, setFilas] = useState<SucursalConTotales[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void pedir(window.sfida.sucursales.listar()).then((s) => {
      if (!vivo) return;
      setFilas(s ?? []);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [pedir, refrescos]);

  // Filtro tolerante a tildes, como `coincide()`.
  const visibles = useMemo(() => {
    const sin = (s: string): string => s.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
    const palabras = sin(busqueda).split(/\s+/).filter(Boolean);
    if (!palabras.length) return filas;
    return filas.filter((s) => {
      const blob = sin(`${s.codigo} ${s.nombre} ${s.responsable ?? ''}`);
      return palabras.every((p) => blob.includes(p));
    });
  }, [filas, busqueda]);

  return (
    <div className="flex flex-col gap-4 p-5">
      <Caja>
        <div className="flex flex-wrap items-center gap-3">
          <Buscador valor={texto} alCambiar={setTexto} placeholder="Buscar sucursal…" className="min-w-[260px] flex-1" />
          <Boton tono="claro" onClick={() => (sel ? setEditando(sel) : avisar('Seleccione una sucursal.', 'info'))}>
            Editar
          </Boton>
          <Boton tono="verde" onClick={() => setEditando(null)}>Nueva sucursal</Boton>
        </div>
      </Caja>

      <Tabla
        columnas={[
          { clave: 'cod', titulo: 'Código', ancho: '95px', render: (s: SucursalConTotales) => <span className="font-medium">{s.codigo}</span> },
          { clave: 'nom', titulo: 'Sucursal', ancho: '210px', render: (s) => s.nombre },
          { clave: 'dir', titulo: 'Dirección', render: (s) => s.direccion || '-' },
          { clave: 'resp', titulo: 'Responsable', ancho: '175px', render: (s) => s.responsable || '-' },
          { clave: 'vales', titulo: 'Vales', ancho: '80px', derecha: true, render: (s) => s.vales },
          { clave: 'und', titulo: 'Unidades recibidas', ancho: '155px', derecha: true, render: (s) => fmtNum(s.unidades) },
          { clave: 'ult', titulo: 'Último reparto', ancho: '135px', render: (s) => (s.ultimo_reparto ? dmy(s.ultimo_reparto) : '—') },
        ]}
        filas={visibles}
        clave={(s) => s.id}
        cargando={cargando}
        seleccionada={sel}
        alSeleccionar={(s) => setSel(s.id)}
        alDobleClic={(s) => setEditando(s.id)}
        vacio={{ titulo: 'Todavía no hay sucursales', detalle: 'Cargá la primera con «Nueva sucursal». Sin sucursales no se pueden registrar egresos.' }}
        sinResultados={texto ? { titulo: 'Ninguna sucursal coincide', detalle: 'Probá con otro código, nombre o responsable.' } : undefined}
        porPagina={POR_PAGINA}
      />

      <DlgSucursal
        abierto={editando !== undefined}
        sucId={editando ?? null}
        alCerrar={(c) => {
          setEditando(undefined);
          if (c) refrescarTodo();
        }}
      />
    </div>
  );
}
