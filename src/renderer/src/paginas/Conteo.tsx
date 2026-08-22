/* ---------------------------------------------------------------------------
 * Conteo físico guiado. Nuevo en la v5.
 *
 * Antes había que ajustar artículo por artículo, cada uno con su diálogo. Con
 * 200 artículos eso es una tarde entera y un montón de oportunidades de cerrar
 * el diálogo equivocado.
 *
 * Acá se recorre la lista con el papel del conteo al lado, se escribe lo que
 * hay de verdad, y al final se guarda TODO junto. La diferencia se ve mientras
 * se escribe, así que si alguien se equivoca de renglón lo nota antes de
 * guardar.
 *
 * Dos decisiones importantes:
 *   - Lo que NO se toca no se ajusta. Un campo vacío significa «no lo conté»,
 *     no «hay cero». Confundir esas dos cosas vaciaría el almacén.
 *   - Se guarda todo o nada (una sola transacción en el núcleo). Si un renglón
 *     dejara el stock negativo, no entra ninguno: no hay forma de quedar a
 *     medio camino sin saber dónde.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type { Categoria, FilaStock } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import {
  Boton,
  Buscador,
  Caja,
  Campo,
  Chips,
  Etiqueta,
  Selector,
  Tabla,
  Tarjeta,
  fmtNum,
  usarConfirmacion,
  useDebounce,
} from '../ui/base';
import { Icono } from '../ui/iconos';

const MOTIVOS = [
  'INVENTARIO FÍSICO',
  'MERMA O DETERIORO',
  'ERROR DE DIGITACIÓN',
  'PÉRDIDA',
  'DEVOLUCIÓN DE SUCURSAL',
];

type Vista = 'todos' | 'contados' | 'diferencias';

export function PanelConteo(): React.JSX.Element {
  const { pedir, avisar, refrescarTodo, refrescos } = useApp();
  const { pedir: confirmar, nodo: nodoConfirmacion } = usarConfirmacion();

  const [texto, setTexto] = useState('');
  const busqueda = useDebounce(texto);
  const [categoria, setCategoria] = useState('');
  const [vista, setVista] = useState<Vista>('todos');
  const [cats, setCats] = useState<Categoria[]>([]);
  const [filas, setFilas] = useState<FilaStock[]>([]);
  const [cargando, setCargando] = useState(true);
  const [motivo, setMotivo] = useState(MOTIVOS[0]!);

  /** Lo contado, por artículo. Texto y no número: «» ≠ «0». */
  const [contado, setContado] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void pedir(window.sfida.catalogos.categorias()).then((c) => setCats(c ?? []));
  }, [pedir]);

  // Se pide SIEMPRE el catálogo completo, sin filtrar, y el filtro se aplica
  // solo para mostrar. Si se filtrara acá, cambiar de categoría a mitad del
  // conteo sacaría de `filas` los artículos ya contados y al guardar se
  // perderían sin que nadie lo note.
  useEffect(() => {
    setCargando(true);
    void pedir(window.sfida.articulos.stock('', null, false)).then((r) => {
      setFilas(r ?? []);
      setCargando(false);
    });
  }, [pedir, refrescos]);

  const opcionesCat = useMemo(
    () => [{ id: '', texto: 'Todas las categorías' }, ...cats.map((c) => ({ id: c.nombre, texto: c.nombre }))],
    [cats],
  );

  /** La diferencia de un artículo, o null si todavía no se contó. */
  const difDe = (f: FilaStock): number | null => {
    const t = (contado[f.id] ?? '').trim();
    if (t === '') return null;
    const n = Number(t.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    return n - Number(f.stock);
  };

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (categoria && f.categoria !== categoria) return false;
      if (t && !`${f.codigo} ${f.nombre}`.toLowerCase().includes(t)) return false;
      const d = difDe(f);
      if (vista === 'contados' && d === null) return false;
      if (vista === 'diferencias' && (d === null || Math.abs(d) < 0.0001)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, busqueda, categoria, vista, contado]);

  const resumen = useMemo(() => {
    let contados = 0;
    let sobran = 0;
    let faltan = 0;
    let negativos = 0;
    for (const f of filas) {
      const d = difDe(f);
      if (d === null) continue;
      contados += 1;
      if (d > 0.0001) sobran += 1;
      else if (d < -0.0001) faltan += 1;
      if (Number(f.stock) + d < -0.0001) negativos += 1;
    }
    return { contados, sobran, faltan, negativos, conDiferencia: sobran + faltan };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, contado]);

  async function guardar(): Promise<void> {
    const lista = filas
      .map((f) => ({ f, d: difDe(f) }))
      .filter((x) => x.d !== null)
      .map((x) => ({ articuloId: x.f.id, contado: Number((contado[x.f.id] ?? '').replace(',', '.')) }));

    if (lista.length === 0) {
      return avisar('Todavía no cargaste ningún conteo.', 'info');
    }

    const ok = await confirmar({
      titulo: 'Aplicar el conteo físico',
      texto:
        `Se van a ajustar ${resumen.conDiferencia} ` +
        `${resumen.conDiferencia === 1 ? 'artículo' : 'artículos'} ` +
        `(de ${lista.length} contados). Los que coinciden no generan ajuste.\n\n` +
        'Cada ajuste queda registrado con su motivo y se puede ver en el kardex.',
      tono: 'ambar',
    });
    if (!ok) return;

    setGuardando(true);
    const r = await pedir(window.sfida.maestro.conteoFisico(lista, motivo));
    setGuardando(false);
    if (!r) return;

    setContado({});
    avisar(
      r.aplicados === 0
        ? 'Todo coincidía con el sistema: no hizo falta ajustar nada.'
        : `Listo: ${r.aplicados} ${r.aplicados === 1 ? 'artículo ajustado' : 'artículos ajustados'}` +
          (r.sinCambio ? ` y ${r.sinCambio} que ya estaban bien.` : '.'),
      'ok',
    );
    refrescarTodo();
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
            <Etiqueta>Categoría</Etiqueta>
            <Selector valor={categoria} alCambiar={setCategoria} opciones={opcionesCat} />
          </div>
          <div className="w-[230px]">
            <Etiqueta>Motivo del ajuste</Etiqueta>
            <Selector
              valor={motivo}
              alCambiar={setMotivo}
              opciones={MOTIVOS.map((m) => ({ id: m, texto: m }))}
            />
          </div>
          <Chips
            valor={vista}
            alElegir={setVista}
            opciones={[
              { id: 'todos', texto: 'Todos' },
              { id: 'contados', texto: 'Ya contados' },
              { id: 'diferencias', texto: 'Con diferencia' },
            ]}
          />
        </div>
      </Caja>

      <div className="flex flex-wrap gap-3">
        <Tarjeta
          orden={0}
          titulo="Contados"
          valor={`${resumen.contados} / ${filas.length}`}
          pie="los vacíos no se tocan"
          color="#2f6fed"
          icono={<Icono nombre="contar" tam={15} />}
        />
        <Tarjeta
          orden={1}
          titulo="Sobra mercadería"
          valor={resumen.sobran}
          pie="hay más de lo que dice el sistema"
          color="#22a06b"
          icono={<Icono nombre="entrada" tam={15} />}
        />
        <Tarjeta
          orden={2}
          titulo="Falta mercadería"
          valor={resumen.faltan}
          pie="hay menos de lo que dice el sistema"
          color="#e5484d"
          icono={<Icono nombre="salida" tam={15} />}
        />
      </div>

      <Tabla
        columnas={[
          { clave: 'cod', titulo: 'Código', ancho: '100px', render: (f: FilaStock) => <span className="font-medium">{f.codigo}</span> },
          { clave: 'art', titulo: 'Artículo', render: (f) => f.nombre },
          { clave: 'uni', titulo: 'Unidad', ancho: '80px', render: (f) => <span className="text-suave">{f.unidad}</span> },
          { clave: 'sis', titulo: 'Según el sistema', ancho: '135px', derecha: true, render: (f) => fmtNum(f.stock) },
          {
            clave: 'cont', titulo: 'Contado de verdad', ancho: '160px',
            render: (f) => (
              <Campo
                valor={contado[f.id] ?? ''}
                alCambiar={(v) => setContado((c) => ({ ...c, [f.id]: v }))}
                placeholder="—"
                numerico
                derecha
              />
            ),
          },
          {
            clave: 'dif', titulo: 'Diferencia', ancho: '130px', derecha: true,
            render: (f) => {
              const d = difDe(f);
              if (d === null) return <span className="text-suave">sin contar</span>;
              if (Math.abs(d) < 0.0001) return <span className="text-suave">coincide</span>;
              const negativo = Number(f.stock) + d < -0.0001;
              return (
                <span className={`font-semibold ${negativo ? 'text-coral' : d > 0 ? 'text-verde' : 'text-coral'}`}>
                  {d > 0 ? '+' : '−'}
                  {fmtNum(Math.abs(d))}
                  {negativo && ' ⚠'}
                </span>
              );
            },
          },
        ]}
        filas={visibles}
        clave={(f) => f.id}
        cargando={cargando}
        vacio={{ titulo: 'Todavía no hay artículos', detalle: 'Cargá el catálogo desde la pestaña de artículos.' }}
        sinResultados={
          texto || categoria || vista !== 'todos'
            ? { titulo: 'Ningún artículo coincide', detalle: 'Probá con otra palabra u otro filtro.' }
            : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-suave">
          {resumen.contados === 0
            ? 'Escribí en la columna «Contado de verdad» lo que hay en el estante.'
            : `${resumen.conDiferencia} ${resumen.conDiferencia === 1 ? 'artículo va a ajustarse' : 'artículos van a ajustarse'}.`}
        </span>
        {resumen.negativos > 0 && (
          <span className="rounded-lg bg-coral-clr px-3 py-1.5 text-[12px] font-semibold text-[#b3282c]">
            {resumen.negativos} {resumen.negativos === 1 ? 'renglón dejaría' : 'renglones dejarían'} el stock
            en negativo. Revisalos: no se va a guardar nada hasta corregirlos.
          </span>
        )}
        <div className="flex-1" />
        <Boton tono="claro" onClick={() => setContado({})} disabled={resumen.contados === 0}>
          Empezar de nuevo
        </Boton>
        <Boton tono="ambar" onClick={guardar} disabled={guardando || resumen.contados === 0}>
          {guardando ? 'Guardando…' : 'Aplicar el conteo'}
        </Boton>
      </div>

      <p className="text-[12px] text-suave">
        Un campo vacío significa <b>«no lo conté»</b>, no «hay cero»: esos artículos quedan como
        están. Al aplicar, entra todo junto o no entra nada, así que nunca queda a medio camino.
      </p>

      {nodoConfirmacion}
    </div>
  );
}
