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
import { compararPeriodos, primerPeriodoDelPlan } from "./periodos";

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
 * Códigos que la historia trae como `cursando` o `regular` y que la simulación
 * optimista da por aprobados al empezar `periodo`.
 *
 * Regla (decisión N0-15): una materia que se está cursando cuenta como
 * aprobada para **todo período posterior al período activo** —el primero del
 * plan del usuario— y **no** en el período activo mismo, donde todavía no hay
 * nota. Sin ningún período en el plan no hay período activo del que hablar:
 * el usuario recién pegó su historia y mira hacia adelante, así que lo que está
 * cursando se da por aprobado para cualquier período que consulte (optimista,
 * como el resto de la simulación).
 */
function cursandoAlEmpezar(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): Codigo[] {
  const activo = primerPeriodoDelPlan(planUsuario);
  if (activo !== null && compararPeriodos(periodo, activo) <= 0) {
    return [];
  }
  const materias = indiceDeMaterias(plan);
  const salida: Codigo[] = [];
  for (const [codigo, entrada] of Object.entries(planUsuario.historia)) {
    const enCurso =
      entrada.estado === "cursando" || entrada.estado === "regular";
    if (enCurso && materias.has(codigo)) {
      salida.push(codigo);
    }
  }
  return salida.sort();
}

/**
 * Créditos con los que el usuario **empieza** `periodo`: los aprobados más los
 * de todo lo planificado en períodos estrictamente anteriores, más los de lo
 * que está cursando cuando `periodo` es posterior al activo (ver
 * `cursandoAlEmpezar`).
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
  for (const codigo of cursandoAlEmpezar(periodo, planUsuario, plan)) {
    aprobados.add(codigo);
  }
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
 * los de la historia, más lo que se está cursando cuando `periodo` es
 * posterior al activo (decisión N0-15), más lo planificado antes.
 */
export function aprobadasAlEmpezar(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): Set<Codigo> {
  const salida = new Set(itemsAprobados(planUsuario.historia, plan));
  for (const codigo of cursandoAlEmpezar(periodo, planUsuario, plan)) {
    salida.add(codigo);
  }
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
