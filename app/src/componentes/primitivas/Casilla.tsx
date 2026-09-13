/**
 * Casilla propia: marcada, vacía o mixta.
 *
 * **Ningún `<input>`.** Es un `<button role="checkbox">`: el botón trae gratis
 * el foco, Espacio y Enter, y `role="checkbox"` con `aria-checked` es lo que
 * hace que un lector de pantalla la anuncie como casilla. El aspecto es todo
 * nuestro —16×16, radio 4, contorno de `--linea-fuerte`— y no hereda nada del
 * navegador.
 *
 * El tercer estado («mixed») no es decorativo: una casilla de año con la mitad
 * de las materias marcadas tiene que poder decir «algo, pero no todo».
 */

import type { MouseEvent } from "react";

import "./Casilla.css";

/** Marcada, vacía, o marcada a medias. */
export type EstadoCasilla = boolean | "mixed";

export interface PropsCasilla {
  marcada: EstadoCasilla;
  /** Nombre accesible; la casilla no lleva texto al lado. */
  etiqueta: string;
  alAccionar: () => void;
  "aria-describedby"?: string;
}

export function Casilla({
  marcada,
  etiqueta,
  alAccionar,
  "aria-describedby": describedby,
}: PropsCasilla) {
  const estado = marcada === true ? "marcada" : marcada === "mixed" ? "mixta" : "vacia";

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcada === "mixed" ? "mixed" : marcada}
      aria-label={etiqueta}
      className={`casilla casilla--${estado}`}
      {...(describedby === undefined ? {} : { "aria-describedby": describedby })}
      onClick={(evento: MouseEvent<HTMLButtonElement>) => {
        /*
         * La casilla vive dentro de la cabecera de la tarjeta, que al clic
         * pliega o despliega el año. Marcar un año no es plegarlo: el evento
         * se corta acá.
         */
        evento.stopPropagation();
        alAccionar();
      }}
    >
      {marcada === false ? null : (
        <svg
          className="casilla__glifo"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
          focusable="false"
        >
          {marcada === "mixed" ? (
            <path
              d="M4 8L12 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M3.5 8.4L6.6 11.4L12.5 4.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      )}
    </button>
  );
}
