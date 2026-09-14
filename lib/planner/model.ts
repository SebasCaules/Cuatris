// Modelo del planner: PLAN tipado + map byId (materia → con horario).
// Arranca con la carrera por defecto (data.json, en el bundle) y se construye
// al importar (sin DOM). Cambiar de carrera (`loadPlan`) REEMPLAZA el contenido
// de PLAN/byId en su lugar —mismas referencias, mismos imports en toda la app—
// y avisa a los módulos que derivan tablas de PLAN (minors, colores) para que
// se rearmen; la app remonta su árbol con `key` para recalcular todo lo demás.
import rawData from "./data.json";
import type { Materia, MateriaM, Plan } from "./types";

export const PLAN = { ...(rawData as unknown as Plan) } as Plan;

export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
export const DAYS6 = [...DAYS, "Sábado"];

// Colores curados de los minors de Informática; las áreas de otras carreras
// (bloques de electivas del plan) toman uno de AREA_PALETTE al cargar el plan.
const AREA_COLOR_CURADO: Record<string, string> = {
  "Ciencia de Datos": "#85a2c2",
  "Imágenes y Realidad Virtual": "#c592ab",
  "Inteligencia Artificial": "#a9b27e",
  "Arquitectura de Software": "#a497c0",
};
const AREA_PALETTE = [
  "#85a2c2", "#c592ab", "#a9b27e", "#a497c0", "#c9a97a", "#7fb8b0",
  "#b89c8a", "#9aa7c9", "#c28c8c", "#8fb08f", "#b3a0c9", "#a3b7a0",
];
export const AREA_COLOR: Record<string, string> = {};

// Paleta para colorear materias en las grillas (combinador / plan): doce pasteles
// de hue nítido, uno cada 30° de la rueda. NO van en orden de rueda — el orden
// salta de a 150°, así dos materias consecutivas nunca caen en hues vecinos (con
// 4-6 materias por cuatrimestre, que es lo normal, todas quedan bien separadas).
// El coral entra recién en la 9.ª para no competir con el marcado de conflicto.
export const PALETTE = [
  "#7fb0e0", "#f0a878", "#6fc7bd", "#f09ab8", "#8fd08f", "#b8a5e8",
  "#f0cf7a", "#7fc3e8", "#f0958f", "#6fd0a8", "#d99ad9", "#c0d489",
];

// Map codigo → materia con su horario resuelto (espejo de buildModel()).
export const byId: Map<string, MateriaM> = new Map();

// Obligatorias que NO entran al optimizador de cuatrimestres (Informática:
// 72.45 Proyecto Final es anual y 72.98 Práctica Laboral es un régimen especial
// de 0 cr, sin cursada). Se marcan en «Mis materias» como cualquier otra, pero
// el plan no las ubica en un cuatrimestre. Las fija cada plan (`noPlanificables`).
export const NO_PLANIFICABLES: Set<string> = new Set();
/** Requisitos sin cursada (Inglés I/II): no planificables; el plan los señala
 *  como «tener aprobado» en el cuatrimestre nominal que les corresponde. */
export const REQUISITOS: Set<string> = new Set();
/** Materias anuales (dos cuatrimestres consecutivos, créditos en mitades). */
export const ANUALES: Set<string> = new Set();

const listeners = new Set<() => void>();
/** Registra un callback que corre cada vez que se carga otro plan (para
 *  módulos con tablas derivadas de PLAN). Devuelve el des-registro. */
export function onPlanChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function rebuild() {
  byId.clear();
  for (const m of [...PLAN.obligatorias, ...PLAN.electivas]) {
    byId.set(m.codigo, { ...m, horario: PLAN.horarios[m.codigo] || null });
  }
  NO_PLANIFICABLES.clear();
  for (const c of PLAN.noPlanificables ?? ["72.98"]) NO_PLANIFICABLES.add(c);
  REQUISITOS.clear();
  for (const c of PLAN.requisitos ?? []) {
    REQUISITOS.add(c);
    NO_PLANIFICABLES.add(c);
  }
  ANUALES.clear();
  for (const c of PLAN.anuales ?? ["72.45"]) ANUALES.add(c);
  for (const k of Object.keys(AREA_COLOR)) delete AREA_COLOR[k];
  PLAN.areas.forEach((a, i) => {
    AREA_COLOR[a] = AREA_COLOR_CURADO[a] ?? AREA_PALETTE[i % AREA_PALETTE.length];
  });
}
rebuild();

/** Reemplaza el plan activo por el de otra carrera (in place) y rearma las
 *  tablas derivadas. Quien lo llama remonta la app para que todo se recalcule. */
export function loadPlan(data: Plan): void {
  for (const k of Object.keys(PLAN)) delete (PLAN as unknown as Record<string, unknown>)[k];
  Object.assign(PLAN, data);
  rebuild();
  listeners.forEach((fn) => fn());
}

export const credOf = (c: string) => Number(byId.get(c)?.creditos) || 0;
export const isElectiva = (c: string) => byId.get(c)?.tipo === "electiva";
export const abbrOf = (c: string) => byId.get(c)?.abbr || c;
export const hasHorario = (c: string) => {
  const m = byId.get(c);
  return !!(m && m.horario && m.horario.comisiones.length);
};
export const esPlanificable = (c: string) => !NO_PLANIFICABLES.has(c);
export const esRequisito = (c: string) => REQUISITOS.has(c);
export const esAnual = (c: string) => ANUALES.has(c);

/** Carga del cuatrimestre más cargado de la grilla nominal del plan (créditos
 *  y cantidad de obligatorias planificables): es el tope por default del
 *  optimizador. Con menos, el plan no puede reproducir ni el cuatrimestre
 *  nominal (Informática pide 27 cr en el 2.º cuatrimestre de 1.º año) y
 *  desparrama materias. Sin grilla nominal (planes sin año/cuatrimestre),
 *  24 cr y 5 materias. */
export function topeNominal(): { cred: number; mat: number } {
  const acc = new Map<string, { cred: number; mat: number }>();
  for (const m of PLAN.obligatorias) {
    if (m.anio == null || m.cuatri == null || !esPlanificable(m.codigo)) continue;
    const k = `${m.anio}/${m.cuatri}`;
    const a = acc.get(k) ?? { cred: 0, mat: 0 };
    a.cred += m.creditos || 0;
    a.mat += 1;
    acc.set(k, a);
  }
  let cred = 0;
  let mat = 0;
  for (const a of acc.values()) {
    cred = Math.max(cred, a.cred);
    mat = Math.max(mat, a.mat);
  }
  return {
    cred: cred ? Math.min(40, Math.max(3, cred)) : 24,
    mat: mat ? Math.min(9, Math.max(1, mat)) : 5,
  };
}

export const remainingOblig = (approved: Set<string>) =>
  PLAN.obligatorias
    .filter((m) => !approved.has(m.codigo) && esPlanificable(m.codigo))
    .map((m) => m.codigo);

// prioridad de cursada: obligatorias › mayor requisito de créditos › más créditos › código
export const planPriority = (a: Materia, b: Materia) =>
  (a.tipo === b.tipo ? 0 : a.tipo === "obligatoria" ? -1 : 1) ||
  (b.creditosReq || 0) - (a.creditosReq || 0) ||
  (b.creditos || 0) - (a.creditos || 0) ||
  a.codigo.localeCompare(b.codigo);

// empaquetado (FFD por créditos) para minimizar cuatrimestres
export const packSort = (a: Materia, b: Materia) =>
  (b.creditos || 0) - (a.creditos || 0) ||
  (a.tipo === b.tipo ? 0 : a.tipo === "obligatoria" ? -1 : 1) ||
  (b.creditosReq || 0) - (a.creditosReq || 0) ||
  a.codigo.localeCompare(b.codigo);
