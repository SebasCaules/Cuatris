import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Panel — la `.vtool-panel` del toolkit: superficie elevada con sombra
 * (`--shadow-sm`), borde y radio de card. Es el contenedor de primer
 * nivel de una herramienta interactiva. Presentacional puro (server
 * component): sólo renderiza un `<div>` con sus hijos.
 *
 * @example
 *   <Panel>
 *     <PanelHeader title="Calculadora" />
 *     …
 *   </Panel>
 */
export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function Panel({ className, children, ...rest }: PanelProps) {
  return (
    <div className={cn("vtool-panel", className)} {...rest}>
      {children}
    </div>
  );
}

export default Panel;
