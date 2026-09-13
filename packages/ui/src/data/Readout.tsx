import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";
import type { ReadoutTone } from "../tokens";
import KeyValue from "./KeyValue";

/**
 * Readout — contenedor `.vtool-readout` de filas key-value mono. Acepta
 * o bien `items` (renderiza un `KeyValue` por entrada) o bien `children`
 * arbitrarios (p. ej. `KeyValue` sueltos o un `.vtool-bignum`).
 *
 * @example
 *   <Readout items={[
 *     { k: "Media", v: "3.14" },
 *     { k: "Desvío", v: "0.82", tone: "accent" },
 *   ]} />
 *
 *   <Readout>
 *     <KeyValue k="n" v={120} />
 *     <KeyValue k="p-valor" v="0.03" tone="coral" />
 *   </Readout>
 */
interface CommonProps {
  /** Filas a renderizar como `KeyValue`. Ignorado si pasás `children`.
   *  `id` opcional da una key estable a React (si no, se usa el índice). */
  items?: { k: ReactNode; v: ReactNode; tone?: ReadoutTone; id?: string | number }[];
  children?: ReactNode;
  className?: string;
}

export type ReadoutProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof CommonProps>;

export function Readout({ items, children, className, ...rest }: ReadoutProps) {
  return (
    <div className={cn("vtool-readout", className)} {...rest}>
      {children ??
        items?.map((item, i) => (
          <KeyValue key={item.id ?? i} k={item.k} v={item.v} tone={item.tone} />
        ))}
    </div>
  );
}

export default Readout;
