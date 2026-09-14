"use client";

import { useEffect } from "react";
import { BASE_PATH } from "@/lib/content/slug";

/** Claves de la query que solo tienen sentido en el planificador (carrera y
 *  estado de la vista). Antes de existir la portada el planner vivía en `/`, y
 *  esos links siguen circulando: se los manda a `/planificar/` con su query. */
const CLAVES_PLANNER = ["carrera", "view", "pq", "areas", "disp", "hor", "combo", "drawer", "ficha"];

/** En la portada: un link viejo del planificador (`/?carrera=S&view=plan`)
 *  redirige a `/planificar/` conservando la query. No renderiza nada. */
export default function LegacyRedirect() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (!CLAVES_PLANNER.some((k) => q.has(k))) return;
    window.location.replace(`${BASE_PATH}/planificar/${window.location.search}${window.location.hash}`);
  }, []);
  return null;
}
