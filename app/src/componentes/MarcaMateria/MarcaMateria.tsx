/**
 * La marca de estado de una materia en el plan de estudios.
 *
 * **Es un control propio, no una casilla.** La regla del autor es explícita:
 * ningún control nativo con aspecto por defecto —`<input type="checkbox">` el
 * primero—, ninguna librería de componentes y ningún set de iconos genérico.
 * Acá eso se cumple con un `<button>` sin aspecto heredado y tres glifos
 * dibujados a mano en SVG: la doble tilde, la tilde simple y el punto.
 *
 * **Cuatro estados, y el ciclo va en el orden en que pasan las cosas** (R2):
 * pendiente → cursando → cursada → final → pendiente. La referencia cicla
 * pendiente → cursada → final; «cursando» se intercala antes porque es lo que
 * ocurre primero. El orden tiene una consecuencia práctica: *final* pasa a ser
 * el último paso, así que al recorrer el ciclo ya no se dispara de paso la
 * regla N0-19 —quitar la materia de los cuatrimestres planificados— como
 * ocurría cuando *final* venía primero.
 *
 * **Sin `title=`.** Lo que hace el clic lo cuenta un `Tooltip` propio, que
 * además dice en qué estado está la materia y a cuál va.
 *
 * Los textos son los del mockup, en voseo.
 */

import type { CSSProperties } from "react";

import type { Codigo, EstadoHistoria } from "../../contrato/tipos";
import { Tooltip } from "../primitivas";
import "./MarcaMateria.css";

/** Los cuatro estados que muestra la marca. */
export type EstadoMarca = "pendiente" | "final" | "cursada" | "cursando";

/** El orden cronológico en que el clic los recorre (R2). */
export const CICLO_MARCA: Record<EstadoMarca, EstadoMarca> = {
  pendiente: "cursando",
  cursando: "cursada",
  cursada: "final",
  final: "pendiente",
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

/** El mismo estado con mayúscula inicial, como lo escribe la burbuja. */
export const NOMBRE_MARCA: Record<EstadoMarca, string> = {
  pendiente: "Pendiente",
  final: "Aprobada con final",
  cursada: "Cursada aprobada, falta el final",
  cursando: "Cursando",
};

/** Cómo se nombra el destino del clic dentro de la burbuja. */
const DESTINO_MARCA: Record<EstadoMarca, string> = {
  pendiente: "pendiente",
  final: "aprobada con final",
  cursada: "cursada aprobada",
  cursando: "cursando",
};

/** «Pendiente · clic: cursando»: el estado de ahora y el del próximo clic. */
export function ayudaDeMarca(estado: EstadoMarca): string {
  return `${NOMBRE_MARCA[estado]} · clic: ${DESTINO_MARCA[CICLO_MARCA[estado]]}`;
}

/**
 * Los glifos, dibujados acá y no tomados de ninguna tipografía de iconos.
 *
 * La doble tilde va en un lienzo apaisado (24×16, el de la referencia) porque
 * son dos tildes una al lado de la otra; la simple y el punto, en uno cuadrado.
 */
function GlifoDeMarca({ estado }: { estado: EstadoMarca }) {
  if (estado === "pendiente") {
    return null;
  }
  if (estado === "final") {
    return (
      <svg
        className="marca-materia__glifo marca-materia__glifo--doble"
        viewBox="0 0 24 16"
        width="19"
        height="14"
        aria-hidden="true"
        focusable="false"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 8.5L6 12L11.5 4.5" />
          <path d="M9.5 8.5L13 12L18.5 4.5" />
        </g>
      </svg>
    );
  }
  return (
    <svg
      className="marca-materia__glifo"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      {estado === "cursada" ? (
        <path
          d="M3.2 8.2L6.4 11.4L12.8 4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx="8" cy="8" r="2.6" fill="currentColor" />
      )}
    </svg>
  );
}

export interface PropsMarcaMateria {
  codigo: Codigo;
  /** Nombre de la materia; entra en el nombre accesible del control. */
  nombre: string;
  estado: EstadoMarca;
  /**
   * Recibe el estado siguiente del ciclo. Sin él la marca es un dibujo y no un
   * control: así la usa la leyenda, que muestra los cuatro estados sin que
   * ninguno se pueda accionar.
   */
  alCambiar?: (siguiente: EstadoMarca) => void;
  /** Lado del cuadrado, en píxeles. 22 en el plan, 16 en la leyenda. */
  tamano?: number;
}

export function MarcaMateria({
  codigo,
  nombre,
  estado,
  alCambiar,
  tamano,
}: PropsMarcaMateria) {
  const clases = `marca-materia marca-materia--${estado}`;
  const estilo =
    tamano === undefined
      ? undefined
      : ({ "--marca-lado": `${String(tamano)}px` } as CSSProperties);

  if (alCambiar === undefined) {
    return (
      <span className={clases} style={estilo} aria-hidden="true">
        <GlifoDeMarca estado={estado} />
      </span>
    );
  }

  return (
    <Tooltip texto={ayudaDeMarca(estado)}>
      <button
        type="button"
        className={clases}
        style={estilo}
        aria-label={`${codigo} ${nombre}: ${DESCRIPCION_MARCA[estado]}`}
        onClick={() => {
          alCambiar(CICLO_MARCA[estado]);
        }}
      >
        <GlifoDeMarca estado={estado} />
      </button>
    </Tooltip>
  );
}
