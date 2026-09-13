/**
 * Glifos de estado (tokens.md, «Estados»): el estado se marca con borde y
 * glifo, nunca con el relleno, porque el relleno ya identifica a la materia.
 *
 * Cada glifo es un `role="img"` con nombre accesible: un «◐» suelto no dice
 * nada en un lector de pantalla.
 */

import { Tooltip } from "./Tooltip";
import "./Glifo.css";

export type NombreGlifo =
  | "aprobada"
  | "cursando"
  | "planificada"
  | "disponible"
  | "bloqueada"
  | "sinHorario"
  | "choque"
  | "cupoLleno"
  | "cambioDeSede";

/** Signo y nombre accesible de cada estado, tal como los fija `tokens.md`. */
const GLIFOS: Record<NombreGlifo, { signo: string; etiqueta: string }> = {
  aprobada: { signo: "✓", etiqueta: "Aprobada" },
  cursando: { signo: "●", etiqueta: "Cursando" },
  planificada: { signo: "◇", etiqueta: "Planificada" },
  disponible: { signo: "○", etiqueta: "Disponible" },
  bloqueada: { signo: "⊘", etiqueta: "Bloqueada" },
  sinHorario: { signo: "—", etiqueta: "Sin horario publicado" },
  choque: { signo: "▲", etiqueta: "Choque de horario" },
  cupoLleno: { signo: "◐", etiqueta: "Cupo lleno" },
  cambioDeSede: { signo: "↕", etiqueta: "Cambio de sede" },
};

/** Los nueve estados, en el orden de la tabla de `tokens.md`. */
export const NOMBRES_GLIFO = Object.keys(GLIFOS) as NombreGlifo[];

export interface PropsGlifo {
  nombre: NombreGlifo;
  /** Reemplaza el nombre accesible por uno más específico del contexto. */
  etiqueta?: string;
  /**
   * Texto de la burbuja que explica el estado (R2). Sin él el glifo no lleva
   * tooltip: en una lista de nueve glifos iguales, nueve burbujas serían ruido.
   */
  descripcion?: string;
}

export function Glifo({ nombre, etiqueta, descripcion }: PropsGlifo) {
  const glifo = GLIFOS[nombre];
  const signo = (
    <span
      className={`glifo glifo--${nombre}`}
      role="img"
      aria-label={etiqueta ?? glifo.etiqueta}
    >
      {glifo.signo}
    </span>
  );
  if (descripcion === undefined) {
    return signo;
  }
  return <Tooltip texto={descripcion}>{signo}</Tooltip>;
}
