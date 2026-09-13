import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Note — la `.vtool-note` del toolkit: nota/ayuda mono con borde
 * izquierdo de acento, pensada al pie de un `Panel`. Con `tone="error"`
 * suma `.vtool-error` para tintar el texto en coral. Presentacional puro
 * (server component): sólo renderiza un `<p>` con sus hijos.
 *
 * @example
 *   <Note>El resultado se redondea a 4 decimales.</Note>
 *   <Note tone="error">La matriz no es invertible.</Note>
 */
export interface NoteProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Tono de la nota; `error` la tinta en coral. Por defecto "default". */
  tone?: "default" | "error";
  children: ReactNode;
  className?: string;
}

export function Note({ tone = "default", className, children, ...rest }: NoteProps) {
  return (
    <p
      className={cn("vtool-note", tone === "error" && "vtool-error", className)}
      {...rest}
    >
      {children}
    </p>
  );
}

export default Note;
