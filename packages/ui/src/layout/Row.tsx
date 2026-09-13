import type { ReactNode, HTMLAttributes, CSSProperties } from "react";
import { cn } from "../cn";

/**
 * Row — la fila utilitaria `.sv-row` (flex con wrap, alineada al
 * centro). El `gap` (en px) se inyecta como la custom property
 * `--sv-row-gap`, que el CSS lee con fallback.
 *
 * @example
 *   <Row gap={12}>
 *     <Button variant="primary">Aceptar</Button>
 *     <Button variant="ghost">Cancelar</Button>
 *   </Row>
 */
export interface RowProps extends HTMLAttributes<HTMLDivElement> {
  /** Separación entre hijos en px (setea `--sv-row-gap`). */
  gap?: number;
  children: ReactNode;
  className?: string;
}

export function Row({ gap, className, style, children, ...rest }: RowProps) {
  const mergedStyle =
    gap != null
      ? ({ ...style, "--sv-row-gap": `${gap}px` } as CSSProperties)
      : style;
  return (
    <div className={cn("sv-row", className)} style={mergedStyle} {...rest}>
      {children}
    </div>
  );
}

export default Row;
