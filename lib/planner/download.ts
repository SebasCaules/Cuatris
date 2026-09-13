// Helpers de descarga / impresión (client-only, con guards de static-export).
// Compartidos por las vistas que exportan documentos (Combinador, Plan de cursada).

/** Descarga un string como archivo. */
export function downloadTextFile(
  text: string,
  filename: string,
  mime = "text/html",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadHTMLFile(html: string, filename: string): void {
  downloadTextFile(html, filename, "text/html");
}

/** Abre el HTML en una pestaña nueva para imprimir → guardar como PDF.
 *  Usa un Blob URL (no `document.write`, que en Chrome suele quedar en about:blank).
 *  Si el pop-up queda bloqueado, cae a descargar el .html. */
export function openForPrint(html: string, fallbackName = "documento.html"): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) {
    // pop-up bloqueado → descargamos el HTML (imprimible → PDF) como fallback
    URL.revokeObjectURL(url);
    downloadHTMLFile(html, fallbackName);
    return;
  }
  // liberar el blob una vez que la pestaña lo cargó
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
