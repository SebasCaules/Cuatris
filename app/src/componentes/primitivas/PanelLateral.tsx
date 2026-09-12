/**
 * Panel que entra por la derecha, como el «Agregar a 1.º 2026» de 13c.
 *
 * No es un modal: mientras buscás se sigue viendo el carrusel, que es
 * justamente la razón de que en 13c el panel sea un panel y no un diálogo. Por
 * eso no lleva velo ni `aria-modal`, pero sí atrapa el foco y cierra con
 * Escape: quien llega con el teclado tiene que poder salir.
 */

import { useId, useRef, type CSSProperties, type ReactNode } from "react";

import { useFocoAtrapado } from "./foco";
import "./PanelLateral.css";

export interface PropsPanelLateral {
  abierto: boolean;
  /** Título de la cabecera; también da el nombre accesible del panel. */
  titulo: string;
  /** Ancho del panel, en píxeles (13c: 330). */
  ancho?: number;
  onCerrar: () => void;
  children: ReactNode;
}

export function PanelLateral({
  abierto,
  titulo,
  ancho = 330,
  onCerrar,
  children,
}: PropsPanelLateral) {
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  useFocoAtrapado(caja, { activo: abierto, onCerrar });

  if (!abierto) {
    return null;
  }

  return (
    <div
      className="panel-lateral"
      style={{ "--panel-ancho": `${ancho}px` } as CSSProperties}
      role="dialog"
      aria-labelledby={idTitulo}
      tabIndex={-1}
      ref={caja}
    >
      <div className="panel-lateral__cabecera">
        <h2 className="panel-lateral__titulo" id={idTitulo}>
          {titulo}
        </h2>
        <button
          type="button"
          className="panel-lateral__cerrar"
          onClick={onCerrar}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <div className="panel-lateral__cuerpo">{children}</div>
    </div>
  );
}
