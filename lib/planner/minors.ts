// Fuente ÚNICA de verdad de los "minors" (áreas de especialización de electivas).
// Deriva de Plan.areas + AREA_COLOR (model.ts); sigla/etiqueta corta curadas acá.
// La consumen todos los badges de minor (cards, recomendaciones, modal de curso,
// sidebar de progreso) para no reinventar sigla/color en cada vista.
import { PLAN, AREA_COLOR } from "./model";

export interface Minor {
  /** id canónico = el string de área tal como aparece en `Plan.areas` / `Materia.areas`. */
  id: string;
  /** nombre completo del minor. */
  name: string;
  /** etiqueta corta para encabezados de columna (p. ej. "Datos", "Arq. SW"). */
  short: string;
  /** sigla compacta para el badge (CD / IRV / IA / ARQ). */
  initials: string;
  /** color de identidad del minor (hex; = `AREA_COLOR`). */
  color: string;
}

/** créditos electivos por área para completar un minor. */
export const MINOR_REQ = 14;

const SHORT: Record<string, string> = {
  "Ciencia de Datos": "Datos",
  "Imágenes y Realidad Virtual": "Imág./RV",
  "Inteligencia Artificial": "IA",
  "Arquitectura de Software": "Arq. SW",
};

const INITIALS: Record<string, string> = {
  "Ciencia de Datos": "CD",
  "Imágenes y Realidad Virtual": "IRV",
  "Inteligencia Artificial": "IA",
  "Arquitectura de Software": "ARQ",
};

/** Todos los minors del plan, en el orden de `Plan.areas`. */
export const MINORS: Minor[] = PLAN.areas.map((a) => ({
  id: a,
  name: a,
  short: SHORT[a] ?? a,
  initials: INITIALS[a] ?? a.slice(0, 3).toUpperCase(),
  color: AREA_COLOR[a] ?? "var(--text-secondary)",
}));

const BY_ID = new Map<string, Minor>(MINORS.map((m) => [m.id, m]));

/** Minor por su id de área (o `undefined` si no es un área conocida). */
export const minorOf = (area: string): Minor | undefined => BY_ID.get(area);

/** Minors de una materia: sus áreas mapeadas a `Minor`, en orden, sin desconocidas. */
export const minorsOf = (areas: string[] | undefined): Minor[] =>
  (areas ?? [])
    .map((a) => BY_ID.get(a))
    .filter((m): m is Minor => m !== undefined);
