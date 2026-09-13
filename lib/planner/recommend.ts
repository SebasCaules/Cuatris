// Recomendador de electivas para el plan de cursada.
// Para cada electiva candidata simula el plan con esa materia agregada y reporta
// dónde quedaría (cuatrimestre), si alarga el plan, y cuántos días de campus suma.
// Permite armar un preview de "dónde caería" antes de agregarla.
import { optimizePlan } from "./optimize";
import { byId, isElectiva, hasHorario, DAYS } from "./model";
import { isAsync } from "./time";
import type { MateriaM, PlacedMateria, PlanState } from "./types";

export interface Recommendation {
  m: MateriaM;
  landingIdx: number; // índice de cuatrimestre donde caería (-1 si no se ubica)
  addsCuatri: boolean; // ¿alarga el plan en un cuatrimestre?
  newDays: number; // días de campus que suma a ese cuatrimestre
  conflict: boolean; // no se pudo ubicar (correlativas / créditos / superposición)
  noHorario: boolean; // sin horario publicado → no se puede armar la cursada
  area: string | null;
}

const usedCount = (items: PlacedMateria[][]) =>
  items.filter((it) => it.length).length;

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
  const base = optimizePlan(PL, approved, fixedCom);
  const baseUsed = usedCount(base.items);

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
    const hyp = optimizePlan({ ...PL, pool: hypPool }, approved, fixedCom);
    let landingIdx = -1;
    hyp.items.forEach((it, i) => {
      if (it.some((x) => x.m.codigo === m.codigo)) landingIdx = i;
    });
    const conflict = landingIdx < 0; // quedó sin ubicar
    const addsCuatri = usedCount(hyp.items) > baseUsed;

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
