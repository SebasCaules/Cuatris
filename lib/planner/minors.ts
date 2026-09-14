// Fuente ÚNICA de verdad de los "minors" (áreas de especialización de electivas).
// Deriva de Plan.areas + AREA_COLOR (model.ts); sigla/etiqueta corta curadas acá.
// La consumen todos los badges de minor (cards, recomendaciones, modal de curso,
// sidebar de progreso) para no reinventar sigla/color en cada vista.
import { PLAN, AREA_COLOR, onPlanChange } from "./model";

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
  /** créditos del área que completan el minor / bloque. */
  req: number;
}

/** créditos electivos por área para completar un minor (Informática; las
 *  demás carreras los fijan por bloque en `Plan.areaReq`). */
export const MINOR_REQ = 14;

/** créditos que exige un área concreta (bloque del plan) o el default del plan. */
export const minorReqOf = (area?: string): number =>
  (area != null ? PLAN.areaReq?.[area] : undefined) ?? PLAN.minorReq ?? MINOR_REQ;

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

/** Sigla automática para áreas sin sigla curada (bloques de electivas del
 *  SGA). Se descartan las palabras genéricas («Bloque», «Electivas», «Área»…);
 *  un número romano se conserva («Bloque II Electivas General» → «II Gen»),
 *  un código de materia también («Electiva 81.30» → «81.30»); si queda una
 *  sola palabra van sus tres primeras letras, si varias, sus iniciales. */
const GENERIC = /^(bloque|electivas?|[aá]rea|materias?|de|la|el|y|en|del|los|las)$/i;
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
function autoInitials(a: string): string {
  const words = a.split(/[\s\-:()]+/).filter(Boolean);
  const code = words.find((w) => /^\d+\.\d+$/.test(w));
  if (code) return code;
  const roman = words.find((w) => ROMAN.test(w))?.toUpperCase();
  const rest = words.filter((w) => !GENERIC.test(w) && !ROMAN.test(w));
  const tail =
    rest.length === 0
      ? ""
      : rest.length === 1
        ? rest[0][0].toUpperCase() + rest[0].slice(1, 3).toLowerCase()
        : rest.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
  const out = [roman, tail].filter(Boolean).join(" ");
  return out || a.slice(0, 3);
}

/** Todos los minors del plan, en el orden de `Plan.areas`. Se rearma al
 *  cambiar de carrera (misma referencia del array). */
export const MINORS: Minor[] = [];
const BY_ID = new Map<string, Minor>();

function rebuild() {
  MINORS.length = 0;
  BY_ID.clear();
  for (const a of PLAN.areas) {
    const m: Minor = {
      id: a,
      name: a,
      short: SHORT[a] ?? a,
      initials: INITIALS[a] ?? autoInitials(a),
      color: AREA_COLOR[a] ?? "var(--text-secondary)",
      req: minorReqOf(a),
    };
    MINORS.push(m);
    BY_ID.set(a, m);
  }
}
rebuild();
onPlanChange(rebuild);

/** Minor por su id de área (o `undefined` si no es un área conocida). */
export const minorOf = (area: string): Minor | undefined => BY_ID.get(area);

/** Minors de una materia: sus áreas mapeadas a `Minor`, en orden, sin desconocidas. */
export const minorsOf = (areas: string[] | undefined): Minor[] =>
  (areas ?? [])
    .map((a) => BY_ID.get(a))
    .filter((m): m is Minor => m !== undefined);
