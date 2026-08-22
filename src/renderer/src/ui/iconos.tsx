/* ---------------------------------------------------------------------------
 * Iconos. Son los mismos que dibujaba `icono()` en `sfida_estilo.py`, pasados
 * a SVG: mismo trazo de 1.7, mismas proporciones sobre una caja de 20×20.
 * ------------------------------------------------------------------------- */
import type { ReactNode } from 'react';

function Svg({ children, tam = 20 }: { children: ReactNode; tam?: number }): React.JSX.Element {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export type NombreIcono =
  | 'panel' | 'caja' | 'entrada' | 'salida' | 'tienda' | 'reporte' | 'candado'
  | 'buscar' | 'alerta' | 'impresora' | 'etiqueta';

export function Icono({ nombre, tam = 20 }: { nombre: NombreIcono; tam?: number }): React.JSX.Element {
  switch (nombre) {
    case 'panel':
      return (
        <Svg tam={tam}>
          <rect x="3" y="3" width="6" height="6" rx="2" />
          <rect x="11" y="3" width="6" height="6" rx="2" />
          <rect x="3" y="11" width="6" height="6" rx="2" />
          <rect x="11" y="11" width="6" height="6" rx="2" />
        </Svg>
      );
    case 'caja':
      return (
        <Svg tam={tam}>
          <path d="M3 6 L10 2.5 L17 6 L17 14 L10 17.5 L3 14 Z" />
          <path d="M3 6 L10 9.5 L17 6" />
          <path d="M10 9.5 L10 17.5" />
        </Svg>
      );
    case 'entrada':
      return (
        <Svg tam={tam}>
          <path d="M10 3 L10 12" />
          <path d="M6 8.5 L10 12.5 L14 8.5" />
          <path d="M4 16 L16 16" />
        </Svg>
      );
    case 'salida':
      return (
        <Svg tam={tam}>
          <path d="M10 12.5 L10 3.5" />
          <path d="M6 7 L10 3 L14 7" />
          <path d="M4 16 L16 16" />
        </Svg>
      );
    case 'tienda':
      return (
        <Svg tam={tam}>
          <path d="M3 8 L17 8" />
          <path d="M3 8 L5 3.5 L15 3.5 L17 8" />
          <path d="M4.5 8 L4.5 16.5 L15.5 16.5 L15.5 8" />
          <rect x="8" y="11" width="4" height="5.5" rx="1" />
        </Svg>
      );
    case 'reporte':
      return (
        <Svg tam={tam}>
          <path d="M3.5 16.5 L16.5 16.5" />
          <path d="M3.5 16.5 L3.5 3.5" />
          <rect x="6" y="10" width="2.6" height="5" fill="currentColor" stroke="none" />
          <rect x="10" y="6.5" width="2.6" height="8.5" fill="currentColor" stroke="none" />
          <rect x="14" y="12" width="2.6" height="3" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'candado':
      return (
        <Svg tam={tam}>
          <rect x="4.5" y="9" width="11" height="8" rx="2" />
          <path d="M7 11 A3 3 0 0 1 13 11" />
          <circle cx="10" cy="13" r="1" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'buscar':
      return (
        <Svg tam={tam}>
          <circle cx="8.5" cy="8.5" r="5" />
          <path d="M12.5 12.5 L17 17" />
        </Svg>
      );
    case 'alerta':
      return (
        <Svg tam={tam}>
          <path d="M10 3 L17.5 16.5 L2.5 16.5 Z" />
          <path d="M10 8 L10 12" />
          <circle cx="10" cy="14.2" r="0.7" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'impresora':
      return (
        <Svg tam={tam}>
          <path d="M5.5 8 L5.5 3 L14.5 3 L14.5 8" />
          <rect x="2.5" y="8" width="15" height="6.5" rx="2" />
          <path d="M5.5 12 L5.5 17.5 L14.5 17.5 L14.5 12 Z" />
          <circle cx="14.2" cy="10.2" r="0.8" fill="currentColor" stroke="none" />
        </Svg>
      );
    case 'etiqueta':
      return (
        <Svg tam={tam}>
          <path d="M3 10.5 L10 3.5 L16.5 3.5 L16.5 10 L9.5 17 Z" />
          <circle cx="13.4" cy="7.4" r="1.1" fill="currentColor" stroke="none" />
        </Svg>
      );
  }
}
