/* ---------------------------------------------------------------------------
 * Detalle de una boleta con los PRECIOS EDITABLES.
 * Port de `DlgDetalleIngreso` de `sfida_dialogos.py`.
 *
 * Las cantidades NO se editan acá: para eso hay que anular la boleta.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import type { DetalleIngreso, IngresoListado } from '../../../compartido/contrato';
import { useApp } from '../estado/app';
import { Boton, Dialogo, Tabla, dmy, fmtNum, fmtPrecio } from '../ui/base';

export function DlgDetalleIngreso({
  abierto,
  ingresoId,
  alCerrar,
}: {
  abierto: boolean;
  ingresoId: number | null;
  alCerrar: (huboCambio: boolean) => void;
}): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [cab, setCab] = useState<IngresoListado | null>(null);
  const [det, setDet] = useState<DetalleIngreso[]>([]);
  const [precios, setPrecios] = useState<Record<number, string>>({});
  const [errores, setErrores] = useState<string[]>([]);

  useEffect(() => {
    if (!abierto || ingresoId === null) return;
    void (async () => {
      const [c, d] = await Promise.all([
        pedir(window.sfida.ingresos.cabecera(ingresoId)),
        pedir(window.sfida.ingresos.detalle(ingresoId)),
      ]);
      setCab(c);
      setDet(d ?? []);
      setPrecios(
        Object.fromEntries((d ?? []).map((x) => [x.id, x.costo_unitario > 0 ? x.costo_unitario.toFixed(2) : ''])),
      );
      setErrores([]);
    })();
  }, [abierto, ingresoId, pedir]);

  const total = det.reduce((s, d) => {
    const p = Number(String(precios[d.id] ?? '').replace(',', '.')) || 0;
    return s + p * d.cantidad;
  }, 0);

  async function guardar(): Promise<void> {
    const errs: string[] = [];
    let cambios = 0;
    for (const d of det) {
      const crudo = String(precios[d.id] ?? '').replace('S/', '').replace('—', '').trim();
      const r = await pedir(window.sfida.ingresos.corregirPrecio(d.id, crudo === '' ? '0' : crudo), {
        silencioso: true,
      });
      if (r === null) errs.push(`${d.nombre}: precio inválido`);
      else if (r) cambios += 1;
    }
    if (errs.length) {
      setErrores(errs);
      return;
    }
    avisar(cambios ? `Se corrigieron ${cambios} precio(s).` : 'No hubo cambios que guardar.', cambios ? 'ok' : 'info');
    alCerrar(cambios > 0);
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Detalle del ingreso"
      subtitulo={
        cab ? (
          <>
            <b>{cab.tipo_doc} {cab.nro_documento}</b> · {dmy(cab.fecha)} · {cab.proveedor || 'sin proveedor'}
          </>
        ) : null
      }
      alCerrar={() => alCerrar(false)}
      ancho="max-w-[780px]"
      pie={
        <>
          <Boton tono="claro" onClick={() => alCerrar(false)}>Cerrar</Boton>
          <div className="flex-1" />
          <span className="text-[15px] font-semibold">Total: {fmtPrecio(total)}</span>
          <Boton tono="verde" onClick={guardar}>Guardar precios</Boton>
        </>
      }
    >
      <p className="mb-3 text-[12px] text-suave">
        Escribí en la columna «Precio unit.» para corregir un precio. Las cantidades no se editan
        acá: para eso anulá la boleta.
      </p>

      <Tabla
        columnas={[
          { clave: 'art', titulo: 'Artículo', render: (d: DetalleIngreso) => `${d.codigo} | ${d.nombre}` },
          { clave: 'cant', titulo: 'Cantidad', ancho: '100px', derecha: true, render: (d) => fmtNum(d.cantidad) },
          { clave: 'uni', titulo: 'Unidad', ancho: '90px', render: (d) => d.unidad },
          {
            clave: 'precio', titulo: 'Precio unit.', ancho: '130px',
            render: (d) => (
              <input
                value={precios[d.id] ?? ''}
                placeholder="—"
                onChange={(e) => setPrecios((p) => ({ ...p, [d.id]: e.target.value }))}
                className="w-full cursor-text rounded-md border border-[#c9d8f5] bg-[#eaf1ff] px-2 py-1 text-right text-[13px] outline-none select-text focus:border-azul"
              />
            ),
          },
          {
            clave: 'sub', titulo: 'Subtotal', ancho: '120px', derecha: true,
            render: (d) => {
              const p = Number(String(precios[d.id] ?? '').replace(',', '.')) || 0;
              return fmtPrecio(p * d.cantidad);
            },
          },
        ]}
        filas={det}
        clave={(d) => d.id}
        vacio={{ titulo: 'La boleta no tiene líneas', detalle: '' }}
      />

      {errores.length > 0 && (
        <div className="mt-3 rounded-lg bg-coral-clr px-3.5 py-2.5 text-[13px] font-semibold text-[#b3282c]">
          {errores.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
    </Dialogo>
  );
}
