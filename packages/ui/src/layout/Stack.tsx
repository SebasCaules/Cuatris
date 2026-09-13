import type { ReactNode, HTMLAttributes, CSSProperties } from "react";
import { cn } from "../cn";

/**
 * Stack — la pila utilitaria `.sv-stack` (grid con gap vertical). El
 * `gap` (en px) se inyecta como la custom property `--sv-stack-gap`,
 * que el CSS lee con fallback. Polimórfico vía `as`.
 *
 * @example
 *   <Stack gap={20}>
 *     <Card>…</Card>
 *     <Card>…</Card>
 *   </Stack>
 */
export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Separación entre hijos en px (setea `--sv-stack-gap`). */
  gap?: number;
  /** Elemento a renderizar. Por defecto "div". */
  as?: "div" | "section" | "ul" | "ol";
  children: ReactNode;
  className?: string;
}

export function Stack({
  gap,
  as: Tag = "div",
  className,
  style,
  children,
  ...rest
}: StackProps) {
  const mergedStyle =
    gap != null
      ? ({ ...style, "--sv-stack-gap": `${gap}px` } as CSSProperties)
      : style;
  return (
    <Tag className={cn("sv-stack", className)} style={mergedStyle} {...rest}>
      {children}
    </Tag>
  );
}

export default Stack;
