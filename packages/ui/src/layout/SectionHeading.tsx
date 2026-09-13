import type { HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * SectionHeading — bloque encabezado de sección: eyebrow opcional,
 * título display (`.section__title`) y lead opcional (`.home-lead`).
 * El nivel del heading (`h2`/`h3`) se elige con `level` para mantener
 * la jerarquía del documento sin cambiar el estilo.
 *
 * @example
 *   <SectionHeading
 *     eyebrow="SYS // índice de vaults"
 *     title="Una materia, un vault."
 *     lead="Cada materia tiene su propio espacio de notas."
 *   />
 *   <SectionHeading title="Sub-bloque" level={3} />
 */
export interface SectionHeadingProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Texto mono en mayúsculas por encima del título. */
  eyebrow?: string;
  /** Título principal (display serif). */
  title: string;
  /** Bajada opcional; sólo se renderiza si se pasa. */
  lead?: string;
  /** Nivel del heading. Por defecto 2. */
  level?: 2 | 3;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  level = 2,
  className,
  ...rest
}: SectionHeadingProps) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className={cn(className)} {...rest}>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <Heading className="section__title">{title}</Heading>
      {lead ? <p className="home-lead">{lead}</p> : null}
    </div>
  );
}

export default SectionHeading;
