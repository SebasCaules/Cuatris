import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * CardIcon — el cuadradito de ícono de una `.card` (`.card__ico`). El
 * tono "coral" es el default (sin modificador); "blue" agrega `.blue`
 * para la variante azul. Acepta texto (p. ej. "01", "PL") o un <Icon>.
 *
 * @example
 *   <CardIcon>01</CardIcon>
 *   <CardIcon tone="blue">PL</CardIcon>
 *   <CardIcon tone="blue"><Icon name="github" /></CardIcon>
 */
export interface CardIconProps extends HTMLAttributes<HTMLDivElement> {
  /** Tono del ícono. "coral" (default) o "blue". */
  tone?: "coral" | "blue";
  children: ReactNode;
  className?: string;
}

export function CardIcon({
  tone = "coral",
  className,
  children,
  ...rest
}: CardIconProps) {
  return (
    <div
      className={cn("card__ico", tone === "blue" && "blue", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export default CardIcon;
