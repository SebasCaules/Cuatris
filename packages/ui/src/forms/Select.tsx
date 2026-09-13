import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Select — el `.vtool-select` del toolkit (select mono con la flecha
 * dibujada en CSS). Pasá `options` para renderizar `<option>`
 * automáticamente, o `children` con tu propio markup. Presentacional
 * puro (server component): reenvía `...rest` y `className`.
 *
 * @example
 *   <Select value={kind} onChange={onKind} options={[
 *     { value: "normal", label: "Normal" },
 *     { value: "binom", label: "Binomial" },
 *   ]} />
 *   <Select value={tab} onChange={onTab}>
 *     <option value="el">EL</option>
 *   </Select>
 */
export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Opciones a renderizar como `<option>`. Ignorado si pasás `children`. */
  options?: SelectOption[];
  children?: ReactNode;
  className?: string;
}

export function Select({
  options,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <select className={cn("vtool-select", className)} {...rest}>
      {children ??
        options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
    </select>
  );
}

export default Select;
