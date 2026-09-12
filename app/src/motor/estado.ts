/**
 * Estado de una materia en un cuatrimestre, y por qué está bloqueada.
 *
 * Toda la lógica de correlativas vive acá. La regla que la gobierna es la
 * simulación optimista: una correlativa planificada en un período **anterior**
 * cuenta como aprobada; planificada en el mismo período o después, no, porque
 * no se puede cursar la consecuencia junto con la causa.
 */

import type {
  Codigo,
  Horarios,
  PeriodoId,
  Plan,
  PlanUsuario,
} from "../contrato/tipos";
import {
  aprobadasAlEmpezar,
  creditosAlEmpezar,
  indiceDeMaterias,
  primerPeriodoPlanificado,
} from "./creditos";
import { MateriaDesconocida, SinPeriodoDeReferencia } from "./errores";
import {
  compararPeriodos,
  periodosDesde,
  primerPeriodoDelPlan,
} from "./periodos";

/** Los cinco estados que la interfaz sabe dibujar. */
export type EstadoMateria =
  | "aprobada"
  | "cursando"
  | "planificada"
  | "disponible"
  | "bloqueada";

/** Por qué una materia no se puede cursar en un período. */
export type MotivoBloqueo =
  | {
      tipo: "correlativa";
      codigo: Codigo;
      /** `falta`: no está ni aprobada ni planificada antes. */
      estado: "falta" | "planificada_en";
      /** Presente solo con `planificada_en`: dónde quedó planificada. */
      periodo?: PeriodoId;
    }
  | { tipo: "creditos"; requeridos: number; tienes: number };

/**
 * Cuántos períodos mira `seDestrabaEn` hacia adelante, además del actual.
 * Doce cuatrimestres son seis años: más allá la respuesta deja de ser útil.
 */
export const PERIODOS_ADELANTE = 12;

function materiaDelPlan(codigo: Codigo, plan: Plan) {
  const materia = indiceDeMaterias(plan).get(codigo);
  if (materia === undefined) {
    throw new MateriaDesconocida(codigo);
  }
  return materia;
}

/**
 * Por qué `codigo` no se puede cursar en `periodo`, en orden: primero las
 * correlativas (en el orden en que las declara el plan), después los créditos.
 * Lista vacía = se puede cursar.
 *
 * Lanza `MateriaDesconocida` si el código no está en el plan: razonar sobre
 * correlativas que no existen es inventar.
 */
export function motivosBloqueo(
  codigo: Codigo,
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): MotivoBloqueo[] {
  const materia = materiaDelPlan(codigo, plan);
  const disponiblesAntes = aprobadasAlEmpezar(periodo, planUsuario, plan);
  const planificadas = primerPeriodoPlanificado(planUsuario);
  const motivos: MotivoBloqueo[] = [];

  for (const correlativa of materia.correlativas) {
    if (disponiblesAntes.has(correlativa)) {
      continue;
    }
    const cuando = planificadas.get(correlativa);
    if (cuando !== undefined && compararPeriodos(cuando, periodo) >= 0) {
      // Planificada en este mismo período o más adelante: no sirve todavía.
      motivos.push({
        tipo: "correlativa",
        codigo: correlativa,
        estado: "planificada_en",
        periodo: cuando,
      });
      continue;
    }
    motivos.push({ tipo: "correlativa", codigo: correlativa, estado: "falta" });
  }

  if (materia.creditos_requeridos > 0) {
    const tienes = creditosAlEmpezar(periodo, planUsuario, plan);
    if (tienes < materia.creditos_requeridos) {
      motivos.push({
        tipo: "creditos",
        requeridos: materia.creditos_requeridos,
        tienes,
      });
    }
  }

  return motivos;
}

/**
 * En qué estado está `codigo` de cara a `periodo`.
 *
 * Precedencia: lo que ya pasó manda sobre lo que se planea, y un bloqueo manda
 * sobre el plan —una materia planificada que quedó bloqueada tiene que verse
 * bloqueada, no planificada—:
 * `aprobada` → `cursando` → `bloqueada` → `planificada` → `disponible`.
 *
 * `regular` y `cursando` de la historia caen los dos en `cursando`: son
 * materias empezadas y no aprobadas, y la interfaz las trata igual.
 *
 * `_horarios` se acepta para que la firma sea estable y 13c pueda pasarlos sin
 * ramificar; en el Sprint 1 no cambia el resultado. Si la materia se ofrece o
 * no en el período se consulta con `seOfrece` (`./horarios`), que es un dato de
 * la oferta y no del estado académico.
 */
export function estadoMateria(
  codigo: Codigo,
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
  _horarios?: Horarios,
): EstadoMateria {
  materiaDelPlan(codigo, plan);

  const enHistoria = planUsuario.historia[codigo];
  if (enHistoria?.estado === "aprobada") {
    return "aprobada";
  }
  if (enHistoria !== undefined) {
    return "cursando";
  }

  if (motivosBloqueo(codigo, periodo, planUsuario, plan).length > 0) {
    return "bloqueada";
  }

  const planificadas = planUsuario.periodos[periodo] ?? [];
  if (planificadas.some((materia) => materia.codigo === codigo)) {
    return "planificada";
  }

  return "disponible";
}

/**
 * Primer período, desde `desde` y hasta `PERIODOS_ADELANTE` más adelante, en el
 * que `codigo` deja de estar bloqueada. `null` si no se destraba en ese tramo.
 *
 * `desde` es opcional: sin él se arranca en el primer período del plan del
 * usuario, que es lo que el motor entiende por «el cuatrimestre actual». Si el
 * plan no tiene ningún período, lanza `SinPeriodoDeReferencia` en vez de elegir
 * un año por su cuenta.
 */
export function seDestrabaEn(
  codigo: Codigo,
  planUsuario: PlanUsuario,
  plan: Plan,
  desde?: PeriodoId,
): PeriodoId | null {
  materiaDelPlan(codigo, plan);
  const arranque = desde ?? primerPeriodoDelPlan(planUsuario);
  if (arranque === null) {
    throw new SinPeriodoDeReferencia(`cuándo se destraba ${codigo}`);
  }
  for (const periodo of periodosDesde(arranque, PERIODOS_ADELANTE + 1)) {
    if (motivosBloqueo(codigo, periodo, planUsuario, plan).length === 0) {
      return periodo;
    }
  }
  return null;
}

/**
 * Materias **vigentes** del plan que tienen a `codigo` como correlativa: lo que
 * se destraba al aprobarla. Ordenadas por código.
 *
 * Las no vigentes quedan afuera porque no se pueden cursar: prometer que una
 * materia destraba algo que el panel de agregar nunca va a ofrecer es mentir.
 */
export function habilita(codigo: Codigo, plan: Plan): Codigo[] {
  materiaDelPlan(codigo, plan);
  return plan.materias
    .filter((materia) => materia.vigente && materia.correlativas.includes(codigo))
    .map((materia) => materia.codigo)
    .sort();
}
