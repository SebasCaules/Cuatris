// Optimizador del plan de cursada.
// Tres estrategias elegibles (`PL.method`), todas con la MISMA invariante de
// factibilidad: nunca ubicar una materia violando correlativas, paridad,
// créditosReq, los caps por cuatrimestre, ni (en modo `avoid`) superposición
// horaria.
//
//  - "cuatris" (default): minimizar la cantidad de cuatrimestres.
//      1. Prioridad por CAMINO CRÍTICO: las materias que destraban cadenas
//         largas de correlativas se ubican primero.
//      2. Empaquetado FFD por créditos para llenar cada cuatrimestre.
//      3. Selección de comisión que minimiza los días distintos en el campus.
//      4. Compactación: adelanta materias de cuatrimestres tardíos a previos
//         de igual paridad que tengan lugar.
//  - "dias": minimizar los días distintos de campus por semana.
//      Misma colocación base que "cuatris" (a: `chooseCom` ya minimiza días
//      nuevos en cada elección), pero (b) la compactación sólo adelanta una
//      materia si eso NO agrega un día de campus nuevo al cuatrimestre
//      destino. Esto hace que cada movimiento de compactación sea, como
//      mucho, neutro en días totales (nunca puede empeorar el total respecto
//      de la colocación base, que es idéntica a la de "cuatris").
//  - "balance": repartir créditos parejo sin aumentar la cantidad de
//      cuatrimestres. Corre "cuatris" completo (colocación + compactación)
//      para obtener una solución 100% factible con la cantidad mínima de
//      cuatrimestres usados U, y después la rebalancea: mueve materias del
//      cuatrimestre más cargado al menos cargado (misma paridad) mientras
//      eso reduzca el desbalance, sin crear cuatrimestres nuevos ni dejar
//      materias sin ubicar.
//
// Los caps por cuatrimestre (`PL.capCredByIdx` / `PL.capMatByIdx`, con
// fallback a `PL.maxCred` / `PL.maxMat`) se respetan como tope DURO en los
// tres métodos, tanto al colocar como al compactar.
import { byId } from "./model";
import { approvedCredits } from "./metrics";
import { comConflict, isAsync } from "./time";
import type {
  Comision,
  MateriaM,
  PlacedMateria,
  PlanResult,
  PlanStart,
  PlanState,
  OptMethod,
} from "./types";

export const cuatriAt = (start: PlanStart, i: number): PlanStart => {
  let p = start.parity;
  let y = start.year;
  for (let k = 0; k < i; k++) {
    if (p === 2) {
      p = 1;
      y++;
    } else p = 2;
  }
  return { parity: p, year: y };
};

export const cuatriLabel = (c: PlanStart) =>
  (c.parity === 1 ? "1c" : "2c") + "-" + String(c.year).slice(-2);
export const cuatriName = (c: PlanStart) =>
  (c.parity === 1 ? "1.º" : "2.º") + " cuat. " + c.year;

/* ---------- metadata de métodos (contrato para la UI) ---------- */

export interface OptMethodMeta {
  key: OptMethod;
  label: string;
  short: string;
  objetivo: string;
}

export const OPT_METHODS: OptMethodMeta[] = [
  {
    key: "cuatris",
    label: "Recibirte antes",
    short: "menos cuatrimestres",
    objetivo: "Minimizar la cantidad de cuatrimestres hasta recibirte.",
  },
  {
    key: "dias",
    label: "Menos días de campus",
    short: "concentrar la cursada",
    objetivo:
      "Concentrar las materias en la menor cantidad de días por semana.",
  },
  {
    key: "balance",
    label: "Carga pareja",
    short: "equilibrar cada cuatri",
    objetivo:
      "Repartir créditos y materias de forma equilibrada entre cuatrimestres.",
  },
];

/* ---------- caps efectivos por cuatrimestre ---------- */

const capCred = (PL: PlanState, i: number): number =>
  PL.capCredByIdx.get(i) ?? PL.maxCred;
const capMat = (PL: PlanState, i: number): number =>
  PL.capMatByIdx.get(i) ?? PL.maxMat;

/* ---------- helpers de comisión / horario ---------- */

const comsOf = (m: MateriaM): Comision[] =>
  (m.horario && m.horario.comisiones) || [];

// Días distintos (no asincrónicos) que ocupa una comisión.
const comDays = (com: Comision): Set<string> => {
  const s = new Set<string>();
  for (const sl of com.slots) if (!isAsync(sl)) s.add(sl.dia);
  return s;
};

// Días ya ocupados por las materias puestas en un cuatrimestre.
const usedDaysOf = (placed: PlacedMateria[]): Set<string> => {
  const u = new Set<string>();
  for (const x of placed) if (x.com) for (const d of comDays(x.com)) u.add(d);
  return u;
};

// ¿Hay alguna comisión sin superposición con lo ya puesto en el cuatrimestre?
const hasFreeCom = (coms: Comision[], placed: PlacedMateria[]): boolean =>
  coms.some((c) => !placed.some((x) => x.com && comConflict(x.com, c)));

// Elige la comisión más compacta: menos días nuevos en el campus, luego menos
// días en total, luego orden original. En modo `avoid` prefiere comisiones sin
// superposición; si no hay ninguna, cae a la mejor igual (el llamador decide si
// la ubica o no vía hasFreeCom).
const chooseCom = (
  coms: Comision[],
  placed: PlacedMateria[],
  avoid: boolean,
  fixedComision?: string,
): Comision | null => {
  if (!coms.length) return null;
  if (fixedComision) {
    const fx = coms.find((c) => c.comision === fixedComision);
    if (fx) return fx;
  }
  const free = avoid
    ? coms.filter((c) => !placed.some((x) => x.com && comConflict(x.com, c)))
    : coms;
  const cand = free.length ? free : coms;
  const used = usedDaysOf(placed);
  let best = cand[0];
  let bestScore = Infinity;
  cand.forEach((c, idx) => {
    const days = comDays(c);
    let extra = 0;
    days.forEach((d) => {
      if (!used.has(d)) extra++;
    });
    // peso: días nuevos ≫ días totales ≫ orden de la cátedra
    const score = extra * 1000 + days.size * 10 + idx;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  });
  return best;
};

/* ---------- orden de colocación (camino crítico) ---------- */

// orden de cursada: obligatoria › camino crítico › más créditos (FFD) ›
// mayor requisito de créditos › código. El camino crítico se calcula sobre el
// pool restante `mats`: materias que destraban cadenas largas de correlativas
// van primero (el piso de cuatrimestres está acotado por la cadena más larga).
function buildCriticalOrder(
  mats: MateriaM[],
): (a: MateriaM, b: MateriaM) => number {
  const codeSet = new Set(mats.map((m) => m.codigo));
  const dependents = new Map<string, string[]>();
  for (const m of mats) {
    for (const c of m.correlativas || []) {
      if (!codeSet.has(c)) continue; // correlativa ya aprobada → no cuenta
      const arr = dependents.get(c);
      if (arr) arr.push(m.codigo);
      else dependents.set(c, [m.codigo]);
    }
  }
  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (code: string): number => {
    const memo = depthMemo.get(code);
    if (memo !== undefined) return memo;
    if (visiting.has(code)) return 0; // guard anti-ciclo
    visiting.add(code);
    let d = 0;
    for (const ch of dependents.get(code) || []) {
      const cd = 1 + depthOf(ch);
      if (cd > d) d = cd;
    }
    visiting.delete(code);
    depthMemo.set(code, d);
    return d;
  };
  return (a: MateriaM, b: MateriaM) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "obligatoria" ? -1 : 1) ||
    depthOf(b.codigo) - depthOf(a.codigo) ||
    (b.creditos || 0) - (a.creditos || 0) ||
    (b.creditosReq || 0) - (a.creditosReq || 0) ||
    a.codigo.localeCompare(b.codigo);
}

/* ---------- colocación (fase común a los tres métodos) ---------- */
// Idéntica para "cuatris", "dias" y la fase 1 de "balance": los tres parten
// de la MISMA colocación base (camino crítico + FFD por créditos + comisión
// más compacta). Lo que cambia entre métodos es lo que se hace DESPUÉS
// (compactación restringida para "dias", rebalanceo para "balance").

interface PlaceResult {
  items: PlacedMateria[][];
  placedIdx: Record<string, number>;
  remaining: MateriaM[];
}

function placeMats(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  order: (a: MateriaM, b: MateriaM) => number,
  N: number,
): PlaceResult {
  const items: PlacedMateria[][] = Array.from({ length: N }, () => []);
  const placedIdx: Record<string, number> = {};
  let acc = approvedCredits(approved);
  let remaining = mats.slice();
  const prereqDone = (m: MateriaM, i: number) =>
    (m.correlativas || []).every(
      (c) =>
        approved.has(c) || (placedIdx[c] !== undefined && placedIdx[c] < i),
    );

  for (let i = 0; i < N && remaining.length; i++) {
    const cu = cuatriAt(PL.start, i);
    const place = (m: MateriaM) => {
      const coms = comsOf(m);
      items[i].push({
        m,
        com: chooseCom(coms, items[i], PL.avoid, fixedCom?.get(m.codigo)),
      });
      placedIdx[m.codigo] = i;
    };
    // materias fijadas a este cuatrimestre van sí o sí
    remaining.filter((m) => PL.fixed.get(m.codigo) === i).forEach(place);
    remaining = remaining.filter((m) => placedIdx[m.codigo] === undefined);

    // cuatrimestre finalizado (lockeado): sólo lo ya pineado vía `fixed` vive
    // acá; no se rellena con materias nuevas.
    if (!PL.lockedIdx.has(i)) {
      const cand = remaining
        .filter((m) => {
          const fx = PL.fixed.get(m.codigo);
          if (fx !== undefined && fx !== null && fx !== i) return false;
          if (m.parity !== null && m.parity !== cu.parity) return false;
          if ((m.creditosReq || 0) > acc) return false;
          return prereqDone(m, i);
        })
        .sort(order);

      const hardMat = capMat(PL, i);
      const hardCred = capCred(PL, i);

      for (const m of cand) {
        if (items[i].length >= hardMat) break;
        const cred = items[i].reduce((s, x) => s + (x.m.creditos || 0), 0);
        const add = m.creditos || 0;
        if (items[i].length > 0 && cred + add > hardCred) continue;
        const coms = comsOf(m);
        // en modo avoid, no la ubico si no hay comisión sin superposición
        if (PL.avoid && coms.length && !hasFreeCom(coms, items[i])) continue;
        place(m);
      }
      remaining = remaining.filter((m) => placedIdx[m.codigo] === undefined);
    }
    acc += items[i].reduce((s, x) => s + (x.m.creditos || 0), 0);
  }

  return { items, placedIdx, remaining };
}

/* ---------- compactación (adelantar a cuatris previos de igual paridad) ---------- */

interface CompactOpts {
  // si es true, no adelanta una materia si eso agrega un día de campus nuevo
  // al cuatrimestre destino (usado por "dias": nunca empeora el total).
  noNewDays?: boolean;
}

function compact(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  items: PlacedMateria[][],
  placedIdx: Record<string, number>,
  N: number,
  opts: CompactOpts = {},
): number {
  const credOfCuatri = (it: PlacedMateria[]) =>
    it.reduce((s, x) => s + (x.m.creditos || 0), 0);
  let moved = 0;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 300) {
    changed = false;
    const accB: number[] = [];
    let a2 = approvedCredits(approved);
    for (let i = 0; i < N; i++) {
      accB[i] = a2;
      a2 += credOfCuatri(items[i]);
    }
    for (let i = N - 1; i >= 1 && !changed; i--) {
      if (!items[i].length) continue;
      const ci = cuatriAt(PL.start, i);
      for (const it of items[i]) {
        const fx = PL.fixed.get(it.m.codigo);
        if (fx !== undefined && fx !== null) continue;
        let done = false;
        for (let j = 0; j < i; j++) {
          if (PL.lockedIdx.has(j)) continue; // no adelantar a un cuatri finalizado
          const cj = cuatriAt(PL.start, j);
          if (cj.parity !== ci.parity) continue;
          if ((it.m.creditosReq || 0) > accB[j]) continue;
          if (
            !(it.m.correlativas || []).every(
              (c) =>
                approved.has(c) ||
                (placedIdx[c] !== undefined && placedIdx[c] < j),
            )
          )
            continue;
          if (items[j].length >= capMat(PL, j)) continue;
          if (credOfCuatri(items[j]) + (it.m.creditos || 0) > capCred(PL, j))
            continue;
          const comsM = comsOf(it.m);
          let comJ = it.com;
          if (comsM.length) {
            if (PL.avoid && !hasFreeCom(comsM, items[j])) continue;
            const cJ = chooseCom(
              comsM,
              items[j],
              PL.avoid,
              fixedCom?.get(it.m.codigo),
            );
            if (opts.noNewDays) {
              const used = usedDaysOf(items[j]);
              const addsNewDay = cJ
                ? [...comDays(cJ)].some((d) => !used.has(d))
                : false;
              if (addsNewDay) continue; // adelantarla sumaría un día de campus nuevo
            }
            comJ = cJ;
          }
          it.com = comJ;
          items[i] = items[i].filter((x) => x !== it);
          items[j].push(it);
          placedIdx[it.m.codigo] = j;
          moved++;
          changed = true;
          done = true;
          break;
        }
        if (done) break;
      }
    }
  }
  return moved;
}

/* ---------- chequeo de factibilidad global (invariante del plan) ---------- */
// Verifica que, en el arreglo `items`, TODA materia colocada cumple su
// `creditosReq` (contra los créditos acumulados ANTES de su cuatrimestre) y
// tiene sus correlativas colocadas en un cuatrimestre estrictamente anterior
// (o ya aprobadas). NO chequea paridad: las materias fijadas por el usuario
// pueden quedar en paridad distinta a propósito (el plan lo marca como aviso),
// y el rebalanceo preserva la paridad por construcción. Se usa como guarda dura
// del rebalanceo: cualquier movimiento que rompa esta invariante se revierte.
function feasible(
  PL: PlanState,
  approved: Set<string>,
  items: PlacedMateria[][],
  N: number,
): boolean {
  const idxOf: Record<string, number> = {};
  for (let i = 0; i < N; i++) for (const { m } of items[i]) idxOf[m.codigo] = i;
  let acc = approvedCredits(approved);
  for (let i = 0; i < N; i++) {
    for (const { m } of items[i]) {
      if ((m.creditosReq || 0) > acc) return false;
      for (const c of m.correlativas || []) {
        if (approved.has(c)) continue;
        const ci = idxOf[c];
        if (ci === undefined || ci >= i) return false;
      }
    }
    acc += items[i].reduce((s, x) => s + (x.m.creditos || 0), 0);
  }
  return true;
}

/* ---------- rebalanceo (método "balance": equilibrar créditos entre cuatris) ---------- */
// A diferencia de `compact` (que sólo adelanta, nunca mueve a un cuatri
// posterior), acá SÍ movemos en ambas direcciones dentro del rango fijo
// [0, U) para poder descargar los cuatris más cargados hacia los más
// livianos. Como el rango de cuatrimestres usados no cambia (nunca se crea
// ni se vacía un índice fuera de [0, U)), la cantidad de cuatrimestres del
// plan queda igual; y como cada materia sólo se reubica (nunca se remueve),
// no aparecen nuevas materias sin ubicar.
//
// Para que mover una materia más TARDE (j > i) sea seguro hace falta algo
// que `compact` no necesita: chequear sus DEPENDIENTES (materias que la
// tienen como correlativa), no sólo sus propias correlativas. Mover más
// TEMPRANO (j < i) es seguro re-chequeando sólo sus propias correlativas,
// igual que en `compact`.
function rebalance(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  items: PlacedMateria[][],
  placedIdx: Record<string, number>,
  U: number,
): number {
  const credOfCuatri = (it: PlacedMateria[]) =>
    it.reduce((s, x) => s + (x.m.creditos || 0), 0);

  // dependientes directos, sólo entre las materias efectivamente colocadas
  // dentro del rango [0, U).
  const dependentsOf = new Map<string, string[]>();
  for (let i = 0; i < U; i++) {
    for (const { m } of items[i]) {
      for (const c of m.correlativas || []) {
        const arr = dependentsOf.get(c);
        if (arr) arr.push(m.codigo);
        else dependentsOf.set(c, [m.codigo]);
      }
    }
  }

  let moved = 0;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 300) {
    changed = false;
    const accB: number[] = [];
    let a2 = approvedCredits(approved);
    for (let i = 0; i < U; i++) {
      accB[i] = a2;
      a2 += credOfCuatri(items[i]);
    }
    const loads = items.slice(0, U).map(credOfCuatri);

    // recorremos los cuatris de más cargado a menos cargado: intentamos
    // aliviar primero el que más desbalancea.
    const overOrder = [...Array(U).keys()].sort((a, b) => loads[b] - loads[a]);

    findMove: for (const i of overOrder) {
      if (!items[i].length) continue;
      if (PL.lockedIdx.has(i)) continue; // no tocar cuatris finalizados
      const ci = cuatriAt(PL.start, i);
      // dentro del cuatri sobrecargado, probamos primero mover la materia
      // más "grande" (créditos): un solo movimiento grande baja más la
      // varianza que varios chicos.
      const cands = items[i]
        .filter((x) => {
          const fx = PL.fixed.get(x.m.codigo);
          return fx === undefined || fx === null;
        })
        .slice()
        .sort((a, b) => (b.m.creditos || 0) - (a.m.creditos || 0));

      for (const it of cands) {
        // cuatris destino: misma paridad, distinto de i, de menos a más
        // cargado (least-loaded first).
        const dest = [...Array(U).keys()]
          .filter(
            (j) =>
              j !== i &&
              !PL.lockedIdx.has(j) && // no mover a un cuatri finalizado
              cuatriAt(PL.start, j).parity === ci.parity,
          )
          .sort((a, b) => loads[a] - loads[b]);

        for (const j of dest) {
          // si mover ya empata o invierte la relación de carga, no mejora:
          // como `dest` está ascendente, los siguientes tampoco sirven.
          if (loads[j] + (it.m.creditos || 0) >= loads[i]) break;
          if (items[j].length >= capMat(PL, j)) continue;
          if (credOfCuatri(items[j]) + (it.m.creditos || 0) > capCred(PL, j))
            continue;
          if ((it.m.creditosReq || 0) > accB[j]) continue;
          if (j < i) {
            // más temprano: sus propias correlativas deben seguir cumplidas.
            if (
              !(it.m.correlativas || []).every(
                (c) =>
                  approved.has(c) ||
                  (placedIdx[c] !== undefined && placedIdx[c] < j),
              )
            )
              continue;
          } else {
            // más tarde: ningún dependiente ya colocado puede quedar en o
            // antes de j (tiene que seguir viniendo después).
            const deps = dependentsOf.get(it.m.codigo) || [];
            if (
              deps.some(
                (d) => placedIdx[d] !== undefined && placedIdx[d] <= j,
              )
            )
              continue;
          }
          const comsM = comsOf(it.m);
          const prevCom = it.com;
          let comJ = it.com;
          if (comsM.length) {
            if (PL.avoid && !hasFreeCom(comsM, items[j])) continue;
            comJ = chooseCom(
              comsM,
              items[j],
              PL.avoid,
              fixedCom?.get(it.m.codigo),
            );
          }
          // aplicamos el movimiento de forma tentativa…
          it.com = comJ;
          items[i] = items[i].filter((x) => x !== it);
          items[j].push(it);
          placedIdx[it.m.codigo] = j;
          // …y lo revertimos si rompe la invariante global del plan. Mover una
          // materia a un cuatri POSTERIOR baja los créditos acumulados de los
          // cuatris intermedios y podría violar el `creditosReq` de OTRAS
          // materias ya ubicadas ahí: `feasible` lo detecta (no alcanza con
          // chequear sólo la materia movida).
          if (!feasible(PL, approved, items, U)) {
            items[j] = items[j].filter((x) => x !== it);
            items[i].push(it);
            placedIdx[it.m.codigo] = i;
            it.com = prevCom;
            continue;
          }
          moved++;
          changed = true;
          break findMove;
        }
      }
    }
  }
  return moved;
}

/* ---------- entrypoint ---------- */

export function optimizePlan(
  PL: PlanState,
  approved: Set<string>,
  fixedCom?: Map<string, string>,
): PlanResult {
  const mats = [...PL.pool]
    .filter((c) => !approved.has(c))
    .map((c) => byId.get(c))
    .filter(Boolean) as MateriaM[];

  const order = buildCriticalOrder(mats);
  const N = 14;

  let items: PlacedMateria[][];
  let placedIdx: Record<string, number>;
  let remaining: MateriaM[];
  let moved = 0;

  const method: OptMethod = PL.method ?? "cuatris";

  if (method === "dias") {
    // colocación base idéntica a "cuatris" (chooseCom ya minimiza días
    // nuevos en cada elección); la compactación sólo adelanta una materia si
    // eso no agrega un día de campus nuevo al cuatri destino, así que nunca
    // puede empeorar el total de días respecto de la colocación base.
    const r = placeMats(PL, approved, fixedCom, mats, order, N);
    items = r.items;
    placedIdx = r.placedIdx;
    remaining = r.remaining;
    moved = compact(PL, approved, fixedCom, items, placedIdx, N, {
      noNewDays: true,
    });
  } else if (method === "balance") {
    // fase 1: corremos "cuatris" completo (colocación + compactación) para
    // obtener una solución 100% factible con la cantidad mínima de
    // cuatrimestres usados U (todas las materias del pool ubicadas, salvo
    // las que "cuatris" tampoco podría ubicar).
    const base = placeMats(PL, approved, fixedCom, mats, order, N);
    compact(PL, approved, fixedCom, base.items, base.placedIdx, N);
    let maxIdx = -1;
    for (let i = 0; i < N; i++) if (base.items[i].length) maxIdx = i;
    const U = Math.max(1, maxIdx + 1);

    // fase 2: rebalanceo iterativo (least-loaded first) DENTRO de esos mismos
    // U cuatrimestres: nunca crea ni vacía un índice, así que ni la cantidad
    // de cuatrimestres ni la lista de materias ubicadas cambian — sólo se
    // pareja la carga.
    moved = rebalance(PL, approved, fixedCom, base.items, base.placedIdx, U);
    items = base.items;
    placedIdx = base.placedIdx;
    remaining = base.remaining;
  } else {
    // "cuatris" (default): comportamiento original exacto.
    const r = placeMats(PL, approved, fixedCom, mats, order, N);
    items = r.items;
    placedIdx = r.placedIdx;
    remaining = r.remaining;
    moved = compact(PL, approved, fixedCom, items, placedIdx, N);
  }

  const accBefore2: number[] = [];
  let a3 = approvedCredits(approved);
  for (let i = 0; i < N; i++) {
    accBefore2[i] = a3;
    a3 += items[i].reduce((s, x) => s + (x.m.creditos || 0), 0);
  }
  return { items, unplaced: remaining, accBefore: accBefore2, moved };
}

/** Códigos que el plan ubica en el PRÓXIMO cuatrimestre (índice 0). Puro:
 *  corre el optimizador con el estado actual y devuelve solo esa lista. Lo usa
 *  el Combinador para sembrar su selección desde el plan en vez de arrancar
 *  vacío. */
export function nextCuatriCodes(
  PL: PlanState,
  approved: Set<string>,
  fixedCom?: Map<string, string>,
): string[] {
  const { items } = optimizePlan(PL, approved, fixedCom);
  return (items[0] ?? []).map((x) => x.m.codigo);
}
