/**
 * Aritmética de períodos (`2026-2C`).
 *
 * Un período es un cuatrimestre: `<año>-1C` o `<año>-2C`. El orden cronológico
 * es el único orden que usa el motor, y como la forma es de ancho fijo coincide
 * con el alfabético; aun así se compara por partes, para que un cambio de forma
 * rompa acá y no en silencio en otro lado.
 */

import type { Cuatrimestre, PeriodoId, PlanUsuario } from "../contrato/tipos";
import { PeriodoInvalido } from "./errores";

const PERIODO = /^(\d{4})-([12])C$/;

export interface PartesPeriodo {
  anio: number;
  cuatrimestre: Cuatrimestre;
}

/** Si el texto tiene la forma de un `PeriodoId`. */
export function esPeriodoId(texto: string): boolean {
  return PERIODO.test(texto);
}

/** Parte un `PeriodoId` en año y cuatrimestre. Lanza `PeriodoInvalido`. */
export function parsearPeriodo(periodo: PeriodoId): PartesPeriodo {
  const coincidencia = periodo.match(PERIODO);
  if (coincidencia === null) {
    throw new PeriodoInvalido(periodo);
  }
  return {
    anio: Number(coincidencia[1]),
    cuatrimestre: coincidencia[2] === "1" ? "1C" : "2C",
  };
}

/** Negativo si `a` es anterior a `b`, cero si son el mismo, positivo si no. */
export function compararPeriodos(a: PeriodoId, b: PeriodoId): number {
  const uno = parsearPeriodo(a);
  const otro = parsearPeriodo(b);
  if (uno.anio !== otro.anio) {
    return uno.anio - otro.anio;
  }
  const numero = (partes: PartesPeriodo): number =>
    partes.cuatrimestre === "1C" ? 1 : 2;
  return numero(uno) - numero(otro);
}

/** El cuatrimestre que sigue: `2026-1C` → `2026-2C` → `2027-1C`. */
export function siguientePeriodo(periodo: PeriodoId): PeriodoId {
  const { anio, cuatrimestre } = parsearPeriodo(periodo);
  return cuatrimestre === "1C" ? `${anio}-2C` : `${anio + 1}-1C`;
}

/**
 * `cantidad` períodos consecutivos empezando por `periodo` (incluido).
 * `cantidad` menor o igual a cero devuelve la lista vacía.
 */
export function periodosDesde(
  periodo: PeriodoId,
  cantidad: number,
): PeriodoId[] {
  // Valida la forma aunque `cantidad` sea cero: un período inválido es un error
  // del que llama, no algo que dependa de cuántos se pidan.
  parsearPeriodo(periodo);
  const salida: PeriodoId[] = [];
  let actual = periodo;
  for (let i = 0; i < cantidad; i += 1) {
    salida.push(actual);
    actual = siguientePeriodo(actual);
  }
  return salida;
}

/** Los mismos períodos, en orden cronológico. */
export function ordenarPeriodos(periodos: readonly PeriodoId[]): PeriodoId[] {
  return [...periodos].sort(compararPeriodos);
}

/**
 * Los períodos que el usuario tiene abiertos, en orden cronológico.
 * Un período con la lista de materias vacía sigue siendo un período.
 */
export function periodosDelPlan(planUsuario: PlanUsuario): PeriodoId[] {
  return ordenarPeriodos(Object.keys(planUsuario.periodos));
}

/**
 * El primero de los períodos del usuario, o `null` si no hay ninguno.
 * Es lo que el motor entiende por «el cuatrimestre actual» cuando nadie se lo
 * dice: el plan arranca en el cuatrimestre que se está por cursar.
 */
export function primerPeriodoDelPlan(
  planUsuario: PlanUsuario,
): PeriodoId | null {
  return periodosDelPlan(planUsuario)[0] ?? null;
}
