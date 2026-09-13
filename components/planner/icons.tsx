"use client";

// Set de iconos finos estandarizados del planner. Un único sistema visual para
// toda la página (Plan de cursada, modal de detalle, sidebar, topbar): reemplaza
// los glyphs sueltos (× ✓ ↗ ↓ › ‹ ▸) y el emoji 🎓 por line-icons coherentes.
//
// Convención: viewBox 24×24, trazo `currentColor` de 1.6, remates redondeados,
// sin relleno. `size` controla ancho=alto (default 16). Heredan el color del
// texto → se tematizan solos. Para decorativos pasar el icono dentro de un
// contenedor con aria-hidden; para botones-solo-icono, el aria-label va en el
// <button>.
//
// Uso: <IconClose /> · <IconDownload size={15} /> · <IconCalendar className="x" />

import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  /** ancho = alto en px (default 16). */
  size?: number;
}

/** Wrapper base: fija viewBox/stroke/linecap comunes; el resto pasa por props. */
function Svg({ size = 16, strokeWidth = 1.6, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------- acciones básicas ---------- */

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.4-3.4" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 4h4M9.5 7l.6 12a1 1 0 0 0 1 .95h1.8a1 1 0 0 0 1-.95L15.5 7" />
  </Svg>
);

export const IconRotateCcw = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5v5h5" />
    <path d="M4.5 10a8 8 0 1 1-1.5 5.5" />
  </Svg>
);

/* ---------- flechas / chevrons ---------- */

export const IconArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
  </Svg>
);

export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 6 8.5 12l6 6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Svg>
);

/* ---------- dominio / navegación ---------- */

/** Panel/sidebar cerrándose (columna izquierda + flecha hacia adentro). */
export const IconPanelLeftClose = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9.5 4v16" />
    <path d="M16 9.5 13.5 12l2.5 2.5" />
  </Svg>
);

/** Panel/sidebar abriéndose (columna izquierda + flecha hacia afuera). */
export const IconPanelLeftOpen = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9.5 4v16" />
    <path d="M13.5 9.5 16 12l-2.5 2.5" />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
  </Svg>
);

/** Roadmap: hitos conectados (dos nodos + curva). */
export const IconRoute = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8 17.5h6a3 3 0 0 0 3-3V8.5" />
  </Svg>
);

/** Sliders horizontales: ajuste / método de optimización. */
export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="17" r="2" />
  </Svg>
);

/** Birrete (graduación) en trazo fino. */
export const IconGraduationCap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 2.5 9 12 14l9.5-5L12 4Z" />
    <path d="M6.5 11v4.2c0 1.2 2.5 2.3 5.5 2.3s5.5-1.1 5.5-2.3V11" />
    <path d="M21.5 9v4.5" />
  </Svg>
);

/** Manija de arrastre (grip de 6 puntos). */
export const IconGrip = (p: IconProps) => (
  <Svg {...p} strokeWidth={p.strokeWidth ?? 1.4}>
    <circle cx="9" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="15" cy="18" r="1" />
  </Svg>
);

/** Capas apiladas (minors / áreas). */
export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="M3 13l9 5 9-5M3 10.5l9 5 9-5" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const IconPrinter = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5" />
    <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="7" y="15" width="10" height="5" rx="1" />
  </Svg>
);

/** Hoja con dos flechas hacia el centro: "todo comprimido en una carilla". */
export const IconCompactPage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M7.5 12h9" />
    <path d="M9.5 8 12 10.5 14.5 8" />
    <path d="M9.5 16 12 13.5 14.5 16" />
  </Svg>
);

export const IconFileText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

/** Balanza (carga pareja / equilibrio). */
export const IconScale = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v16M7 20h10M4.5 8h15l-2.5 5a2.5 2.5 0 0 1-5 0L4.5 8Zm0 0 2.5 5a2.5 2.5 0 0 1-5 0L4.5 8Z" />
    <path d="M8 6.5 12 5l4 1.5" />
  </Svg>
);

/** Candado cerrado (cuatri finalizado / correlativa de final bloqueada). */
export const IconLock = (p: IconProps) => (
  <Svg size={15} strokeWidth={1.7} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

/** Candado abierto (desbloquear cuatri). */
export const IconUnlock = (p: IconProps) => (
  <Svg size={15} strokeWidth={1.7} {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 7.5-1.3" />
  </Svg>
);
