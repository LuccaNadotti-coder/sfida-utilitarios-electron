/* ---------------------------------------------------------------------------
 * Artículos y stock. Port de `StockPage` de `sfida_paginas.py`.
 *
 * En la v5 se le sumaron dos pestañas: «Qué comprar» y «Conteo físico». Viven
 * acá y no en Reportes porque son tareas del almacén, no informes para leer.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type { Categoria, FilaStock } from '../../../compartido/contrato';
import type { ClavePagina, DestinoExtra } from '../App';
import { DlgAjuste } from '../dialogos/Ajuste';
import { DlgArticulo } from '../dialogos/Articulo';
import { useApp } from '../estado/app';
import { PanelComprar } from './Comprar';
import { PanelConteo } from './Conteo';
import {
  Boton,
  Buscador,
  Caja,
  Chips,
  POR_PAGINA,
  Pastilla,
  Selector,
  Tabla,
  categoriaCorta,
  dmy,
  estadoStock,
  fmtNum,
  fmtPrecio,
  usarConfirmacion,
  useDebounce,
} from '../ui/base';

type Modo = 'todos' | 'bajo' | 'sin';
type Seccion = 'articulos' | 'comprar' | 'conteo';

export function PaginaStock({
  irA,
  extra,
}: {
  irA: (d: ClavePagina, e?: DestinoExtra) => void;
  extra: DestinoExtra | null;
}): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const { pedir: confirmar, nodo: dlgConfirmar } = usarConfirmacion();
  const [seccion, setSeccion] = useState<Seccion>('articulos');
  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [categoria, setCategoria] = useState<number | 0>(0);
  const [modo, setModo] = useState<Modo>('todos');
  const [cats, setCats] = useState<Categoria[]>([]);
  const [filas, setFilas] = useState<FilaStock[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<number | null>(extra?.id ?? null);
  const [editando, setEditando] = useState<number | null | undefined>(undefined);
  const [ajustando, setAjustando] = useState<number | null>(null);

  useEffect(() => {
    void pedir(window.sfida.catalogos.categorias()).then((c) => setCats(c ?? []));
  }, [pedir]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await pedir(
        window.sfida.articulos.stock(busqueda, categoria || null, modo === 'bajo'),
      );
      if (!vivo) return;
      let lista = r ?? [];
      // «Sin stock» se filtra en memoria, igual que en la versión Qt.
      if (modo === 'sin') lista = lista.filter((f) => Number(f.stock) <= 0);
      setFilas(lista);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [pedir, busqueda, categoria, modo, refrescos]);

  const opcionesCat = useMemo(
    () => [{ id: 0, texto: 'Todas las categorías' }, ...cats.map((c) => ({ id: c.id, texto: c.nombre }))],
    [cats],
  );

  const conSeleccion = (fn: (id: number) => void): void => {
    if (!sel) {
      avisar('Seleccione primero un artículo de la lista.', 'info');
      return;
    }
    fn(sel);
  };

  async function exportar(): Promise<void> {
    const cabeceras = [
      'Código', 'Artículo', 'Categoría', 'Unidad', 'Stock', 'Mínimo', 'Último precio', 'Fecha del precio',
    ];
    const datos = filas.map((f) => [
      f.codigo, f.nombre, f.categoria ?? '', f.unidad,
      fmtNum(f.stock), fmtNum(f.stock_minimo),
      f.ultimo_precio ? f.ultimo_precio.toFixed(2) : '',
      f.ultima_fecha ?? '',
    ]);
    const r = await pedir(window.sfida.reportes.exportar('stock_actual', cabeceras, datos));
    if (r) avisar(`Archivo guardado: ${r}`, 'ok');
  }

  /**
   * Da de baja el artículo seleccionado.
   *
   * No siempre borra: si el artículo tiene movimientos, el núcleo lo DESACTIVA
   * para no romper el kardex. Por eso el botón se llama «Desactivar» y el
   * mensaje cuenta cuál de las dos cosas pasó. Los desactivados se vuelven a
   * habilitar desde Control Maestro → Artículos desactivados.
   */
  async function desactivar(id: number): Promise<void> {
    const art = filas.find((f) => f.id === id);
    const ok = await confirmar({
      titulo: 'Desactivar el artículo',
      texto:
        `¿Desactivar «${art?.nombre ?? ''}» (${art?.codigo ?? ''})?\n\n` +
        'Deja de aparecer en ingresos, egresos y en esta lista. Si ya tiene ' +
        'movimientos NO se borra: se guarda desactivado para no perder el ' +
        'historial, y se puede volver a activar desde Control Maestro.',
    });
    if (!ok) return;
    const r = await pedir(window.sfida.articulos.eliminar(id));
    if (r === null) return;
    avisar(
      r === 'eliminado'
        ? 'El artículo no tenía movimientos: se borró.'
        : 'Artículo desactivado. Podés volver a activarlo desde Control Maestro.',
      'ok',
    );
    setSel(null);
    refrescarTodo();
  }

  async function importar(): Promise<void> {
    const r = await pedir(window.sfida.articulos.importarCsv());
    if (!r) return;
    let msg = `Artículos nuevos: ${r.nuevos}. Actualizados: ${r.actualizados}.`;
    if (r.errores.length) msg += `\nFilas con problemas:\n${r.errores.slice(0, 6).join('\n')}`;
    avisar(msg, r.errores.length ? 'info' : 'ok');
    refrescarTodo();
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <Chips
        valor={seccion}
        alElegir={setSeccion}
        opciones={[
          { id: 'articulos', texto: 'Artículos y stock' },
          { id: 'comprar', texto: 'Qué comprar' },
          { id: 'conteo', texto: 'Conteo físico' },
        ]}
      />

      {seccion === 'comprar' && <PanelComprar />}
      {seccion === 'conteo' && <PanelConteo />}

      {seccion === 'articulos' && (
        <>
        <Caja>
          <div className="flex flex-wrap items-center gap-3">
            <Buscador
              valor={texto}
              alCambiar={setTexto}
              placeholder="Buscar por nombre, código o categoría…"
              className="min-w-[280px] flex-1"
            />
            <Selector valor={categoria} alCambiar={setCategoria} opciones={opcionesCat} className="w-[200px]" />
            <Chips
              valor={modo}
              alElegir={setModo}
              opciones={[
                { id: 'todos', texto: 'Todos' },
                { id: 'bajo', texto: 'Bajo el mínimo' },
                { id: 'sin', texto: 'Sin stock' },
              ]}
            />
            <div className="flex-1" />
            <Boton tono="verde" onClick={() => setEditando(null)}>
              Nuevo artículo
            </Boton>
          </div>
        </Caja>

        <Tabla
          columnas={[
            { clave: 'codigo', titulo: 'Código', ancho: '100px', render: (f: FilaStock) => <span className="font-medium">{f.codigo}</span> },
            { clave: 'nombre', titulo: 'Artículo', render: (f) => f.nombre },
            { clave: 'cat', titulo: 'Categoría', ancho: '105px', render: (f) => <span className="text-suave">{categoriaCorta(f.categoria)}</span> },
            { clave: 'uni', titulo: 'Unidad', ancho: '75px', render: (f) => <span className="text-suave">{f.unidad}</span> },
            { clave: 'stock', titulo: 'Stock', ancho: '80px', derecha: true, render: (f) => fmtNum(f.stock) },
            { clave: 'min', titulo: 'Mínimo', ancho: '80px', derecha: true, render: (f) => <span className="text-suave">{fmtNum(f.stock_minimo)}</span> },
            {
              clave: 'estado', titulo: 'Estado', ancho: '115px',
              render: (f) => {
                const [txt, clase] = estadoStock(f.stock, f.stock_minimo);
                return <Pastilla clase={clase}>{txt}</Pastilla>;
              },
            },
            { clave: 'precio', titulo: 'Último precio', ancho: '120px', derecha: true, render: (f) => fmtPrecio(f.ultimo_precio) },
            { clave: 'fecha', titulo: 'Fecha', ancho: '105px', render: (f) => <span className="text-suave">{f.ultimo_precio ? dmy(f.ultima_fecha) : '—'}</span> },
          ]}
          filas={filas}
          clave={(f) => f.id}
          cargando={cargando}
          // De a 10: con el catálogo entero en pantalla, cada tecla del
          // buscador volvía a dibujar cientos de filas y se sentía trabado.
          porPagina={POR_PAGINA}
          seleccionada={sel}
          alSeleccionar={(f) => setSel(f.id)}
          alDobleClic={(f) => setEditando(f.id)}
          vacio={{ titulo: 'Todavía no hay artículos', detalle: 'Usá «Nuevo artículo» o importá una lista desde Excel.' }}
          sinResultados={
            texto || categoria || modo !== 'todos'
              ? { titulo: 'Ningún artículo coincide', detalle: 'Probá con otra palabra, otra categoría u otro filtro.' }
              : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-suave">
            {filas.length} {filas.length === 1 ? 'artículo' : 'artículos'}
          </span>
          <div className="flex-1" />
          <Boton tono="claro" onClick={() => conSeleccion((id) => setEditando(id))}>Editar</Boton>
          <Boton tono="ambar" onClick={() => conSeleccion((id) => setAjustando(id))}>Ajustar stock</Boton>
          <Boton tono="rojo" onClick={() => conSeleccion((id) => void desactivar(id))}>Desactivar</Boton>
          <Boton tono="claro" onClick={() => conSeleccion((id) => irA('reportes', { tipo: 'kardex', id }))}>Ver kardex</Boton>
          <Boton tono="claro" onClick={() => conSeleccion((id) => irA('reportes', { tipo: 'precios', id }))}>Ver precios</Boton>
          <Boton tono="claro" onClick={importar}>Importar de Excel</Boton>
          <Boton tono="claro" onClick={async () => {
            const r = await pedir(window.sfida.articulos.plantillaCsv());
            if (r) avisar(`Plantilla guardada en ${r}. Llenala en Excel y usá «Importar de Excel».`, 'ok');
          }}>Plantilla de carga</Boton>
          <Boton tono="claro" onClick={exportar}>Exportar</Boton>
        </div>
        </>
      )}

      <DlgArticulo
        abierto={editando !== undefined}
        artId={editando ?? null}
        alCerrar={(cambio) => {
          setEditando(undefined);
          if (cambio) refrescarTodo();
        }}
      />
      <DlgAjuste
        abierto={ajustando !== null}
        artId={ajustando}
        alCerrar={(cambio) => {
          setAjustando(null);
          if (cambio) refrescarTodo();
        }}
      />
      {dlgConfirmar}
    </div>
  );
}
