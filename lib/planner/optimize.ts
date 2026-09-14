// Optimizador del plan de cursada.
// Tres estrategias elegibles (`PL.method`), todas con la MISMA invariante de
// factibilidad: nunca ubicar una materia violando correlativas, paridad,
// créditosReq, los caps por cuatrimestre, ni (en modo `avoid`) superposición
// horaria.
//
// OBJETIVO PRIMARIO (los tres métodos): la fecha de egreso, o sea el ÚLTIMO
// cuatrimestre con materias. Ningún método la sacrifica: «menos días» y «carga
// pareja» son criterios secundarios entre planes que terminan igual.
//
//  - "cuatris" (default): minimizar la cantidad de cuatrimestres.
//      Búsqueda en cartera (`searchPlacement`): se prueban varias
//      colocaciones y se elige la mejor por un vector lexicográfico
//      (materias sin ubicar › egreso › cuatrimestres usados › orden del plan
//      de estudios › idas a la facultad › días). Colocaciones:
//      1. NOMINAL: obligatorias en el orden del plan de estudios (año y
//         cuatrimestre), con la ventana ORDEN_VENTANA; entre iguales, camino
//         crítico y FFD por créditos. Es el plan «natural».
//      2. HOLGURA: prioridad por menor `latestStart` (el último cuatrimestre
//         en el que la materia puede arrancar sin correr la fecha de egreso,
//         calculado hacia atrás por dependientes, con paridad y anuales).
//         Sin ventana: una materia de 4.º con holgura cero entra en 2.º si
//         eso acorta el plan. Atrapa lo que la nominal no ve: requisitos de
//         créditos que dejan una sola ventana (94.23 pide 168 créditos y es
//         del 2.º cuatrimestre), materias con una sola comisión, etc.
//      3. REINICIOS: si ninguna alcanza la cota inferior (`lowerBoundLast`:
//         ASAP sin topes + capacidad), hasta SEARCH_RESTARTS colocaciones
//         más con la prioridad de holgura perturbada (ruido determinista con
//         semilla fija: mismo input, mismo plan). Corta en cuanto una toca la
//         cota. En modo `avoid` esto es lo que resuelve los bloqueos por
//         superposición: probar otro subconjunto en el cuatrimestre que
//         trababa a una materia crítica.
//      Cada colocación termina con `compact` (adelantar materias a
//      cuatrimestres previos de igual paridad con lugar). Empaquetado FFD por
//      créditos dentro de cada cuatrimestre; selección de comisión que
//      minimiza las IDAS a la facultad (`viajesDe`) y siempre prefiere una
//      comisión sin superposición si existe (con `avoid` apagado, la materia
//      entra igual con la menos mala si no hay ninguna libre).
//  - "dias": mismo egreso, menos días de campus por semana. La misma cartera
//      con dos cambios: la compactación sólo adelanta una materia si eso NO
//      agrega un día de campus nuevo al cuatrimestre destino, y el vector de
//      elección pone días e idas antes que cuatrimestres usados y orden.
//  - "balance": mismo egreso, carga pareja. Toma el plan de "cuatris" y lo
//      rebalancea: mueve materias del cuatrimestre más cargado al menos
//      cargado (misma paridad) mientras eso reduzca el desbalance, sin crear
//      cuatrimestres nuevos ni dejar materias sin ubicar.
//
// «EVITAR SUPERPOSICIONES» APAGADO no es ignorar el horario: es tolerar
// choques SOLO si acortan el plan. El plan sin choques (la misma búsqueda con
// `avoid`) es candidato y gana si termina igual; los choques cuentan en el
// vector justo después del egreso; compactar y rebalancear nunca crean uno; y
// `repairOverlaps` mueve cada materia que se pisa a otro cuatrimestre del
// mismo rango con comisión libre. `PlanResult.delayed` explica, con `avoid`
// encendido, qué materia queda más tarde sólo por el horario y con quién se
// pisa (la UI ofrece el plan alternativo con sus choques).
//
// ESQUELETO + RELLENO: con electivas en el pool, la búsqueda cara corre sobre
// el ESQUELETO (obligatorias y lo fijado a un cuatrimestre) y se memoiza por
// firma del input; las electivas rellenan después el lugar que sobra (sólo
// abren cuatrimestres nuevos si no hay lugar), y las obligatorias que el
// esqueleto no pudo ubicar (créditos requeridos que sólo se juntan con
// electivas) se reintentan sobre el plan relleno. En paralelo se arma la
// colocación MEZCLADA (todo el pool junto, sin reinicios) y se queda la mejor
// por el mismo vector. La memoización es lo que mantiene barato al
// recomendador de electivas, que simula el plan una vez por candidata (~90
// corridas con el mismo esqueleto).
//
// Los caps por cuatrimestre (`PL.capCredByIdx` / `PL.capMatByIdx`, con
// fallback a `PL.maxCred` / `PL.maxMat`) se respetan como tope DURO en los
// tres métodos, tanto al colocar como al compactar.
//
// ORDEN DEL PLAN DE ESTUDIOS (preferencia, no invariante): en la colocación
// nominal las obligatorias se colocan en el orden de su plan (año/cuatrimestre)
// y en cada cuatrimestre sólo entran las que están a lo sumo ORDEN_VENTANA
// cuatrimestres por delante de la obligatoria pendiente más temprana. Así una
// materia de 5.º no se mezcla con una de 1.º aunque correlativas y créditos lo
// permitan. Como la elección final es por egreso primero y orden después, la
// ventana nunca cuesta un cuatrimestre: si mezclar acorta el plan, se mezcla
// (`orderDev` mide cuánto). Las electivas no tienen orden nominal y no
// participan; lo fijado a mano tampoco.
//
// Materias ANUALES (Proyecto Final: 12 cr en un año continuo): se ubican como
// DOS MITADES en cuatrimestres consecutivos (i, i+1), cada una con la mitad de
// los créditos y contando como una materia en cada uno; las dos tienen que
// entrar en sus caps. Sin paridad (arrancan en cualquier cuatrimestre). Sus
// dependientes van después de la segunda mitad. Las mitades no se compactan
// ni se rebalancean sueltas: la colocación ya las deja en el primer par de
// cuatrimestres donde caben.
import { PLAN, byId, esAnual, onPlanChange } from "./model";
import { MAX_PLAN_CUATRIS } from "./consts";
import { approvedCredits } from "./metrics";
import { comConflict, isAsync, slotsConflict, toMin, viajesDe } from "./time";
import type {
  Comision,
  MateriaM,
  PlacedMateria,
  PlanResult,
  PlanStart,
  PlanState,
  OptMethod,
  UnplacedReason,
  DelayedBy,
  Slot,
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
    objetivo:
      "Terminar lo antes posible: cada cuatrimestre lleva lo máximo que permiten los topes y el orden del plan.",
  },
  {
    key: "dias",
    label: "Menos días",
    short: "concentrar la cursada",
    objetivo:
      "Misma fecha de egreso, pero con la cursada concentrada en menos días de campus por semana.",
  },
  {
    key: "balance",
    label: "Carga pareja",
    short: "equilibrar cada cuatri",
    objetivo:
      "Misma fecha de egreso, con los créditos repartidos parejo entre cuatrimestres.",
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

// `comConflict` es el cuello de botella de la búsqueda (decenas de miles de
// pares por corrida, siempre los mismos objetos de `byId`): se memoiza por
// identidad de las dos comisiones. WeakMap: al cargar otro plan, los objetos
// viejos se van con su caché.
const conflictCache = new WeakMap<Comision, WeakMap<Comision, boolean>>();
const conflicts = (a: Comision, b: Comision): boolean => {
  let ma = conflictCache.get(a);
  if (!ma) {
    ma = new WeakMap();
    conflictCache.set(a, ma);
  }
  const hit = ma.get(b);
  if (hit !== undefined) return hit;
  const v = comConflict(a, b);
  ma.set(b, v);
  let mb = conflictCache.get(b);
  if (!mb) {
    mb = new WeakMap();
    conflictCache.set(b, mb);
  }
  mb.set(a, v);
  return v;
};

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
// Con una comisión fijada por el usuario, sólo cuenta esa: si se pisa, la
// materia no entra acá (antes se la daba por libre porque OTRA comisión lo
// estaba, y después `chooseCom` devolvía la fijada pisando a una vecina).
const hasFreeCom = (
  coms: Comision[],
  placed: PlacedMateria[],
  fixedComision?: string,
): boolean => {
  const fx = fixedComision ? coms.filter((c) => c.comision === fixedComision) : [];
  const cand = fx.length ? fx : coms;
  return cand.some((c) => !placed.some((x) => x.com && conflicts(x.com, c)));
};

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
  const free = coms.filter((c) => !placed.some((x) => x.com && conflicts(x.com, c)));
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
      if (c && chosen.some((o) => o && conflicts(o, c))) continue;
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

/* ---------- prioridad por holgura (latestStart) y cota inferior ---------- */

/** Índices de cuatrimestre que puede ocupar `m` (paridad; las anuales y las
 *  materias sin paridad entran en cualquiera). Fijadas: sólo su índice. */
const parityOk = (PL: PlanState, m: MateriaM, i: number): boolean =>
  esAnual(m.codigo) ||
  m.parity === null ||
  m.parity === cuatriAt(PL.start, i).parity;

// Último índice ≤ `upto` donde `m` puede arrancar (paridad); -1 si ninguno.
const latestFit = (PL: PlanState, m: MateriaM, upto: number): number => {
  for (let i = upto; i >= 0; i--) if (parityOk(PL, m, i)) return i;
  return -1;
};

/**
 * `latestStart` de cada materia para una fecha de egreso objetivo `L` (índice
 * del último cuatrimestre): el mayor índice en el que puede arrancar de modo
 * que ella y todos sus dependientes (dentro del pool) terminen a más tardar
 * en L. Se calcula hacia atrás por dependientes; una anual necesita dos
 * cuatrimestres. Puede dar negativo: significa que con ese L la cadena no
 * entra (sigue siendo un orden útil: cuanto más negativo, más urgente).
 */
function latestStarts(
  PL: PlanState,
  mats: MateriaM[],
  L: number,
): Map<string, number> {
  const inPool = new Set(mats.map((m) => m.codigo));
  const dependents = new Map<string, string[]>();
  for (const m of mats) {
    for (const c of m.correlativas || []) {
      if (!inPool.has(c)) continue;
      const arr = dependents.get(c);
      if (arr) arr.push(m.codigo);
      else dependents.set(c, [m.codigo]);
    }
  }
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const ls = (code: string): number => {
    const hit = memo.get(code);
    if (hit !== undefined) return hit;
    const m = byId.get(code);
    if (!m) return L;
    if (visiting.has(code)) return L; // guard anti-ciclo
    visiting.add(code);
    const fx = PL.fixed.get(code);
    let v: number;
    if (fx !== undefined && fx !== null) v = fx;
    else {
      const span = esAnual(code) ? 1 : 0; // la 2.ª mitad ocupa i+1
      let upto = L - span;
      for (const d of dependents.get(code) || []) {
        const ld = ls(d) - 1 - span;
        if (ld < upto) upto = ld;
      }
      v = upto < 0 ? upto : latestFit(PL, m, upto);
    }
    visiting.delete(code);
    memo.set(code, v);
    return v;
  };
  for (const m of mats) ls(m.codigo);
  return memo;
}

/**
 * Orden de colocación por HOLGURA: primero la materia cuyo `latestStart` es
 * menor (la que antes hay que arrancar para no correr el egreso `L`); entre
 * iguales, obligatoria › camino crítico › orden nominal › más créditos (FFD)
 * › mayor requisito de créditos › código. Con `noise`, cada materia suma un
 * desplazamiento aleatorio (reinicios de la búsqueda).
 */
function buildSlackOrder(
  PL: PlanState,
  mats: MateriaM[],
  L: number,
  noise?: Map<string, number>,
): (a: MateriaM, b: MateriaM) => number {
  const ls = latestStarts(PL, mats, L);
  const critical = buildCriticalOrder(mats);
  const key = (m: MateriaM) => (ls.get(m.codigo) ?? L) + (noise?.get(m.codigo) ?? 0);
  return (a, b) => key(a) - key(b) || critical(a, b);
}

/** Generador determinista (LCG): la búsqueda con reinicios da siempre el
 *  mismo plan para el mismo input. */
const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

interface Bound {
  /** cota inferior del último cuatrimestre usado (-1 sin materias). */
  last: number;
  /** materias que NO entran en ningún cuatrimestre del horizonte (correlativa
   *  fuera del plan, créditos requeridos inalcanzables…): quedan sin ubicar
   *  haga lo que haga la búsqueda. */
  unplaceable: number;
}

/**
 * Cota inferior de la fecha de egreso. ASAP sin topes: el índice más temprano
 * de cada materia dado el de sus correlativas, su paridad, los cuatrimestres
 * finalizados y su requisito de créditos contra una acumulación OPTIMISTA (todo
 * lo que puede estar antes, está antes); punto fijo monótono. Más la cota de
 * capacidad (créditos y materias del pool contra los topes de los primeros
 * cuatrimestres). Ningún plan factible termina antes.
 */
function lowerBoundLast(
  PL: PlanState,
  approved: Set<string>,
  mats: MateriaM[],
  N: number,
): Bound {
  const inPool = new Map(mats.map((m) => [m.codigo, m]));
  const earliest = new Map<string, number>();
  for (const m of mats) earliest.set(m.codigo, 0);
  const base = approvedCredits(approved);
  const creditsBefore = (i: number): number => {
    let s = base;
    for (const m of mats) {
      const e = earliest.get(m.codigo)!;
      if (e < i && e < N) s += m.creditos || 0;
    }
    return s;
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const m of mats) {
      const fx = PL.fixed.get(m.codigo);
      let e: number;
      if (fx !== undefined && fx !== null) e = fx;
      else {
        let lo = 0;
        for (const c of m.correlativas || []) {
          if (approved.has(c)) continue;
          const cm = inPool.get(c);
          if (!cm) {
            lo = N; // correlativa fuera del pool: no entra nunca
            break;
          }
          const ec = earliest.get(c)! + 1 + (esAnual(c) ? 1 : 0);
          if (ec > lo) lo = ec;
        }
        e = lo;
        for (; e < N; e++) {
          if (PL.lockedIdx.has(e)) continue;
          if (!parityOk(PL, m, e)) continue;
          if ((m.creditosReq || 0) > creditsBefore(e)) continue;
          break;
        }
      }
      if (e !== earliest.get(m.codigo)) {
        earliest.set(m.codigo, e);
        changed = true;
      }
    }
  }
  let last = -1;
  let unplaceable = 0;
  // demanda libre (no fijada) contra la capacidad que dejan las fijadas
  let cred = 0;
  let count = 0;
  let maxCredMateria = 0;
  const fixedCred: number[] = Array(N).fill(0);
  const fixedCount: number[] = Array(N).fill(0);
  for (const m of mats) {
    const e = earliest.get(m.codigo)!;
    const anual = esAnual(m.codigo);
    if (e >= N || (anual && e + 1 >= N)) {
      unplaceable++;
      continue;
    }
    const end = e + (anual ? 1 : 0);
    if (end > last) last = end;
    const fx = PL.fixed.get(m.codigo);
    if (fx !== undefined && fx !== null) {
      fixedCred[fx] += anual ? mitadCred(m, 1) : m.creditos || 0;
      fixedCount[fx] += 1;
      if (anual && fx + 1 < N) {
        fixedCred[fx + 1] += mitadCred(m, 2);
        fixedCount[fx + 1] += 1;
      }
      continue;
    }
    cred += m.creditos || 0;
    count += anual ? 2 : 1;
    const c1 = anual ? mitadCred(m, 1) : m.creditos || 0;
    if (c1 > maxCredMateria) maxCredMateria = c1;
  }
  // capacidad: el menor L tal que los topes de 0..L (sin los finalizados, y
  // descontando lo fijado) alcanzan para los créditos y las materias libres.
  // La parte de créditos sólo vale si ninguna materia supera por sí sola un
  // tope (una sola puede exceder el cap cuando va sola en el cuatrimestre).
  let minCap = Infinity;
  for (let i = 0; i < N; i++) if (!PL.lockedIdx.has(i)) minCap = Math.min(minCap, capCred(PL, i));
  let accC = 0;
  let accM = 0;
  for (let L = 0; L < N; L++) {
    if (!PL.lockedIdx.has(L)) {
      accC += Math.max(0, capCred(PL, L) - fixedCred[L]);
      accM += Math.max(0, capMat(PL, L) - fixedCount[L]);
    }
    const okCred = maxCredMateria > minCap || accC >= cred;
    if (okCred && accM >= count) {
      if (count > 0 && L > last) last = L;
      break;
    }
  }
  return { last, unplaceable };
}


/* ---------- colocación (una corrida de la cartera) ---------- */
// Recorre los cuatrimestres en orden y llena cada uno con las materias
// factibles según `order`, respetando los topes, las fijadas, los finalizados
// y (con `avoid`) las superposiciones. `ventana` aplica la preferencia por el
// orden del plan de estudios (ORDEN_VENTANA); la colocación por holgura la
// apaga. Lo que cambia entre métodos es lo que se hace DESPUÉS de la cartera
// (compactación restringida para "dias", rebalanceo para "balance").

interface PlaceOpts {
  /** respetar la ventana del orden nominal (default: sí). */
  ventana?: boolean;
}

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
  popts: PlaceOpts = {},
): PlaceResult {
  const ventana = popts.ventana !== false;
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
      const anchor = ventana
        ? anchorOf(remaining.filter((m) => PL.fixed.get(m.codigo) == null))
        : null;
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
        if (PL.avoid && coms.length && !hasFreeCom(coms, items[i], fixedCom?.get(m.codigo))) {
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
  // respetar la ventana del orden nominal al adelantar (default: sí).
  ventana?: boolean;
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
          if (
            opts.ventana !== false &&
            fueraDeOrden(it.m, anchorOf(items[j].map((x) => x.m)))
          )
            continue;
          const comsM = comsOf(it.m);
          let comJ = it.com;
          let reComs: (Comision | null)[] | null = null;
          if (comsM.length) {
            let cJ: Comision | null;
            // adelantar nunca crea una superposición (tampoco con `avoid`
            // apagado: los choques sólo se toleran al colocar, donde acortan)
            if (!hasFreeCom(comsM, items[j], fixedCom?.get(it.m.codigo))) {
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
            // emparejar la carga nunca crea una superposición
            if (!hasFreeCom(comsM, items[j], fixedCom?.get(it.m.codigo))) continue;
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


/* ---------- vector de elección entre colocaciones ---------- */

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

// Cuánto se aparta el plan del orden del plan de estudios: por cuatrimestre,
// suma de lo que cada obligatoria se adelanta más allá de ORDEN_VENTANA
// respecto de la más temprana que la acompaña (0 = ningún cuatrimestre mezcla
// años lejanos). Las fijadas a mano no cuentan.
const orderDevOf = (PL: PlanState, items: PlacedMateria[][]): number => {
  let dev = 0;
  for (const it of items) {
    const libres = it.filter((x) => PL.fixed.get(x.m.codigo) == null).map((x) => x.m);
    const anchor = anchorOf(libres);
    if (anchor == null) continue;
    for (const m of libres) {
      const n = nominalIdx(m);
      if (n != null && n > anchor + ORDEN_VENTANA) dev += n - anchor - ORDEN_VENTANA;
    }
  }
  return dev;
};

// Idas a la facultad y días de campus sumados sobre todos los cuatrimestres.
const viajesDiasOf = (items: PlacedMateria[][]): { viajes: number; dias: number } => {
  let viajes = 0;
  let dias = 0;
  for (const it of items) {
    if (!it.length) continue;
    const v = viajesDe(it.map((x) => x.com));
    viajes += v.viajes;
    dias += v.dias;
  }
  return { viajes, dias };
};

// Pares de materias que se pisan en el mismo cuatrimestre (con `avoid`
// apagado, lo que se quiere minimizar después del egreso).
const overlapsOf = (items: PlacedMateria[][]): number => {
  let n = 0;
  for (const it of items)
    for (let p = 0; p < it.length; p++)
      for (let q = p + 1; q < it.length; q++)
        if (it[p].com && it[q].com && conflicts(it[p].com!, it[q].com!)) n++;
  return n;
};

/** Vector lexicográfico (menor es mejor) con el que se comparan dos
 *  colocaciones del mismo pool. El egreso va siempre primero; después, las
 *  superposiciones (0 por construcción con `avoid`; con `avoid` apagado son
 *  lo que se tolera SOLO si acorta el plan). */
function scoreOf(PL: PlanState, method: OptMethod, r: PlaceResult): number[] {
  const last = lastCuatri(r.items);
  const used = usedCuatris(r.items);
  const dev = orderDevOf(PL, r.items);
  const overlaps = overlapsOf(r.items);
  const { viajes, dias } = viajesDiasOf(r.items);
  return method === "dias"
    ? [r.remaining.length, last, overlaps, dias, viajes, used, dev]
    : [r.remaining.length, last, overlaps, used, dev, viajes, dias];
}

const betterScore = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
};

/* ---------- búsqueda en cartera (esqueleto o pool entero) ---------- */

/** Reinicios con prioridad perturbada cuando ninguna colocación determinista
 *  toca la cota inferior. Determinista (semilla fija). El esqueleto se memoiza,
 *  así que su búsqueda se paga una vez por cambio de estado; la mezclada (pool
 *  con electivas) corre en cada simulación del recomendador y lleva menos. */
const SEARCH_RESTARTS = 48;
const MIXED_RESTARTS = 8;

/** Horizonte de cuatrimestres: 14 (siete años) y, si con eso quedan materias
 *  ubicables afuera (topes muy bajos, muchas fijadas), se extiende hasta
 *  MAX_PLAN_CUATRIS (el tope que también usan los selects y el arrastre). */
const HORIZON = 14;
const HORIZON_MAX = MAX_PLAN_CUATRIS;

function placeAndCompact(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  order: (a: MateriaM, b: MateriaM) => number,
  N: number,
  opts: CompactOpts,
  ventana: boolean,
  seed?: { items: PlacedMateria[][]; placedIdx: Record<string, number> },
): BaseResult {
  const r = placeMats(PL, approved, fixedCom, mats, order, N, seed, { ventana });
  const moved = compact(PL, approved, fixedCom, r.items, r.placedIdx, N, {
    ...opts,
    ventana,
  });
  if (!PL.avoid) repairOverlaps(PL, approved, fixedCom, r.items, r.placedIdx, N);
  return { ...r, moved };
}

/* ---------- reparación de superposiciones (avoid apagado) ---------- */
// «Evitar superposiciones» apagado quiere decir tolerarlas SI acortan el plan,
// no ignorar el horario: después de colocar y compactar, cada materia que se
// pisa con otra del mismo cuatrimestre se intenta mover a otro cuatrimestre
// del mismo rango (sin correr el egreso) donde tenga una comisión libre y siga
// cumpliendo paridad, correlativas, dependientes, créditos y topes. Cada
// movimiento baja el total de pares en conflicto, así que termina.
function repairOverlaps(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  items: PlacedMateria[][],
  placedIdx: Record<string, number>,
  N: number,
): number {
  const credOfCuatri = (it: PlacedMateria[]) =>
    it.reduce((s, x) => s + (x.m.creditos || 0), 0);
  const last = lastCuatri(items);
  if (last < 1) return 0;
  const conflictsAt = (x: PlacedMateria, it: PlacedMateria[]) =>
    x.com ? it.filter((y) => y !== x && y.com && conflicts(y.com, x.com!)).length : 0;
  const dependentsOf = new Map<string, string[]>();
  for (let i = 0; i <= last; i++)
    for (const { m } of items[i])
      for (const c of m.correlativas || []) {
        const arr = dependentsOf.get(c);
        if (arr) arr.push(m.codigo);
        else dependentsOf.set(c, [m.codigo]);
      }
  let moved = 0;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    const accB: number[] = [];
    let a2 = approvedCredits(approved);
    for (let i = 0; i < N; i++) {
      accB[i] = a2;
      a2 += credOfCuatri(items[i]);
    }
    findMove: for (let i = 0; i <= last; i++) {
      if (PL.lockedIdx.has(i)) continue;
      for (const it of items[i]) {
        if (!it.com || it.parte || esAnual(it.m.codigo)) continue;
        if (PL.fixed.get(it.m.codigo) != null) continue;
        const here = conflictsAt(it, items[i]);
        if (!here) continue;
        const coms = comsOf(it.m);
        const fx = fixedCom?.get(it.m.codigo);
        for (let j = 0; j <= last; j++) {
          if (j === i || PL.lockedIdx.has(j) || !parityOk(PL, it.m, j)) continue;
          if (items[j].length >= capMat(PL, j)) continue;
          if (items[j].length > 0 && credOfCuatri(items[j]) + (it.m.creditos || 0) > capCred(PL, j)) continue;
          if ((it.m.creditosReq || 0) > accB[j]) continue;
          if (
            !(it.m.correlativas || []).every(
              (c) => approved.has(c) || (placedIdx[c] !== undefined && placedIdx[c] < j),
            )
          )
            continue;
          if ((dependentsOf.get(it.m.codigo) || []).some((d) => placedIdx[d] !== undefined && placedIdx[d] <= j)) continue;
          if (!hasFreeCom(coms, items[j], fx)) continue;
          const prevCom: Comision | null = it.com;
          it.com = chooseCom(coms, items[j], true, fx);
          items[i] = items[i].filter((x) => x !== it);
          items[j].push(it);
          placedIdx[it.m.codigo] = j;
          if (!feasible(PL, approved, items, N) || conflictsAt(it, items[j])) {
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

/**
 * Mejor colocación de `mats` sobre cuatrimestres vacíos. Cartera: nominal (con
 * ventana), holgura (sin ventana), holgura con ventana, y reinicios con ruido
 * mientras no se alcance la cota inferior. Con `restarts` = 0 sólo corren las
 * deterministas (colocación mezclada del pool con electivas: no se memoiza y
 * el recomendador la corre una vez por candidata).
 */
function searchPlacement(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  N: number,
  method: OptMethod,
  restarts: number,
): BaseResult {
  const copts: CompactOpts = method === "dias" ? { noNewDays: true } : {};
  const bound = lowerBoundLast(PL, approved, mats, N);
  let best = placeAndCompact(PL, approved, fixedCom, mats, buildCriticalOrder(mats), N, copts, true);
  let bestScore = scoreOf(PL, method, best);
  // en la cota y (con `avoid` apagado) sin choques: no hay nada mejor
  const atBound = (r: BaseResult) =>
    r.remaining.length <= bound.unplaceable &&
    lastCuatri(r.items) <= bound.last &&
    (PL.avoid || overlapsOf(r.items) === 0);
  if (atBound(best)) return best;
  const consider = (r: BaseResult) => {
    const s = scoreOf(PL, method, r);
    if (betterScore(s, bestScore)) {
      best = r;
      bestScore = s;
    }
  };
  if (!PL.avoid) {
    // con «Evitar superposiciones» apagado, el plan SIN choques (la misma
    // búsqueda completa con `avoid`) es candidato: si termina igual, gana —
    // las superposiciones sólo se toleran si acortan el plan.
    const hard: PlanState = { ...PL, avoid: true };
    consider(searchPlacement(hard, approved, fixedCom, mats, N, method, restarts));
    if (atBound(best)) return best;
  }
  const L = Math.max(bound.last, 0);
  consider(placeAndCompact(PL, approved, fixedCom, mats, buildSlackOrder(PL, mats, L), N, copts, false));
  if (atBound(best)) return best;
  consider(placeAndCompact(PL, approved, fixedCom, mats, buildSlackOrder(PL, mats, L), N, copts, true));
  if (atBound(best)) return best;
  const rand = rng(0x5eed);
  for (let r = 0; r < restarts; r++) {
    const noise = new Map<string, number>();
    const w = 0.5 + rand() * 2;
    for (const m of mats) noise.set(m.codigo, rand() * w);
    consider(
      placeAndCompact(PL, approved, fixedCom, mats, buildSlackOrder(PL, mats, L + (r % 2), noise), N, copts, false),
    );
    if (atBound(best)) break;
  }
  return best;
}

/* ---------- memoización del esqueleto ---------- */
// El recomendador simula el plan una vez por electiva candidata con el MISMO
// esqueleto; la búsqueda con reinicios se paga una sola vez. Clave: todo lo que
// determina la colocación del esqueleto (plan activo, aprobadas, materias,
// fijadas, comisiones fijadas, inicio, topes, finalizados, método).

const MEMO_MAX = 8;
const memo = new Map<string, BaseResult>();
// otro plan (carrera): otros objetos en byId, la caché no sirve
onPlanChange(() => memo.clear());

const sortedEntries = (m: Map<string, unknown> | Map<number, unknown>): string =>
  [...m.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(",");

function memoKey(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  method: OptMethod,
  N: number,
): string {
  const codes = mats.map((m) => m.codigo).sort();
  const fc = fixedCom
    ? [...fixedCom.entries()]
        .filter(([k]) => byId.has(k))
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join(",")
    : "";
  return [
    PLAN.planId ?? "",
    PLAN.carrera?.codigo ?? "",
    method,
    N,
    PL.start.parity + "-" + PL.start.year,
    PL.maxCred,
    PL.maxMat,
    PL.avoid ? 1 : 0,
    sortedEntries(PL.capCredByIdx),
    sortedEntries(PL.capMatByIdx),
    [...PL.lockedIdx].sort().join(","),
    sortedEntries(PL.fixed),
    fc,
    [...approved].sort().join(","),
    codes.join(","),
  ].join("|");
}

const cloneResult = (r: BaseResult): BaseResult => ({
  items: r.items.map((it) => it.map((x) => ({ ...x }))),
  placedIdx: { ...r.placedIdx },
  remaining: r.remaining.slice(),
  moved: r.moved,
});

function searchSkeleton(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  N: number,
  method: OptMethod,
): BaseResult {
  const key = memoKey(PL, approved, fixedCom, mats, method, N);
  const hit = memo.get(key);
  if (hit) {
    // refrescar el orden LRU
    memo.delete(key);
    memo.set(key, hit);
    return cloneResult(hit);
  }
  const r = searchPlacement(PL, approved, fixedCom, mats, N, method, SEARCH_RESTARTS);
  memo.set(key, cloneResult(r));
  if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string);
  return r;
}

/* ---------- colocación base: esqueleto + relleno vs. mezclada ---------- */

// Dos colocaciones, y se queda con la mejor por `scoreOf`:
//  - F (esqueleto + relleno): primero las obligatorias y lo fijado a un
//    cuatrimestre —el esqueleto, con la búsqueda completa y memoizado—, después
//    las electivas ocupan el lugar que sobra (sólo abren cuatrimestres nuevos
//    si no hay lugar), y por último se reintentan las obligatorias que el
//    esqueleto no pudo ubicar (créditos requeridos que recién se juntan con
//    las electivas).
//  - M (mezclada): todo el pool junto, sólo las colocaciones deterministas.
//    Puede ganar cuando una electiva temprana suma los créditos que destraban
//    una obligatoria antes de lo que F la ubica.
// A igualdad gana F: no reordena las obligatorias al agregar una electiva (en
// M una electiva colocada temprano podía quedarse con el hueco al que la
// compactación iba a adelantar una obligatoria, y el recomendador la marcaba
// «alarga»).
function basePlacement(
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string> | undefined,
  mats: MateriaM[],
  N: number,
  method: OptMethod,
  quick: boolean,
): BaseResult {
  const isFilling = (m: MateriaM) => {
    const fx = PL.fixed.get(m.codigo);
    return m.tipo === "electiva" && (fx === undefined || fx === null);
  };
  const skeleton = mats.filter((m) => !isFilling(m));
  const filling = mats.filter(isFilling);
  const bone = searchSkeleton(PL, approved, fixedCom, skeleton, N, method);
  if (!filling.length) return bone;

  const copts: CompactOpts = method === "dias" ? { noNewDays: true } : {};
  // Relleno sobre una copia del esqueleto, con varios órdenes de electivas
  // (son pocas: cada relleno es barato); después se reintentan las
  // obligatorias que el esqueleto dejó afuera. Gana el mejor por `scoreOf`.
  const fillOrders: ((a: MateriaM, b: MateriaM) => number)[] = [
    buildCriticalOrder(filling),
    (a, b) => (b.creditos || 0) - (a.creditos || 0) || a.codigo.localeCompare(b.codigo),
    (a, b) => (a.creditos || 0) - (b.creditos || 0) || a.codigo.localeCompare(b.codigo),
    (a, b) => comsOf(a).length - comsOf(b).length || a.codigo.localeCompare(b.codigo),
  ];
  let layered: BaseResult | null = null;
  let layeredScore: number[] = [];
  for (const order of fillOrders) {
    const seed = cloneResult(bone);
    const full = placeAndCompact(PL, approved, fixedCom, filling, order, N, copts, true, {
      items: seed.items,
      placedIdx: seed.placedIdx,
    });
    let cand: BaseResult = {
      items: full.items,
      placedIdx: full.placedIdx,
      remaining: [...bone.remaining, ...full.remaining],
      moved: bone.moved + full.moved,
    };
    if (bone.remaining.length) {
      const again = placeAndCompact(
        PL,
        approved,
        fixedCom,
        bone.remaining,
        buildCriticalOrder(bone.remaining),
        N,
        copts,
        true,
        { items: full.items, placedIdx: full.placedIdx },
      );
      cand = {
        items: again.items,
        placedIdx: again.placedIdx,
        remaining: [...again.remaining, ...full.remaining],
        moved: cand.moved + again.moved,
      };
    }
    const sc = scoreOf(PL, method, cand);
    if (!layered || betterScore(sc, layeredScore)) {
      layered = cand;
      layeredScore = sc;
    }
  }
  layered = layered as BaseResult;

  // Si el relleno ya toca la cota, la mezclada no puede terminar antes: se
  // ahorra (es lo que más cuesta en el recomendador). En modo `quick` corre
  // sin reinicios.
  const bound = lowerBoundLast(PL, approved, mats, N);
  if (
    layered.remaining.length <= bound.unplaceable &&
    lastCuatri(layered.items) <= bound.last &&
    (PL.avoid || overlapsOf(layered.items) === 0)
  )
    return layered;
  const mixed = searchPlacement(PL, approved, fixedCom, mats, N, method, quick ? 0 : MIXED_RESTARTS);
  return betterScore(scoreOf(PL, method, mixed), scoreOf(PL, method, layered)) ? mixed : layered;
}

/* ---------- por qué quedó afuera ---------- */

/** Motivo de cada materia sin ubicar (para que el plan diga qué falta en vez
 *  de un «no entra» genérico). Cascada: si su correlativa está en el pool
 *  pero tampoco entró, la culpa es de la correlativa. */
function explainUnplaced(
  PL: PlanState,
  approved: Set<string>,
  mats: MateriaM[],
  unplaced: MateriaM[],
): Map<string, UnplacedReason> {
  const why = new Map<string, UnplacedReason>();
  const inPool = new Set(mats.map((m) => m.codigo));
  const out = new Set(unplaced.map((m) => m.codigo));
  const total =
    approvedCredits(approved) + mats.reduce((s, m) => s + (m.creditos || 0), 0);
  for (const m of unplaced) {
    const codes = (m.correlativas || []).filter(
      (c) => !approved.has(c) && (!inPool.has(c) || out.has(c)),
    );
    // lo máximo que puede haber antes de ella: aprobadas más todo el pool
    // (menos ella misma); si ni así alcanza, hacen falta más materias
    const max = total - (m.creditos || 0);
    if (codes.length) why.set(m.codigo, { kind: "correlativa", codes });
    else if ((m.creditosReq || 0) > max)
      why.set(m.codigo, { kind: "creditos", req: m.creditosReq || 0, max });
    else why.set(m.codigo, { kind: "sinLugar" });
  }
  return why;
}

/* ---------- retrasadas por superposición ---------- */

/** Materias que están más tarde de lo que podrían SOLO por el horario: para
 *  cada una, los cuatrimestres anteriores donde entraba por paridad,
 *  correlativas, créditos y topes pero ninguna de sus comisiones queda libre
 *  contra lo ya puesto. Es lo que el plan tiene que poder explicar cuando
 *  termina después de la cota («Cuántica se pisa con Redes y con SIA»). Con
 *  `avoid` apagado no hay retrasos de este tipo. */
function explainDelays(
  PL: PlanState,
  approved: Set<string>,
  items: PlacedMateria[][],
  accBefore: number[],
): Map<string, DelayedBy[]> {
  const out = new Map<string, DelayedBy[]>();
  if (!PL.avoid) return out;
  const idxOf: Record<string, number> = {};
  items.forEach((it, i) => it.forEach((x) => (idxOf[x.m.codigo] = i)));
  items.forEach((it, i) => {
    for (const x of it) {
      const m = x.m;
      if (x.parte || esAnual(m.codigo)) continue; // las anuales van en par
      if (PL.fixed.get(m.codigo) != null) continue;
      const coms = comsOf(m);
      if (!coms.length) continue;
      const by: DelayedBy[] = [];
      for (let j = 0; j < i; j++) {
        if (PL.lockedIdx.has(j) || !parityOk(PL, m, j)) continue;
        if ((m.creditosReq || 0) > accBefore[j]) continue;
        if (
          !(m.correlativas || []).every(
            (c) => approved.has(c) || (idxOf[c] !== undefined && idxOf[c] < j),
          )
        )
          continue;
        // (sin mirar los topes: si el cuatrimestre está lleno es porque otras
        // ocuparon el lugar que esta no pudo usar por el horario)
        // si alguna comisión queda libre, no es el horario lo que la frena
        if (hasFreeCom(coms, items[j])) continue;
        const codes = items[j]
          .filter((y) => y.com && coms.some((c) => conflicts(y.com!, c)))
          .map((y) => y.m.codigo);
        by.push({ idx: j, codes: [...new Set(codes)] });
      }
      if (by.length) out.set(m.codigo, by);
    }
  });
  return out;
}

/** Superposiciones que quedaron en un plan (con `avoid` apagado): por
 *  cuatrimestre, cada par de materias cuyas comisiones se pisan y cuándo
 *  («jue 18:00–19:00»; con cambio de sede sin margen, «jue 18:00, cambio de
 *  sede»). */
export interface PlanOverlap {
  idx: number;
  a: PlacedMateria;
  b: PlacedMateria;
  cuando: string;
}

const DIA3: Record<string, string> = {
  Lunes: "lun",
  Martes: "mar",
  Miércoles: "mié",
  Jueves: "jue",
  Viernes: "vie",
  Sábado: "sáb",
};

const cuandoSePisan = (ca: Comision, cb: Comision): string => {
  const partes: string[] = [];
  const A = ca.slots.filter((s: Slot) => !isAsync(s));
  const B = cb.slots.filter((s: Slot) => !isAsync(s));
  for (const x of A)
    for (const y of B) {
      if (!slotsConflict(x, y)) continue;
      const dia = DIA3[x.dia] ?? x.dia;
      const ini = Math.max(toMin(x.desde), toMin(y.desde));
      const fin = Math.min(toMin(x.hasta), toMin(y.hasta));
      if (ini < fin) {
        const hm = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
        partes.push(`${dia} ${hm(ini)}–${hm(fin)}`);
      } else partes.push(`${dia} ${x.hasta === y.desde ? x.hasta : y.hasta}, cambio de sede`);
    }
  return [...new Set(partes)].join(" · ");
};

export function planOverlaps(items: PlacedMateria[][]): PlanOverlap[] {
  const out: PlanOverlap[] = [];
  items.forEach((it, idx) => {
    for (let p = 0; p < it.length; p++)
      for (let q = p + 1; q < it.length; q++) {
        const a = it[p];
        const b = it[q];
        if (!a.com || !b.com || !conflicts(a.com, b.com)) continue;
        out.push({ idx, a, b, cuando: cuandoSePisan(a.com, b.com) });
      }
  });
  return out;
}

/* ---------- entrypoint ---------- */

export interface OptimizeOpts {
  /** Recomendador: simula ~90 planes con el mismo esqueleto. La mezclada corre
   *  sin reinicios (el esqueleto memoizado ya lleva la búsqueda completa). */
  quick?: boolean;
}

export function optimizePlan(
  PL: PlanState,
  approved: Set<string>,
  fixedCom?: Map<string, string>,
  opts: OptimizeOpts = {},
): PlanResult {
  // orden canónico: el plan no depende del orden en que se agregaron las
  // materias al pool (el ruido de los reinicios se asigna por posición)
  const mats = ([...PL.pool]
    .filter((c) => !approved.has(c))
    .map((c) => byId.get(c))
    .filter(Boolean) as MateriaM[]).sort((a, b) => a.codigo.localeCompare(b.codigo));

  const method: OptMethod = PL.method ?? "cuatris";

  // Horizonte: 14 cuatrimestres —o lo que pidan las fijadas (una anual fijada
  // al final necesita el índice siguiente para su 2.ª mitad)— y, si quedan
  // afuera materias que un horizonte más largo sí ubica (topes muy bajos,
  // muchas fijadas), se extiende.
  let N = HORIZON;
  for (const m of mats) {
    const fx = PL.fixed.get(m.codigo);
    if (fx === undefined || fx === null) continue;
    N = Math.max(N, fx + (esAnual(m.codigo) ? 2 : 1));
  }
  N = Math.min(HORIZON_MAX, N);
  const quick = opts.quick === true;
  let base = basePlacement(PL, approved, fixedCom, mats, N, method, quick);
  while (N < HORIZON_MAX && base.remaining.length) {
    const wide = lowerBoundLast(PL, approved, mats, HORIZON_MAX);
    if (base.remaining.length <= wide.unplaceable) break;
    N = Math.min(HORIZON_MAX, N + HORIZON);
    base = basePlacement(PL, approved, fixedCom, mats, N, method, quick);
  }
  let moved = base.moved;
  if (method === "balance") {
    // rebalanceo iterativo (least-loaded first) DENTRO de los U cuatrimestres
    // usados: nunca crea ni vacía un índice, así que ni el egreso ni la lista
    // de materias ubicadas cambian — sólo se pareja la carga.
    const U = Math.max(1, lastCuatri(base.items) + 1);
    moved = rebalance(PL, approved, fixedCom, base.items, base.placedIdx, U);
  }
  const { items, remaining } = base;

  const accBefore: number[] = [];
  let acc = approvedCredits(approved);
  for (let i = 0; i < N; i++) {
    accBefore[i] = acc;
    acc += items[i].reduce((s, x) => s + (x.m.creditos || 0), 0);
  }
  const bound = lowerBoundLast(PL, approved, mats, N);
  return {
    items,
    unplaced: remaining,
    accBefore,
    moved,
    minLast: bound.last,
    unplacedWhy: explainUnplaced(PL, approved, mats, remaining),
    delayed: explainDelays(PL, approved, items, accBefore),
  };
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
