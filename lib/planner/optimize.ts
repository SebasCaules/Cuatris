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
//      3. Selección de comisión que minimiza las IDAS a la facultad
//         (`viajesDe`): una comisión que termina en la sede donde arranca la
//         siguiente materia cuenta una sola ida; recién después, menos días
//         distintos y menos espera entre bloques. Siempre se prefiere una
//         comisión sin superposición si existe (con `avoid` apagado, la
//         materia entra igual con la menos mala si no hay ninguna libre).
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
//
// ORDEN DEL PLAN DE ESTUDIOS (preferencia, no invariante): las obligatorias
// se colocan en el orden nominal de su plan (año/cuatrimestre) y en cada
// cuatrimestre sólo entran las que están a lo sumo ORDEN_VENTANA cuatrimestres
// por delante de la obligatoria pendiente más temprana. Así una materia de 5.º
// no se mezcla con una de 1.º aunque correlativas y créditos lo permitan; la
// de 5.º espera a que las anteriores estén ubicadas. Vale al colocar, al
// compactar y al rebalancear (una materia no se adelanta a un cuatri cuyas
// obligatorias son de años muy anteriores). Las electivas no tienen orden
// nominal y no participan de la ventana; lo fijado a mano tampoco.
//
// Materias ANUALES (Proyecto Final: 12 cr en un año continuo): se ubican como
// DOS MITADES en cuatrimestres consecutivos (i, i+1), cada una con la mitad de
// los créditos y contando como una materia en cada uno; las dos tienen que
// entrar en sus caps. Sin paridad (arrancan en cualquier cuatrimestre). Sus
// dependientes van después de la segunda mitad. Las mitades no se compactan
// ni se rebalancean sueltas: la colocación ya las deja en el primer par de
// cuatrimestres donde caben.
import { byId, esAnual } from "./model";
import { approvedCredits } from "./metrics";
import { comConflict, isAsync, viajesDe } from "./time";
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

/** Orden cronológico de dos cuatrimestres (negativo si `a` es anterior). */
export const compareCuatri = (a: PlanStart, b: PlanStart): number =>
  a.year - b.year || a.parity - b.parity;

/**
 * Cuatrimestre en curso según la fecha: marzo–julio es el 1.º, agosto–
 * diciembre el 2.º; enero y febrero son receso y cuentan como el 2.º del año
 * anterior (todavía no empezó nada nuevo).
 */
export const currentCuatri = (date: Date = new Date()): PlanStart => {
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  if (m >= 8) return { parity: 2, year: y };
  if (m >= 3) return { parity: 1, year: y };
  return { parity: 2, year: y - 1 };
};

/** El próximo cuatrimestre a planificar: el que sigue al que está en curso. */
export const nextCuatri = (date: Date = new Date()): PlanStart =>
  cuatriAt(currentCuatri(date), 1);

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

/* ---------- orden nominal del plan de estudios ---------- */

/** Cuatrimestres de adelanto que se toleran respecto de la obligatoria
 *  pendiente más temprana (2 = un año lectivo). */
const ORDEN_VENTANA = 2;

/** Índice nominal 0.. de una obligatoria en su plan ((año-1)·2 + cuatri-1);
 *  null para electivas y materias sin año. */
const nominalIdx = (m: MateriaM): number | null => {
  if (m.tipo !== "obligatoria" || m.anio == null) return null;
  return (m.anio - 1) * 2 + (m.cuatri != null ? m.cuatri - 1 : 0);
};

/** Menor índice nominal entre las materias dadas (null si ninguna lo tiene). */
const anchorOf = (ms: Iterable<MateriaM>): number | null => {
  let min: number | null = null;
  for (const m of ms) {
    const n = nominalIdx(m);
    if (n != null && (min == null || n < min)) min = n;
  }
  return min;
};

/** ¿`m` está demasiado adelantada respecto de `anchor`? (fuera de la ventana) */
const fueraDeOrden = (m: MateriaM, anchor: number | null): boolean => {
  const n = nominalIdx(m);
  return n != null && anchor != null && n > anchor + ORDEN_VENTANA;
};

/* ---------- materias anuales: dos mitades consecutivas ---------- */

/** Créditos de cada mitad (la primera se lleva el redondeo hacia arriba). */
const mitadCred = (m: MateriaM, parte: 1 | 2): number => {
  const c = m.creditos || 0;
  return parte === 1 ? Math.ceil(c / 2) : Math.floor(c / 2);
};

/** La materia tal como se ubica en un cuatrimestre: media carga y el número
 *  de mitad en el nombre y la sigla, para que el plan las distinga. */
const mitadDe = (m: MateriaM, parte: 1 | 2): MateriaM => ({
  ...m,
  creditos: mitadCred(m, parte),
  nombre: `${m.nombre} · ${parte}.ª mitad`,
  abbr: `${m.abbr}${parte === 1 ? "¹" : "²"}`,
  parity: null, // arranca en cualquier cuatrimestre; la 2.ª mitad va al siguiente
});

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

// Puntaje de un conjunto de comisiones (un cuatrimestre): idas a la facultad
// ≫ días distintos ≫ espera entre bloques. Menor es mejor.
const comScore = (coms: (Comision | null | undefined)[]): number => {
  const v = viajesDe(coms);
  return v.viajes * 10000 + v.dias * 100 + Math.min(99, Math.round(v.espera / 15));
};

// Elige la comisión que menos idas a la facultad agrega a lo ya puesto en el
// cuatrimestre (pegada a otra materia en la misma sede = misma ida), luego
// menos días, menos espera y orden original. SIEMPRE prefiere una comisión
// sin superposición con lo elegido; si no hay ninguna, cae a la mejor igual
// (el llamador decide si la ubica o no vía hasFreeCom / `avoid`).
const chooseCom = (
  coms: Comision[],
  placed: PlacedMateria[],
  _avoid: boolean,
  fixedComision?: string,
): Comision | null => {
  if (!coms.length) return null;
  if (fixedComision) {
    const fx = coms.find((c) => c.comision === fixedComision);
    if (fx) return fx;
  }
  const free = coms.filter((c) => !placed.some((x) => x.com && comConflict(x.com, c)));
  const cand = free.length ? free : coms;
  const base = placed.map((x) => x.com);
  let best = cand[0];
  let bestScore = Infinity;
  cand.forEach((c, idx) => {
    const score = comScore([...base, c]) * 10 + Math.min(9, idx);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  });
  return best;
};

/* ---------- reelección de comisiones del cuatrimestre ---------- */

// Cuando ninguna comisión de la candidata queda libre contra lo YA elegido en
// el cuatrimestre, la colocación greedy la descartaba aunque el cuatrimestre
// la admitiera cambiando alguna comisión ya puesta (Derecho tiene ocho; la
// «F» del lunes 16–19 le cerraba la puerta a cualquier electiva del lunes).
// Busca una asignación de comisiones sin superposiciones para las materias
// puestas más la candidata —respetando las comisiones fijadas por el usuario—
// y, entre las factibles, la de menos idas a la facultad (`comScore`).
// Devuelve null si no existe ninguna. El espacio es chico (≤ capMat materias por cuatri) y
// además se acota por nodos visitados.
interface ComAssignment {
  coms: (Comision | null)[]; // una por materia puesta, en el mismo orden
  candCom: Comision | null; // la de la candidata
}

const RESOLVE_BUDGET = 4000;

function resolveComs(
  placed: PlacedMateria[],
  cand: MateriaM,
  fixedCom: Map<string, string> | undefined,
): ComAssignment | null {
  const mats = [...placed.map((x) => x.m), cand];
  const options: (Comision | null)[][] = mats.map((m) => {
    const coms = comsOf(m);
    if (!coms.length) return [null];
    const fx = fixedCom?.get(m.codigo);
    if (fx) {
      const c = coms.find((x) => x.comision === fx);
      if (c) return [c];
    }
    return coms;
  });
  const chosen: (Comision | null)[] = [];
  let best: (Comision | null)[] | null = null;
  let bestScore = Infinity;
  let nodes = 0;
  const rec = (k: number): void => {
    if (nodes++ > RESOLVE_BUDGET) return;
    if (k === mats.length) {
      const sc = comScore(chosen);
      if (sc < bestScore) {
        bestScore = sc;
        best = chosen.slice();
      }
      return;
    }
    for (const c of options[k]) {
      if (c && chosen.some((o) => o && comConflict(o, c))) continue;
      chosen.push(c);
      rec(k + 1);
      chosen.pop();
      if (bestScore <= 10000 + 100) return; // una sola ida: no se puede mejorar
    }
  };
  rec(0);
  if (best === null) return null;
  const asg = best as (Comision | null)[];
  return { coms: asg.slice(0, placed.length), candCom: asg[placed.length] };
}

// Aplica una asignación a las materias ya puestas (misma posición).
const applyComs = (placed: PlacedMateria[], coms: (Comision | null)[]) => {
  placed.forEach((x, k) => {
    x.com = coms[k];
  });
};

/**
 * Comisiones para un conjunto de materias que se cursan JUNTAS (el cuatrimestre
 * en curso): la fijada por el usuario si la hay; si no, la que no se pisa con
 * las demás (reeligiendo si hace falta) y suma menos idas a la facultad. Sin
 * asignación libre de superposiciones, cae a la más compacta igual: es una
 * foto de lo que se cursa, no una optimización.
 */
export function assignComs(
  mats: MateriaM[],
  fixedCom?: Map<string, string>,
): PlacedMateria[] {
  const placed: PlacedMateria[] = [];
  for (const m of mats) {
    const coms = comsOf(m);
    if (!coms.length) {
      placed.push({ m, com: null });
      continue;
    }
    const re = resolveComs(placed, m, fixedCom);
    if (re) {
      applyComs(placed, re.coms);
      placed.push({ m, com: re.candCom });
    } else {
      placed.push({ m, com: chooseCom(coms, placed, false, fixedCom?.get(m.codigo)) });
    }
  }
  return placed;
}

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
      // Una electiva no alarga la cadena crítica de una obligatoria: contar
      // «BDII destraba Grafos» como profundidad de BDII la hacía saltar por
      // delante de otras obligatorias en cuanto se agregaba la electiva al
      // pool, y ese reordenamiento empujaba materias a cuatrimestres nuevos
      // (el recomendador marcaba «alarga» a electivas que entran de sobra).
      // Entre electivas sí se cuenta: sólo ordena a las electivas entre sí.
      if (m.tipo === "electiva" && byId.get(c)?.tipo !== "electiva") continue;
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
  // obligatorias antes que electivas; entre obligatorias, primero las de
  // año/cuatrimestre más temprano del plan (orden nominal) y recién después
  // el camino crítico: así cada cuatrimestre se llena con lo que «toca».
  return (a: MateriaM, b: MateriaM) =>
    (a.tipo === b.tipo ? 0 : a.tipo === "obligatoria" ? -1 : 1) ||
    (nominalIdx(a) ?? 99) - (nominalIdx(b) ?? 99) ||
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
  // Con `seed`, `mats` se colocan SOBRE un plan ya armado (relleno de
  // electivas en el esqueleto de obligatorias): los cuatrimestres conservan lo
  // que tienen y sólo se ocupa el lugar que sobra.
  seed?: { items: PlacedMateria[][]; placedIdx: Record<string, number> },
): PlaceResult {
  const items: PlacedMateria[][] =
    seed?.items ?? Array.from({ length: N }, () => []);
  const placedIdx: Record<string, number> = seed?.placedIdx ?? {};
  let acc = approvedCredits(approved);
  let remaining = mats.slice();
  const prereqDone = (m: MateriaM, i: number) =>
    (m.correlativas || []).every(
      (c) =>
        approved.has(c) || (placedIdx[c] !== undefined && placedIdx[c] < i),
    );

  const credOfCuatri = (it: PlacedMateria[]) =>
    it.reduce((s, x) => s + (x.m.creditos || 0), 0);

  for (let i = 0; i < N && remaining.length; i++) {
    const cu = cuatriAt(PL.start, i);
    const place = (m: MateriaM, com?: Comision | null) => {
      if (esAnual(m.codigo)) {
        // dos mitades: i e i+1; los dependientes se cuentan desde la segunda
        for (const parte of [1, 2] as const) {
          const j = i + parte - 1;
          if (j >= N) break;
          const mm = mitadDe(m, parte);
          const coms = comsOf(m);
          items[j].push({
            m: mm,
            com:
              parte === 1 && com !== undefined
                ? com
                : chooseCom(coms, items[j], PL.avoid, fixedCom?.get(m.codigo)),
            parte,
          });
          placedIdx[m.codigo] = j;
        }
        return;
      }
      const coms = comsOf(m);
      items[i].push({
        m,
        com:
          com !== undefined
            ? com
            : chooseCom(coms, items[i], PL.avoid, fixedCom?.get(m.codigo)),
      });
      placedIdx[m.codigo] = i;
    };
    /** ¿Entra la segunda mitad de una anual en i+1? (cap de materias y de
     *  créditos del cuatrimestre siguiente, que no esté finalizado). */
    const cabeSegundaMitad = (m: MateriaM): boolean => {
      const j = i + 1;
      if (j >= N || PL.lockedIdx.has(j)) return false;
      if (items[j].length >= capMat(PL, j)) return false;
      const add = mitadCred(m, 2);
      return items[j].length === 0 || credOfCuatri(items[j]) + add <= capCred(PL, j);
    };
    // materias fijadas a este cuatrimestre van sí o sí
    remaining
      .filter((m) => PL.fixed.get(m.codigo) === i)
      .forEach((m) => place(m));
    remaining = remaining.filter((m) => placedIdx[m.codigo] === undefined);

    // cuatrimestre finalizado (lockeado): sólo lo ya pineado vía `fixed` vive
    // acá; no se rellena con materias nuevas.
    if (!PL.lockedIdx.has(i)) {
      const feasibles = remaining
        .filter((m) => {
          const fx = PL.fixed.get(m.codigo);
          if (fx !== undefined && fx !== null && fx !== i) return false;
          // las anuales arrancan en cualquier cuatrimestre
          if (!esAnual(m.codigo) && m.parity !== null && m.parity !== cu.parity) return false;
          if ((m.creditosReq || 0) > acc) return false;
          return prereqDone(m, i);
        })
        .sort(order);
      // Orden del plan: la obligatoria pendiente más temprana marca hasta
      // dónde se puede adelantar en este cuatrimestre (ORDEN_VENTANA). Si con
      // esa ventana no entra NINGUNA, se abre de a un año hasta que algo
      // entre: preferir el orden nunca deja un cuatrimestre vacío.
      const anchor = anchorOf(remaining.filter((m) => PL.fixed.get(m.codigo) == null));
      let cand = feasibles;
      if (anchor != null) {
        for (let w = ORDEN_VENTANA; ; w += 2) {
          const lim = anchor + w;
          cand = feasibles.filter((m) => {
            const n = nominalIdx(m);
            return n == null || n <= lim;
          });
          if (cand.length || !feasibles.some((m) => nominalIdx(m) != null)) break;
        }
      }

      const hardMat = capMat(PL, i);
      const hardCred = capCred(PL, i);

      for (const m of cand) {
        if (items[i].length >= hardMat) break;
        const cred = credOfCuatri(items[i]);
        const anual = esAnual(m.codigo);
        const add = anual ? mitadCred(m, 1) : m.creditos || 0;
        if (items[i].length > 0 && cred + add > hardCred) continue;
        if (anual && !cabeSegundaMitad(m)) continue;
        const coms = comsOf(m);
        // en modo avoid, no la ubico si no hay comisión sin superposición…
        if (PL.avoid && coms.length && !hasFreeCom(coms, items[i])) {
          // …salvo que el cuatrimestre entero admita otra combinación de
          // comisiones (reelección) que la deje entrar.
          const re = resolveComs(items[i], m, fixedCom);
          if (!re) continue;
          applyComs(items[i], re.coms);
          place(m, re.candCom);
          continue;
        }
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
        if (it.parte) continue; // mitad de una anual: se queda con su par
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
          // orden del plan: no adelantar a un cuatri cuyas obligatorias son de
          // años muy anteriores (mezclaría 1.º con 5.º)
          if (fueraDeOrden(it.m, anchorOf(items[j].map((x) => x.m)))) continue;
          const comsM = comsOf(it.m);
          let comJ = it.com;
          let reComs: (Comision | null)[] | null = null;
          if (comsM.length) {
            let cJ: Comision | null;
            if (PL.avoid && !hasFreeCom(comsM, items[j])) {
              // ninguna comisión libre contra lo elegido: probar reeligiendo
              // las comisiones del cuatrimestre destino.
              const re = resolveComs(items[j], it.m, fixedCom);
              if (!re) continue;
              reComs = re.coms;
              cJ = re.candCom;
            } else {
              cJ = chooseCom(
                comsM,
                items[j],
                PL.avoid,
                fixedCom?.get(it.m.codigo),
              );
            }
            if (opts.noNewDays) {
              const before = usedDaysOf(items[j]).size;
              const after = new Set<string>();
              (reComs ?? items[j].map((x) => x.com)).forEach(
                (c) => c && comDays(c).forEach((d) => after.add(d)),
              );
              if (cJ) comDays(cJ).forEach((d) => after.add(d));
              if (after.size > before) continue; // sumaría un día de campus nuevo
            }
            comJ = cJ;
          }
          if (reComs) applyComs(items[j], reComs);
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
          if (x.parte) return false; // mitad de una anual: se queda con su par
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
          // orden del plan: ni adelantarla a un cuatri de años muy anteriores
          // ni meter en i… (j > i) una materia muy posterior a lo que hay en j
          if (fueraDeOrden(it.m, anchorOf(items[j].map((x) => x.m)))) continue;
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

/* ---------- colocación base: mezclada vs. esqueleto + relleno ---------- */

interface BaseResult extends PlaceResult {
  moved: number;
}

const usedCuatris = (items: PlacedMateria[][]) =>
  items.filter((it) => it.length).length;

// Último cuatrimestre con materias: la fecha de egreso del plan.
const lastCuatri = (items: PlacedMateria[][]) => {
  let last = -1;
  items.forEach((it, i) => {
    if (it.length) last = i;
  });
  return last;
};

// Colocación + compactación de `mats` (con las opciones de compactación del
// método), opcionalmente sobre un plan semilla.
function placeAndCompact(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  N: number,
  opts: CompactOpts,
  seed?: { items: PlacedMateria[][]; placedIdx: Record<string, number> },
): BaseResult {
  const order = buildCriticalOrder(mats);
  const r = placeMats(PL, approved, fixedCom, mats, order, N, seed);
  const moved = compact(PL, approved, fixedCom, r.items, r.placedIdx, N, opts);
  return { ...r, moved };
}

// Dos colocaciones, y se queda con la mejor:
//  - M (mezclada): todo el pool junto, el comportamiento histórico. Las
//    electivas compiten por el lugar con las obligatorias.
//  - F (esqueleto + relleno): primero las obligatorias y lo fijado a un
//    cuatrimestre —el esqueleto, compactado—, y después las electivas ocupan el
//    lugar que sobra; sólo abren cuatrimestres nuevos si no hay lugar.
// M puede ganar cuando una electiva temprana suma los créditos que destraban
// una obligatoria (créditos requeridos). Pero en M una electiva colocada
// temprano también podía quedarse con el hueco al que la compactación iba a
// adelantar una obligatoria, y el plan se alargaba un cuatrimestre por una
// electiva que entraba de sobra en otro lado: el recomendador la marcaba
// «alarga». Criterio: más materias ubicadas › egreso más temprano (último
// cuatrimestre usado) › menos cuatrimestres con materias › F (a igualdad, la
// que no reordena las obligatorias al agregar una electiva).
function basePlacement(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  N: number,
  opts: CompactOpts = {},
): BaseResult {
  const mixed = placeAndCompact(PL, approved, fixedCom, mats, N, opts);

  const isFilling = (m: MateriaM) => {
    const fx = PL.fixed.get(m.codigo);
    return m.tipo === "electiva" && (fx === undefined || fx === null);
  };
  const skeleton = mats.filter((m) => !isFilling(m));
  const filling = mats.filter(isFilling);
  if (!filling.length) return mixed;

  const bone = placeAndCompact(PL, approved, fixedCom, skeleton, N, opts);
  const full = placeAndCompact(PL, approved, fixedCom, filling, N, opts, {
    items: bone.items,
    placedIdx: bone.placedIdx,
  });
  const layered: BaseResult = {
    items: full.items,
    placedIdx: full.placedIdx,
    remaining: [...bone.remaining, ...full.remaining],
    moved: bone.moved + full.moved,
  };

  if (layered.remaining.length !== mixed.remaining.length)
    return layered.remaining.length < mixed.remaining.length ? layered : mixed;
  const lastL = lastCuatri(layered.items);
  const lastM = lastCuatri(mixed.items);
  if (lastL !== lastM) return lastL < lastM ? layered : mixed;
  return usedCuatris(layered.items) <= usedCuatris(mixed.items)
    ? layered
    : mixed;
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

  const N = 14;

  let items: PlacedMateria[][];
  let placedIdx: Record<string, number>;
  let remaining: MateriaM[];
  let moved = 0;

  const method: OptMethod = PL.method ?? "cuatris";

  if (method === "dias") {
    // misma colocación base que "cuatris" (chooseCom ya minimiza días nuevos
    // en cada elección); la compactación sólo adelanta una materia si eso no
    // agrega un día de campus nuevo al cuatri destino, así que nunca puede
    // empeorar el total de días respecto de la colocación base.
    const r = basePlacement(PL, approved, fixedCom, mats, N, {
      noNewDays: true,
    });
    items = r.items;
    placedIdx = r.placedIdx;
    remaining = r.remaining;
    moved = r.moved;
  } else if (method === "balance") {
    // fase 1: corremos "cuatris" completo (colocación + compactación) para
    // obtener una solución 100% factible con la cantidad mínima de
    // cuatrimestres usados U (todas las materias del pool ubicadas, salvo
    // las que "cuatris" tampoco podría ubicar).
    const base = basePlacement(PL, approved, fixedCom, mats, N);
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
    // "cuatris" (default).
    const r = basePlacement(PL, approved, fixedCom, mats, N);
    items = r.items;
    placedIdx = r.placedIdx;
    remaining = r.remaining;
    moved = r.moved;
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
  return [...new Set((items[0] ?? []).map((x) => x.m.codigo))];
}
