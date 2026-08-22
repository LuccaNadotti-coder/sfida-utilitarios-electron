/* ---------------------------------------------------------------------------
 * Detalle de un vale de salida.
 *
 * En la versión Qt esto era un QMessageBox de texto plano (punto 9 de la
 * sección 8 del inventario). Acá es un diálogo de verdad, con la misma
 * información: no cambia ninguna regla, solo se ve mejor.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import type { CabeceraSalida, DetalleSalida } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import { Boton, Dialogo, Tabla, dmy, fmtNum } from '../ui/base';

export function DlgDetalleSalida({
  abierto,
  salidaId,
  alCerrar,
}: {
  abierto: boolean;
  salidaId: number | null;
  alCerrar: () => void;
}): React.JSX.Element {
  const { pedir } = useApp();
  const [cab, setCab] = useState<CabeceraSalida | null>(null);
  const [det, setDet] = useState<DetalleSalida[]>([]);

  useEffect(() => {
    if (!abierto || salidaId === null) return;
    void (async () => {
      const [c, d] = await Promise.all([
        pedir(window.sfida.salidas.cabecera(salidaId)),
        pedir(window.sfida.salidas.detalle(salidaId)),
      ]);
      setCab(c);
      setDet(d ?? []);
    })();
  }, [abierto, salidaId, pedir]);

  const totalUnd = det.reduce((s, d) => s + d.cantidad, 0);

  return (
    <Dialogo
      abierto={abierto}
      titulo={cab ? `Vale ${cab.nro_vale}` : 'Vale'}
      subtitulo={cab ? `${dmy(cab.fecha)} · ${cab.suc_codigo} - ${cab.sucursal}` : null}
      alCerrar={alCerrar}
      ancho="max-w-[700px]"
      pie={
        <>
          <div className="flex-1" />
          <Boton tono="claro" onClick={alCerrar}>Cerrar</Boton>
        </>
      }
    >
      {cab && (
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
          <div><span className="text-suave">Entregó:</span> {cab.entregado_por || '-'}</div>
          <div><span className="text-suave">Recibió:</span> {cab.recibido_por || '-'}</div>
          {cab.direccion && <div className="col-span-2"><span className="text-suave">Dirección:</span> {cab.direccion}</div>}
          {cab.observacion && <div className="col-span-2"><span className="text-suave">Observación:</span> {cab.observacion}</div>}
        </dl>
      )}

      <Tabla
        columnas={[
          { clave: 'cod', titulo: 'Código', ancho: '110px', render: (d: DetalleSalida) => d.codigo },
          { clave: 'art', titulo: 'Artículo', render: (d) => d.nombre },
          { clave: 'cant', titulo: 'Cantidad', ancho: '110px', derecha: true, render: (d) => fmtNum(d.cantidad) },
          { clave: 'uni', titulo: 'Unidad', ancho: '90px', render: (d) => d.unidad },
        ]}
        filas={det}
        clave={(d) => d.id}
        vacio={{ titulo: 'El vale no tiene líneas', detalle: '' }}
      />

      <p className="mt-3 text-[13px]">
        <b>Total de artículos:</b> {det.length} &nbsp;&nbsp; <b>Total de unidades:</b> {fmtNum(totalUnd)}
      </p>
    </Dialogo>
  );
}
