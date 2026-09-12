/**
 * Persistencia del `PlanUsuario` en `localStorage`.
 *
 * Regla dura: **nunca se descarta un plan guardado**. Si lo que hay en disco no
 * se puede leer, se deja intacto y se devuelve el error; la interfaz ofrece
 * exportarlo antes de empezar de cero.
 */

import type { PlanUsuario } from "../contrato/tipos";
import { exportar, migrar, PlanUsuarioCorrupto } from "./planUsuario";

export const CLAVE_ALMACENAMIENTO = "cuatris.plan_usuario";
/** Debounce corto: agrupa ráfagas de cambios sin retrasar el guardado. */
export const RETARDO_GUARDADO_MS = 300;

export type LecturaAlmacenada =
  | { estado: "vacio" }
  | { estado: "listo"; plan: PlanUsuario }
  | { estado: "corrupto"; error: PlanUsuarioCorrupto; crudo: string };

function almacen(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Navegador con el almacenamiento bloqueado: se trabaja en memoria.
    return null;
  }
}

/** Lee el plan guardado. No borra ni reescribe nada. */
export function leer(): LecturaAlmacenada {
  const disco = almacen();
  if (disco === null) {
    return { estado: "vacio" };
  }
  let crudo: string | null;
  try {
    crudo = disco.getItem(CLAVE_ALMACENAMIENTO);
  } catch {
    return { estado: "vacio" };
  }
  if (crudo === null || crudo === "") {
    return { estado: "vacio" };
  }
  try {
    return { estado: "listo", plan: migrar(JSON.parse(crudo) as unknown) };
  } catch (error) {
    const falla =
      error instanceof PlanUsuarioCorrupto
        ? error
        : new PlanUsuarioCorrupto(
            "raiz",
            error instanceof Error ? error.message : "no es JSON válido",
          );
    return { estado: "corrupto", error: falla, crudo };
  }
}

/** Escribe el plan ya mismo. */
export function guardarYa(plan: PlanUsuario): void {
  const disco = almacen();
  if (disco === null) {
    return;
  }
  try {
    disco.setItem(CLAVE_ALMACENAMIENTO, exportar(plan));
  } catch {
    // Cuota llena o modo privado: no hay nada que hacer desde acá.
  }
}

/**
 * Guardado con debounce. Devuelve una función para cancelarlo, pensada para el
 * `useEffect` que lo dispara.
 */
export function guardarConRetardo(
  plan: PlanUsuario,
  retardoMs: number = RETARDO_GUARDADO_MS,
): () => void {
  const temporizador = window.setTimeout(() => {
    guardarYa(plan);
  }, retardoMs);
  return () => {
    window.clearTimeout(temporizador);
  };
}
