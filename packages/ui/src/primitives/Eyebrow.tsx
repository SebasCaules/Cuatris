import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Eyebrow — el `.eyebrow` del sistema, antetítulo mono sobre headings.
 * Renderiza `<p>` por defecto; `as` permite `<span>` o `<div>`.
 *
 * @example
 *   <Eyebrow>Materia</Eyebrow>
 *   <Eyebrow as="span">Sección 03</Eyebrow>
 */
export interface EyebrowProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Elemento contenedor. Por defecto `"p"`. */
  as?: "p" | "span" | "div";
  children: ReactNode;
  className?: string;
}

export function Eyebrow({
  as: Tag = "p",
  className,
  children,
  ...rest
}: EyebrowProps) {
  return (
    <Tag className={cn("eyebrow", className)} {...rest}>
      {children}
    </Tag>
  );
}

export default Eyebrow;
