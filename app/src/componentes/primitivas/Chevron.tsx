/**
 * Chevron propio: la punta de flecha que dice si una tarjeta está plegada.
 *
 * Se dibuja acá y no sale de ningún set de iconos. Es decorativo —`aria-hidden`—
 * porque quien lo acompaña siempre lleva `aria-expanded`, que es lo que un
 * lector de pantalla anuncia; dibujarlo también como imagen con nombre diría
 * dos veces lo mismo.
 */

import "./Chevron.css";

export interface PropsChevron {
  /** Apunta hacia arriba cuando está desplegado y hacia abajo cuando no. */
  abierto: boolean;
}

export function Chevron({ abierto }: PropsChevron) {
  return (
    <svg
      className={`chevron ${abierto ? "chevron--abierto" : "chevron--cerrado"}`}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
