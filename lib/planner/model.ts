// Modelo estático del planner: PLAN tipado + map byId (materia → con horario).
// Derivado de datos estáticos → se construye una vez al importar (sin DOM).
import rawData from "./data.json";
import type { Materia, MateriaM, Plan } from "./types";

export const PLAN = rawData as unknown as Plan;

export const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
export const DAYS6 = [...DAYS, "Sábado"];

export const AREA_COLOR: Record<string, string> = {
  "Ciencia de Datos": "#85a2c2",
  "Imágenes y Realidad Virtual": "#c592ab",
  "Inteligencia Artificial": "#a9b27e",
  "Arquitectura de Software": "#a497c0",
};

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
for (const m of [...PLAN.obligatorias, ...PLAN.electivas]) {
  byId.set(m.codigo, { ...m, horario: PLAN.horarios[m.codigo] || null });
}

export const credOf = (c: string) => Number(byId.get(c)?.creditos) || 0;
export const isElectiva = (c: string) => byId.get(c)?.tipo === "electiva";
export const abbrOf = (c: string) => byId.get(c)?.abbr || c;
export const hasHorario = (c: string) => {
  const m = byId.get(c);
  return !!(m && m.horario && m.horario.comisiones.length);
};
// Obligatorias que NO entran al optimizador de cuatrimestres: 72.45 Proyecto
// Final es anual y 72.98 Práctica Laboral es un régimen especial (0 cr, sin
// cursada). Se marcan en «Mis materias» como cualquier otra, pero el plan no las
// ubica en un cuatrimestre.
export const NO_PLANIFICABLES: ReadonlySet<string> = new Set(["72.45", "72.98"]);
export const esPlanificable = (c: string) => !NO_PLANIFICABLES.has(c);

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
