import { createReadStream, statSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

const aqui = dirname(fileURLToPath(import.meta.url));
/** Raiz del repositorio: `app/` cuelga de ella y `data/` es su hermana. */
const raizRepo = resolve(aqui, "..");
const directorioDatos = join(raizRepo, "data");

const TIPOS_MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Sirve `<raiz del repositorio>/data/` bajo `/data/` solo en desarrollo.
 *
 * En el build no se copia nada: el workflow de despliegue coloca `data/` junto
 * al sitio publicado. Por eso este plugin solo define `configureServer`.
 */
function servirDatosEnDesarrollo(): Plugin {
  return {
    name: "cuatris-servir-datos",
    apply: "serve",
    configureServer(servidor) {
      servidor.middlewares.use((peticion, respuesta, siguiente) => {
        const crudo = peticion.url ?? "";
        if (!crudo.startsWith("/data/")) {
          siguiente();
          return;
        }
        // Se descarta `?v=<hash>`: la version la resuelve el indice, no el disco.
        const sinConsulta = crudo.split("?")[0] ?? "";
        let relativa: string;
        try {
          relativa = decodeURIComponent(sinConsulta.slice("/data/".length));
        } catch {
          respuesta.statusCode = 400;
          respuesta.end("Ruta invalida");
          return;
        }
        const destino = normalize(join(directorioDatos, relativa));
        if (destino !== directorioDatos && !destino.startsWith(directorioDatos + sep)) {
          respuesta.statusCode = 403;
          respuesta.end("Fuera de data/");
          return;
        }
        let info;
        try {
          info = statSync(destino);
        } catch {
          respuesta.statusCode = 404;
          respuesta.end("No existe en data/");
          return;
        }
        if (!info.isFile()) {
          respuesta.statusCode = 404;
          respuesta.end("No es un archivo");
          return;
        }
        const punto = destino.lastIndexOf(".");
        const extension = punto === -1 ? "" : destino.slice(punto);
        respuesta.setHeader(
          "Content-Type",
          TIPOS_MIME[extension] ?? "application/octet-stream",
        );
        respuesta.setHeader("Cache-Control", "no-cache");
        createReadStream(destino).pipe(respuesta);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // `VITE_BASE` puede venir del entorno del build o de un archivo `.env`.
  const entorno = loadEnv(mode, aqui, "");
  const base = entorno.VITE_BASE ?? "/";
  return {
    base,
    plugins: [react(), servirDatosEnDesarrollo()],
    server: {
      fs: {
        // El plugin lee `../data`; `fs.allow` mantiene el acceso acotado a eso.
        allow: [aqui, directorioDatos],
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
    },
  };
});
