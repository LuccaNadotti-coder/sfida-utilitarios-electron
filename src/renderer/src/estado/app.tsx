/* ---------------------------------------------------------------------------
 * Estado compartido de la aplicación: avisos, clave del Control Maestro y el
 * atajo `pedir()` que desenvuelve las respuestas del IPC.
 * ------------------------------------------------------------------------- */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Respuesta } from '../../../compartido/contrato';
import type { TipoAviso } from '../ui/base';

export interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}

interface Ctx {
  avisos: Aviso[];
  avisar: (texto: string, tipo?: TipoAviso) => void;
  /**
   * Desenvuelve una `Respuesta<T>`: devuelve los datos, o `null` mostrando el
   * mensaje de error. Así ninguna pantalla tiene que repetir el if.
   */
  pedir: <T>(p: Promise<Respuesta<T>>, opciones?: { silencioso?: boolean }) => Promise<T | null>;
  maestroAbierto: boolean;
  setMaestroAbierto: (v: boolean) => void;
  refrescos: number;
  refrescarTodo: () => void;
}

const Contexto = createContext<Ctx | null>(null);

export function ProveedorApp({ children }: { children: ReactNode }): React.JSX.Element {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [maestroAbierto, setMaestroAbierto] = useState(false);
  const [refrescos, setRefrescos] = useState(0);
  const contador = useRef(0);

  const avisar = useCallback((texto: string, tipo: TipoAviso = 'ok') => {
    contador.current += 1;
    const id = contador.current;
    setAvisos((prev) => [...prev.slice(-2), { id, texto, tipo }]);
    // 6 segundos, igual que la versión Qt.
    setTimeout(() => setAvisos((prev) => prev.filter((a) => a.id !== id)), 6000);
  }, []);

  const pedir = useCallback(
    async <T,>(p: Promise<Respuesta<T>>, opciones?: { silencioso?: boolean }): Promise<T | null> => {
      const r = await p;
      if (r.ok) return r.datos;
      if (!opciones?.silencioso) avisar(r.error.mensaje, 'err');
      return null;
    },
    [avisar],
  );

  const valor = useMemo<Ctx>(
    () => ({
      avisos,
      avisar,
      pedir,
      maestroAbierto,
      setMaestroAbierto,
      refrescos,
      refrescarTodo: () => setRefrescos((n) => n + 1),
    }),
    [avisos, avisar, pedir, maestroAbierto, refrescos],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error('useApp fuera del ProveedorApp');
  return c;
}
