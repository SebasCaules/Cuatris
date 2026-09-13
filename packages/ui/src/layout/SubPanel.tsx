import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * SubPanel — la `.vtool-sub` del toolkit: superficie anidada más sutil
 * (`--surface-3`, hairline, radio de control) para agrupar controles o
 * salidas dentro de un `Panel`. Presentacional puro (server component):
 * sólo renderiza un `<div>` con sus hijos.
 *
 * @example
 *   <Panel>
 *     <SubPanel>contenido agrupado</SubPanel>
 *   </Panel>
 */
export interface SubPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function SubPanel({ className, children, ...rest }: SubPanelProps) {
  return (
    <div className={cn("vtool-sub", className)} {...rest}>
      {children}
    </div>
  );
}

export default SubPanel;
