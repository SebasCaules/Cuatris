// Recomendador de electivas para el plan de cursada.
// Para cada electiva candidata simula el plan con esa materia agregada y reporta
// dónde quedaría (cuatrimestre), si alarga el plan, y cuántos días de campus suma.
// Permite armar un preview de "dónde caería" antes de agregarla.
import { optimizePlan } from "./optimize";
import { byId, isElectiva, hasHorario, DAYS } from "./model";
import { isAsync } from "./time";
import type { MateriaM, PlacedMateria, PlanState } from "./types";

/** Electivas sugeridas para cubrir los créditos que faltan para el título. */
export interface FillSuggestion {
  /** las elegidas, con el cuatrimestre (índice) donde caen todas juntas. */
  picks: { m: MateriaM; idx: number }[];
  /** créditos que suman. */
  cred: number;
  /** último cuatrimestre usado por el plan con ellas. */
  last: number;
}

export interface Recommendation {
  m: MateriaM;
  landingIdx: number; // índice de cuatrimestre donde caería (-1 si no se ubica)
  addsCuatri: boolean; // ¿corre la fecha de egreso (último cuatrimestre usado)?
  newDays: number; // días de campus que suma a ese cuatrimestre
  conflict: boolean; // no se pudo ubicar (correlativas / créditos / superposición)
  noHorario: boolean; // sin horario publicado → no se puede armar la cursada
  area: string | null;
}

// «Alargar la carrera» es recibirse más tarde: lo que cuenta es el ÚLTIMO
// cuatrimestre usado, no cuántos tienen materias. Una electiva que cae en un
// hueco del plan (un cuatrimestre vacío entre dos con materias, por paridad)
// no mueve la fecha de egreso; contarla como «un cuatrimestre más» la marcaba
// como si alargara.
const lastUsed = (items: PlacedMateria[][]) => {
  let last = -1;
  items.forEach((it, i) => {
    if (it.length) last = i;
  });
  return last;
};

const campusDays = (placed: PlacedMateria[]): Set<string> => {
  const d = new Set<string>();
  for (const x of placed)
    if (x.com)
      for (const s of x.com.slots)
        if (!isAsync(s) && DAYS.includes(s.dia)) d.add(s.dia);
  return d;
};

export function recommendElectives(
  PL: PlanState,
  approved: Set<string>,
  limit = 6,
  fixedCom?: Map<string, string>,
): Recommendation[] {
  // modo quick: ~90 simulaciones con el mismo esqueleto (memoizado); la
  // colocación mezclada corre sin reinicios.
  const base = optimizePlan(PL, approved, fixedCom, { quick: true });
  const baseLast = lastUsed(base.items);

  // áreas ya cubiertas (electivas aprobadas o ya en el plan) → para diversificar
  const coveredAreas = new Set<string>();
  const addAreas = (code: string) =>
    byId.get(code)?.areas?.forEach((a) => coveredAreas.add(a));
  approved.forEach((c) => isElectiva(c) && addAreas(c));
  PL.pool.forEach((c) => isElectiva(c) && addAreas(c));

  const candidates = [...byId.values()].filter(
    (m) =>
      m.tipo === "electiva" &&
      (m.creditos || 0) > 0 && // 0 créditos no ayudan a llegar a la meta electiva
      !approved.has(m.codigo) &&
      !PL.pool.has(m.codigo),
  );

  const recs: Recommendation[] = candidates.map((m) => {
    const hypPool = new Set(PL.pool);
    hypPool.add(m.codigo);
    const hyp = optimizePlan({ ...PL, pool: hypPool }, approved, fixedCom, { quick: true });
    let landingIdx = -1;
    hyp.items.forEach((it, i) => {
      if (it.some((x) => x.m.codigo === m.codigo)) landingIdx = i;
    });
    const conflict = landingIdx < 0; // quedó sin ubicar
    const addsCuatri = lastUsed(hyp.items) > baseLast;

    let newDays = 0;
    if (landingIdx >= 0) {
      const landing = hyp.items[landingIdx];
      const cand = landing.find((x) => x.m.codigo === m.codigo);
      const others = landing.filter((x) => x !== cand);
      const used = campusDays(others);
      if (cand) campusDays([cand]).forEach((d) => !used.has(d) && newDays++);
    }
    return {
      m,
      landingIdx,
      addsCuatri,
      newDays,
      conflict,
      noHorario: !hasHorario(m.codigo),
      area: m.areas?.[0] ?? null,
    };
  });

  // ranking: ubicable › no alarga el plan › con horario disponible › más
  // créditos (valor hacia la meta) › menos días nuevos › área nueva › código.
  // `noHorario` va antes que créditos/días: dentro de cada grupo, las electivas
  // sin horario caen al fondo (mínima prioridad).
  const rank = (r: Recommendation): (number | string)[] => [
    r.conflict ? 1 : 0,
    r.addsCuatri ? 1 : 0,
    r.noHorario ? 1 : 0,
    -(r.m.creditos || 0),
    r.newDays,
    r.area && !coveredAreas.has(r.area) ? 0 : 1,
    r.m.codigo,
  ];
  recs.sort((a, b) => {
    const ra = rank(a),
      rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });

  return recs.slice(0, limit);
}

/**
 * Sugerencia para cubrir `faltan` créditos de electivas. Dos órdenes de
 * elección —el de las recomendaciones (ubicables › no alargan el plan › con
 * horario › más créditos › menos días nuevos › área nueva) y el mismo con
 * los créditos primero (menos materias: cuando lo que aprieta es el tope de
 * materias, tres de 6 cr entran donde seis de 3 no)— y de cada uno se toman
 * electivas hasta juntar los créditos; se simula el plan con todas juntas y,
 * si alguna queda sin ubicar (de a una entraban, todas juntas no), se
 * descarta y se completa con las siguientes. Gana el orden que termina antes
 * y, a igual egreso, el de menos materias. `null` si no hay electivas
 * ubicables que alcancen.
 */
export function suggestFill(
  PL: PlanState,
  approved: Set<string>,
  recs: Recommendation[],
  faltan: number,
  fixedCom?: Map<string, string>,
): FillSuggestion | null {
  if (faltan <= 0) return null;
  const usable = recs.filter((r) => !r.conflict && !PL.pool.has(r.m.codigo));
  const porCreditos = [...usable].sort(
    (a, b) =>
      Number(a.noHorario) - Number(b.noHorario) ||
      (b.m.creditos || 0) - (a.m.creditos || 0) ||
      usable.indexOf(a) - usable.indexOf(b),
  );
  let best: FillSuggestion | null = null;
  for (const orden of [usable, porCreditos]) {
    const rejected = new Set<string>();
    for (let pass = 0; pass < 4; pass++) {
      const picks: MateriaM[] = [];
      let cred = 0;
      for (const r of orden) {
        if (cred >= faltan) break;
        if (rejected.has(r.m.codigo)) continue;
        picks.push(r.m);
        cred += r.m.creditos || 0;
      }
      if (cred < faltan) break;
      const pool = new Set(PL.pool);
      for (const m of picks) pool.add(m.codigo);
      const R = optimizePlan({ ...PL, pool }, approved, fixedCom);
      const unplaced = new Set(R.unplaced.map((m) => m.codigo));
      const bad = picks.filter((m) => unplaced.has(m.codigo));
      if (bad.length) {
        for (const m of bad) rejected.add(m.codigo);
        continue;
      }
      const idxOf = new Map<string, number>();
      R.items.forEach((it, i) => it.forEach((x) => idxOf.set(x.m.codigo, i)));
      const cand: FillSuggestion = {
        picks: picks.map((m) => ({ m, idx: idxOf.get(m.codigo) ?? -1 })),
        cred,
        last: lastUsed(R.items),
      };
      if (!best || cand.last < best.last || (cand.last === best.last && cand.picks.length < best.picks.length))
        best = cand;
      break;
    }
  }
  return best;
}
