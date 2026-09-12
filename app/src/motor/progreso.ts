/**
 * Progreso: títulos, electivas y minors.
 *
 * Un título no se alcanza juntando créditos: hay que aprobar **todos los ítems**
 * de los ciclos que exige (hallazgo 2). Por eso Inglés I, Inglés II y Práctica
 * Laboral, que valen cero créditos, pesan igual que cualquier otra materia.
 *
 * El `estimado` sale de la misma simulación optimista del resto del motor: se
 * recorre período a período lo que el usuario planificó y se responde en cuál
 * termina de cumplir todo lo que el título exige.
 */

import type {
  Ciclo,
  Codigo,
  PeriodoId,
  Plan,
  PlanUsuario,
  Sigla,
} from "../contrato/tipos";
import {
  aprobadasAlEmpezar,
  indiceDeMaterias,
  itemsAprobados,
  primerPeriodoPlanificado,
} from "./creditos";
import { compararPeriodos, periodosDelPlan } from "./periodos";

export interface ProgresoTitulo {
  id: string;
  nombre: string;
  alcanzado: boolean;
  /** Créditos aprobados hoy. */
  creditos: number;
  requeridos: number;
  /** Ítems de los ciclos exigidos que todavía no están aprobados. */
  faltanItems: Codigo[];
  /**
   * Cuatrimestre en el que la simulación optimista lo alcanza. `null` si ya
   * está alcanzado o si el plan cargado no llega a cumplirlo.
   */
  estimado: PeriodoId | null;
}

/** Una electiva que suma a los 27 créditos. */
export interface ElectivaContada {
  codigo: Codigo;
  creditos: number;
  estado: "aprobada" | "planificada";
}

export interface ProgresoElectivas {
  /** Créditos de electivas aprobadas. */
  aprobados: number;
  /** Créditos de electivas planificadas y todavía no aprobadas. */
  planificados: number;
  requeridos: number;
  lista: ElectivaContada[];
}

export interface ProgresoMinor {
  sigla: Sigla;
  nombre: string;
  /** Créditos aprobados de materias del minor. */
  creditos: number;
  /** Créditos planificados y todavía no aprobados. */
  planificados: number;
  minimos: number;
  /** Créditos aprobados que faltan para el mínimo; cero si ya está. */
  faltan: number;
}

/** Conjunto de estados que la simulación considera «ya aprobado». */
interface Situacion {
  aprobadas: Set<Codigo>;
  creditos: number;
  creditosElectivas: number;
}

function situacion(aprobadas: Set<Codigo>, plan: Plan): Situacion {
  const materias = indiceDeMaterias(plan);
  let creditos = 0;
  let creditosElectivas = 0;
  for (const codigo of aprobadas) {
    const materia = materias.get(codigo);
    if (materia === undefined) {
      continue;
    }
    creditos += materia.creditos;
    if (materia.ciclo === "electiva") {
      creditosElectivas += materia.creditos;
    }
  }
  return { aprobadas, creditos, creditosElectivas };
}

function itemsDeCiclos(plan: Plan, ciclos: readonly Ciclo[]): Codigo[] {
  return plan.materias
    .filter((materia) => materia.vigente && ciclos.includes(materia.ciclo))
    .map((materia) => materia.codigo)
    .sort();
}

function faltantes(
  plan: Plan,
  ciclos: readonly Ciclo[],
  aprobadas: Set<Codigo>,
): Codigo[] {
  return itemsDeCiclos(plan, ciclos).filter((codigo) => !aprobadas.has(codigo));
}

function cumple(
  titulo: Plan["titulos"][number],
  plan: Plan,
  estado: Situacion,
): boolean {
  const ciclos = titulo.requiere_ciclos ?? [];
  if (faltantes(plan, ciclos, estado.aprobadas).length > 0) {
    return false;
  }
  if (estado.creditos < titulo.creditos) {
    return false;
  }
  const electivasExigidas = titulo.requiere_electivas ?? 0;
  return estado.creditosElectivas >= electivasExigidas;
}

/** Códigos aprobados al **terminar** `periodo`, según la simulación. */
function aprobadasAlTerminar(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): Set<Codigo> {
  const salida = aprobadasAlEmpezar(periodo, planUsuario, plan);
  const materias = indiceDeMaterias(plan);
  for (const [codigo, cuando] of primerPeriodoPlanificado(planUsuario)) {
    if (materias.has(codigo) && compararPeriodos(cuando, periodo) <= 0) {
      salida.add(codigo);
    }
  }
  return salida;
}

/**
 * Progreso de cada título del plan, en el orden en que el plan los declara
 * (del intermedio al principal).
 */
export function progresoTitulos(
  planUsuario: PlanUsuario,
  plan: Plan,
): ProgresoTitulo[] {
  const hoy = situacion(
    new Set(itemsAprobados(planUsuario.historia, plan)),
    plan,
  );
  // El título se alcanza *al terminar* un cuatrimestre, y lo que se informa es
  // el nombre de ese cuatrimestre: por eso se recorren los del plan, en orden.
  const simulacion = periodosDelPlan(planUsuario).map((periodo) => ({
    periodo,
    estado: situacion(aprobadasAlTerminar(periodo, planUsuario, plan), plan),
  }));

  return plan.titulos.map((titulo): ProgresoTitulo => {
    const ciclos = titulo.requiere_ciclos ?? [];
    const alcanzado = cumple(titulo, plan, hoy);
    const estimado = alcanzado
      ? null
      : (simulacion.find((paso) => cumple(titulo, plan, paso.estado))?.periodo ??
        null);
    return {
      id: titulo.id,
      nombre: titulo.nombre,
      alcanzado,
      creditos: hoy.creditos,
      requeridos: titulo.creditos,
      faltanItems: faltantes(plan, ciclos, hoy.aprobadas),
      estimado,
    };
  });
}

/**
 * Electivas contra los 27 créditos del plan: lo aprobado, lo planificado y de
 * qué materias sale cada cosa (aprobadas primero, cada grupo por código).
 */
export function electivas(
  planUsuario: PlanUsuario,
  plan: Plan,
): ProgresoElectivas {
  const materias = indiceDeMaterias(plan);
  const aprobadas = new Set(itemsAprobados(planUsuario.historia, plan));
  const planificadas = primerPeriodoPlanificado(planUsuario);

  const lista: ElectivaContada[] = [];
  let sumaAprobados = 0;
  let sumaPlanificados = 0;

  for (const codigo of [...aprobadas].sort()) {
    const materia = materias.get(codigo);
    if (materia === undefined || materia.ciclo !== "electiva") {
      continue;
    }
    lista.push({ codigo, creditos: materia.creditos, estado: "aprobada" });
    sumaAprobados += materia.creditos;
  }
  for (const codigo of [...planificadas.keys()].sort()) {
    if (aprobadas.has(codigo)) {
      continue;
    }
    const materia = materias.get(codigo);
    if (materia === undefined || materia.ciclo !== "electiva") {
      continue;
    }
    lista.push({ codigo, creditos: materia.creditos, estado: "planificada" });
    sumaPlanificados += materia.creditos;
  }

  return {
    aprobados: sumaAprobados,
    planificados: sumaPlanificados,
    requeridos: plan.electivas.creditos_requeridos,
    lista,
  };
}

/**
 * Progreso de cada minor. Una electiva puede sumar a más de un minor: el plan
 * le da varias siglas y cada minor la cuenta por separado.
 */
export function minors(planUsuario: PlanUsuario, plan: Plan): ProgresoMinor[] {
  const materias = indiceDeMaterias(plan);
  const aprobadas = new Set(itemsAprobados(planUsuario.historia, plan));
  const planificadas = new Set(primerPeriodoPlanificado(planUsuario).keys());

  return plan.minors.map((minor): ProgresoMinor => {
    let creditos = 0;
    let planificados = 0;
    for (const materia of plan.materias) {
      if (!materia.minors.includes(minor.sigla)) {
        continue;
      }
      if (aprobadas.has(materia.codigo)) {
        creditos += materia.creditos;
      } else if (planificadas.has(materia.codigo) && materias.has(materia.codigo)) {
        planificados += materia.creditos;
      }
    }
    return {
      sigla: minor.sigla,
      nombre: minor.nombre,
      creditos,
      planificados,
      minimos: minor.creditos_minimos,
      faltan: Math.max(0, minor.creditos_minimos - creditos),
    };
  });
}
