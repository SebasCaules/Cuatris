/**
 * Créditos e ítems: lo aprobado y lo que la simulación optimista da por hecho.
 *
 * «Optimista» quiere decir que todo lo que el usuario planificó en un período
 * anterior se cuenta como aprobado al empezar el siguiente. Es la hipótesis con
 * la que se planifica una carrera; el motor no la disimula, la nombra.
 */

import type {
  Codigo,
  EntradaHistoria,
  Materia,
  PeriodoId,
  Plan,
  PlanUsuario,
} from "../contrato/tipos";
import { compararPeriodos } from "./periodos";

export type Historia = Record<Codigo, EntradaHistoria>;

/** Índice `código → materia` del plan. Se arma una vez por cálculo. */
export function indiceDeMaterias(plan: Plan): Map<Codigo, Materia> {
  const indice = new Map<Codigo, Materia>();
  for (const materia of plan.materias) {
    indice.set(materia.codigo, materia);
  }
  return indice;
}

/**
 * Códigos aprobados que el plan reconoce, en orden.
 *
 * Solo cuenta el estado `aprobada`: `regular` y `cursando` son materias que
 * todavía no son ítems de ningún título. Un código de la historia que el plan
 * no tiene (otra carrera, un plan viejo) se ignora acá —no se le pueden asignar
 * créditos sin inventarlos— y la interfaz lo muestra aparte si hace falta.
 */
export function itemsAprobados(historia: Historia, plan: Plan): Codigo[] {
  const materias = indiceDeMaterias(plan);
  const salida: Codigo[] = [];
  for (const [codigo, entrada] of Object.entries(historia)) {
    if (entrada.estado === "aprobada" && materias.has(codigo)) {
      salida.push(codigo);
    }
  }
  return salida.sort();
}

/** Créditos de las materias aprobadas que el plan reconoce. */
export function creditosAprobados(historia: Historia, plan: Plan): number {
  const materias = indiceDeMaterias(plan);
  let total = 0;
  for (const codigo of itemsAprobados(historia, plan)) {
    total += materias.get(codigo)?.creditos ?? 0;
  }
  return total;
}

/**
 * `código → primer período` en que el usuario la planificó.
 *
 * Si la misma materia aparece en dos períodos gana el más temprano: es la
 * lectura optimista y además la única que no depende del orden de las claves.
 */
export function primerPeriodoPlanificado(
  planUsuario: PlanUsuario,
): Map<Codigo, PeriodoId> {
  const salida = new Map<Codigo, PeriodoId>();
  for (const [periodo, materias] of Object.entries(planUsuario.periodos)) {
    for (const materia of materias) {
      const anterior = salida.get(materia.codigo);
      if (anterior === undefined || compararPeriodos(periodo, anterior) < 0) {
        salida.set(materia.codigo, periodo);
      }
    }
  }
  return salida;
}

/**
 * Créditos con los que el usuario **empieza** `periodo`: los aprobados más los
 * de todo lo planificado en períodos estrictamente anteriores.
 *
 * Lo planificado en `periodo` no suma: todavía no se cursó. Una materia ya
 * aprobada que además aparece planificada se cuenta una sola vez.
 */
export function creditosAlEmpezar(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): number {
  const materias = indiceDeMaterias(plan);
  const aprobados = new Set(itemsAprobados(planUsuario.historia, plan));
  let total = 0;
  for (const codigo of aprobados) {
    total += materias.get(codigo)?.creditos ?? 0;
  }
  for (const [codigo, cuando] of primerPeriodoPlanificado(planUsuario)) {
    if (aprobados.has(codigo)) {
      continue;
    }
    if (compararPeriodos(cuando, periodo) >= 0) {
      continue;
    }
    total += materias.get(codigo)?.creditos ?? 0;
  }
  return total;
}

/**
 * Códigos que la simulación optimista da por aprobados al empezar `periodo`:
 * los de la historia más lo planificado antes.
 */
export function aprobadasAlEmpezar(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): Set<Codigo> {
  const salida = new Set(itemsAprobados(planUsuario.historia, plan));
  const materias = indiceDeMaterias(plan);
  for (const [codigo, cuando] of primerPeriodoPlanificado(planUsuario)) {
    if (!materias.has(codigo)) {
      continue;
    }
    if (compararPeriodos(cuando, periodo) < 0) {
      salida.add(codigo);
    }
  }
  return salida;
}
