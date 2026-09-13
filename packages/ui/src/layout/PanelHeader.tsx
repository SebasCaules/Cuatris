import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * PanelHeader — el `.vtool-head` del toolkit: encabezado de un `Panel`
 * con título display (`<h3>`), descripción opcional y un eyebrow mono
 * opcional por encima. A la derecha (mismo flex con `space-between`)
 * se ubican las `actions` si se pasan. Presentacional puro (server
 * component): cualquier `actions` interactivo llega ya armado por props.
 *
 * @example
 *   <PanelHeader
 *     eyebrow="MNA // solver"
 *     title="Eliminación gaussiana"
 *     description="Resolvé sistemas Ax = b paso a paso."
 *     actions={<Button variant="ghost" onClick={reset}>Reset</Button>}
 *   />
 */
export interface PanelHeaderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Título principal (display serif, `<h3>`). */
  title: ReactNode;
  /** Bajada opcional; sólo se renderiza si se pasa. */
  description?: ReactNode;
  /** Texto mono en mayúsculas por encima del head; sólo si se pasa. */
  eyebrow?: ReactNode;
  /** Bloque de acciones alineado a la derecha del head. */
  actions?: ReactNode;
  className?: string;
}

export function PanelHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...rest
}: PanelHeaderProps) {
  return (
    <>
      {eyebrow ? <p className="vtool-eyebrow">{eyebrow}</p> : null}
      <div className={cn("vtool-head", className)} {...rest}>
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
    </>
  );
}

export default PanelHeader;
