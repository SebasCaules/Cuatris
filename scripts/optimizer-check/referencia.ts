// Solver de referencia (adversarial): list-scheduling con reinicios
// aleatorios, misma factibilidad que el optimizador (correlativas,
// creditosReq, paridad, topes, anuales en mitades, sin superposición si
// avoid). Si alguna vez ubica más materias o termina antes que el optimizador,
// el optimizador dejó de ser óptimo para ese escenario.
import { byId, esAnual } from "../../lib/planner/model";
import { cuatriAt } from "../../lib/planner/optimize";
import { approvedCredits } from "../../lib/planner/metrics";
import { comConflict } from "../../lib/planner/time";
import type { PlanState, MateriaM, Comision } from "../../lib/planner/types";

export interface RefResult { last: number; used: number; unplaced: number; loads: number[]; plan: string[][] }

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ¿existe asignación de comisiones sin superposición para estas materias?
function comsFeasible(ms: MateriaM[], fixedCom?: Map<string, string>, budget = 20000): boolean {
  const opts = ms.map((m) => {
    const coms = m.horario?.comisiones ?? [];
    if (!coms.length) return [null] as (Comision | null)[];
    const fx = fixedCom?.get(m.codigo);
    if (fx) { const c = coms.find((x) => x.comision === fx); if (c) return [c]; }
    return coms as (Comision | null)[];
  });
  // ordenar por menos opciones primero
  const idx = opts.map((_, i) => i).sort((a, b) => opts[a].length - opts[b].length);
  const chosen: (Comision | null)[] = [];
  let nodes = 0;
  const rec = (k: number): boolean => {
    if (nodes++ > budget) return false;
    if (k === idx.length) return true;
    for (const c of opts[idx[k]]) {
      if (c && chosen.some((o) => o && comConflict(o, c))) continue;
      chosen.push(c);
      if (rec(k + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  return rec(0);
}

export function schedule(PL: PlanState, approved: Set<string>, order: (a: MateriaM, b: MateriaM) => number, N = 14): RefResult {
  const mats = [...PL.pool].filter((c) => !approved.has(c)).map((c) => byId.get(c)!).filter(Boolean);
  const items: MateriaM[][] = Array.from({ length: N }, () => []);
  const credIt: number[] = Array(N).fill(0);
  const placedIdx = new Map<string, number>(); // índice donde TERMINA (anual: 2.ª mitad)
  let remaining = mats.slice();
  let acc = approvedCredits(approved);
  const capCred = (i: number) => PL.capCredByIdx.get(i) ?? PL.maxCred;
  const capMat = (i: number) => PL.capMatByIdx.get(i) ?? PL.maxMat;
  for (let i = 0; i < N && remaining.length; i++) {
    const cu = cuatriAt(PL.start, i);
    const fixedHere = remaining.filter((m) => PL.fixed.get(m.codigo) === i);
    for (const m of fixedHere) {
      if (esAnual(m.codigo)) { const h1 = { ...m, creditos: Math.ceil(m.creditos / 2) }; const h2 = { ...m, creditos: Math.floor(m.creditos / 2) }; items[i].push(h1); credIt[i] += h1.creditos; if (i + 1 < N) { items[i + 1].push(h2); credIt[i + 1] += h2.creditos; } placedIdx.set(m.codigo, i + 1); }
      else { items[i].push(m); credIt[i] += m.creditos || 0; placedIdx.set(m.codigo, i); }
    }
    remaining = remaining.filter((m) => !placedIdx.has(m.codigo));
    if (!PL.lockedIdx.has(i)) {
      const feas = remaining.filter((m) => {
        const fx = PL.fixed.get(m.codigo); if (fx != null && fx !== i) return false;
        if (!esAnual(m.codigo) && m.parity != null && m.parity !== cu.parity) return false;
        if ((m.creditosReq || 0) > acc) return false;
        return (m.correlativas || []).every((c) => approved.has(c) || (placedIdx.has(c) && placedIdx.get(c)! < i));
      }).sort(order);
      for (const m of feas) {
        if (items[i].length >= capMat(i)) break;
        const anual = esAnual(m.codigo);
        const add = anual ? Math.ceil(m.creditos / 2) : m.creditos || 0;
        if (items[i].length > 0 && credIt[i] + add > capCred(i)) continue;
        if (anual) {
          const j = i + 1; if (j >= N || PL.lockedIdx.has(j) || items[j].length >= capMat(j)) continue;
          const add2 = Math.floor(m.creditos / 2); if (items[j].length > 0 && credIt[j] + add2 > capCred(j)) continue;
        }
        if (PL.avoid && (m.horario?.comisiones.length ?? 0) > 0 && !comsFeasible([...items[i], m], PL.fixed.size ? undefined : undefined)) continue;
        if (anual) { const h1 = { ...m, creditos: add }; const h2 = { ...m, creditos: Math.floor(m.creditos / 2) }; items[i].push(h1); credIt[i] += add; items[i + 1].push(h2); credIt[i + 1] += h2.creditos; placedIdx.set(m.codigo, i + 1); }
        else { items[i].push(m); credIt[i] += add; placedIdx.set(m.codigo, i); }
      }
      remaining = remaining.filter((m) => !placedIdx.has(m.codigo));
    }
    acc += credIt[i];
  }
  let last = -1, used = 0;
  items.forEach((it, i) => { if (it.length) { last = i; used++; } });
  return { last, used, unplaced: remaining.length, loads: credIt.slice(0, last + 1), plan: items.map((it) => it.map((m) => m.codigo)) };
}

/** Profundidad de la cadena de dependientes (camino crítico hacia adelante). */
export function depths(mats: MateriaM[]): Map<string, number> {
  const set = new Set(mats.map((m) => m.codigo));
  const deps = new Map<string, string[]>();
  for (const m of mats) for (const c of m.correlativas || []) if (set.has(c)) { const a = deps.get(c) ?? []; a.push(m.codigo); deps.set(c, a); }
  const memo = new Map<string, number>();
  const d = (c: string): number => { if (memo.has(c)) return memo.get(c)!; memo.set(c, 0); let v = 0; for (const x of deps.get(c) ?? []) v = Math.max(v, 1 + d(x)); memo.set(c, v); return v; };
  for (const m of mats) d(m.codigo);
  return memo;
}

export function best(PL: PlanState, approved: Set<string>, restarts = 300, seed = 1, N = 14): RefResult & { orders: number } {
  const mats = [...PL.pool].filter((c) => !approved.has(c)).map((c) => byId.get(c)!).filter(Boolean);
  const dep = depths(mats);
  const rand = rng(seed);
  let bestR: RefResult | null = null;
  const better = (a: RefResult, b: RefResult | null) => !b || a.unplaced < b.unplaced || (a.unplaced === b.unplaced && (a.last < b.last || (a.last === b.last && a.used < b.used)));
  // órdenes base deterministas + aleatorios
  const orders: ((a: MateriaM, b: MateriaM) => number)[] = [
    (a, b) => (dep.get(b.codigo)! - dep.get(a.codigo)!) || (b.creditos - a.creditos) || a.codigo.localeCompare(b.codigo),
    (a, b) => (b.creditos - a.creditos) || (dep.get(b.codigo)! - dep.get(a.codigo)!) || a.codigo.localeCompare(b.codigo),
    (a, b) => (b.creditosReq - a.creditosReq) || (dep.get(b.codigo)! - dep.get(a.codigo)!) || a.codigo.localeCompare(b.codigo),
  ];
  for (let r = 0; r < restarts; r++) {
    const noise = new Map<string, number>();
    for (const m of mats) noise.set(m.codigo, rand());
    const w = rand() * 3; // peso del camino crítico
    orders.push((a, b) => (dep.get(b.codigo)! * w + noise.get(b.codigo)! * 2 + (b.creditos / 6)) - (dep.get(a.codigo)! * w + noise.get(a.codigo)! * 2 + (a.creditos / 6)));
  }
  for (const o of orders) { const R = schedule(PL, approved, o, N); if (better(R, bestR)) bestR = R; }
  return { ...bestR!, orders: orders.length };
}
