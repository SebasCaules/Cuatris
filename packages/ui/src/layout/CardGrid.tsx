import type { ReactNode, HTMLAttributes, CSSProperties } from "react";
import { cn } from "../cn";

/**
 * CardGrid — la grilla `.cards` (auto-fit con minmax). Por defecto usa
 * el minmax del CSS; si se pasa `min` (px), se sobreescribe el
 * `grid-template-columns` vía style para apretar/aflojar la grilla.
 *
 * @example
 *   <CardGrid>
 *     <Card>…</Card>
 *     <Card>…</Card>
 *   </CardGrid>
 *   <CardGrid min={200}>…</CardGrid>
 */
export interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Ancho mínimo de columna en px (overridea el minmax del CSS). */
  min?: number;
  children: ReactNode;
  className?: string;
}

export function CardGrid({
  min,
  className,
  style,
  children,
  ...rest
}: CardGridProps) {
  const mergedStyle: CSSProperties | undefined =
    min != null
      ? {
          ...style,
          gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        }
      : style;
  return (
    <div className={cn("cards", className)} style={mergedStyle} {...rest}>
      {children}
    </div>
  );
}

export default CardGrid;
