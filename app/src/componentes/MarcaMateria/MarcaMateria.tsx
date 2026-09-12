/**
 * La marca de estado de una materia en el plan de estudios (R1).
 *
 * **Es un control propio, no una casilla.** La regla del autor es explícita:
 * ningún control nativo con aspecto por defecto —`<input type="checkbox">` el
 * primero—, ninguna librería de componentes y ningún set de iconos genérico.
 * Acá eso se cumple con un `<button>` sin aspecto heredado y tres glifos
 * dibujados a mano en SVG: la doble tilde, la tilde simple y el punto.
 *
 * **Cuatro estados, no dos.** Una materia puede estar aprobada con final,
 * aprobada de cursada pero con el final pendiente, cursándose ahora, o nada de
 * eso. Un clic cicla en ese orden y vuelve al principio; con el teclado, Enter
 * o Espacio hacen lo mismo, porque es un botón de verdad.
 *
 * Los textos son los del mockup, en voseo.
 */

import type { Codigo, EstadoHistoria } from "../../contrato/tipos";
import "./MarcaMateria.css";

/** Los cuatro estados que muestra la marca. */
export type EstadoMarca = "pendiente" | "final" | "cursada" | "cursando";

/** El orden en que el clic los recorre. */
export const CICLO_MARCA: Record<EstadoMarca, EstadoMarca> = {
  pendiente: "final",
  final: "cursada",
  cursada: "cursando",
  cursando: "pendiente",
};

/**
 * Cómo se guarda cada estado en `historia` (CONTRATO-v1 §6).
 *
 * «Pendiente» es `null` a propósito: no se guarda una entrada que diga «no
 * hice nada», se borra la que hubiera.
 */
export const ESTADO_GUARDADO: Record<EstadoMarca, EstadoHistoria | null> = {
  pendiente: null,
  final: "aprobada",
  cursada: "regular",
  cursando: "cursando",
};

/** La vuelta: qué marca corresponde a lo que hay guardado. */
export function marcaDeHistoria(
  guardado: EstadoHistoria | undefined,
): EstadoMarca {
  switch (guardado) {
    case "aprobada":
      return "final";
    case "regular":
      return "cursada";
    case "cursando":
      return "cursando";
    default:
      return "pendiente";
  }
}

/** Cómo se lee cada estado en voz alta; entra en el `aria-label`. */
export const DESCRIPCION_MARCA: Record<EstadoMarca, string> = {
  pendiente: "pendiente",
  final: "aprobada con final",
  cursada: "cursada aprobada, falta el final",
  cursando: "cursando",
};

/** La ayuda que aparece al dejar el puntero encima. */
export const AYUDA_MARCA = "Clic: cambia el estado";

/**
 * Los glifos, dibujados acá y no tomados de ninguna tipografía de iconos.
 *
 * El lienzo es 20×20 para que el trazo caiga sobre medios píxeles nada más en
 * los extremos; el botón lo escala a los ~28 px de la captura.
 */
function GlifoDeMarca({ estado }: { estado: EstadoMarca }) {
  if (estado === "pendiente") {
    return null;
  }
  return (
    <svg
      className="marca-materia__glifo"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      {estado === "final" ? (
        /* Doble tilde: la de la captura. Dos trazos iguales, uno corrido. */
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 10.5 L5.8 14.3 L11.4 6.2" />
          <path d="M8.6 10.5 L12.4 14.3 L18 6.2" />
        </g>
      ) : null}
      {estado === "cursada" ? (
        <path
          d="M4.4 10.4 L8.4 14.4 L15.6 5.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {estado === "cursando" ? (
        <circle cx="10" cy="10" r="3.4" fill="currentColor" />
      ) : null}
    </svg>
  );
}

export interface PropsMarcaMateria {
  codigo: Codigo;
  /** Nombre de la materia; entra en el nombre accesible del control. */
  nombre: string;
  estado: EstadoMarca;
  /** Recibe el estado siguiente del ciclo. */
  alCambiar: (siguiente: EstadoMarca) => void;
}

export function MarcaMateria({
  codigo,
  nombre,
  estado,
  alCambiar,
}: PropsMarcaMateria) {
  return (
    <button
      type="button"
      className={`marca-materia marca-materia--${estado}`}
      aria-label={`${codigo} ${nombre}: ${DESCRIPCION_MARCA[estado]}`}
      title={AYUDA_MARCA}
      onClick={() => {
        alCambiar(CICLO_MARCA[estado]);
      }}
    >
      <GlifoDeMarca estado={estado} />
    </button>
  );
}
