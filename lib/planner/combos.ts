// Combinador de horarios. PORTADO VERBATIM de planner.js (generateCombos):
// solo se cambió el acceso a `state.*` por parámetros explícitos.
import { byId, hasHorario } from "./model";
import { comConflict, comModalidad } from "./time";
import type { ComboParams, Comision, Materia, MateriaM, PlacedMateria } from "./types";

export const CAP = 600;

/** Comisiones candidatas de una materia, filtradas por comisión fija + modalidad. */
export function comisionesFor(
  code: string,
  fixedCom: Map<string, string>,
  comboParams: ComboParams,
): Comision[] {
  const m = byId.get(code);
  if (!m || !m.horario) return [];
  let coms = m.horario.comisiones;
  const fx = fixedCom.get(code);
  if (fx) {
    const f = coms.filter((c) => c.comision === fx);
    if (f.length) coms = f;
  }
  const mod = comboParams.modal;
  const filt = coms.filter((c) => {
    const cm = comModalidad(c);
    return cm === "Asincrónico" || mod[cm as keyof typeof mod] !== false;
  });
  return filt.length ? filt : coms;
}

export interface CombosResult {
  mats: { codigo: string; m: MateriaM; coms: Comision[] }[];
  combos: PlacedMateria[][];
  truncated: boolean;
  conflictPairs: [Materia, Materia][];
}

export function generateCombos(
  combo: Set<string>,
  fixedCom: Map<string, string>,
  comboParams: ComboParams,
): CombosResult {
  const sel = [...combo].filter(hasHorario).sort();
  const mats = sel.map((c) => ({
    codigo: c,
    m: byId.get(c)!,
    coms: comisionesFor(c, fixedCom, comboParams),
  }));
  const allow = comboParams.allowOverlap;
  const combos: PlacedMateria[][] = [];
  const chosen: PlacedMateria[] = [];
  let truncated = false;

  (function bt(i: number) {
    if (combos.length >= CAP) {
      truncated = true;
      return;
    }
    if (i === mats.length) {
      combos.push(chosen.slice());
      return;
    }
    for (const com of mats[i].coms) {
      if (!allow) {
        let ok = true;
        for (const p of chosen)
          if (p.com && comConflict(p.com, com)) {
            ok = false;
            break;
          }
        if (!ok) continue;
      }
      chosen.push({ m: mats[i].m, com });
      bt(i + 1);
      chosen.pop();
      if (combos.length >= CAP) {
        truncated = true;
        return;
      }
    }
  })(0);

  // Pares en conflicto irreconciliable (cuando no hay ninguna cursada sin superposición).
  const conflictPairs: [Materia, Materia][] = [];
  if (!combos.length) {
    for (let i = 0; i < mats.length; i++)
      for (let j = i + 1; j < mats.length; j++)
        if (
          mats[i].coms.every((ci) =>
            mats[j].coms.every((cj) => comConflict(ci, cj)),
          )
        )
          conflictPairs.push([mats[i].m, mats[j].m]);
  }

  return { mats, combos, truncated, conflictPairs };
}
