"use client";

import { useId, type ReactNode, type CSSProperties, type HTMLAttributes, type MouseEvent } from "react";
import { cn } from "../cn";
import { Icon } from "../primitives/Icon";
import { useDismissable } from "./useDismissable";

/**
 * Drawer — panel lateral que entra desde la derecha sobre un scrim
 * (`.sv-overlay .sv-overlay--right` + `.sv-drawer`). Cierra con Escape y
 * con click en el scrim (no al hacer click dentro del panel). Bloquea el
 * scroll del fondo, atrapa el foco y lo restaura al cerrar. Header opcional
 * con título y botón de cierre. Si `open` es false no renderiza nada.
 *
 * @example
 *   <Drawer open={open} onClose={() => setOpen(false)} title="Filtros">
 *     <FilterForm />
 *   </Drawer>
 *   <Drawer open={open} onClose={close} width={520}>…</Drawer>
 */
export interface DrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Ancho del panel en px → custom property `--sv-drawer-w`. */
  width?: number;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width,
  className,
  style,
  ...rest
}: DrawerProps) {
  const panelRef = useDismissable(open, onClose);
  const titleId = useId();

  if (!open) return null;

  const stop = (e: MouseEvent<HTMLDivElement>) => e.stopPropagation();

  return (
    <div className="sv-overlay sv-overlay--right" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        className={cn("sv-drawer", className)}
        style={width ? ({ "--sv-drawer-w": `${width}px`, ...style } as CSSProperties) : style}
        onClick={stop}
        {...rest}
      >
        {title !== undefined && (
          <div className="sv-overlay__head">
            <h2 id={titleId} className="sv-overlay__title">{title}</h2>
            <button
              type="button"
              className="sv-overlay__close"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="sv-overlay__body">{children}</div>
      </div>
    </div>
  );
}

export default Drawer;
