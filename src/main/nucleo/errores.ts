/* ---------------------------------------------------------------------------
 * Port de `class ErrorNegocio(Exception)` de `sfida_core.py`.
 *
 * Es el error CONTROLADO que se le muestra a la persona en pantalla. La regla
 * de la versión Qt sigue valiendo: nunca dejar que reviente con un traceback
 * delante del usuario.
 * ------------------------------------------------------------------------- */
import type { ErrorNegocioSerializado } from '../../compartido/contrato';

export class ErrorNegocio extends Error {
  readonly esErrorNegocio = true;

  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

/** Deja cualquier error listo para cruzar el IPC sin perder el mensaje. */
export function serializarError(e: unknown): ErrorNegocioSerializado {
  if (e instanceof ErrorNegocio) {
    return { __errorNegocio: true, mensaje: e.message };
  }
  // Un error inesperado no se le muestra crudo a la persona del almacén, pero
  // sí queda entero en la consola del proceso principal para poder depurarlo.
  console.error('[SFIDA] error inesperado:', e);
  const detalle = e instanceof Error ? e.message : String(e);
  return {
    __errorNegocio: true,
    mensaje: `Ocurrió un problema inesperado. Avise al responsable del sistema.\n\nDetalle técnico: ${detalle}`,
  };
}
