import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";
import type { ReadoutTone } from "../tokens";

/**
 * KeyValue — una fila `.vtool-kv` de un readout mono (clave a la izquierda,
 * valor a la derecha). El `tone` tinta el valor:
 *  - "default" → color por defecto
 *  - "accent"  → `.v.acc` (link/azul)
 *  - "coral"   → `.v.coral` (acento coral)
 *
 * @example
 *   <KeyValue k="Determinante" v="−12" tone="coral" />
 *   <KeyValue k="Rango" v={3} />
 */
interface CommonProps {
  /** Clave (columna izquierda). */
  k: ReactNode;
  /** Valor (columna derecha). */
  v: ReactNode;
  /** Tinte del valor. Por defecto "default". */
  tone?: ReadoutTone;
  className?: string;
}

export type KeyValueProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof CommonProps>;

export function KeyValue({
  k,
  v,
  tone = "default",
  className,
  ...rest
}: KeyValueProps) {
  return (
    <div className={cn("vtool-kv", className)} {...rest}>
      <span className="k">{k}</span>
      <span className={cn("v", tone === "accent" && "acc", tone === "coral" && "coral")}>
        {v}
      </span>
    </div>
  );
}

export default KeyValue;
