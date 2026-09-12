/**
 * Enrutado por hash.
 *
 * GitHub Pages no reescribe rutas, así que la SPA vive entera en el fragmento:
 * `#/plan`, `#/progreso`, `#/materia/<codigo>`. Nada de react-router.
 */

import { useCallback, useEffect, useState } from "react";

import type { Codigo } from "./contrato/tipos";

const CODIGO = /^\d{2}\.\d{2}$/;

export type Ruta =
  | { vista: "plan" }
  | { vista: "progreso" }
  | { vista: "materia"; codigo: Codigo }
  | { vista: "inicio" }
  | { vista: "muestrario" };

/** Adónde se cae cuando el hash está vacío o no se reconoce. */
export const RUTA_POR_DEFECTO: Ruta = { vista: "plan" };

/**
 * Interpreta un `location.hash`. Un hash desconocido no es un error: la
 * pantalla del plan es el punto de partida.
 */
export function parsearRuta(hash: string): Ruta {
  const limpio = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (limpio === "") {
    return RUTA_POR_DEFECTO;
  }
  const partes = limpio.split("/");
  const primera = partes[0];
  if (primera === "plan" && partes.length === 1) {
    return { vista: "plan" };
  }
  if (primera === "progreso" && partes.length === 1) {
    return { vista: "progreso" };
  }
  if (primera === "inicio" && partes.length === 1) {
    return { vista: "inicio" };
  }
  if (primera === "muestrario" && partes.length === 1) {
    return { vista: "muestrario" };
  }
  if (primera === "materia" && partes.length === 2) {
    const codigo = partes[1] ?? "";
    if (CODIGO.test(codigo)) {
      return { vista: "materia", codigo };
    }
  }
  return RUTA_POR_DEFECTO;
}

/** Texto del hash que corresponde a una ruta, con `#` incluido. */
export function rutaAHash(ruta: Ruta): string {
  switch (ruta.vista) {
    case "plan":
      return "#/plan";
    case "progreso":
      return "#/progreso";
    case "materia":
      return `#/materia/${ruta.codigo}`;
    case "inicio":
      return "#/inicio";
    case "muestrario":
      return "#/muestrario";
  }
}

/** Cambia la ruta actual. El `hashchange` del navegador hace el resto. */
export function navegar(ruta: Ruta): void {
  window.location.hash = rutaAHash(ruta);
}

/** Ruta activa, sincronizada con `location.hash`. */
export function useRuta(): { ruta: Ruta; ir: (destino: Ruta) => void } {
  const [ruta, setRuta] = useState<Ruta>(() =>
    parsearRuta(window.location.hash),
  );

  useEffect(() => {
    const alCambiar = () => {
      setRuta(parsearRuta(window.location.hash));
    };
    window.addEventListener("hashchange", alCambiar);
    // Por si el hash cambió entre el primer render y este efecto.
    alCambiar();
    return () => {
      window.removeEventListener("hashchange", alCambiar);
    };
  }, []);

  const ir = useCallback((destino: Ruta) => {
    navegar(destino);
  }, []);

  return { ruta, ir };
}
