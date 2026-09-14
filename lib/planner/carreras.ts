// Carreras del planner: registro (generado en ./carreras/index.ts por
// scripts/build-planner-data.mjs), elección de la carrera pedida y carga del
// plan de cada una. No hay carrera por defecto para el usuario (la elige la
// primera vez); DEFAULT_CARRERA es solo la que viaja en el bundle (data.json)
// y la que usa PLAN antes de elegir. Las demás se traen con import() diferido.
import rawDefault from "./data.json";
import { CARRERAS, DEFAULT_CARRERA, LOADERS, type CarreraInfo } from "./carreras/index";
import { loadPlan } from "./model";
import { loadCarreraPref, setPersistCarrera } from "./persist";
import type { Plan } from "./types";

export { CARRERAS, DEFAULT_CARRERA };
export type { CarreraInfo };

/** Query param con la carrera (deep-link compartible: `?carrera=I`). */
export const CARRERA_URL_KEY = "carrera";

export const carreraInfo = (codigo: string): CarreraInfo | undefined =>
  CARRERAS.find((c) => c.codigo === codigo);

/** Nombre sin el tipo de título, para la barra: «Ingeniería Química» →
 *  «Química», «Licenciatura en Gestión de Negocios» → «Gestión de Negocios». */
export const nombreCorto = (nombre: string): string =>
  nombre.replace(/^(ingenier[ií]a( en)?|licenciatura en|lic\.\s?en)\s+/i, "");

export const carreraDisponible = (codigo: string): boolean =>
  carreraInfo(codigo)?.disponible === true && (codigo === DEFAULT_CARRERA || codigo in LOADERS);

/** Carrera que hay que mostrar: la de la URL si es válida, si no la que el
 *  usuario eligió la última vez. `null` si no hay ninguna: el planner no
 *  asume carrera y pide elegirla. Solo cliente. */
export function carreraPedida(params: URLSearchParams): string | null {
  const url = params.get(CARRERA_URL_KEY);
  if (url && carreraDisponible(url)) return url;
  const pref = loadCarreraPref();
  if (pref && carreraDisponible(pref)) return pref;
  return null;
}

const cache = new Map<string, Plan>([[DEFAULT_CARRERA, rawDefault as unknown as Plan]]);

/** Trae el plan de una carrera (cacheado). */
export async function fetchPlan(codigo: string): Promise<Plan> {
  const hit = cache.get(codigo);
  if (hit) return hit;
  const loader = LOADERS[codigo];
  if (!loader) throw new Error(`carrera sin plan: ${codigo}`);
  const mod = await loader();
  cache.set(codigo, mod.default);
  return mod.default;
}

/** Deja el planner apuntando a una carrera: su plan en PLAN/byId y su
 *  persistencia en localStorage. Quien llama remonta el árbol de React. */
export async function activarCarrera(codigo: string): Promise<void> {
  const plan = await fetchPlan(codigo);
  setPersistCarrera(codigo);
  loadPlan(plan);
}
