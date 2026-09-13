import Link from "next/link";
import type { ReactNode, MouseEventHandler, AnchorHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * NavLink — el `.nav__link` del sistema, con estado activo (`.is-active`).
 * Polimórfico igual que `Button`:
 *  - interno         → next/link <Link>
 *  - `external`      → <a target="_blank" rel="noopener noreferrer">
 *
 * Sólo reenvía un `onClick` recibido por props, así que se mantiene como
 * server component (sin la directiva "use client").
 *
 * @example
 *   <NavLink href="/electivas/" active>Electivas</NavLink>
 *   <NavLink href={REPO_URL} external>GitHub</NavLink>
 */
export interface NavLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> {
  href: string;
  /** Marca el enlace como activo (`.is-active`). */
  active?: boolean;
  /** Renderiza un <a> externo (target _blank) en vez de next/link. */
  external?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
  className?: string;
}

export function NavLink({
  href,
  active,
  external,
  onClick,
  className,
  children,
  ...rest
}: NavLinkProps) {
  const classes = cn("nav__link", active && "is-active", className);

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={classes}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default NavLink;
