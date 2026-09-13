import Link from "next/link";
import { cn } from "../cn";

/**
 * Crumb — una miga de pan: `label` y, opcionalmente, `href`. Sin `href`
 * se renderiza como la página actual (`aria-current="page"`).
 */
export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumbs — la `.crumbs` del sistema: cadena de migas con separadores
 * `/`. El último (o cualquiera sin `href`) marca la página actual.
 * Presentacional puro.
 *
 * @example
 *   <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Proba" }]} />
 */
export interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn("crumbs", className)} aria-label="Migas de pan">
      {items.map((c, i) => (
        <span key={c.href ?? c.label} className="crumbs__item">
          {c.href ? (
            <Link href={c.href}>{c.label}</Link>
          ) : (
            <span aria-current="page">{c.label}</span>
          )}
          {i < items.length - 1 && <span className="crumbs__sep">/</span>}
        </span>
      ))}
    </nav>
  );
}

export default Breadcrumbs;
