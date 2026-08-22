import type { ApiSfida } from '../../compartido/contrato';

declare global {
  interface Window {
    /** Lo que expone el preload. Es la única puerta al proceso principal. */
    sfida: ApiSfida;
  }
}

export {};
