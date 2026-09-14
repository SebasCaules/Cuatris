// Matriz de escenarios del optimizador del plan de cursada.
//   npm run check:optimizador            todas las carreras
//   npm run check:optimizador -- S I     sólo esas
// Por cada carrera × escenario (aprobadas por cuatrimestre nominal, al azar,
// con electivas, topes por índice, fijadas, cuatrimestre finalizado, topes
// mínimos) × método × topes × modo de superposiciones:
//   - invariantes del plan (harness.check);
//   - «cuatris» nunca peor que el solver de referencia (más ubicadas, o
//     mismo número y egreso más temprano) ni por debajo de su cota inferior;
//   - «dias» y «balance» nunca terminan más tarde que «cuatris».
// Sale con código 1 si algo falla.
import { loadCarrera, mkPL, check } from "./harness";
import { best as refBest } from "./referencia";
import { PLAN, byId, remainingOblig, topeNominal, esAnual } from "../../lib/planner/model";
import { optimizePlan, planOverlaps } from "../../lib/planner/optimize";
import { CARRERAS } from "../../lib/planner/carreras/index";
import type { OptMethod, PlanState } from "../../lib/planner/types";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// aprobadas: los primeros k cuatrimestres nominales
function approvedNominal(k: number): Set<string> {
  const ap = new Set<string>();
  for (const m of PLAN.obligatorias) {
    const idx = m.anio != null ? (m.anio - 1) * 2 + ((m.cuatri ?? 1) - 1) : 99;
    if (idx < k) ap.add(m.codigo);
  }
  return ap;
}
// aprobadas al azar, cerradas por correlativas
function approvedRandom(rand: () => number, p: number): Set<string> {
  const ap = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of PLAN.obligatorias) {
      if (ap.has(m.codigo)) continue;
      if (!(m.correlativas || []).every((c) => ap.has(c) || !byId.has(c))) continue;
      if (rand() < p) {
        ap.add(m.codigo);
        changed = true;
      }
    }
  }
  return ap;
}

interface Scenario {
  name: string;
  ap: Set<string>;
  over: Partial<PlanState>;
  /** comisiones fijadas por el usuario (código → comisión) */
  fixedCom?: Map<string, string>;
}

function scenariosFor(code: string): Scenario[] {
  const rand = rng(code.length * 7919 + 13);
  const electivas = PLAN.electivas
    .map((m) => m.codigo)
    .filter((c) => byId.get(c)?.horario?.comisiones.length);
  const out: Scenario[] = [];
  for (let k = 0; k <= 8; k += 2) out.push({ name: `nominal${k}`, ap: approvedNominal(k), over: {} });
  for (let r = 0; r < 4; r++)
    out.push({ name: `random${r}`, ap: approvedRandom(rand, 0.35 + r * 0.15), over: {} });
  for (let r = 0; r < 3; r++) {
    const ap = approvedNominal(2 + r * 2);
    const pool = new Set(remainingOblig(ap));
    const n = 3 + r * 2;
    for (let i = 0; i < n && electivas.length; i++)
      pool.add(electivas[Math.floor(rand() * electivas.length)]);
    out.push({ name: `elec${r}`, ap, over: { pool } });
  }
  {
    const ap = approvedNominal(2);
    out.push({
      name: "capIdx",
      ap,
      over: { capCredByIdx: new Map([[0, 12], [1, 15]]), capMatByIdx: new Map([[0, 3]]) },
    });
  }
  {
    const ap = approvedNominal(2);
    const fixed = new Map<string, number>();
    remainingOblig(ap)
      .filter((c) => !esAnual(c))
      .slice(0, 4)
      .forEach((c, i) => fixed.set(c, i * 2 + 1));
    out.push({ name: "fixed", ap, over: { fixed } });
  }
  {
    const ap = approvedNominal(2);
    const fixed = new Map<string, number>();
    remainingOblig(ap).slice(0, 3).forEach((c) => fixed.set(c, 0));
    out.push({ name: "locked0", ap, over: { fixed, lockedIdx: new Set([0]) } });
  }
  out.push({ name: "horizonte", ap: new Set(), over: { maxMat: 2 } });
  // comisiones fijadas: la primera comisión de seis materias con varias
  {
    const ap = approvedNominal(2);
    const fixedCom = new Map<string, string>();
    remainingOblig(ap)
      .filter((c) => (byId.get(c)?.horario?.comisiones.length ?? 0) > 1)
      .slice(0, 6)
      .forEach((c) => fixedCom.set(c, byId.get(c)!.horario!.comisiones[0].comision));
    out.push({ name: "fixedCom", ap, over: {}, fixedCom });
  }
  // anual fijada en el último índice del horizonte base (13): necesita el 14
  {
    const anual = PLAN.obligatorias.find((m) => esAnual(m.codigo));
    if (anual) out.push({ name: "anualFin", ap: new Set(), over: { fixed: new Map([[anual.codigo, 13]]) } });
  }
  return out;
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const codes = wanted.length
  ? wanted
  : CARRERAS.filter((c) => c.disponible).map((c) => c.codigo);

let fails = 0;
let total = 0;
const times: number[] = [];
for (const code of codes) {
  try {
    loadCarrera(code);
  } catch (e) {
    console.log(`${code}: no carga (${(e as Error).message})`);
    fails++;
    continue;
  }
  const tope = topeNominal();
  for (const sc of scenariosFor(code)) {
    // por (método, tope): el plan con «evitar superposiciones» y sin él
    const porModo: Record<string, { last: number; unpl: number; overlaps: number }> = {};
    for (const avoid of [true, false]) {
      const res: Record<string, ReturnType<typeof check>> = {};
      const caps: [number, number][] =
        sc.name === "horizonte" ? [[tope.cred, tope.mat]] : [[tope.cred, tope.mat], [40, 9]];
      for (const method of ["cuatris", "dias", "balance"] as OptMethod[]) {
        for (const [mc, mm] of caps) {
          const PL = mkPL({ method, maxCred: mc, maxMat: mm, avoid, ...sc.over }, sc.ap);
          const label = `${code} ${sc.name} ${method} ${PL.maxCred}/${PL.maxMat} avoid=${avoid ? 1 : 0}`;
          const t0 = performance.now();
          const R = optimizePlan(PL, sc.ap, sc.fixedCom);
          times.push(performance.now() - t0);
          const ck = check(PL, sc.ap, R, sc.fixedCom);
          total++;
          if (!ck.ok) {
            fails++;
            console.log(`INVARIANTE ${label}: ${ck.errors.slice(0, 4).join(" | ")}`);
          }
          // independencia del orden del pool: el mismo conjunto en orden inverso
          // tiene que dar el mismo plan (misma firma de cuatrimestres)
          if (method === "cuatris" && mc === tope.cred) {
            const rev = mkPL({ ...PL, pool: new Set([...PL.pool].reverse()) }, sc.ap);
            const R2 = optimizePlan(rev, sc.ap, sc.fixedCom);
            const sig = (r: typeof R) => r.items.map((it) => it.map((x) => x.m.codigo + "/" + (x.com?.comision ?? "")).join(",")).join("|");
            if (sig(R) !== sig(R2)) {
              fails++;
              console.log(`ORDEN DEL POOL ${label}: el plan cambia con el pool en orden inverso`);
            }
          }
          res[`${method}/${mc}`] = ck;
          porModo[`${method}/${mc}/${avoid}`] = { last: ck.last, unpl: ck.unplaced.length, overlaps: planOverlaps(R.items).length };
          // con «evitar superposiciones» apagado, los choques se toleran SOLO si
          // acortan el plan: si termina igual que con él encendido, no puede haber
          if (!avoid) {
            const con = porModo[`${method}/${mc}/true`];
            const sin = porModo[`${method}/${mc}/false`];
            // (las forzadas por el usuario —fijadas que se pisan entre sí— están en los dos)
            if (con && sin && sin.last === con.last && sin.unpl === con.unpl && sin.overlaps > con.overlaps) {
              fails++;
              console.log(`CHOQUES INNECESARIOS ${label}: ${sin.overlaps} superposiciones con el mismo egreso que evitándolas`);
            }
            if (con && sin && (sin.unpl > con.unpl || (sin.unpl === con.unpl && sin.last > con.last))) {
              fails++;
              console.log(`SIN EVITAR MÁS TARDE ${label}: ${sin.last} vs ${con.last}`);
            }
          }
          if (method === "cuatris" && !sc.fixedCom) {
            // mismo horizonte que el plan (el optimizador lo extiende si hace falta)
            const ref = refBest(PL, sc.ap, 120, 3, R.items.length);
            if (
              ref.unplaced < ck.unplaced.length ||
              (ref.unplaced === ck.unplaced.length && ref.last < ck.last)
            ) {
              fails++;
              console.log(
                `REFERENCIA MEJOR ${label}: optimizador last=${ck.last} sin ubicar=${ck.unplaced.length}; referencia last=${ref.last} sin ubicar=${ref.unplaced}`,
              );
            }
            if (R.minLast != null && ck.unplaced.length === 0 && ck.last < R.minLast) {
              fails++;
              console.log(`COTA INVÁLIDA ${label}: last=${ck.last} < minLast=${R.minLast}`);
            }
          }
        }
      }
      for (const [mc] of caps) {
        const c = res[`cuatris/${mc}`];
        const d = res[`dias/${mc}`];
        const b = res[`balance/${mc}`];
        if (!c || !d || !b) continue;
        const later = (x: typeof c) =>
          x.unplaced.length > c.unplaced.length ||
          (x.unplaced.length === c.unplaced.length && x.last > c.last);
        if (later(d)) {
          fails++;
          console.log(`DIAS MÁS TARDE ${code} ${sc.name} ${mc} avoid=${avoid}: ${d.last} vs ${c.last}`);
        }
        if (later(b)) {
          fails++;
          console.log(`BALANCE MÁS TARDE ${code} ${sc.name} ${mc} avoid=${avoid}: ${b.last} vs ${c.last}`);
        }
      }
    }
  }
  console.log(`${code.padEnd(4)} ${PLAN.carrera?.nombre ?? ""}: ok`);
}
times.sort((a, b) => a - b);
const q = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
console.log(
  `\n${total} corridas · ${fails} fallas · optimizePlan ms: mediana ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · máx ${q(1)}`,
);
process.exit(fails ? 1 : 0);
