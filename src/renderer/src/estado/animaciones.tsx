/* ---------------------------------------------------------------------------
 * El interruptor de animaciones.
 *
 * Vive en Control Maestro → Respaldos y datos, se guarda en `config` y de
 * fábrica viene ENCENDIDO. Las PC del almacén pueden ser viejas y ahí el
 * movimiento estorba más de lo que ayuda.
 *
 * Además se respeta SIEMPRE `prefers-reduced-motion` del sistema: si la
 * persona lo pidió a nivel de Windows, no hay animación aunque el interruptor
 * esté encendido.
 * ------------------------------------------------------------------------- */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface Ctx {
  activas: boolean;
  encendidas: boolean;
  setEncendidas: (v: boolean) => void;
}

const Contexto = createContext<Ctx>({ activas: true, encendidas: true, setEncendidas: () => {} });

export function ProveedorAnimaciones({ children }: { children: ReactNode }): React.JSX.Element {
  const [encendidas, setEncendidasEstado] = useState(true);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    void window.sfida.sistema.animaciones().then((r) => {
      if (r.ok) setEncendidasEstado(r.datos);
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aplicar = (): void => setReduce(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  const valor = useMemo<Ctx>(
    () => ({
      activas: encendidas && !reduce,
      encendidas,
      setEncendidas: (v: boolean) => {
        setEncendidasEstado(v);
        void window.sfida.sistema.setAnimaciones(v);
      },
    }),
    [encendidas, reduce],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** ¿Hay que animar? Combina el interruptor propio con el del sistema. */
export function useAnimaciones(): boolean {
  return useContext(Contexto).activas;
}

export function useInterruptorAnimaciones(): Ctx {
  return useContext(Contexto);
}
