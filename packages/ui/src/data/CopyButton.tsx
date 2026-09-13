"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * CopyButton — botón `.vtool-copy` que copia `text` al portapapeles con
 * `navigator.clipboard`. Tras copiar, muestra `copiedLabel` y aplica
 * `.copied` + `.is-copied` durante ~1.2s, luego vuelve al estado base.
 * (Se emiten ambas: toolkit.css estila `.vtool-copy.copied` y la wiki
 * `.wiki-code__copy.is-copied` — ver CodeBlock.)
 *
 * @example
 *   <CopyButton text="git clone …" />
 *   <CopyButton text={snippet} label="Copiar import" copiedLabel="¡Listo!" />
 */
interface CommonProps {
  /** Texto que se escribe en el portapapeles. */
  text: string;
  /** Label en reposo. Por defecto "copiar". */
  label?: ReactNode;
  /** Label tras copiar. Por defecto "copiado". */
  copiedLabel?: ReactNode;
  className?: string;
}

export type CopyButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps>;

export function CopyButton({
  text,
  label = "copiar",
  copiedLabel = "copiado",
  className,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard no disponible / permiso denegado: no-op */
    }
  }, [text]);

  return (
    <button
      type="button"
      aria-live="polite"
      title="Copiar al portapapeles"
      className={cn("vtool-copy", copied && "copied is-copied", className)}
      onClick={onCopy}
      {...rest}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

export default CopyButton;
