"use client";

// Controles flotantes de zoom y encuadre del mapa de correlativas (PLAN.md
// §1.2 y §2.5): cuatro botones de ícono, sin una sola palabra que los
// describa — cada uno se explica por su forma y, al posarse, por su propio
// `Tooltip` (nunca `title=`).
//
// El contenedor frena la propagación de onPointerDown/onPointerUp/onClick:
// `.grafo-controls` vive dentro de `.grafo-viewport`, que es quien escucha
// esos mismos eventos más arriba en el árbol (useViewport.handlers) para
// interpretar arrastre y tap sobre el lienzo. Sin frenar la propagación acá,
// un clic en un botón también se leería como el arranque de un pan o como un
// tap en el vacío.
import type { ReactNode } from "react";
import { memo } from "react";
import { Tooltip } from "@/components/planner/Tooltip";

export interface GrafoControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onLocate: () => void;
}

/** Ícono propio del mapa (viewBox 24×24, trazo 1.9 redondeado): se arma acá
 *  en vez de tomarlo de `icons.tsx` porque ese set usa 1.6 — este control
 *  pide su propio grosor (contrato U4). */
function GIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconZoomIn = () => (
  <GIcon>
    <path d="M12 5v14M5 12h14" />
  </GIcon>
);

const IconZoomOut = () => (
  <GIcon>
    <path d="M5 12h14" />
  </GIcon>
);

const IconFit = () => (
  <GIcon>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </GIcon>
);

const IconLocate = () => (
  <GIcon>
    <circle cx="12" cy="12" r="6.5" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
  </GIcon>
);

const LOCATE_LABEL = "Ir a donde estoy: el primer cuatrimestre con materias pendientes";

function GrafoControlsInner({ onZoomIn, onZoomOut, onFit, onLocate }: GrafoControlsProps) {
  return (
    <div
      className="grafo-controls"
      role="group"
      aria-label="Zoom y encuadre"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Tooltip content="Acercar" width={96}>
        <button type="button" className="grafo-btn" aria-label="Acercar" onClick={onZoomIn}>
          <IconZoomIn />
        </button>
      </Tooltip>
      <Tooltip content="Alejar" width={96}>
        <button type="button" className="grafo-btn" aria-label="Alejar" onClick={onZoomOut}>
          <IconZoomOut />
        </button>
      </Tooltip>
      <Tooltip content="Ver toda la carrera" width={160}>
        <button
          type="button"
          className="grafo-btn"
          aria-label="Ver toda la carrera"
          onClick={onFit}
        >
          <IconFit />
        </button>
      </Tooltip>
      <Tooltip content={LOCATE_LABEL} width={230}>
        <button type="button" className="grafo-btn" aria-label={LOCATE_LABEL} onClick={onLocate}>
          <IconLocate />
        </button>
      </Tooltip>
    </div>
  );
}

// memo: los callbacks llegan estables desde la vista; nada que re-renderizar por hover
export const GrafoControls = memo(GrafoControlsInner);
