import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../cn";

/**
 * Callout — caja de "entorno tipo apunte LaTeX" (amsthm): definición, teorema,
 * demostración, ejemplo, intuición, nota o advertencia. Es la versión-componente
 * del mismo sistema visual que ya pinta `blockquote[data-env]` en la prosa de
 * las páginas de wiki (`rehypeEnv` en `lib/content/render.ts` le agrega las
 * mismas clases `env env--<slug>` a los blockquotes de markdown). Usá `Callout`
 * cuando el contenido se arma en JSX en vez de markdown (tools, sheets,
 * showcases); el CSS que lo pinta vive en `.prose-sv` — envolvé el punto de
 * montaje con `className="prose-sv"` si se usa fuera de una página de wiki.
 * Presentacional puro (server component): sólo renderiza un `<blockquote>`.
 *
 * @example
 *   <Callout env="def" title="Definición.">
 *     Un grafo es <strong>conexo</strong> si hay un camino entre todo par de vértices.
 *   </Callout>
 *
 * @example
 *   <Callout env="warn" title="Atención.">
 *     La matriz no es invertible: el sistema no tiene solución única.
 *   </Callout>
 */
interface CommonProps {
  /** Entorno a pintar; matchea los `data-env` ya soportados en la prosa. */
  env: "def" | "thm" | "proof" | "ex" | "note" | "intu" | "warn";
  /** Etiqueta en negrita al inicio del bloque (p.ej. "Definición."). Opcional. */
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

// `Omit<…, keyof CommonProps>` (en vez de `extends`) porque `HTMLAttributes`
// trae su propio `title` nativo tipado `string` (el atributo tooltip del
// navegador), que chocaría con nuestro `title?: ReactNode` (la etiqueta del
// entorno).
export type CalloutProps = CommonProps &
  Omit<HTMLAttributes<HTMLQuoteElement>, keyof CommonProps>;

export function Callout({ env, title, className, children, ...rest }: CalloutProps) {
  return (
    <blockquote
      className={cn("env", `env--${env}`, className)}
      data-env={env}
      {...rest}
    >
      {title ? <strong>{title}</strong> : null}
      {children}
    </blockquote>
  );
}

export default Callout;
