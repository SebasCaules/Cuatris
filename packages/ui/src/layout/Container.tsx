import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Container — el `.container` del sistema: ancho máximo centrado con
 * padding horizontal. Polimórfico vía `as` para emitir el elemento
 * semántico correcto (section/header/footer) sin perder el layout.
 *
 * @example
 *   <Container>contenido centrado</Container>
 *   <Container as="header" className="site-head">…</Container>
 */
export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  /** Elemento a renderizar. Por defecto "div". */
  as?: "div" | "section" | "header" | "footer";
  children: ReactNode;
  className?: string;
}

export function Container({
  as: Tag = "div",
  className,
  children,
  ...rest
}: ContainerProps) {
  return (
    <Tag className={cn("container", className)} {...rest}>
      {children}
    </Tag>
  );
}

export default Container;
