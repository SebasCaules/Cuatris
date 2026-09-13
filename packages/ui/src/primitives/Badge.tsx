import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";
import type { BadgeVariant } from "../tokens";

/**
 * Badge — la `.badge` del sistema, etiqueta mono en pill.
 * La variante mapea a `.badge--*`; `"default"` no agrega modificador.
 *
 * @example
 *   <Badge>Estable</Badge>
 *   <Badge variant="status">En curso</Badge>
 *   <Badge variant="solid">v2.0</Badge>
 */
export interface BadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  default: "",
  status: "badge--status",
  sys: "badge--sys",
  solid: "badge--solid",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cn("badge", VARIANT_CLASS[variant], className)} {...rest}>
      {children}
    </span>
  );
}

export default Badge;
