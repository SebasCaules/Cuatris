"use client";

/* ============================================================================
   url-state · estado deep-linkable sobre el static export
   ----------------------------------------------------------------------------
   El sitio es Next static export (multi-ruta) y YA navega sin reload (soft-nav
   vía next/link). Esta capa agrega ESTADO EN LA URL a las islas cliente para
   que recargar y compartir un link reproduzcan el estado intermedio de una
   página (vista del planner, tab del toolkit, modo de una hoja, query de la
   búsqueda global, …).

   Mecanismo (bendecido por la doc de Next 16, guía "single-page-applications":
   sección "Shallow routing on the client"): se usa el History API nativo
   —`window.history.pushState` / `replaceState`— que Next intercepta e integra
   con su router (sincroniza usePathname/useSearchParams SIN recargar ni hacer
   scroll). NO usamos `router.push/replace` para estado efímero: dispara
   re-render de ruta y reset de scroll.

   Lectura: NO usamos `useSearchParams()` porque en static export fuerza un
   Suspense boundary y deopta la página a client-render. En su lugar seguimos el
   idioma del repo (igual que persist.ts / SheetShell / wiki Sidebar):
   "primer render = defaults deterministas; hidratar desde el entorno tras
   montar". Leemos `window.location.search` en un effect + escuchamos `popstate`
   para atrás/adelante.

   Reglas de oro (ver README.md de esta carpeta):
   · SSR-safe: todo acceso a `window` detrás de guard.
   · Cada superficie toca SOLO sus propias claves (read-modify-write): dos islas
     en la misma ruta (p. ej. planner + búsqueda global en /electivas) coexisten.
   · `decode` SIEMPRE valida: una clave desconocida/ inválida cae al default.
   · Gatear las escrituras detrás de "hidratado" para no pisar la URL con
     defaults antes de haber leído lo que venía en ella.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";

/** Lee los query params actuales. `URLSearchParams` vacío en SSR/prerender. */
export function readParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/**
 * Aplica una mutación a los query params vivos y escribe la URL vía History API,
 * preservando pathname (incluye basePath en runtime) y hash.
 *
 * - `mode: "replace"` (default) → reescribe la entrada actual: ideal para
 *   filtros/estado continuo (no ensucia el back stack).
 * - `mode: "push"` → agrega una entrada: usalo para un abrir/cerrar discreto que
 *   el botón Atrás deba revertir (p. ej. abrir un drawer o una tool).
 *
 * `mutate` debe tocar SOLO las claves propias de la superficie (y borrar las que
 * queden en su valor default), para no pisar las de otra isla en la misma ruta.
 */
export function writeParams(
  mutate: (p: URLSearchParams) => void,
  mode: "replace" | "push" = "replace",
): void {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams(window.location.search);
  mutate(p);
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export interface UrlStateConfig<T> {
  /** Valor determinista para SSR/primer render (antes de hidratar desde la URL). */
  initial: T;
  /** Construye el valor a partir de los params. DEBE validar (desconocido → default). */
  decode: (p: URLSearchParams) => T;
  /** Serializa el valor en los params. Tocá SOLO tus claves; borralas cuando estén en default. */
  encode: (value: T, p: URLSearchParams) => void;
  /** replace (default) o push. Ver `writeParams`. */
  mode?: "replace" | "push";
}

/**
 * Estado local de React sincronizado con la URL, SSR-safe. Para las islas
 * simples basadas en `useState` (tab del toolkit, modo de la hoja, búsqueda
 * global). El planner usa un reducer y consume `readParams`/`writeParams`
 * directamente.
 *
 * - SSR/primer render → `initial` (hidratación segura, sin mismatch).
 * - Tras montar → lee la URL con `decode` y adopta ese valor; marca `hydrated`.
 * - `set(next)` actualiza el estado y escribe la URL con `encode`.
 * - `popstate` (atrás/adelante) re-lee la URL y re-decodifica.
 *
 * @returns `[value, set, hydrated]`
 */
export function useUrlState<T>(
  config: UrlStateConfig<T>,
): [T, (next: T) => void, boolean] {
  const { initial, mode = "replace" } = config;
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  // Refs: decode/encode suelen venir inline; evitamos re-suscribir el listener.
  const decodeRef = useRef(config.decode);
  decodeRef.current = config.decode;
  const encodeRef = useRef(config.encode);
  encodeRef.current = config.encode;

  useEffect(() => {
    const sync = () => setValue(decodeRef.current(readParams()));
    sync();
    setHydrated(true);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      writeParams((p) => encodeRef.current(next, p), mode);
    },
    [mode],
  );

  return [value, set, hydrated];
}

/* ---- helpers de (de)serialización compartidos -------------------------------
   Codificaciones canónicas para que todas las superficies serialicen igual. */

/** Set<string> ⇄ CSV ordenado. `""`/ausente → Set vacío. */
export const csv = {
  encode: (s: Iterable<string>): string => [...s].join(","),
  decode: (raw: string | null): Set<string> =>
    new Set((raw ?? "").split(",").map((x) => x.trim()).filter(Boolean)),
};

/** Bandera booleana ⇄ presencia de la clave con valor "1". */
export const flag = {
  decode: (raw: string | null): boolean => raw === "1",
};

/**
 * Setea o borra una clave según valor/condición. Borra cuando el valor está en
 * su default (mantiene la URL corta y estable). Uso:
 *   setOrDelete(p, "view", view, view !== "cuatri");
 */
export function setOrDelete(
  p: URLSearchParams,
  key: string,
  value: string,
  keep: boolean,
): void {
  if (keep && value) p.set(key, value);
  else p.delete(key);
}
