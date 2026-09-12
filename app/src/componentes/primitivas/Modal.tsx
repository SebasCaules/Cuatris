/**
 * Modal centrado sobre un velo, como el «elegir comisión» de 13d.
 *
 * Foco atrapado mientras está abierto, Escape cierra, ✕ cierra, y el ancho lo
 * fija quien lo abre (13d son 1060 px de lienzo; 13j, 520).
 *
 * Se dibuja con un portal en `document.body` para que el velo cubra la
 * pantalla entera sin depender de dónde esté el componente que lo abrió.
 */

import { useId, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useFocoAtrapado } from "./foco";
import "./Modal.css";

export interface PropsModal {
  abierto: boolean;
  /** Título visible; también da el nombre accesible del diálogo. */
  titulo: string;
  /** Línea en mono bajo el título («9 comisiones · ordenadas por…»). */
  subtitulo?: ReactNode;
  /** Ancho máximo del diálogo, en píxeles. */
  ancho?: number;
  onCerrar: () => void;
  children: ReactNode;
}

export function Modal({
  abierto,
  titulo,
  subtitulo,
  ancho = 640,
  onCerrar,
  children,
}: PropsModal) {
  const caja = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  useFocoAtrapado(caja, { activo: abierto, onCerrar });

  if (!abierto) {
    return null;
  }

  return createPortal(
    <div
      className="modal__velo"
      onMouseDown={(evento) => {
        // Solo el clic que empieza y termina en el velo cierra: arrastrar una
        // selección desde adentro no tiene por qué cerrar el diálogo.
        if (evento.target === evento.currentTarget) {
          onCerrar();
        }
      }}
    >
      <div
        className="modal"
        style={{ "--modal-ancho": `${ancho}px` } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        ref={caja}
      >
        <div className="modal__cabecera">
          <h2 className="modal__titulo" id={idTitulo}>
            {titulo}
          </h2>
          <button
            type="button"
            className="modal__cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {subtitulo === undefined ? null : (
          <p className="modal__subtitulo">{subtitulo}</p>
        )}
        <div className="modal__cuerpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
