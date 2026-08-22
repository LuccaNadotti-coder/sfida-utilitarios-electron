/* ---------------------------------------------------------------------------
 * Ajuste por conteo físico. Port de `DlgAjuste` de `sfida_dialogos.py`.
 *
 * Se escribe LA CANTIDAD REAL CONTADA, no la diferencia. El sistema calcula
 * cuánto suma o descuenta.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import type { ArticuloListado } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import { Boton, Campo, Dialogo, Etiqueta, Selector, SpinNumero, fmtNum } from '../ui/base';

const MOTIVOS = [
  'INVENTARIO FÍSICO',
  'MERMA O DETERIORO',
  'ERROR DE DIGITACIÓN',
  'PÉRDIDA',
  'DEVOLUCIÓN DE SUCURSAL',
];

export function DlgAjuste({
  abierto,
  artId,
  alCerrar,
}: {
  abierto: boolean;
  artId: number | null;
  alCerrar: (huboCambio: boolean) => void;
}): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [art, setArt] = useState<ArticuloListado | null>(null);
  const [actual, setActual] = useState(0);
  const [contado, setContado] = useState(0);
  const [motivo, setMotivo] = useState(MOTIVOS[0]!);
  const [otro, setOtro] = useState('');

  useEffect(() => {
    if (!abierto || artId === null) return;
    void pedir(window.sfida.articulos.obtener(artId)).then((a) => {
      setArt(a);
      setActual(a?.stock ?? 0);
      setContado(a?.stock ?? 0);
      setMotivo(MOTIVOS[0]!);
      setOtro('');
    });
  }, [abierto, artId, pedir]);

  const dif = contado - actual;

  return (
    <Dialogo
      abierto={abierto}
      titulo="Ajuste por conteo físico"
      subtitulo={art ? art.nombre : ''}
      alCerrar={() => alCerrar(false)}
      ancho="max-w-[470px]"
      pie={
        <>
          <Boton tono="claro" onClick={() => alCerrar(false)}>Cancelar</Boton>
          <div className="flex-1" />
          <Boton
            tono="ambar"
            disabled={Math.abs(dif) < 0.0001}
            onClick={async () => {
              if (artId === null) return;
              const r = await pedir(
                window.sfida.articulos.ajustar(artId, contado, otro.trim() || motivo),
              );
              if (r === null) return;
              avisar('Stock ajustado y registrado en el kardex.', 'ok');
              alCerrar(true);
            }}
          >
            Guardar ajuste
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-suave">
          Stock según el sistema: <b className="text-texto">{fmtNum(actual)} {art?.unidad}</b>
        </p>

        <div>
          <Etiqueta>Cantidad real contada en el almacén</Etiqueta>
          <SpinNumero valor={contado} alCambiar={setContado} />
        </div>

        <div
          className={`rounded-lg px-3.5 py-2.5 text-[13px] font-semibold ${
            Math.abs(dif) < 0.0001
              ? 'bg-separador text-suave'
              : dif > 0
                ? 'bg-verde-clr text-[#14724a]'
                : 'bg-coral-clr text-[#b3282c]'
          }`}
        >
          {Math.abs(dif) < 0.0001
            ? 'Sin diferencia'
            : dif > 0
              ? `Sumará ${fmtNum(dif)} unidades`
              : `Descontará ${fmtNum(-dif)} unidades`}
        </div>

        <div>
          <Etiqueta>Motivo</Etiqueta>
          <Selector valor={motivo} alCambiar={setMotivo} opciones={MOTIVOS.map((m) => ({ id: m, texto: m }))} />
          <div className="mt-2">
            <Campo valor={otro} alCambiar={setOtro} mayusculas placeholder="O ESCRIBA OTRO MOTIVO (OPCIONAL)" />
          </div>
        </div>
      </div>
    </Dialogo>
  );
}
