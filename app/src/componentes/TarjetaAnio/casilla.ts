/**
 * Cómo se deriva la casilla de un grupo de materias (R2).
 *
 * Lógica pura, sin React, porque es la regla que hace que la casilla del año y
 * la del cuatrimestre digan lo mismo con el mismo criterio:
 *
 * - **marcada** si todas tienen el final;
 * - **mixta** si alguna tiene algo anotado y no todas llegaron al final;
 * - **vacía** si no hay nada anotado.
 *
 * Un grupo sin materias queda vacío: no hay nada que marcar.
 */

import type { EstadoCasilla } from "../primitivas";
import type { EstadoMarca } from "../MarcaMateria";

export function estadoDeCasilla(
  estados: readonly EstadoMarca[],
): EstadoCasilla {
  if (estados.length === 0) {
    return false;
  }
  if (estados.every((estado) => estado === "final")) {
    return true;
  }
  if (estados.some((estado) => estado !== "pendiente")) {
    return "mixed";
  }
  return false;
}

/** Qué pasa al accionar la casilla: si está marcada, quita; si no, marca. */
export function siguienteDeCasilla(actual: EstadoCasilla): EstadoMarca {
  return actual === true ? "pendiente" : "final";
}
