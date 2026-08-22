/* ---------------------------------------------------------------------------
 * Pide la clave del Control Maestro para una acción puntual.
 * Port de `DlgClave` de `sfida_maestro.py`.
 *
 * Si el Control Maestro ya está desbloqueado, NO pregunta: devuelve autorizado
 * al instante, igual que `pedir_clave()` en la versión Qt.
 * ------------------------------------------------------------------------- */
import { useEffect, useState } from 'react';

import { useApp } from '../estado/app';
import { Boton, Campo, Dialogo, Etiqueta } from '../ui/base';
import { Icono } from '../ui/iconos';

export function DlgClave({
  abierto,
  motivo,
  alCerrar,
}: {
  abierto: boolean;
  motivo: string;
  alCerrar: (autorizado: boolean) => void;
}): React.JSX.Element | null {
  const { pedir, maestroAbierto } = useApp();
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setClave('');
    setError('');
    // Ya desbloqueado: no se vuelve a preguntar.
    if (maestroAbierto) alCerrar(true);
  }, [abierto, maestroAbierto, alCerrar]);

  if (maestroAbierto) return null;

  async function comprobar(): Promise<void> {
    const ok = await pedir(window.sfida.clave.verificar(clave));
    if (ok) {
      alCerrar(true);
      return;
    }
    setError('Clave incorrecta.');
    setClave('');
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Control Maestro"
      alCerrar={() => alCerrar(false)}
      ancho="max-w-[430px]"
      pie={
        <>
          <Boton tono="claro" onClick={() => alCerrar(false)}>Cancelar</Boton>
          <div className="flex-1" />
          <Boton tono="verde" onClick={comprobar}>Continuar</Boton>
        </>
      }
    >
      <div className="text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-celeste text-azul">
          <Icono nombre="candado" tam={26} />
        </div>
        <p className="text-[15px] font-semibold">Se necesita la clave del Control Maestro</p>
        {motivo && <p className="mt-0.5 text-[13px] text-suave">Acción: {motivo}</p>}
      </div>
      <div className="mt-4">
        <Etiqueta>Clave</Etiqueta>
        <Campo valor={clave} alCambiar={setClave} tipo="password" autoFocus alEnter={comprobar} />
        {error && (
          <div className="mt-2 rounded-lg bg-coral-clr px-3 py-2 text-[13px] font-semibold text-[#b3282c]">
            {error}
          </div>
        )}
      </div>
    </Dialogo>
  );
}
