// Tipos del planner de Electivas. Reflejan la forma de Electivas/data.js
// (window.PLAN), convertida a lib/planner/data.json por build-planner-data.mjs.

export interface Slot {
  dia: string; // "Lunes" … "Sábado"
  desde: string; // "HH:MM"
  hasta: string; // "HH:MM"
  aula?: string;
  sala?: string;
  sede?: string;
  modalidad?: string; // "Presencial" | "Virtual" | "Blended" | …
  async?: boolean;
}

export interface Comision {
  comision: string;
  slots: Slot[];
  profesores?: string;
  cupo?: string;
}

export interface Horario {
  periodo?: string;
  anio?: string;
  comienzo?: string;
  fin?: string;
  depto?: string;
  comisiones: Comision[];
  /** códigos con los que el SGA dicta este curso en conjunto (misma aula y
   *  horario bajo otro código, típicamente el de otra carrera). */
  conjunto?: string[];
}

export type Tipo = "obligatoria" | "electiva";

export interface Materia {
  codigo: string;
  nombre: string;
  abbr: string;
  creditos: number;
  creditosReq: number;
  correlativas: string[];
  ciclo?: string;
  seccion?: string;
  anio?: number;
  cuatri?: number;
  parity: number | null; // 1 = 1.º cuat, 2 = 2.º cuat, null = sin restricción
  tipo: Tipo;
  areas?: string[]; // solo electivas
}

/** Materia con su horario resuelto (lo que vive en el map byId). */
export type MateriaM = Materia & { horario: Horario | null };

// ---- ficha (programa analítico) de una electiva ----
// Extraída del PDF oficial del ITBA ("Programas Analíticos - GRADO") por
// scripts/build-fichas-data.mjs → lib/planner/fichas.ts. Indexada por código.

/** Una unidad del temario (fila de la tabla "Contenidos" del programa). */
export interface FichaUnidad {
  titulo: string;
  descripcion: string;
}

/** Desglose de carga horaria del programa analítico. */
export interface FichaCargaHoraria {
  total: number | null; // horas totales del cuatrimestre
  teoricas: number | null;
  practicas: number | null;
  laboratorio: number | null;
  semanales: number | null; // horas semanales
  presencial: number | null;
  distancia: number | null;
}

/** Programa analítico oficial de una electiva (el "ficha" del PDF del ITBA). */
export interface Ficha {
  codigo: string;
  materia: string;
  creditos: number | null;
  departamento: string;
  anio: string; // año del programa, p. ej. "2023"
  carrera: string; // carreras a las que aplica
  actualizado: string; // fecha de última actualización del programa
  cargaHoraria: FichaCargaHoraria;
  contenidosMinimos: string;
  presentacion: string;
  objetivos: string;
  programa: FichaUnidad[]; // temario (tabla "Contenidos")
  estrategias: string;
  evaluacion: string;
  bibliografiaObligatoria: string[];
  bibliografiaComplementaria: string[];
  pdf: string; // ruta pública SIN basePath (envolver con withBase), p. ej. "/electivas-fichas/10.07.pdf"
}

/** Características derivadas del programa analítico (heurística determinista sobre
 *  el texto de `evaluacion`). Convención: se marca un valor SOLO si la señal aparece
 *  explícita en el texto; `null` cuando no se detecta (nunca se infiere un dato ausente).
 *  El texto crudo de `evaluacion` siempre se muestra para que el usuario verifique.
 *  Se computa en runtime desde la `Ficha` (lib/planner/programa.ts) — no se persiste
 *  en fichas.ts, así se re-deriva sin re-parsear los PDFs. */
export interface FichaDerivado {
  tieneParcial: boolean; // aparece "parcial(es)"
  /** rinde examen final. Además del texto, `charsOf` fuerza `true` si la materia
   *  tiene mesa en la planilla oficial de finales (finalesFlags.ts). */
  tieneFinal: boolean;
  tieneTP: boolean; // aparece "trabajo práctico" / "TP"
  /** promociona (cierra la materia) SIN examen final. No confundir con final
   *  reducido: si hay mesa oficial, `charsOf` fuerza `false` aunque la ficha
   *  hable de promoción. true si hay "promoc"; false si hay final; null dudoso. */
  promocionable: boolean | null;
  /** asistencia/presentismo obligatorio detectado en "Requisitos de aprobación". */
  asistenciaObligatoria: boolean | null;
  /** porcentaje mínimo de asistencia si el texto lo explicita (ej. 75). */
  asistenciaPct: number | null;
}

export interface Edge {
  from: string;
  to: string;
}

export interface Plan {
  /** carrera a la que pertenece el plan (código del SGA: "S", "I", "K"…). */
  carrera?: { codigo: string; nombre: string };
  /** id del plan de estudios en el SGA ("S10-Rev23", "I22"…). */
  planId?: string;
  /** período de los horarios cargados, legible ("2.º cuatrimestre 2026"). */
  periodoLabel?: string;
  /** áreas de electivas: minors (Informática) o bloques de electivas del plan
   *  (las demás carreras, cuando el plan tiene más de un bloque). */
  areas: string[];
  /** créditos que exige cada área (bloque del plan); si falta, `minorReq`. */
  areaReq?: Record<string, number>;
  /** créditos para completar un minor cuando el área no fija los suyos. */
  minorReq?: number;
  obligatorias: Materia[];
  electivas: Materia[];
  horarios: Record<string, Horario>;
  edges: Edge[];
  aprobadasDefault: string[];
  creditosElectivasReq?: number;
  tituloAnalista?: unknown;
  /** título principal de la carrera y sus créditos. */
  tituloFinal?: { nombre: string; creditos: number | null } | null;
  /** obligatorias que el optimizador no ubica en un cuatrimestre (práctica
   *  laboral, regímenes sin cursada): se marcan pero no se planifican. */
  noPlanificables?: string[];
  /** Requisitos sin cursada (Inglés I/II): están en `noPlanificables` y el
   *  plan los muestra como «tener aprobado» en el cuatrimestre que les toca
   *  en vez de ubicarlos como una materia más. */
  requisitos?: string[];
  /** materias ANUALES: se cursan en dos cuatrimestres consecutivos y sus
   *  créditos se reparten en mitades (Proyecto Final: 12 cr = 6 + 6). El
   *  optimizador las ubica como dos mitades seguidas. */
  anuales?: string[];
  generado?: string;
}

// ---- estado del planner (espejo del `state` de planner.js) ----

export type ViewKey =
  | "cuatri"
  | "elect"
  | "combo"
  | "plan"
  | "grafo"
  | "finales"
  | "ref";

// ---- Plan de finales / Combinación de finales (feature nueva) ----

/** Llamado a mesas de finales del año. */
export type FinalPeriodo = "julio" | "diciembre" | "febrero";

/** Llamado (fecha) dentro de un período: cada período publica 1.ª y 2.ª mesa. */
export type FinalLlamado = "primer" | "segundo";

/** Fecha + hora de una mesa de final (autopoblado oficial u override manual). */
export interface MesaFinal {
  fecha: string; // "YYYY-MM-DD"
  hora: string; // "HH:MM"
}

/** Dónde decidió rendir un final el usuario: período (Julio/Dic/Feb, con su año
 *  lectivo implícito en `FinalesState.anio`) + llamado (1.ª o 2.ª fecha).
 *  Limitación conocida (heredada del diseño previo): NO lleva año — cambiar el
 *  año del selector re-interpreta las asignaciones en ese año (se planifica un
 *  ciclo lectivo por vez). */
export interface FinalAsignacion {
  periodo: FinalPeriodo;
  llamado: FinalLlamado;
}

/** Estado del combinador de finales (persistible). El armado efímero de la
 *  combinación sugerida / detección de conflictos vive local en la vista. */
export interface FinalesState {
  periodo: FinalPeriodo;
  anio: number;
  /** override/carga manual de fecha+hora de mesa por materia (clave: código). */
  mesas: Map<string, MesaFinal>;
  /** asignación por materia: en qué período+llamado rinde cada final. Una
   *  materia asignada a Diciembre no aparece elegida en la pestaña de Febrero:
   *  así se planifican varios períodos juntos sin duplicar finales.
   *  (Antes: Set<string> de códigos del período visible — migrado en persist.) */
  seleccion: Map<string, FinalAsignacion>;
  /** anticipación del recordatorio de inscripción para el .ics (hs): 48 | 72 | 96. */
  reminderHs: number;
  /** margen mínimo de repaso deseado entre finales (días). */
  margenDias: number;
}

/** Estrategia de optimización del plan de cursada (elegible por el usuario).
 *  - "cuatris": minimizar la cantidad de cuatrimestres (recibirse antes).
 *  - "dias":    minimizar los días distintos en el campus (menos viajes).
 *  - "balance": repartir la carga (créditos/materias) pareja entre cuatrimestres. */
export type OptMethod = "cuatris" | "dias" | "balance";

export interface ComboParams {
  allowOverlap: boolean;
  modal: { Presencial: boolean; Virtual: boolean; Blended: boolean };
}

export interface PlanStart {
  parity: number;
  year: number;
}

/** Una materia ubicada en un cuatrimestre del plan, con su comisión elegida.
 *  Una materia anual ocupa dos entradas en cuatrimestres consecutivos
 *  (`parte` 1 y 2), cada una con la mitad de los créditos en `m.creditos`. */
export interface PlacedMateria {
  m: MateriaM;
  com: Comision | null;
  parte?: 1 | 2;
}

/** Por qué una materia del pool quedó sin ubicar.
 *  - "correlativa": le falta una correlativa que no está aprobada ni en el
 *    pool (`codes`), o que está en el pool pero tampoco entra (cascada).
 *  - "creditos": pide más créditos (`req`) de los que el plan puede juntar con
 *    lo aprobado más todo el pool (`max`): hacen falta más materias (electivas).
 *  - "sinLugar": entra en teoría, pero no hubo cuatrimestre donde ponerla
 *    (superposiciones con `avoid`, topes por cuatrimestre, horizonte). */
export type UnplacedReason =
  | { kind: "correlativa"; codes: string[] }
  | { kind: "creditos"; req: number; max: number }
  | { kind: "sinLugar" };

export interface PlanResult {
  items: PlacedMateria[][]; // por índice de cuatrimestre
  unplaced: MateriaM[];
  accBefore: number[];
  moved: number;
  /** cota inferior del último cuatrimestre usado (correlativas, paridad,
   *  créditos requeridos y topes): si el plan termina ahí, no se puede antes. */
  minLast?: number;
  /** motivo por materia sin ubicar (código → motivo). */
  unplacedWhy?: Map<string, UnplacedReason>;
}

export interface PlanState {
  pool: Set<string>;
  fixed: Map<string, number>;
  start: PlanStart;
  maxCred: number;
  maxMat: number;
  avoid: boolean;
  /** estrategia de optimización elegida (default "cuatris"). */
  method: OptMethod;
  /** override opcional de máx. créditos por índice de cuatrimestre; si no hay
   *  entrada para un índice, se usa el global `maxCred`. */
  capCredByIdx: Map<number, number>;
  /** override opcional de máx. materias por índice de cuatrimestre; si no hay
   *  entrada para un índice, se usa el global `maxMat`. */
  capMatByIdx: Map<number, number>;
  /** cuatrimestres "finalizados" por el usuario: el optimizador no los toca
   *  (no mete materias nuevas ahí ni mueve las existentes hacia/desde ese
   *  índice). Las materias de un índice lockeado se pinean vía `fixed`. */
  lockedIdx: Set<number>;
  /** registro de qué pines agregó cada lock (índice → códigos pineados POR el
   *  lock, sin los manuales previos): al des-lockear se liberan SOLO esos.
   *  Sin registro para un índice (estado viejo) el unlock no borra nada. */
  lockPins: Map<number, string[]>;
}

export interface PlannerState {
  view: ViewKey;
  /** cursada aprobada (regular o final) — semántica histórica intacta: todo el
   *  planner de cursada/correlativas la sigue leyendo como "materia aprobada". */
  approved: Set<string>;
  /** subconjunto de `approved` cuyo FINAL también está aprobado (doble-check).
   *  Invariante: `finalDone ⊆ approved`. La vista de finales lo usa para el 2º
   *  nivel; las materias que promocionan/no rinden final nunca entran acá. */
  finalDone: Set<string>;
  /** materias que se están cursando ahora (marcador de progreso; disjunto de
   *  `approved`: al aprobar sale de acá). No cuenta como aprobada en nada. */
  cursando: Set<string>;
  combo: Set<string>;
  /** modo "ignorar el progreso" del combinador: arma horarios ofreciendo también
   *  las materias ya aprobadas y se desacopla del plan (no guarda al plan). Se
   *  persiste en localStorage (conserva la preferencia entre recargas). */
  comboSolo: boolean;
  fixedCom: Map<string, string>;
  areasOn: Set<string>;
  search: string;
  fDisp: boolean;
  fHor: boolean;
  comboParams: ComboParams;
  combos: PlacedMateria[][];
  comboIdx: number;
  plan: PlanState;
  sideCollapsed: boolean;
  drawerCode: string | null;
  fichaCode: string | null; // electiva abierta en el lector full-screen (efímero, sin persistir)
  /** estado del combinador de finales (período, mesas, selección). */
  finales: FinalesState;
  /** banner de primer uso ("marcá tus aprobadas") cerrado por el usuario —
   *  persistido para no volver a mostrarlo. */
  introDismissed: boolean;
  hydrated: boolean;
}

/** Bloque renderizable en la grilla semanal. */
export interface WeekBlock {
  dia: string;
  desde: string;
  hasta: string;
  abbr: string;
  nombre?: string;
  codigo?: string; // código de la materia → permite click al drawer desde el calendario
  sala?: string;
  sede?: string;
  modalidad?: string;
  color: string;
  conf?: boolean;
  /** bloque fantasma de una vista previa (hover): se dibuja punteado, sin interacción */
  preview?: boolean;
  /** la materia se está arrastrando: el bloque origen se atenúa */
  dragging?: boolean;
}
