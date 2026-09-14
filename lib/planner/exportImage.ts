// Exporta un fragmento HTML (+ su CSS) como imagen PNG, sin dependencias:
// se envuelve en un <foreignObject> SVG, se dibuja en un canvas a 2x sobre
// fondo blanco y se descarga. Solo fuentes del sistema y colores literales
// (nada externo: el SVG no puede cargar recursos). En navegadores que
// «contaminan» el canvas con foreignObject (Safari), `toBlob` falla y se
// rechaza la promesa: el que llama cae a la versión imprimible.
export interface HtmlToPngOptions {
  width: number; // px CSS del documento
  height: number; // px CSS del documento
  scale?: number; // factor de resolución (default 2)
  background?: string; // default #fff
}

export function htmlToPngBlob(
  html: string,
  css: string,
  { width, height, scale = 2, background = "#fff" }: HtmlToPngOptions,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("sin DOM"));
      return;
    }
    // El HTML de los documentos es HTML (con <br>, entidades…), pero adentro
    // de un SVG tiene que ser XML bien formado: se parsea como HTML y se
    // vuelve a serializar como XHTML. El CSS va en CDATA por los `>` y `&`.
    const parsed = new DOMParser().parseFromString(
      `<div id="__root">${html}</div>`,
      "text/html",
    );
    const root = parsed.getElementById("__root");
    if (!root) {
      reject(new Error("html inválido"));
      return;
    }
    root.removeAttribute("id");
    root.setAttribute(
      "style",
      `width:${width}px;height:${height}px;background:${background};overflow:hidden`,
    );
    const xhtml = new XMLSerializer().serializeToString(root);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<style><![CDATA[${css.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]></style>` +
      `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    // data: URL (no blob:): en Chrome un SVG con foreignObject cargado desde
    // un blob: «contamina» el canvas y toBlob falla; con data: no.
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("sin canvas");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("toBlob"));
        }, "image/png");
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("no se pudo rasterizar"));
    img.src = url;
  });
}

/** Descarga un Blob como archivo. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
