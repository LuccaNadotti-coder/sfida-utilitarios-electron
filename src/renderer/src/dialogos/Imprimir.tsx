/* ---------------------------------------------------------------------------
 * Ventana «Imprimir vale». Port de `DlgImprimir` de `sfida_impresion.py`.
 *
 * Elegir impresora, papel y copias (2 por defecto: una queda en el almacén y
 * la otra viaja con la mercadería), ver el vale a escala real e imprimir o
 * guardar PDF. Recuerda la última impresora y el último papel usados.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import type { AnchoPapel, Impresora, VistaPreviaVale } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import { Boton, Chips, Dialogo, Etiqueta, Selector, SpinNumero } from '../ui/base';

const PAPELES: Array<{ id: AnchoPapel; texto: string }> = [
  { id: 80, texto: 'Ticket 80 mm' },
  { id: 58, texto: 'Ticket 58 mm' },
  { id: 210, texto: 'Hoja A4' },
];

export function DlgImprimir({
  abierto,
  salidaId,
  alCerrar,
}: {
  abierto: boolean;
  salidaId: number | null;
  alCerrar: () => void;
}): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [impresoras, setImpresoras] = useState<Impresora[]>([]);
  const [impresora, setImpresora] = useState('');
  const [papel, setPapel] = useState<AnchoPapel>(80);
  const [copias, setCopias] = useState(2);
  const [previa, setPrevia] = useState<VistaPreviaVale | null>(null);
  const [trabajando, setTrabajando] = useState(false);

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
    if (!abierto || salidaId === null) return;
    setPrevia(null);
    void pedir(window.sfida.impresion.vistaPrevia(salidaId, papel)).then(setPrevia);
  }, [abierto, salidaId, papel, pedir]);

  async function imprimir(): Promise<void> {
    if (salidaId === null) return;
    if (!impresora) {
      avisar('Windows no reporta ninguna impresora instalada.\n\nConecte la impresora, instale su controlador y vuelva a abrir esta ventana.', 'err');
      return;
    }
    setTrabajando(true);
    const r = await pedir(window.sfida.impresion.imprimir({ salidaId, anchoMm: papel, deviceName: impresora, copias }));
    setTrabajando(false);
    if (!r) return;
    if (r.ok) {
      avisar(`Vale enviado a ${impresora} (${copias} copias).`, 'ok');
      alCerrar();
    } else {
      avisar(`La impresora devolvió este error:\n${r.motivo ?? 'sin detalle'}`, 'err');
    }
  }

  async function pdf(): Promise<void> {
    if (salidaId === null) return;
    setTrabajando(true);
    const r = await pedir(window.sfida.impresion.guardarPdf({ salidaId, anchoMm: papel }));
    setTrabajando(false);
    if (!r) return;
    if (r.ok) avisar(`PDF guardado en ${r.ruta}`, 'ok');
    else if (r.motivo !== 'cancelado') avisar(`No se pudo guardar: ${r.motivo}`, 'err');
  }

  const zoom = papel >= 200 ? 1.6 : 2.8;

  return (
    <Dialogo
      abierto={abierto}
      titulo="Imprimir vale"
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
          <div className="flex max-h-[52vh] justify-center overflow-auto rounded-xl border border-borde bg-[#e9edf3] p-5">
            {previa ? (
              <div
                className="bg-white shadow-lg"
                style={{
                  width: `${previa.anchoMm}mm`,
                  padding: `${previa.margenMm}mm`,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top center',
                  marginBottom: `${previa.altoHojaMm * (zoom - 1) * 3.78}px`,
                }}
                dangerouslySetInnerHTML={{ __html: previa.html }}
              />
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
