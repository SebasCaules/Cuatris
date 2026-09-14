// Render de un árbol React a HTML estático (XHTML bien formado) en el cliente,
// para meter un componente de pantalla dentro de un documento exportado o de un
// <foreignObject> SVG (imagen). Sin react-dom/server: monta en un nodo suelto,
// sincrónico (flushSync), serializa y desmonta. Solo corre en el navegador.
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

export function renderStaticHTML(node: ReactNode): string {
  if (typeof document === "undefined") return "";
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(node));
  // XMLSerializer cierra los vacíos (<br/>) y escapa atributos: sirve tanto
  // para HTML como para el XHTML que exige foreignObject.
  const html = Array.from(host.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join("")
    // el serializador agrega xmlns en cada raíz; en el documento es ruido
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
  root.unmount();
  return html;
}
