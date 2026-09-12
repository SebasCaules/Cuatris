/**
 * Nota punteada. Es el recurso que el diseño usa para «esto todavía no está»:
 * el borde `1.5px dotted` de `tokens.md` dice «dato pendiente» sin gritar.
 *
 * - `linea`: una sola línea, sin relleno. «— 15.09 Agile / Lean · sin horario
 *   publicado» y «Horarios publicados hace 3 días» de 13b.
 * - `caja`: con relleno `--sin-horario-fondo`, para un párrafo. El cuatrimestre
 *   sin horarios publicados de 13b/13g.
 *
 * El texto lo pone quien la usa: acá no se inventa ninguna leyenda.
 */

import type { ReactNode } from "react";

import "./Nota.css";

export type VarianteNota = "linea" | "caja";

export interface PropsNota {
  variante?: VarianteNota;
  children: ReactNode;
}

export function Nota({ variante = "linea", children }: PropsNota) {
  return <p className={`nota nota--${variante}`}>{children}</p>;
}
