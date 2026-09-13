// Shim standalone de `@/lib/content/slug` de StudyVaults: el planner solo
// consume `withBase` (y el sitio, `SITE_URL`). Mantener la misma ruta permite
// copiar components/planner y lib/planner sin tocar un import.

// basePath del sitio (project page de GitHub Pages). En dev queda vacío.
// Debe coincidir con next.config.ts (misma variable, mismo default).
export const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (process.env.NODE_ENV === "production" ? "/Cuatris" : "");

// URL pública completa (metadata OG, sitemap).
export const SITE_URL = "https://sebascaules.github.io/Cuatris";

// Prefija basePath para assets/URLs referenciados a mano (PDFs de fichas,
// imágenes). next/link y next/image lo aplican solos — no usar acá.
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}
