import type { SelectHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * CommissionSelect — selector de comisión unificado del planner. Reemplaza los
 * tres estilos divergentes (`.cmb-chip__com`, `.rmap-mat__sel`, `.pool-item
 * select`) por un único control (mono, compacto, truncado con ellipsis, foco
 * coral). Presentacional puro (server component): reenvía `...rest`/`className`.
 *
 * @example
 *   <CommissionSelect
 *     value={fixed ?? ""}
 *     onChange={(e) => setFixed(e.target.value || null)}
 *     options={coms.map((c) => ({ value: c.comision, label: c.comision, title: horarioTxt(c) }))}
 *   />
 */
export interface CommissionOption {
  value: string;
  label: string;
  /** tooltip nativo (p. ej. horario completo de la comisión). */
  title?: string;
}

export interface CommissionSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  options: CommissionOption[];
  /** texto de la opción vacía (sin comisión fijada). Default "Auto". */
  placeholder?: string;
  /** ancho compacto uniforme. */
  size?: "sm" | "md";
  className?: string;
}

export function CommissionSelect({
  options,
  placeholder = "Auto",
  size = "md",
  className,
  ...rest
}: CommissionSelectProps) {
  return (
    <select
      className={cn(
        "commission-select",
        size === "sm" && "commission-select--sm",
        className,
      )}
      {...rest}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} title={o.title}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default CommissionSelect;
