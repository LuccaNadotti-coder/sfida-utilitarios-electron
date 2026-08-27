/* ---------------------------------------------------------------------------
 * Ventana «Imprimir vale». Port de `DlgImprimir` de `sfida_impresion.py`.
 *
 * Elegir impresora, papel y copias (2 por defecto: una queda en el almacén y
 * la otra viaja con la mercadería), ver el vale a escala real e imprimir o
 * guardar PDF. Recuerda la última impresora y el último papel usados.
 * ------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from 'react';

import type {
  AnchoPapel,
  Impresora,
  TipoComprobante,
  VistaPreviaVale,
} from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import { Boton, Chips, Dialogo, Etiqueta, Selector, SpinNumero, useDebounce } from '../ui/base';

const PAPELES: Array<{ id: AnchoPapel; texto: string }> = [
  { id: 80, texto: 'Ticket 80 mm' },
  { id: 58, texto: 'Ticket 58 mm' },
  { id: 210, texto: 'Hoja A4' },
];

export function DlgImprimir({
  abierto,
  tipo,
  id,
  alCerrar,
}: {
  abierto: boolean;
  /** Qué comprobante: el vale de salida o el ingreso. */
  tipo: TipoComprobante;
  id: number | null;
  alCerrar: () => void;
}): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [impresoras, setImpresoras] = useState<Impresora[]>([]);
  const [impresora, setImpresora] = useState('');
  const [papel, setPapel] = useState<AnchoPapel>(80);
  const [copias, setCopias] = useState(2);
  const [ajustarAlto, setAjustarAlto] = useState(false);
  const [corrimiento, setCorrimiento] = useState(0);
  const [previa, setPrevia] = useState<VistaPreviaVale | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const [anchoCaja, setAnchoCaja] = useState(0);
  // Sin la espera, mover el corrimiento abriría una ventana de armado por cada
  // toque en el botón. En A4 no se aplica: ahí la hoja es una hoja de verdad y
  // el margen lo pone el `@page`.
  const corrimientoQuieto = useDebounce(papel < 200 ? corrimiento : 0, 250);

  useEffect(() => {
    if (!abierto) return;
    void (async () => {
      const [lista, prefs] = await Promise.all([
        pedir(window.sfida.impresion.impresoras()),
        pedir(window.sfida.impresion.preferencias()),
      ]);
      setImpresoras(lista ?? []);
      if (prefs) {
        setPapel(prefs.papel);
        setAjustarAlto(prefs.ajustarAlto);
        setCorrimiento(prefs.corrimientoMm ?? 0);
        // Solo se restaura la impresora si sigue instalada.
        if (prefs.impresora && (lista ?? []).some((i) => i.name === prefs.impresora)) {
          setImpresora(prefs.impresora);
        } else {
          setImpresora((lista ?? []).find((i) => i.isDefault)?.name ?? (lista ?? [])[0]?.name ?? '');
        }
      }
      setCopias(2);
    })();
  }, [abierto, pedir]);

  useEffect(() => {
    if (!abierto || id === null) return;
    setPrevia(null);
    void pedir(window.sfida.impresion.vistaPrevia(tipo, id, papel, corrimientoQuieto)).then(setPrevia);
  }, [abierto, tipo, id, papel, corrimientoQuieto, pedir]);

  // Cuánto mide la caja de la vista previa, para calcular el aumento.
  useEffect(() => {
    if (!abierto) return;
    const medir = (): void => setAnchoCaja(caja.current?.clientWidth ?? 0);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [abierto, previa]);

  async function imprimir(): Promise<void> {
    if (id === null) return;
    if (!impresora) {
      avisar('Windows no reporta ninguna impresora instalada.\n\nConecte la impresora, instale su controlador y vuelva a abrir esta ventana.', 'err');
      return;
    }
    setTrabajando(true);
    const r = await pedir(
      window.sfida.impresion.imprimir({
        tipo, id, anchoMm: papel, deviceName: impresora, copias, ajustarAlto,
        corrimientoMm: papel < 200 ? corrimiento : 0,
      }),
    );
    setTrabajando(false);
    if (!r) return;
    if (r.ok) {
      avisar(
        `${tipo === 'salida' ? 'Vale' : 'Ingreso'} enviado a ${impresora} (${copias} copias).`,
        'ok',
      );
      alCerrar();
    } else {
      avisar(`La impresora devolvió este error:\n${r.motivo ?? 'sin detalle'}`, 'err');
    }
  }

  async function pdf(): Promise<void> {
    if (id === null) return;
    setTrabajando(true);
    const r = await pedir(window.sfida.impresion.guardarPdf({ tipo, id, anchoMm: papel }));
    setTrabajando(false);
    if (!r) return;
    if (r.ok) avisar(`PDF guardado en ${r.ruta}`, 'ok');
    else if (r.motivo !== 'cancelado') avisar(`No se pudo guardar: ${r.motivo}`, 'err');
  }

  // El aumento de la vista previa se CALCULA con lo que mide la caja: con un
  // valor fijo, el papel ampliado era más ancho que su columna y el vale se
  // veía cortado por los dos costados —justo donde hay que mirar si quedó
  // derecho—. Se usa la propiedad `zoom` y no `transform: scale`, porque
  // `transform` no cambia el espacio que ocupa y el recuadro no se enteraba.
  const anchoPapelPx = ((previa?.anchoMm ?? papel) * 96) / 25.4;
  const zoom = anchoCaja
    ? Math.max(0.55, Math.min(papel >= 200 ? 1.6 : 2.8, (anchoCaja - 44) / anchoPapelPx))
    : 1;

  return (
    <Dialogo
      abierto={abierto}
      titulo={tipo === 'salida' ? 'Imprimir vale de egreso' : 'Imprimir comprobante de ingreso'}
      alCerrar={alCerrar}
      ancho="max-w-[900px]"
      pie={
        <>
          <Boton tono="claro" onClick={alCerrar}>Cerrar</Boton>
          <div className="flex-1" />
          <Boton tono="gris" onClick={pdf} disabled={trabajando}>Guardar PDF</Boton>
          <Boton tono="verde" onClick={imprimir} disabled={trabajando || !impresora}>
            {trabajando ? 'Imprimiendo…' : 'Imprimir ahora'}
          </Boton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div>
            <Etiqueta>Impresora</Etiqueta>
            <Selector
              valor={impresora}
              alCambiar={setImpresora}
              opciones={
                impresoras.length
                  ? impresoras.map((i) => ({
                      id: i.name,
                      texto: i.displayName + (i.isDefault ? '   (predeterminada)' : ''),
                    }))
                  : [{ id: '', texto: 'No se encontró ninguna impresora instalada' }]
              }
            />
          </div>

          <div>
            <Etiqueta>Tamaño del papel</Etiqueta>
            <Chips valor={String(papel)} alElegir={(v) => setPapel(Number(v) as AnchoPapel)} opciones={PAPELES.map((p) => ({ id: String(p.id), texto: p.texto }))} />
          </div>

          {papel < 200 && (
            <div>
              <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={ajustarAlto}
                  onChange={(e) => setAjustarAlto(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Cortar el papel justo donde termina el vale</span>
              </label>
              <p className="mt-1.5 text-[12px] text-suave">
                Dejalo destildado si al imprimir queda mucho espacio en blanco arriba: casi
                ninguna impresora acepta que le pidan el alto de la hoja, y cuando no lo
                acepta manda el vale al medio del papel.
              </p>
            </div>
          )}

          {papel < 200 && (
            <div>
              <Etiqueta>Correr el vale a los costados</Etiqueta>
              <div className="flex flex-wrap items-center gap-2">
                <SpinNumero
                  valor={corrimiento}
                  alCambiar={setCorrimiento}
                  min={-10}
                  max={10}
                  paso={0.5}
                  decimales={1}
                  className="w-[150px]"
                />
                <span className="text-[13px] text-suave">mm</span>
                {corrimiento !== 0 && (
                  <button
                    onClick={() => setCorrimiento(0)}
                    className="cursor-pointer text-[12px] font-semibold text-azul hover:underline"
                  >
                    Volver al centro
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-suave">
                El vale sale centrado solo. Usá esto únicamente si el papel queda desparejo:
                un número positivo lo mueve a la derecha y uno negativo, a la izquierda.
                Se queda guardado para la próxima vez.
              </p>
            </div>
          )}

          <div>
            <Etiqueta>Copias</Etiqueta>
            <SpinNumero valor={copias} alCambiar={setCopias} min={1} max={9} className="w-[140px]" />
            <p className="mt-1.5 text-[12px] text-suave">
              Lo normal son 2: una se queda en el almacén y la otra viaja con la mercadería.
            </p>
          </div>

          {previa && (
            <dl className="grid grid-cols-2 gap-2 text-[11px]">
              <Medida valor={`${previa.anchoMm} mm`} pie="ancho del papel" />
              <Medida valor={`${previa.cols} col.`} pie="columnas de texto" />
              <Medida valor={`${previa.tamLetraPt.toFixed(2)} pt`} pie="letra medida" />
              <Medida valor={`${previa.altoHojaMm.toFixed(0)} mm`} pie="alto de la hoja" />
            </dl>
          )}

          <p className="text-[12px] text-suave">
            Si la impresora térmica corta el texto por los costados, probá con el ancho de 58 mm.
            Para archivar el vale en papel normal elegí «Hoja A4».
          </p>
        </div>

        <div>
          <Etiqueta>Así va a salir impreso</Etiqueta>
          <div
            ref={caja}
            className="flex max-h-[52vh] justify-center overflow-auto rounded-xl border border-borde bg-[#e9edf3] p-5"
          >
            {previa ? (
              <div
                className="h-fit bg-white shadow-lg"
                style={{
                  zoom,
                  width: `${previa.anchoMm}mm`,
                  // A los costados no va relleno: el vale se centra, igual que
                  // en el papel. Si se pusiera relleno fijo acá, la vista
                  // previa mentiría justo sobre lo que se está mirando.
                  padding: `${previa.margenMm}mm 0`,
                }}
              >
                <div
                  style={{
                    width: `${previa.utilMm}mm`,
                    margin: '0 auto',
                    // La MISMA letra del documento que se imprime. Si se deja
                    // la del programa, el ticket mide otra cosa acá que en el
                    // papel y la vista previa deja de servir justo para lo
                    // único que sirve: ver cómo va a salir.
                    ...(papel < 200
                      ? {
                          fontFamily:
                            "Consolas, 'Courier New', 'DejaVu Sans Mono', 'Liberation Mono', monospace",
                          fontWeight: 600,
                          lineHeight: '116%',
                        }
                      : {}),
                  }}
                  dangerouslySetInnerHTML={{ __html: previa.html }}
                />
              </div>
            ) : (
              <div className="py-16 text-center text-[13px] text-suave">Armando el vale…</div>
            )}
          </div>
        </div>
      </div>
    </Dialogo>
  );
}

function Medida({ valor, pie }: { valor: string; pie: string }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-gris-cab px-2.5 py-1.5">
      <div className="text-[14px] font-bold">{valor}</div>
      <div className="text-suave">{pie}</div>
    </div>
  );
}
