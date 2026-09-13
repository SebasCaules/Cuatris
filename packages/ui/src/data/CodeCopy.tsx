"use client";

import { useEffect } from "react";

/**
 * CodeCopy — isla cliente que cablea el botón `.wiki-code__copy` inyectado
 * (server-side) en cada bloque de código con chrome de terminal
 * (`figure.wiki-code`). No renderiza nada: monta UN listener `click`
 * delegado (dentro de `root`, o en `document` si `root` no matchea nada)
 * y reconstruye el código crudo a partir de los `span[data-line]` que
 * emite shiki/rehype-pretty-code — usar `code.textContent` a secas pega
 * todas las líneas sin salto, por eso se unen a mano con `"\n"`.
 *
 * Tras copiar, agrega `.is-copied` al botón y cambia su
 * `.wiki-code__copy-label` a "copiado" por ~1.2s (mismo timing/tono que
 * `CopyButton`), con manejo de timer por botón para que clicks repetidos
 * (incluso antes de que expire el timer anterior) no arrastren estado viejo.
 *
 * @example
 *   <CodeCopy />                      // acota a ".prose-sv" (default)
 *   <CodeCopy root="#showcase-ui" />  // acota a otro contenedor
 */
export interface CodeCopyProps {
  /** Selector CSS del contenedor a escuchar. Por defecto ".prose-sv". */
  root?: string;
}

const COPIED_MS = 1200;

export function CodeCopy({ root = ".prose-sv" }: CodeCopyProps = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const target: EventTarget = document.querySelector(root) ?? document;
    const timers = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>();

    async function copyAndFeedback(raw: string, btn: HTMLButtonElement) {
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard) return;
        await navigator.clipboard.writeText(raw);
      } catch {
        // clipboard no disponible / permiso denegado: no-op, sin feedback.
        return;
      }

      const label = btn.querySelector<HTMLElement>(".wiki-code__copy-label");

      const prev = timers.get(btn);
      if (prev) clearTimeout(prev);

      btn.classList.add("is-copied");
      if (label) label.textContent = "copiado";

      const timer = setTimeout(() => {
        btn.classList.remove("is-copied");
        if (label) label.textContent = "copiar";
        timers.delete(btn);
      }, COPIED_MS);
      timers.set(btn, timer);
    }

    function onClick(e: Event) {
      const start = e.target as HTMLElement | null;
      const btn = start?.closest<HTMLButtonElement>(".wiki-code__copy");
      if (!btn) return;

      const fig = btn.closest(".wiki-code");
      const code = fig?.querySelector("pre code");
      const lines = code?.querySelectorAll("[data-line]");

      const raw =
        lines && lines.length > 0
          ? Array.from(lines)
              // rehype-pretty-code (grid:true) mete UN espacio literal en las
              // líneas vacías para que la fila del grid no colapse; al copiar eso
              // deja un espacio fantasma. Un `data-line` cuyo textContent es
              // exactamente " " es esa línea vacía → la devolvemos como "".
              .map((line) => {
                const t = line.textContent ?? "";
                return t === " " ? "" : t;
              })
              .join("\n")
          : (code?.textContent ?? "");

      void copyAndFeedback(raw, btn);
    }

    target.addEventListener("click", onClick);
    return () => {
      target.removeEventListener("click", onClick);
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, [root]);

  return null;
}

export default CodeCopy;
