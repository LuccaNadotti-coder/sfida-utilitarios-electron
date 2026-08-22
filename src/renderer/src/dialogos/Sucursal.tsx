/* ---------------------------------------------------------------------------
 * Alta y edición de sucursales. Port de `DlgSucursal` de `sfida_dialogos.py`.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import { useApp } from '../estado/app';
import { Boton, Campo, Dialogo, Etiqueta } from '../ui/base';

export function DlgSucursal({
  abierto,
  sucId,
  alCerrar,
}: {
  abierto: boolean;
  sucId: number | null;
  alCerrar: (huboCambio: boolean) => void;
}): React.JSX.Element {
  const { pedir, avisar } = useApp();
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [responsable, setResponsable] = useState('');

  const editando = sucId !== null;

  useEffect(() => {
    if (!abierto) return;
    void (async () => {
      const todas = (await pedir(window.sfida.sucursales.listar(false))) ?? [];
      if (editando) {
        const s = todas.find((x) => x.id === sucId);
        setCodigo(s?.codigo ?? '');
        setNombre(s?.nombre ?? '');
        setDireccion(s?.direccion ?? '');
        setResponsable(s?.responsable ?? '');
      } else {
        // Propone SUC01, SUC02… contando también las inactivas.
        setCodigo(`SUC${String(todas.length + 1).padStart(2, '0')}`);
        setNombre('');
        setDireccion('');
        setResponsable('');
      }
    })();
  }, [abierto, sucId, editando, pedir]);

  return (
    <Dialogo
      abierto={abierto}
      titulo={editando ? 'Editar sucursal' : 'Nueva sucursal'}
      alCerrar={() => alCerrar(false)}
      ancho="max-w-[480px]"
      pie={
        <>
          <Boton tono="claro" onClick={() => alCerrar(false)}>Cancelar</Boton>
          <div className="flex-1" />
          <Boton
            tono="verde"
            onClick={async () => {
              const r = await pedir(
                window.sfida.sucursales.guardar({ codigo, nombre, direccion, responsable, sucId }),
              );
              if (r === null) return;
              avisar(editando ? 'Sucursal actualizada.' : 'Sucursal registrada.', 'ok');
              alCerrar(true);
            }}
          >
            Guardar
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Etiqueta>Código</Etiqueta>
          <Campo valor={codigo} alCambiar={setCodigo} mayusculas placeholder="SUC04" />
        </div>
        <div>
          <Etiqueta>Nombre</Etiqueta>
          <Campo valor={nombre} alCambiar={setNombre} mayusculas autoFocus placeholder="TIENDA ESTE" />
        </div>
        <div>
          <Etiqueta>Dirección</Etiqueta>
          <Campo valor={direccion} alCambiar={setDireccion} mayusculas />
        </div>
        <div>
          <Etiqueta>Responsable</Etiqueta>
          <Campo valor={responsable} alCambiar={setResponsable} mayusculas />
        </div>
      </div>
    </Dialogo>
  );
}
