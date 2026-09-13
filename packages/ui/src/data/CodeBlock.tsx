import type { HTMLAttributes } from "react";
import { cn } from "../cn";
import { CopyButton } from "./CopyButton";

/**
 * CodeBlock — bloque de código `.vtool-code` (un `<pre>` con tipografía
 * mono, fondo oscuro fijo y `white-space: pre`). Recibe el código como
 * `children` (string); la indentación se respeta tal cual.
 *
 * @example
 *   <CodeBlock>{`SELECT * FROM alumnos\nWHERE promedio >= 8;`}</CodeBlock>
 */
interface CommonProps {
  /** Código a mostrar (string crudo, sin escapar). */
  children: string;
  className?: string;
}

export type CodeBlockProps = CommonProps &
  Omit<HTMLAttributes<HTMLPreElement>, keyof CommonProps>;

export function CodeBlock({ children, className, ...rest }: CodeBlockProps) {
  return (
    <pre className={cn("vtool-code", className)} {...rest}>
      {children}
    </pre>
  );
}

export default CodeBlock;

/**
 * CodeBlockChrome — variante "terminal" de `CodeBlock`: envuelve el código en
 * el mismo chrome skeuomórfico que usan los bloques de código de la wiki
 * (clases `.wiki-code` / `.wiki-code__bar` / `.wiki-code__dots` /
 * `.wiki-code__dot` / `.wiki-code__lang`, ver `rehypeCodeChrome` en
 * `lib/content/render.ts`), con un botón de copiar.
 *
 * Decisión de diseño: es un componente HERMANO, no una prop `chrome?` sobre
 * `CodeBlock`. `CodeBlock` es un `<pre>` simple con una API estable que ya
 * consumen otras tools (className/ref/passthrough apuntan al `<pre>`); una
 * variante con chrome cambia la raíz a `<figure>` con una barra arriba, así
 * que meterla como prop condicional volvería ambigua a qué nodo apunta cada
 * prop. Un componente aparte mantiene ambas API limpias y no rompe la actual.
 *
 * A diferencia de la isla `CodeCopy` (que reconstruye el texto recorriendo
 * `span[data-line]`, porque ahí sólo hay HTML ya troceado por shiki), acá el
 * string crudo YA está disponible como `children`, así que el copy usa
 * directamente `<CopyButton text={children} />` — sin reconstrucción ni
 * `data-line`. Queda como server component (sin "use client"): sólo
 * `CopyButton` necesita cliente, y un Server Component puede componer un
 * Client Component como hijo sin volverse cliente él mismo.
 *
 * @example
 *   <CodeBlockChrome lang="java">{`public class Main {}`}</CodeBlockChrome>
 */
interface ChromeCommonProps {
  /** Código a mostrar (string crudo, sin escapar). */
  children: string;
  /** Lenguaje mostrado en la barra (p.ej. "java"). Si se omite, no se muestra. */
  lang?: string;
  className?: string;
}

export type CodeBlockChromeProps = ChromeCommonProps &
  Omit<HTMLAttributes<HTMLElement>, keyof ChromeCommonProps>;

export function CodeBlockChrome({
  children,
  lang,
  className,
  ...rest
}: CodeBlockChromeProps) {
  return (
    <figure className={cn("wiki-code", className)} {...rest}>
      <div className="wiki-code__bar">
        <span className="wiki-code__dots" aria-hidden="true">
          <span className="wiki-code__dot" />
          <span className="wiki-code__dot" />
          <span className="wiki-code__dot" />
        </span>
        {lang ? <span className="wiki-code__lang">{lang}</span> : null}
        <CopyButton text={children} className="wiki-code__copy" />
      </div>
      <pre data-language={lang}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}
