import Link from "next/link";
import type { ReactNode } from "react";
import Brand from "./Brand";

/** Un enlace dentro de una columna del footer (interno o externo). */
export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Una columna del footer: título + lista de enlaces. */
export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

/**
 * Footer — el `.footer` del sistema, genérico. Estructura `.footer__top`
 * con el bloque de marca (`.footer__brand`) más columnas de enlaces
 * (`.footer__col`), y una franja inferior opcional (`.footer__bottom`).
 * Enlaces internos con next/link, externos con `<a target="_blank">`.
 * Presentacional puro.
 *
 * @example
 *   <Footer
 *     description={<p>Bases de conocimiento del ITBA.</p>}
 *     columns={[{ title: "Materias", links: [{ label: "Proba", href: "/proba/" }] }]}
 *     bottom={<span>SYS.00 // <b>StudyVaults</b></span>}
 *   />
 */
export interface FooterProps {
  /** Lockup de marca. Por defecto `<Brand/>`. */
  brand?: ReactNode;
  /** Texto/descripción bajo la marca. */
  description?: ReactNode;
  columns: FooterColumn[];
  /** Contenido de la franja inferior `.footer__bottom`. */
  bottom?: ReactNode;
}

export function Footer({
  brand = <Brand />,
  description,
  columns,
  bottom,
}: FooterProps) {
  return (
    <footer className="footer">
      <div className="container footer__top">
        <div className="footer__brand">
          {brand}
          {description}
        </div>

        {columns.map((col) => (
          <div key={col.title} className="footer__col">
            <h4>{col.title}</h4>
            {col.links.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                </a>
              ) : (
                <Link key={l.href} href={l.href} prefetch={false}>
                  {l.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>

      {bottom != null && (
        <div className="container footer__bottom">{bottom}</div>
      )}
    </footer>
  );
}

export default Footer;
