import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import { cn } from "../cn";
import type { ButtonVariant, ButtonSize } from "../tokens";

/**
 * Button — el `.btn` del sistema, polimórfico.
 *  - sin `href`            → <button>
 *  - `href` interno        → next/link <Link>
 *  - `href` + `external`   → <a target="_blank" rel="noopener noreferrer">
 *
 * @example
 *   <Button variant="primary" size="lg" href="#materias">Explorar</Button>
 *   <Button variant="ghost" onClick={fn}>Cancelar</Button>
 *   <Button variant="primary" href={REPO_URL} external>GitHub</Button>
 */
interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Bordes pill (border-radius completo). */
  pill?: boolean;
  /** Renderiza un <a> externo (target _blank) en vez de next/link. */
  external?: boolean;
  href?: string;
  /**
   * Prefetch de next/link. Pasar `false` cuando el link apunta a una ruta
   * pesada desde una página de lectura (toolkit/planner): difiere la descarga
   * del bundle al clic en vez de bajarlo en segundo plano. Solo aplica a la
   * rama <Link> interna (ignorado en `external`).
   */
  prefetch?: boolean;
  children: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps>;

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn--primary",
  blue: "btn--blue",
  secondary: "btn--secondary",
  ghost: "btn--ghost",
  monolabel: "btn--monolabel",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn--sm",
  md: "",
  lg: "btn--lg",
};

export function Button({
  variant,
  size = "md",
  pill,
  external,
  href,
  prefetch,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(
    "btn",
    variant && VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    pill && "btn--pill",
    className,
  );

  // Deshabilitado: nunca renderizar un link navegable, aunque haya href.
  if (disabled) {
    return (
      <button
        className={classes}
        disabled
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </button>
    );
  }

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
        prefetch={prefetch}
        className={classes}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

export default Button;
