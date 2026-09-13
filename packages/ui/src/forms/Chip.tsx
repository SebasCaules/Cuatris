import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Chip — el `.vtool-chip` del toolkit (pill mono clickeable, `<button>`).
 * `active` aplica `.is-active` (resaltado primario) y `tone="ok"` aplica
 * `.ok` (resaltado coral). Sólo reenvía el `onClick` recibido por props,
 * así que queda como server component (sin `"use client"`).
 *
 * @example
 *   <Chip active={cat === "All"} onClick={() => setCat("All")}>All · {n}</Chip>
 *   <Chip tone="ok" active>Aprobado</Chip>
 */
export interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** Marca el chip como seleccionado (`.is-active`). */
  active?: boolean;
  /** Tono visual: `"ok"` lo pinta en coral (`.ok`). */
  tone?: "default" | "ok";
  children: ReactNode;
  className?: string;
}

export function Chip({
  active,
  tone = "default",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "vtool-chip",
        active && "is-active",
        tone === "ok" && "ok",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Chip;
