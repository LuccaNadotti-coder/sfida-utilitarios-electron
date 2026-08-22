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

/* --------------------------------------------------------------- el ritmo
 *
 * Un solo vocabulario de curvas y tiempos para toda la aplicación. Cuando cada
 * pantalla elige los suyos, el conjunto se siente desprolijo aunque cada parte
 * por separado esté bien: una cosa tarda 150 ms, la de al lado 400, y la
 * sensación es de que el programa responde a destiempo.
 *
 * La regla: lo que la persona TOCA responde casi al instante (RAPIDO); lo que
 * aparece solo puede tomarse un poco más (NORMAL); y lo que se mueve de un
 * lugar a otro usa un resorte, que es lo que se lee como «moderno» y no como
 * «una diapositiva».
 * ------------------------------------------------------------------------- */

/** Curva de salida suave: arranca rápido y frena. Es la de toda la app. */
export const CURVA = [0.22, 0.61, 0.36, 1] as const;

export const RAPIDO = 0.14;
export const NORMAL = 0.22;
export const PAUSADO = 0.34;

/** Resorte para lo que se DESPLAZA (la pastilla del menú, los chips). */
export const RESORTE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.7 } as const;

/**
 * Escalón de la entrada en cascada de una lista.
 *
 * Va topeado a propósito: con 200 filas, un escalón por fila haría que la
 * última apareciera varios segundos después. Se cortan las primeras y el resto
 * entra junto — se lee como un barrido, que es lo que se busca, y nunca hace
 * esperar.
 */
export function cascada(i: number, paso = 0.014, tope = 14): number {
  return Math.min(i, tope) * paso;
}
