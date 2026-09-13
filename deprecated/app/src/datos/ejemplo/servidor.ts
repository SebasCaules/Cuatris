/**
 * Servidor de datos simulado para los tests: responde con los archivos de
 * `app/src/datos/ejemplo/` a las peticiones que hace `cargar.ts`.
 *
 * No se importa desde la aplicación, solo desde tests.
 */

import abreviaciones from "./v1/abreviaciones.json";
import horarios from "./v1/horarios/2026-2C.json";
import indice from "./index.json";
import plan from "./v1/planes/S10-Rev23.json";
import vocabulario from "./v1/vocabulario.json";

export const ARCHIVOS_EJEMPLO: Record<string, unknown> = {
  "index.json": indice,
  "v1/planes/S10-Rev23.json": plan,
  "v1/horarios/2026-2C.json": horarios,
  "v1/abreviaciones.json": abreviaciones,
  "v1/vocabulario.json": vocabulario,
};

export {
  abreviaciones as abreviacionesEjemplo,
  horarios as horariosEjemplo,
  indice as indiceEjemplo,
  plan as planEjemplo,
  vocabulario as vocabularioEjemplo,
};

export interface PeticionRegistrada {
  archivo: string;
  version: string | null;
}

export interface ServidorSimulado {
  fetch: typeof fetch;
  peticiones: PeticionRegistrada[];
}

/**
 * Construye un `fetch` que sirve `ARCHIVOS_EJEMPLO` bajo `<base>data/`.
 *
 * `reemplazos` permite devolver otro contenido para un archivo puntual, y
 * `caidos` simula una red que no responde.
 */
export function servidorEjemplo(opciones?: {
  reemplazos?: Record<string, unknown>;
  caidos?: string[];
}): ServidorSimulado {
  const reemplazos = opciones?.reemplazos ?? {};
  const caidos = new Set(opciones?.caidos ?? []);
  const peticiones: PeticionRegistrada[] = [];

  const simulado = (entrada: RequestInfo | URL): Promise<Response> => {
    const url = new URL(String(entrada), "http://localhost/");
    const marca = "/data/";
    const posicion = url.pathname.indexOf(marca);
    if (posicion === -1) {
      return Promise.reject(new TypeError(`Ruta fuera de data/: ${url.href}`));
    }
    const archivo = url.pathname.slice(posicion + marca.length);
    peticiones.push({ archivo, version: url.searchParams.get("v") });

    if (caidos.has(archivo)) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    const cuerpo = archivo in reemplazos
      ? reemplazos[archivo]
      : ARCHIVOS_EJEMPLO[archivo];
    if (cuerpo === undefined) {
      return Promise.resolve(
        new Response("no existe", { status: 404, statusText: "Not Found" }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  return { fetch: simulado as typeof fetch, peticiones };
}
