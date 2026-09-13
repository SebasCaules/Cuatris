import type { ReactNode, HTMLAttributes, AnchorHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Tag — la `.tag` del sistema (el `#` lo pone el CSS `::before`, no lo agregues).
 *  - sin `href` → <span>
 *  - con `href` → <a href> (tag clickeable)
 *
 * @example
 *   <Tag>algebra</Tag>
 *   <Tag href="/temas/limites">limites</Tag>
 */
export interface TagProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  children: ReactNode;
  href?: string;
  className?: string;
}

export function Tag({ href, className, children, ...rest }: TagProps) {
  const classes = cn("tag", className);

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}

export default Tag;
