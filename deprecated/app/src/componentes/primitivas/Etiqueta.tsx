/**
 * Etiqueta en mono para los datos duros: códigos de materia, horas y aulas.
 *
 * Talla 8.5–9 px, la del mockup: JetBrains Mono e IBM Plex Mono son
 * equivalentes en ancho, así que estas medidas no se reajustan (tokens.md).
 *
 * - `plana`: texto solo. El «93.18» de una lista de resultados.
 * - `contorno`: caja fina. La etiqueta de aula dentro de un bloque de la
 *   grilla, que en el mockup toma el color de la materia; por eso `color`
 *   admite un color de materia (`var(--materia-3)`, por ejemplo).
 */

import type { CSSProperties, ReactNode } from "react";

import "./Etiqueta.css";

export type VarianteEtiqueta = "plana" | "contorno";

export interface PropsEtiqueta {
  variante?: VarianteEtiqueta;
  /** Color del contorno; por defecto, la línea de la grilla. */
  color?: string;
  /**
   * Nombre accesible cuando el texto abreviado no se entiende solo. **No es un
   * `title=`**: para que se vea con el mouse hay que envolverla en `Tooltip`.
   */
  titulo?: string;
  children: ReactNode;
}

export function Etiqueta({
  variante = "plana",
  color,
  titulo,
  children,
}: PropsEtiqueta) {
  const estilo =
    color === undefined
      ? undefined
      : ({ "--etiqueta-color": color } as CSSProperties);
  return (
    <span
      className={`etiqueta etiqueta--${variante}`}
      style={estilo}
      aria-label={titulo}
    >
      {children}
    </span>
  );
}
