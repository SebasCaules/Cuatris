/**
 * Datos reales para las pruebas del motor. **Solo para tests.**
 *
 * Se importan por ruta relativa desde donde ya viven en el repositorio; no se
 * copian, para que un cambio del plan o del corpus rompa acá y no quede una
 * copia vieja pasando pruebas que ya no describen la realidad.
 */

import planCrudo from "../../../../data/v1/planes/S10-Rev23.json";
import abreviacionesCrudas from "../../../../data/v1/abreviaciones.json";
import raroCrudo from "../../../../tests/fixtures/deben-pasar/horarios-casos-raros.json";
import type {
  Abreviaciones,
  Codigo,
  EntradaHistoria,
  Horarios,
  MateriaPlanificada,
  PeriodoId,
  Plan,
  PlanUsuario,
} from "../../contrato/tipos";

/** `data/v1/planes/S10-Rev23.json`: 163 materias, 3 títulos, 4 minors. */
export const PLAN: Plan = planCrudo as unknown as Plan;

/** `data/v1/abreviaciones.json`: 163 abreviaciones únicas. */
export const ABREVIACIONES: Abreviaciones =
  abreviacionesCrudas as unknown as Abreviaciones;

/**
 * `tests/fixtures/deben-pasar/horarios-casos-raros.json`: los siete casos raros
 * verificados del SGA (dos aulas simultáneas, letras no contiguas, cruce de
 * sedes, modalidades mixtas, período corto, homónimas, cupo completo).
 */
export const HORARIOS_RAROS: Horarios = raroCrudo as unknown as Horarios;

/** El período del archivo de casos raros. */
export const PERIODO_RARO: PeriodoId = HORARIOS_RAROS.periodo.id;

/** Un `PlanUsuario` vacío al que las pruebas le agregan lo que necesitan. */
export function planVacio(): PlanUsuario {
  return {
    version: 1,
    plan: "S10-Rev23",
    historia: {},
    periodos: {},
    colores: {},
    sugerencias: [],
    preferencias: { visibles: 2 },
  };
}

/** Historia con todos esos códigos en el estado indicado (por defecto aprobada). */
export function historiaCon(
  codigos: readonly Codigo[],
  estado: EntradaHistoria["estado"] = "aprobada",
): Record<Codigo, EntradaHistoria> {
  const salida: Record<Codigo, EntradaHistoria> = {};
  for (const codigo of codigos) {
    salida[codigo] = { estado };
  }
  return salida;
}

/** Códigos de las materias vigentes de un ciclo del plan. */
export function codigosDelCiclo(
  ciclo: Plan["materias"][number]["ciclo"],
): Codigo[] {
  return PLAN.materias
    .filter((materia) => materia.vigente && materia.ciclo === ciclo)
    .map((materia) => materia.codigo)
    .sort();
}

/** Un plan de usuario armado de una vez: historia y períodos. */
export function planCon(
  historia: Record<Codigo, EntradaHistoria>,
  periodos: Record<PeriodoId, MateriaPlanificada[]>,
): PlanUsuario {
  return { ...planVacio(), historia, periodos };
}
