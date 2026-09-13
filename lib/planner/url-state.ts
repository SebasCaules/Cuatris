// Puente entre el estado de vista/navegación del planner y la URL (?view=…).
// Dos funciones puras y testeables (sin `window`, sin hooks):
//   - decodePlannerUrl: lee y VALIDA las 8 claves del planner desde los query
//     params. Clave ausente/valor inválido → campo `undefined` en el output,
//     así el merge en el reducer nunca pisa el estado con basura.
//   - encodePlannerUrl: escribe SOLO esas 8 claves (read-modify-write) y borra
//     las que están en su valor default, para una URL corta y estable.
// Contrato completo (taxonomía de claves, reglas): site/lib/url-state/README.md
// → tabla "Detalle planner".
import { csv, flag, setOrDelete } from "@/lib/url-state/core";
import { byId, PLAN } from "./model";
import { FICHAS } from "./fichas";
import type { PlannerState, ViewKey } from "./types";

const VIEW_KEYS: readonly ViewKey[] = [
  "cuatri",
  "elect",
  "combo",
  "plan",
  "grafo",
  "finales",
  "ref",
];
const VIEWS = new Set<string>(VIEW_KEYS);
const ALL_AREAS = new Set(PLAN.areas);

/** Slices de vista/navegación decodificadas de la URL. Cada campo queda
 *  `undefined` cuando su clave no está presente o el valor no valida — el
 *  merge en el reducer (`HYDRATE_URL`) solo pisa los campos definidos. */
export interface PlannerUrlState {
  view?: ViewKey;
  search?: string;
  areasOn?: string[];
  fDisp?: boolean;
  fHor?: boolean;
  combo?: string[];
  drawerCode?: string;
  fichaCode?: string;
}

/** Lee y valida las 8 claves del planner desde los query params. */
export function decodePlannerUrl(p: URLSearchParams): PlannerUrlState {
  const out: PlannerUrlState = {};

  const view = p.get("view");
  if (view && VIEWS.has(view)) out.view = view as ViewKey;

  // mismo normalizado que SET_SEARCH (Sidebar): trim + lowercase.
  const pq = p.get("pq");
  if (pq != null) out.search = pq.trim().toLowerCase();

  const areasRaw = p.get("areas");
  if (areasRaw != null) {
    const valid = [...csv.decode(areasRaw)].filter((a) => ALL_AREAS.has(a));
    if (valid.length) out.areasOn = valid;
  }

  if (p.has("disp")) out.fDisp = flag.decode(p.get("disp"));
  if (p.has("hor")) out.fHor = flag.decode(p.get("hor"));

  const comboRaw = p.get("combo");
  if (comboRaw != null) {
    const valid = [...csv.decode(comboRaw)].filter((c) => byId.has(c));
    if (valid.length) out.combo = valid;
  }

  // drawer: cualquier materia real (obligatoria o electiva).
  const drawer = p.get("drawer");
  if (drawer && byId.has(drawer)) out.drawerCode = drawer;

  // ficha: solo electivas con programa analítico disponible (si no, el link
  // compartido abriría el lector en el estado "no disponible").
  const ficha = p.get("ficha");
  if (ficha && FICHAS[ficha]) out.fichaCode = ficha;

  return out;
}

/**
 * Escribe las 8 claves del planner en `p` (read-modify-write: no toca otras
 * claves que pueda tener la ruta, p. ej. `q` de la búsqueda global). Borra
 * las que están en su valor default para mantener la URL corta y estable.
 */
export function encodePlannerUrl(
  state: PlannerState,
  p: URLSearchParams,
): void {
  setOrDelete(p, "view", state.view, state.view !== "cuatri");
  setOrDelete(p, "pq", state.search, state.search !== "");

  const allAreasOn =
    state.areasOn.size === ALL_AREAS.size &&
    [...state.areasOn].every((a) => ALL_AREAS.has(a));
  setOrDelete(p, "areas", csv.encode(state.areasOn), !allAreasOn);

  setOrDelete(p, "disp", "1", state.fDisp);
  setOrDelete(p, "hor", "1", state.fHor);

  setOrDelete(p, "combo", csv.encode(state.combo), state.combo.size > 0);

  setOrDelete(p, "drawer", state.drawerCode ?? "", state.drawerCode != null);
  setOrDelete(p, "ficha", state.fichaCode ?? "", state.fichaCode != null);
}
