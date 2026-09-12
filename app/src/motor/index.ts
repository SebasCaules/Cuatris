/**
 * Motor de dominio de Cuatris.
 *
 * TypeScript puro: nada de React, nada del DOM, ninguna dependencia. Es la
 * parte que tiene que sobrevivir a cualquier rediseño de la interfaz, y por eso
 * se prueba sola, con los datos reales del plan y del corpus.
 *
 * Las funciones son puras: reciben el plan de estudios, el plan del usuario y,
 * cuando hace falta, los horarios del período, y devuelven valores nuevos.
 */

export {
  MateriaDesconocida,
  PeriodoInvalido,
  SinPeriodoDeReferencia,
} from "./errores";

export {
  compararPeriodos,
  esPeriodoId,
  ordenarPeriodos,
  parsearPeriodo,
  periodosDelPlan,
  periodosDesde,
  primerPeriodoDelPlan,
  siguientePeriodo,
} from "./periodos";
export type { PartesPeriodo } from "./periodos";

export {
  aprobadasAlEmpezar,
  creditosAlEmpezar,
  creditosAprobados,
  indiceDeMaterias,
  itemsAprobados,
  primerPeriodoPlanificado,
} from "./creditos";
export type { Historia } from "./creditos";

export {
  estadoMateria,
  habilita,
  motivosBloqueo,
  PERIODOS_ADELANTE,
  seDestrabaEn,
} from "./estado";
export type { EstadoMateria, MotivoBloqueo } from "./estado";

export {
  bloquesDelPeriodo,
  cambiosDeSede,
  choques,
  cupoLleno,
  cursoDe,
  DIAS,
  ordenarComisiones,
  paresConCambioDeSede,
  paresQueChocan,
  seOfrece,
} from "./horarios";
export type {
  BloqueUbicado,
  CambioDeSede,
  Choque,
  ComisionEvaluada,
} from "./horarios";

export { electivas, minors, progresoTitulos } from "./progreso";
export type {
  ElectivaContada,
  ProgresoElectivas,
  ProgresoMinor,
  ProgresoTitulo,
} from "./progreso";

export { buscar, docentesPorMateria, normalizar, RELEVANCIA } from "./buscar";

export { parsearHistoria } from "./historia";
export type { HistoriaParseada } from "./historia";
