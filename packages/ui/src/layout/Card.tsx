import Link from "next/link";
import type { ReactNode, HTMLAttributes, AnchorHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Card — la `.card` del sistema (superficie con barra de acento al
 * hover), polimórfica igual que `Button`:
 *  - sin `href`           → <div>
 *  - `href` interno       → next/link <Link>
 *  - `href` + `external`  → <a target="_blank" rel="noopener noreferrer">
 *
 * @example
 *   <Card href="/proba/">…</Card>
 *   <Card href={REPO_URL} external>…</Card>
 *   <Card>contenido estático</Card>
 */
interface CommonProps {
  href?: string;
  /** Renderiza un <a> externo (target _blank) en vez de next/link. */
  external?: boolean;
  children: ReactNode;
  className?: string;
}

type CardProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof CommonProps> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps>;

export function Card({
  href,
  external,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = cn("card", className);

  if (href && external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  return (
    <div className={classes} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}

export default Card;
