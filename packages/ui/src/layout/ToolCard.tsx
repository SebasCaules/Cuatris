import Link from "next/link";
import type { ReactNode, HTMLAttributes, AnchorHTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * ToolCard — card-lanzador de una herramienta o app (`.card .toolcard`).
 * Cabecera con ícono + "kind", título, descripción y un CTA al pie.
 * Polimórfica igual que `Card`: `href` interno → next/link; `external` → <a>.
 *
 * @example
 *   <ToolCard
 *     href="/mna/herramientas"
 *     icon={<Icon name="search" />}
 *     kind="Interactivo"
 *     title="Toolkit de estudio"
 *     description="Calculadoras y exploradores a medida de la materia."
 *     cta="Abrir toolkit →"
 *   />
 */
interface CommonProps {
  href: string;
  external?: boolean;
  icon: ReactNode;
  kind: ReactNode;
  title: ReactNode;
  description: ReactNode;
  /** Texto del CTA al pie. Para `external` se le agrega un ↗. */
  cta: ReactNode;
  className?: string;
}

type ToolCardProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps>;

export function ToolCard({
  href,
  external,
  icon,
  kind,
  title,
  description,
  cta,
  className,
  ...rest
}: ToolCardProps) {
  const classes = cn("card", "toolcard", className);
  const body = (
    <>
      <div className="toolcard__top">
        <span className="toolcard__ico" aria-hidden="true">
          {icon}
        </span>
        <span className="toolcard__kind">{kind}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="toolcard__meta">
        {cta}
        {external ? (
          <>
            {" "}
            <span className="ext">↗</span>
          </>
        ) : null}
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} prefetch={false} {...rest}>
      {body}
    </Link>
  );
}

export default ToolCard;
