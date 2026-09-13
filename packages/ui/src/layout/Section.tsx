import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Section — el `.section` del sistema (padding vertical de sección).
 * Si `container` es true, suma `.container` para centrar el contenido
 * sin anidar un wrapper extra. Polimórfico vía `as`.
 *
 * @example
 *   <Section>bloque con respiro vertical</Section>
 *   <Section container as="section" id="materias">…</Section>
 */
export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Elemento a renderizar. Por defecto "div". */
  as?: "div" | "section" | "header" | "footer";
  /** Si true, agrega `.container` (ancho máximo + padding horizontal). */
  container?: boolean;
  children: ReactNode;
  className?: string;
}

export function Section({
  as: Tag = "div",
  container,
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <Tag
      className={cn("section", container && "container", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export default Section;
