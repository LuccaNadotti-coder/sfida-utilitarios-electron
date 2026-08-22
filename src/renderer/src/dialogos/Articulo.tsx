/* ---------------------------------------------------------------------------
 * Alta y edición de artículos. Port de `DlgArticulo` de `sfida_dialogos.py`.
 *
 * Pensado para cargar muchos rápido: «Guardar y crear otro» limpia el nombre,
 * re-sugiere el código y deja el foco listo para el siguiente.
 * ------------------------------------------------------------------------- */
import { useEffect, useMemo, useState } from 'react';

import type { ArticuloListado, Categoria, UnidadCatalogo } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import { Boton, Campo, Dialogo, Etiqueta, Selector, SpinNumero } from '../ui/base';

/** Prefijo del código según la categoría, como `PREFIJOS` en Python. */
function prefijoDe(nombreCategoria: string): string {
  const t = nombreCategoria.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
  if (t.includes('LIMPIEZA')) return 'LIM';
  if (t.includes('OFICINA')) return 'OFI';
  return t.slice(0, 3) || 'ART';
}

export function DlgArticulo({
  abierto,
  artId,
  alCerrar,
}: {
  abierto: boolean;
  artId: number | null;
  alCerrar: (huboCambio: boolean) => void;
}): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [cats, setCats] = useState<Categoria[]>([]);
  const [unidades, setUnidades] = useState<UnidadCatalogo[]>([]);
  const [todos, setTodos] = useState<ArticuloListado[]>([]);

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [auto, setAuto] = useState(true);
  const [catId, setCatId] = useState<number>(0);
  const [unidad, setUnidad] = useState('UND');
  const [minimo, setMinimo] = useState(0);
  const [inicial, setInicial] = useState(0);
  const [guardados, setGuardados] = useState(0);
  const [ok, setOk] = useState('');

  const editando = artId !== null;

  useEffect(() => {
    if (!abierto) return;
    void (async () => {
      const [c, u, t] = await Promise.all([
        pedir(window.sfida.catalogos.categorias()),
        pedir(window.sfida.catalogos.unidades()),
        pedir(window.sfida.articulos.listar({ soloActivos: false })),
      ]);
      setCats(c ?? []);
      setUnidades(u ?? []);
      setTodos(t ?? []);

      if (editando) {
        const a = (t ?? []).find((x) => x.id === artId);
        if (a) {
          setNombre(a.nombre);
          setCodigo(a.codigo);
          setCatId(a.categoria_id ?? c?.[0]?.id ?? 0);
          setUnidad(a.unidad);
          setMinimo(a.stock_minimo);
        }
        setAuto(false);
      } else {
        // Arranca en la categoría más usada, o en la primera.
        const cuenta = new Map<number, number>();
        for (const a of t ?? []) {
          if (a.categoria_id) cuenta.set(a.categoria_id, (cuenta.get(a.categoria_id) ?? 0) + 1);
        }
        const masUsada = [...cuenta.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
        setCatId(masUsada ?? c?.[0]?.id ?? 0);
        setNombre('');
        setUnidad('UND');
        setMinimo(0);
        setInicial(0);
        setAuto(true);
      }
      setGuardados(0);
      setOk('');
    })();
  }, [abierto, artId, editando, pedir]);

  // Sugerir el código cuando corresponde
  useEffect(() => {
    if (!abierto || editando || !auto || !catId) return;
    const cat = cats.find((c) => c.id === catId);
    if (!cat) return;
    void pedir(window.sfida.articulos.codigoSugerido(prefijoDe(cat.nombre))).then((c) => {
      if (c) setCodigo(c);
    });
  }, [abierto, editando, auto, catId, cats, pedir, guardados]);

  /** Aviso de parecidos en vivo. NO bloquea: solo informa. */
  const parecidos = useMemo(() => {
    const t = nombre.trim();
    if (t.length < 3) return [];
    const sin = (s: string): string => s.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
    const palabras = sin(t).split(/\s+/).filter(Boolean);
    return todos
      .filter((a) => a.id !== artId && palabras.every((p) => sin(a.nombre).includes(p)))
      .slice(0, 3)
      .map((a) => a.nombre);
  }, [nombre, todos, artId]);

  const unidadInfo = unidades.find((u) => u.codigo === unidad);

  async function grabar(): Promise<number | null> {
    return pedir(
      window.sfida.articulos.guardar({
        codigo,
        nombre,
        categoriaId: catId || null,
        unidad,
        stockMinimo: minimo,
        artId,
        stockInicial: editando ? 0 : inicial,
      }),
    );
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo={editando ? 'Editar artículo' : 'Nuevo artículo'}
      alCerrar={() => alCerrar(guardados > 0)}
      pie={
        <>
          <Boton tono="claro" onClick={() => alCerrar(guardados > 0)}>Cancelar</Boton>
          <div className="flex-1" />
          {!editando && (
            <Boton
              tono="gris"
              onClick={async () => {
                const id = await grabar();
                if (id === null) return;
                setGuardados((n) => n + 1);
                setOk('Guardado. Puede escribir el siguiente artículo.');
                setNombre('');
                setInicial(0);
              }}
            >
              Guardar y crear otro
            </Boton>
          )}
          <Boton
            tono="verde"
            onClick={async () => {
              const id = await grabar();
              if (id === null) return;
              avisar(editando ? 'Artículo actualizado.' : 'Artículo registrado.', 'ok');
              alCerrar(true);
            }}
          >
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Etiqueta>Nombre del artículo</Etiqueta>
          <Campo valor={nombre} alCambiar={setNombre} mayusculas autoFocus placeholder="EJ. LAPICERO AZUL FABER 034" />
          {parecidos.length > 0 && (
            <p className="mt-1.5 text-[12px] text-ambar-osc">
              Ya existe algo parecido: {parecidos.join(', ')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Etiqueta>Categoría</Etiqueta>
            <Selector
              valor={catId}
              alCambiar={setCatId}
              opciones={cats.map((c) => ({ id: c.id, texto: c.nombre }))}
            />
          </div>
          <div>
            <Etiqueta>Unidad de medida</Etiqueta>
            <Selector
              valor={unidad}
              alCambiar={setUnidad}
              opciones={unidades.map((u) => ({
                id: u.codigo,
                texto: `${u.codigo} · ${u.nombre}`,
              }))}
            />
            {unidadInfo && (
              <p className="mt-1.5 text-[12px] text-azul">
                {unidadInfo.equivalencia === 'es la unidad base'
                  ? unidadInfo.familia === 'Conteo'
                    ? 'Se cuenta de a uno (no se convierte).'
                    : `Es la unidad base de ${unidadInfo.familia.toLowerCase()}.`
                  : `Equivale a:  ${unidadInfo.equivalencia}`}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Etiqueta>Código</Etiqueta>
            <div className="flex items-center gap-2">
              <Campo valor={codigo} alCambiar={setCodigo} mayusculas disabled={auto && !editando} />
              {!editando && (
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] whitespace-nowrap">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                  Automático
                </label>
              )}
            </div>
          </div>
          <div>
            <Etiqueta>Stock mínimo (para la alerta)</Etiqueta>
            <SpinNumero valor={minimo} alCambiar={setMinimo} />
          </div>
        </div>

        {!editando && (
          <div>
            <Etiqueta>Stock inicial que ya tiene en el almacén (opcional)</Etiqueta>
            <SpinNumero valor={inicial} alCambiar={setInicial} />
          </div>
        )}

        {ok && (
          <div className="rounded-lg bg-verde-clr px-3.5 py-2.5 text-[13px] font-semibold text-[#14724a]">
            {ok}
          </div>
        )}
      </div>
    </Dialogo>
  );
}
