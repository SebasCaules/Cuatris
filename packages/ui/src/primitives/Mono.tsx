import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Mono — el `.vtool-mono` del sistema, código inline monoespaciado.
 * Renderiza `<code>` con el chip mono ya estilado por el CSS.
 *
 * @example
 *   <Mono>npm install</Mono>
 *   <Mono>O(n log n)</Mono>
 */
export interface MonoProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  children: ReactNode;
  className?: string;
}

export function Mono({ className, children, ...rest }: MonoProps) {
  return (
    <code className={cn("vtool-mono", className)} {...rest}>
      {children}
    </code>
  );
}

export default Mono;
