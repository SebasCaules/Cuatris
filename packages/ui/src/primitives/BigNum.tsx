import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * BigNum — el `.vtool-bignum` del sistema, número display grande.
 * El sufijo `unit` se renderiza en `<small>` (ya estilado por el CSS).
 *
 * @example
 *   <BigNum value="42" />
 *   <BigNum value="3.14" unit="rad" />
 */
export interface BigNumProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
}

export function BigNum({ value, unit, className, ...rest }: BigNumProps) {
  return (
    <div className={cn("vtool-bignum", className)} {...rest}>
      {value}
      {unit && <small>{unit}</small>}
    </div>
  );
}

export default BigNum;
