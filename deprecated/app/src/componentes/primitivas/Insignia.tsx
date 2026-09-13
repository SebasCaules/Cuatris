/**
 * Insignia: la marca chica de color que acompaña a una materia.
 *
 * - `minor`: la sigla del minor sobre su color (DESIGN.md §6): relleno al
 *   16 %, borde al 42 %, texto en tinta. El color viaja por `color` como una
 *   custom property (`var(--minor-cd)`), igual que el contrato `MinorBadge`
 *   de StudyVaults.
 * - `troncal`: la marca de obligatoria, en el azul de `--primario` (DESIGN.md
 *   §3).
 *
 * Es un `span` que reenvía sus props: así `Tooltip` puede colgarle la burbuja
 * sin envolverla. Sin `titulo` la sigla se lee tal cual; con él, el nombre
 * accesible es el nombre completo del minor.
 */

import type { CSSProperties, HTMLAttributes } from "react";

import "./Insignia.css";

export type TonoInsignia = "minor" | "troncal";

export interface PropsInsignia extends HTMLAttributes<HTMLSpanElement> {
  tono: TonoInsignia;
  /** Color de la insignia de minor, como `var(--minor-cd)`. */
  color?: string;
  /** Nombre accesible cuando la sigla no alcanza. Nunca es un `title=`. */
  titulo?: string;
}

export function Insignia({
  tono,
  color,
  titulo,
  className,
  style,
  children,
  ...resto
}: PropsInsignia) {
  const estilo =
    color === undefined
      ? style
      : ({ ...style, "--insignia-color": color } as CSSProperties);
  return (
    <span
      {...resto}
      className={`insignia insignia--${tono}${
        className === undefined ? "" : ` ${className}`
      }`}
      style={estilo}
      aria-label={titulo}
    >
      {children}
    </span>
  );
}
