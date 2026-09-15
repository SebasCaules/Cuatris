// Harness del optimizador del plan de cursada: carga de carreras, estado de
// plan por default, chequeo de invariantes de un PlanResult y cota inferior
// independiente. Lo usa run.ts (npm run check:optimizador).
import { readFileSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "../..");
import { PLAN, byId, loadPlan, remainingOblig, topeNominal, esAnual } from "../../lib/planner/model";
import { optimizePlan, cuatriAt, OPT_METHODS, parityOf } from "../../lib/planner/optimize";
import { approvedCredits } from "../../lib/planner/metrics";
import { comConflict, viajesDe, isAsync } from "../../lib/planner/time";
import type { PlanState, PlanResult, MateriaM, OptMethod } from "../../lib/planner/types";

export function loadCarrera(code: string) {
  if (code !== "S") {
    const json = JSON.parse(readFileSync(path.join(ROOT, "lib/planner/carreras", code + ".json"), "utf8"));
    loadPlan(json);
  } else {
    const json = JSON.parse(readFileSync(path.join(ROOT, "lib/planner/data.json"), "utf8"));
    loadPlan(json);
  }
}

export function mkPL(over: Partial<PlanState> = {}, approved = new Set<string>()): PlanState {
  const tope = topeNominal();
  return {
    pool: new Set(remainingOblig(approved)),
    fixed: new Map(),
    start: { parity: 1, year: 2027 },
    maxCred: tope.cred,
    maxMat: tope.mat,
    avoid: true,
    method: "cuatris",
    capCredByIdx: new Map(),
    capMatByIdx: new Map(),
    lockedIdx: new Set(),
    lockPins: new Map(),
    ...over,
  };
}

const comsOf = (m: MateriaM) => m.horario?.comisiones ?? [];

export interface Check { ok: boolean; errors: string[]; used: number; last: number; unplaced: string[]; loads: number[]; mats: number[]; days: number[]; viajes: number[] }

export function check(PL: PlanState, approved: Set<string>, R: PlanResult, fixedCom?: Map<string, string>): Check {
  const errors: string[] = [];
  const N = R.items.length;
  const idxOf = new Map<string, number[]>();
  R.items.forEach((it, i) => it.forEach((x) => { const a = idxOf.get(x.m.codigo) ?? []; a.push(i); idxOf.set(x.m.codigo, a); }));
  // 1. cobertura
  for (const c of PL.pool) {
    if (approved.has(c)) continue;
    const placed = idxOf.has(c);
    const unpl = R.unplaced.some((m) => m.codigo === c);
    if (placed && unpl) errors.push(`${c} ubicada Y en unplaced`);
    if (!placed && !unpl) errors.push(`${c} ni ubicada ni en unplaced`);
    if (placed) {
      const ids = idxOf.get(c)!;
      if (esAnual(c)) { if (ids.length !== 2 || ids[1] !== ids[0] + 1) errors.push(`${c} anual no en dos cuatris consecutivos: ${ids}`); }
      else if (ids.length !== 1) errors.push(`${c} duplicada en ${ids}`);
    }
  }
  for (const [c] of idxOf) if (!PL.pool.has(c)) errors.push(`${c} ubicada sin estar en el pool`);
  // 2. correlativas, creditosReq, paridad, caps, overlap
  let acc = approvedCredits(approved);
  const capCred = (i: number) => PL.capCredByIdx.get(i) ?? PL.maxCred;
  const capMat = (i: number) => PL.capMatByIdx.get(i) ?? PL.maxMat;
  const loads: number[] = [], mats: number[] = [], days: number[] = [], viajes: number[] = [];
  for (let i = 0; i < N; i++) {
    const it = R.items[i];
    const cu = cuatriAt(PL.start, i);
    if (R.accBefore[i] !== acc) errors.push(`accBefore[${i}]=${R.accBefore[i]} ≠ ${acc}`);
    const cred = it.reduce((s, x) => s + (x.m.creditos || 0), 0);
    loads.push(cred); mats.push(it.length);
    // los topes sólo se exigen si el cuatrimestre tiene alguna materia libre:
    // lo fijado a mano va «sí o sí» aunque desborde
    const hayLibre = it.some((x) => PL.fixed.get(x.m.codigo) == null);
    if (hayLibre && it.length > capMat(i)) errors.push(`cuatri ${i}: ${it.length} materias > cap ${capMat(i)}`);
    if (hayLibre && cred > capCred(i) && it.length > 1) errors.push(`cuatri ${i}: ${cred} cr > cap ${capCred(i)}`);
    const d = new Set<string>();
    for (const x of it) if (x.com) for (const s of x.com.slots) if (!isAsync(s)) d.add(s.dia);
    days.push(d.size); viajes.push(viajesDe(it.map((x) => x.com)).viajes);
    for (const x of it) {
      const m = x.m; const code = m.codigo;
      const fx = PL.fixed.get(code);
      if (fx != null && fx !== i && !(esAnual(code) && x.parte === 2 && fx === i - 1)) errors.push(`${code} fijada en ${fx} pero está en ${i}`);
      const orig = byId.get(code)!;
      const par = parityOf(orig);
      if (fx == null && !esAnual(code) && par != null && par !== cu.parity) errors.push(`${code} paridad ${par} en cuatri ${i} (paridad ${cu.parity})`);
      const pinned = fx != null; // lo fijado a mano va sí o sí: el plan lo marca como aviso
      if (!pinned && (orig.creditosReq || 0) > acc && !(x.parte === 2)) errors.push(`${code} creditosReq ${orig.creditosReq} > acumulado ${acc} en cuatri ${i}`);
      if (!pinned) for (const c of orig.correlativas || []) {
        if (approved.has(c)) continue;
        const ci = idxOf.get(c);
        const lastIdx = ci ? Math.max(...ci) : undefined;
        if (lastIdx === undefined || lastIdx >= i) errors.push(`${code} en ${i} con correlativa ${c} en ${lastIdx ?? "ninguno"}`);
      }
      // superposiciones: sólo se toleran entre dos materias forzadas por el
      // usuario (fijadas a este cuatrimestre o con comisión fijada)
      const forced = (y: typeof x) => PL.fixed.get(y.m.codigo) != null || fixedCom?.has(y.m.codigo) === true;
      if (PL.avoid && x.com) for (const y of it) if (y !== x && y.com && !(forced(x) && forced(y)) && comConflict(x.com, y.com)) errors.push(`cuatri ${i}: ${code}/${x.com.comision} pisa ${y.m.codigo}/${y.com.comision}`);
      if (fixedCom?.get(code) && x.com && x.com.comision !== fixedCom.get(code) && comsOf(orig).some((c) => c.comision === fixedCom.get(code))) errors.push(`${code}: comisión fijada ${fixedCom.get(code)} pero el plan eligió ${x.com.comision}`);
    }
    if (PL.lockedIdx.has(i)) for (const x of it) if (PL.fixed.get(x.m.codigo) == null) errors.push(`cuatri ${i} lockeado con ${x.m.codigo} sin fijar`);
    acc += cred;
  }
  let last = -1; let used = 0;
  R.items.forEach((it, i) => { if (it.length) { last = i; used++; } });
  return { ok: !errors.length, errors: [...new Set(errors)], used, last, unplaced: R.unplaced.map((m) => m.codigo), loads, mats, days, viajes };
}

/** Cota inferior del último cuatrimestre: ASAP sin caps (correlativas +
 *  paridad + creditosReq con acumulación optimista), más cotas de capacidad. */
export function lowerBound(PL: PlanState, approved: Set<string>): { asap: number; cap: number; lb: number } {
  const mats = [...PL.pool].filter((c) => !approved.has(c)).map((c) => byId.get(c)!).filter(Boolean);
  const earliest = new Map<string, number>();
  const N = 40;
  // iterar hasta punto fijo: earliest(m) = min i ≥ max(earliest(correlativas)+1) con paridad ok
  let changed = true; let guard = 0;
  const totalCredBefore = (i: number) => { // créditos optimistas acumulados antes de i: todo lo que puede estar antes
    let s = approvedCredits(approved);
    for (const m of mats) { const e = earliest.get(m.codigo); if (e !== undefined && e < i) s += m.creditos || 0; }
    return s;
  };
  for (const m of mats) earliest.set(m.codigo, 0);
  while (changed && guard++ < 200) {
    changed = false;
    for (const m of mats) {
      let lo = 0;
      for (const c of m.correlativas || []) if (!approved.has(c) && earliest.has(c)) lo = Math.max(lo, (earliest.get(c)! + (esAnual(c) ? 1 : 0)) + 1);
      const fx = PL.fixed.get(m.codigo);
      let i = lo;
      for (; i < N; i++) {
        const cu = cuatriAt(PL.start, i);
        if (fx != null) { i = fx; break; }
        if (PL.lockedIdx.has(i)) continue;
        if (!esAnual(m.codigo) && parityOf(m) != null && parityOf(m) !== cu.parity) continue;
        if ((m.creditosReq || 0) > totalCredBefore(i)) continue;
        break;
      }
      if (i !== earliest.get(m.codigo)) { earliest.set(m.codigo, i); changed = true; }
    }
  }
  let asap = -1;
  for (const m of mats) asap = Math.max(asap, earliest.get(m.codigo)! + (esAnual(m.codigo) ? 1 : 0));
  const totalCred = mats.reduce((s, m) => s + (m.creditos || 0), 0);
  const n = mats.length + mats.filter((m) => esAnual(m.codigo)).length;
  const cap = Math.max(Math.ceil(totalCred / PL.maxCred), Math.ceil(n / PL.maxMat)) - 1;
  return { asap, cap, lb: Math.max(asap, cap) };
}

export function fmt(PL: PlanState, R: PlanResult) {
  return R.items.map((it, i) => it.length ? `${String(i).padStart(2)} ${(cuatriAt(PL.start, i).parity)}c ${String(it.reduce((s, x) => s + (x.m.creditos || 0), 0)).padStart(2)}cr ${it.length}m  ${it.map((x) => x.m.abbr + (x.com ? "/" + x.com.comision : "")).join(" ")}` : null).filter(Boolean).join("\n");
}
