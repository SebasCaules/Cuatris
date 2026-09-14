import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/content/slug";

export const dynamic = "force-static";

// Web App Manifest: permite «Agregar a la pantalla de inicio» en el teléfono y
// abrir Cuatris como app a pantalla completa. Los PNG salen de app/icon.svg
// (rsvg-convert); el SVG queda como icono escalable para los navegadores que
// lo aceptan. Todas las rutas llevan el basePath porque el manifest no pasa
// por next/link.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cuatris — Planificador de cursada · ITBA",
    short_name: "Cuatris",
    description:
      "Planificador de cursada para las carreras de grado del ITBA: correlativas, horarios sin choques, plan de cursada y finales.",
    // instalada como app abre directo en el planificador (la portada es
    // para quien llega por primera vez)
    start_url: `${BASE_PATH}/planificar/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    lang: "es",
    background_color: "#4c3b30",
    theme_color: "#241208",
    icons: [
      { src: `${BASE_PATH}/icon.svg`, sizes: "any", type: "image/svg+xml" },
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      {
        src: `${BASE_PATH}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
