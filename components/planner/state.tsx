"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { PLAN, esAnual, esPlanificable, remainingOblig, topeNominal } from "@/lib/planner/model";
import { nextCuatri } from "@/lib/planner/optimize";

/** «Electivas» se fusionó con «Materias»: cualquier pedido de la vista vieja
 *  (deep-link, vista persistida, rail viejo) cae en la vista unificada. */
const normalizeView = (v: ViewKey): ViewKey => (v === "elect" ? "cuatri" : v);
import { tieneFinal, type Estado } from "@/lib/planner/estado";
import type { Persisted } from "@/lib/planner/persist";
import type { PlannerUrlState } from "@/lib/planner/url-state";
import type {
  FinalAsignacion,
  FinalPeriodo,
  FinalesState,
  MesaFinal,
  OptMethod,
  PlacedMateria,
  PlannerState,
  ViewKey,
} from "@/lib/planner/types";

/** Estado del combinador de finales al arrancar (determinístico SSR = cliente). */
export function initialFinales(): FinalesState {
  return {
    periodo: "julio",
    anio: 2026,
    mesas: new Map<string, MesaFinal>(),
    seleccion: new Map<string, FinalAsignacion>(),
    reminderHs: 72,
    margenDias: 2,
  };
}

// Fuente única del tipo: lib/planner/estado.ts (re-export de compatibilidad).
export type { Estado };

const clampInt = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;

/** Tope persistido → tope a usar: sin dato (undefined/0) → null (el nominal);
 *  un default viejo por debajo del nominal → el nominal; si no, el guardado. */
function heredarTope(
  guardado: number | undefined,
  defaultsViejos: number[],
  nominal: number,
): number | null {
  if (!guardado) return null;
  if (defaultsViejos.includes(guardado) && guardado < nominal) return nominal;
  return guardado;
}

/** Estado inicial determinístico (igual en SSR y primer render del cliente).
 *  Build divulgable: arranca SIN materias aprobadas — cada usuario marca las
 *  suyas y se persisten en localStorage (ver persist.ts). */
export function initialState(): PlannerState {
  const approved = new Set<string>(PLAN.aprobadasDefault);
  // topes por default: el cuatrimestre más cargado del plan de estudios
  const tope = topeNominal();
  return {
    view: "cuatri",
    approved,
    // migración: lo aprobado se toma como final aprobado (estado:"final"), pero
    // SOLO si la materia rinde final — invariante: promocionables/sin-final
    // nunca entran en finalDone (ver types.ts).
    finalDone: new Set<string>([...approved].filter(tieneFinal)),
    cursando: new Set<string>(),
    combo: new Set<string>(),
    comboSolo: false,
    fixedCom: new Map<string, string>(),
    areasOn: new Set<string>(PLAN.areas),
    search: "",
    fDisp: false,
    fHor: false,
    comboParams: {
      allowOverlap: false,
      modal: { Presencial: true, Virtual: true, Blended: true },
    },
    combos: [],
    comboIdx: 0,
    plan: {
      pool: new Set<string>(remainingOblig(approved)),
      fixed: new Map<string, number>(),
      // se empieza a planificar en el cuatrimestre que SIGUE al que está en
      // curso: lo que se cursa hoy ya está decidido (marcado como «cursando»).
      start: nextCuatri(),
      maxCred: tope.cred,
      maxMat: tope.mat,
      avoid: true,
      method: "cuatris",
      capCredByIdx: new Map<number, number>(),
      capMatByIdx: new Map<number, number>(),
      lockedIdx: new Set<number>(),
      lockPins: new Map<number, string[]>(),
    },
    sideCollapsed: false,
    drawerCode: null,
    fichaCode: null,
    finales: initialFinales(),
    introDismissed: false,
    hydrated: false,
  };
}

export type Action =
  | { type: "HYDRATE"; payload: Persisted }
  | { type: "HYDRATE_URL"; payload: PlannerUrlState }
  | { type: "SET_VIEW"; view: ViewKey }
  | { type: "SET_ESTADO"; code: string; estado: Estado }
  | { type: "TOGGLE_COMBO"; code: string }
  | { type: "SEED_COMBO"; codes: string[] }
  | { type: "SET_COMBO_SOLO"; value: boolean }
  | { type: "SET_FIXED_COM"; code: string; comision: string | null }
  | { type: "SET_SEARCH"; value: string }
  | { type: "TOGGLE_AREA"; area: string }
  | { type: "SET_FILTER"; key: "fDisp" | "fHor"; value: boolean }
  | { type: "SET_ALLOW_OVERLAP"; value: boolean }
  | { type: "SET_MODAL"; key: "Presencial" | "Virtual" | "Blended"; value: boolean }
  | { type: "SET_COMBOS"; combos: PlacedMateria[][] }
  | { type: "SET_COMBO_IDX"; idx: number }
  | { type: "RESET_COMBO" }
  | { type: "SET_PLAN_START"; start: { parity: number; year: number } }
  | { type: "SET_PLAN_MAXCRED"; value: number }
  | { type: "SET_PLAN_MAXMAT"; value: number }
  | { type: "SET_PLAN_AVOID"; value: boolean }
  | { type: "SET_PLAN_METHOD"; value: OptMethod }
  | { type: "SET_PLAN_CAP_CRED"; idx: number; value: number | null }
  | { type: "SET_PLAN_CAP_MAT"; idx: number; value: number | null }
  | { type: "PLAN_POOL_ADD"; code: string }
  | { type: "PLAN_POOL_REMOVE"; code: string }
  | { type: "PLAN_SET_FIXED"; code: string; idx: number | null }
  // `pinnedByLock`: códigos ubicados en el cuatri al momento de lockear (los
  // manda PlanView); el reducer registra los que el lock efectivamente pinea
  // para liberarlos —y solo a ellos— al des-lockear.
  | { type: "PLAN_TOGGLE_LOCK"; idx: number; pinnedByLock?: string[] }
  | { type: "PLAN_SAVE_PREFERENCE"; codes: string[]; idx?: number }
  | { type: "PLAN_RESET" }
  | { type: "RESET_APPROVED" }
  | { type: "DISMISS_INTRO" }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "OPEN_DRAWER"; code: string }
  | { type: "CLOSE_DRAWER" }
  | { type: "OPEN_FICHA"; code: string }
  | { type: "CLOSE_FICHA" }
  | { type: "SET_FINALES_PERIODO"; periodo: FinalPeriodo }
  | { type: "SET_FINALES_ANIO"; anio: number }
  | { type: "SET_MESA"; code: string; mesa: MesaFinal | null }
  // asignación por materia: en qué período+llamado se rinde (null = quitar).
  | { type: "SET_FINAL_ASIGNACION"; code: string; asignacion: FinalAsignacion | null }
  | { type: "SET_FINALES_REMINDER"; hs: number }
  | { type: "SET_FINALES_MARGEN"; dias: number };

export function reducer(s: PlannerState, a: Action): PlannerState {
  switch (a.type) {
    case "HYDRATE": {
      const p = a.payload;
      const approved = p.approved ? new Set(p.approved) : s.approved;
      return {
        ...s,
        approved,
        // migración: sin `finalDone` persistido (datos pre-feature), lo aprobado
        // se toma como final aprobado (estado:"final"). En ambas ramas se filtra
        // por `tieneFinal` (y ⊆ approved): datos persistidos por la migración
        // vieja venían contaminados con promocionables/sin-final.
        finalDone: p.finalDone
          ? new Set(
              p.finalDone.filter((c) => approved.has(c) && tieneFinal(c)),
            )
          : new Set([...approved].filter(tieneFinal)),
        // invariante: cursando ∩ approved = ∅ (una aprobada no está en curso)
        cursando: p.cursando
          ? new Set(p.cursando.filter((c) => !approved.has(c)))
          : new Set([...s.cursando].filter((c) => !approved.has(c))),
        combo: p.combo ? new Set(p.combo) : s.combo,
        fixedCom: p.fixedCom ? new Map(p.fixedCom) : s.fixedCom,
        comboParams: p.comboParams ?? s.comboParams,
        finales: p.finales
          ? {
              periodo: p.finales.periodo,
              anio: p.finales.anio,
              mesas: new Map(p.finales.mesas),
              seleccion: new Map(p.finales.seleccion),
              reminderHs: p.finales.reminderHs,
              margenDias: p.finales.margenDias,
            }
          : s.finales,
        plan: {
          ...s.plan,
          pool: p.pool
            ? new Set([
                ...p.pool.filter(esPlanificable),
                // migración: las anuales (Proyecto Final) antes no se
                // planificaban y no están en ningún pool guardado; entran
                // solas si todavía no se aprobaron.
                ...remainingOblig(approved).filter(esAnual),
              ])
            : new Set(remainingOblig(approved)),
          fixed: p.fixed ? new Map(p.fixed) : s.plan.fixed,
          lockedIdx: p.lockedIdx ? new Set(p.lockedIdx) : s.plan.lockedIdx,
          // tolerante a datos viejos sin registro de pines: si el payload trae
          // locks pero no lockPins, arranca sin registro (unlock conservador).
          lockPins: p.lockPins
            ? new Map(p.lockPins)
            : p.lockedIdx
              ? new Map()
              : s.plan.lockPins,
          start: p.planOpts?.start ?? s.plan.start,
          // clamp defensivo: valores persistidos fuera de rango (de versiones
          // previas con el input roto) no deben romper el plan. 0 = sin dato
          // (import sin ese campo) → queda el tope nominal del estado inicial.
          // Un tope guardado que es uno de los defaults viejos (18/24 cr,
          // 5 materias) y quedó por debajo del nominal del plan se sube: nadie
          // lo eligió, lo escribió el planner con su default de entonces.
          maxCred: clampInt(
            heredarTope(p.planOpts?.maxCred, [18, 24], s.plan.maxCred) ?? s.plan.maxCred,
            3,
            40,
          ),
          maxMat: clampInt(heredarTope(p.planOpts?.maxMat, [5], s.plan.maxMat) ?? s.plan.maxMat, 1, 9),
          avoid: p.planOpts?.avoid ?? s.plan.avoid,
          method: p.planOpts?.method ?? s.plan.method,
          capCredByIdx: p.planOpts?.capCredByIdx
            ? new Map(
                p.planOpts.capCredByIdx.map(([i, v]) => [i, clampInt(v, 3, 40)]),
              )
            : s.plan.capCredByIdx,
          capMatByIdx: p.planOpts?.capMatByIdx
            ? new Map(
                p.planOpts.capMatByIdx.map(([i, v]) => [i, clampInt(v, 1, 9)]),
              )
            : s.plan.capMatByIdx,
        },
        sideCollapsed: p.sideCollapsed,
        comboSolo: p.comboSolo,
        // una vez cerrado, cerrado queda (un import de preferencias no lo revive)
        introDismissed: p.introDismissed || s.introDismissed,
        hydrated: true,
      };
    }
    // Mergea las slices de vista/navegación que trajo la URL al montar (pisan
    // lo que haya puesto HYDRATE de localStorage en esas mismas claves — la
    // intención explícita del link gana). Campos ausentes en el payload no
    // tocan el estado. Se despacha en el mismo effect, justo después de
    // HYDRATE, para no dejar un frame con el estado a medio hidratar.
    case "HYDRATE_URL": {
      const u = a.payload;
      return {
        ...s,
        view: u.view ? normalizeView(u.view) : s.view,
        search: u.search ?? s.search,
        areasOn: u.areasOn ? new Set(u.areasOn) : s.areasOn,
        fDisp: u.fDisp ?? s.fDisp,
        fHor: u.fHor ?? s.fHor,
        combo: u.combo ? new Set(u.combo) : s.combo,
        drawerCode: u.drawerCode ?? s.drawerCode,
        fichaCode: u.fichaCode ?? s.fichaCode,
      };
    }
    case "SET_VIEW":
      return { ...s, view: normalizeView(a.view) };
    case "SET_ESTADO": {
      const approved = new Set(s.approved);
      const finalDone = new Set(s.finalDone);
      const cursando = new Set(s.cursando);
      cursando.delete(a.code);
      if (a.estado === "pendiente") {
        approved.delete(a.code);
        finalDone.delete(a.code);
      } else if (a.estado === "cursando") {
        approved.delete(a.code);
        finalDone.delete(a.code);
        cursando.add(a.code);
      } else if (a.estado === "regular") {
        approved.add(a.code);
        finalDone.delete(a.code);
      } else {
        approved.add(a.code);
        finalDone.add(a.code);
      }
      return { ...s, approved, finalDone, cursando };
    }
    case "TOGGLE_COMBO": {
      const combo = new Set(s.combo);
      // Quitar del combinador NO toca el pool: el plan es la memoria durable
      // (se quita desde la UI del Plan). Solo la dirección AGREGAR tiende el
      // puente al plan.
      if (combo.has(a.code)) {
        combo.delete(a.code);
        return { ...s, combo };
      }
      combo.add(a.code);
      // Puente automático combinar→plan: agregar una materia al combinador la
      // suma también al pool del plan, salvo que esté aprobada (una aprobada
      // nunca entra al plan; puede llegar acá vía «Ignorar mi progreso»).
      if (s.approved.has(a.code)) return { ...s, combo };
      const pool = new Set(s.plan.pool);
      pool.add(a.code);
      return { ...s, combo, plan: { ...s.plan, pool } };
    }
    case "SEED_COMBO":
      // Siembra del combinador desde el plan: los códigos vienen de optimizar el
      // pool actual, así que ya viven en el plan — no se toca el pool.
      return { ...s, combo: new Set(a.codes) };
    case "SET_COMBO_SOLO":
      return { ...s, comboSolo: a.value };
    case "SET_FIXED_COM": {
      const fixedCom = new Map(s.fixedCom);
      if (a.comision) fixedCom.set(a.code, a.comision);
      else fixedCom.delete(a.code);
      return { ...s, fixedCom };
    }
    case "SET_SEARCH":
      return { ...s, search: a.value };
    case "TOGGLE_AREA": {
      const areasOn = new Set(s.areasOn);
      areasOn.has(a.area) ? areasOn.delete(a.area) : areasOn.add(a.area);
      return { ...s, areasOn };
    }
    case "SET_FILTER":
      return { ...s, [a.key]: a.value };
    case "SET_ALLOW_OVERLAP":
      return {
        ...s,
        comboParams: { ...s.comboParams, allowOverlap: a.value },
      };
    case "SET_MODAL":
      return {
        ...s,
        comboParams: {
          ...s.comboParams,
          modal: { ...s.comboParams.modal, [a.key]: a.value },
        },
      };
    case "SET_COMBOS":
      return { ...s, combos: a.combos, comboIdx: 0 };
    case "SET_COMBO_IDX":
      return { ...s, comboIdx: a.idx };
    case "RESET_COMBO":
      return {
        ...s,
        combo: new Set(),
        fixedCom: new Map(),
        combos: [],
        comboIdx: 0,
      };
    case "SET_PLAN_START":
      return { ...s, plan: { ...s.plan, start: a.start } };
    case "SET_PLAN_MAXCRED":
      return { ...s, plan: { ...s.plan, maxCred: clampInt(a.value, 3, 40) } };
    case "SET_PLAN_MAXMAT":
      return { ...s, plan: { ...s.plan, maxMat: clampInt(a.value, 1, 9) } };
    case "SET_PLAN_AVOID":
      return { ...s, plan: { ...s.plan, avoid: a.value } };
    case "SET_PLAN_METHOD":
      return { ...s, plan: { ...s.plan, method: a.value } };
    case "SET_PLAN_CAP_CRED": {
      const capCredByIdx = new Map(s.plan.capCredByIdx);
      if (a.value === null) capCredByIdx.delete(a.idx);
      else capCredByIdx.set(a.idx, clampInt(a.value, 3, 40));
      return { ...s, plan: { ...s.plan, capCredByIdx } };
    }
    case "SET_PLAN_CAP_MAT": {
      const capMatByIdx = new Map(s.plan.capMatByIdx);
      if (a.value === null) capMatByIdx.delete(a.idx);
      else capMatByIdx.set(a.idx, clampInt(a.value, 1, 9));
      return { ...s, plan: { ...s.plan, capMatByIdx } };
    }
    case "PLAN_POOL_ADD": {
      const pool = new Set(s.plan.pool);
      pool.add(a.code);
      return { ...s, plan: { ...s.plan, pool } };
    }
    case "PLAN_POOL_REMOVE": {
      const pool = new Set(s.plan.pool);
      pool.delete(a.code);
      const fixed = new Map(s.plan.fixed);
      fixed.delete(a.code);
      return { ...s, plan: { ...s.plan, pool, fixed } };
    }
    case "PLAN_SET_FIXED": {
      const fixed = new Map(s.plan.fixed);
      if (a.idx === null) fixed.delete(a.code);
      else fixed.set(a.code, a.idx);
      return { ...s, plan: { ...s.plan, fixed } };
    }
    case "PLAN_TOGGLE_LOCK": {
      const lockedIdx = new Set(s.plan.lockedIdx);
      const fixed = new Map(s.plan.fixed);
      const lockPins = new Map(s.plan.lockPins);
      if (lockedIdx.has(a.idx)) {
        // des-lockear: liberar SOLO los pines que agregó el lock; los manuales
        // previos quedan. Sin registro (estado viejo) no se borra nada.
        lockedIdx.delete(a.idx);
        for (const code of lockPins.get(a.idx) ?? []) {
          if (fixed.get(code) === a.idx) fixed.delete(code);
        }
        lockPins.delete(a.idx);
      } else {
        // finalizar: pinear lo que hoy está ubicado en ese cuatrimestre para
        // que el optimizador lo respete tal cual. Se registra SOLO lo que este
        // lock agrega (lo ya pineado a ese índice era manual y no se toca al
        // des-lockear).
        lockedIdx.add(a.idx);
        const added = (a.pinnedByLock ?? []).filter(
          (code) => fixed.get(code) !== a.idx,
        );
        lockPins.set(a.idx, added);
        for (const code of added) fixed.set(code, a.idx);
      }
      return { ...s, plan: { ...s.plan, lockedIdx, fixed, lockPins } };
    }
    case "PLAN_SAVE_PREFERENCE": {
      // combinador → plan: suma las materias elegidas al pool del plan (las
      // comisiones ya viajan por el `fixedCom` compartido) y salta a la vista
      // del plan; el efecto de optimización re-arma el resto alrededor. Si se da
      // `idx`, además pinea esas materias a ese cuatrimestre (fixed) para que la
      // combinación caiga tal cual en el cuatri elegido.
      const pool = new Set(s.plan.pool);
      const fixed = new Map(s.plan.fixed);
      for (const c of a.codes) {
        // una aprobada nunca entra al plan (posible vía «Solo combinar»):
        // el pool la ocultaría en la UI y quedaría imposible de quitar.
        if (s.approved.has(c)) continue;
        pool.add(c);
        if (a.idx !== undefined) fixed.set(c, a.idx);
      }
      return { ...s, view: "plan", plan: { ...s.plan, pool, fixed } };
    }
    case "PLAN_RESET":
      return {
        ...s,
        plan: {
          ...s.plan,
          pool: new Set(remainingOblig(s.approved)),
          fixed: new Map(),
          capCredByIdx: new Map(),
          capMatByIdx: new Map(),
          lockedIdx: new Set(),
          lockPins: new Map(),
        },
      };
    case "RESET_APPROVED": {
      const approved = new Set(PLAN.aprobadasDefault);
      return {
        ...s,
        approved,
        finalDone: new Set([...approved].filter(tieneFinal)),
        cursando: new Set(),
        plan: {
          ...s.plan,
          pool: new Set(remainingOblig(approved)),
          fixed: new Map(),
          lockedIdx: new Set(),
          lockPins: new Map(),
        },
      };
    }
    case "DISMISS_INTRO":
      return { ...s, introDismissed: true };
    case "TOGGLE_SIDEBAR":
      return { ...s, sideCollapsed: !s.sideCollapsed };
    case "OPEN_DRAWER":
      return { ...s, drawerCode: a.code };
    case "CLOSE_DRAWER":
      return { ...s, drawerCode: null };
    case "OPEN_FICHA":
      return { ...s, fichaCode: a.code };
    case "CLOSE_FICHA":
      return { ...s, fichaCode: null };
    case "SET_FINALES_PERIODO":
      return { ...s, finales: { ...s.finales, periodo: a.periodo } };
    case "SET_FINALES_ANIO":
      return { ...s, finales: { ...s.finales, anio: a.anio } };
    case "SET_MESA": {
      const mesas = new Map(s.finales.mesas);
      if (a.mesa === null) mesas.delete(a.code);
      else mesas.set(a.code, a.mesa);
      return { ...s, finales: { ...s.finales, mesas } };
    }
    case "SET_FINAL_ASIGNACION": {
      const seleccion = new Map(s.finales.seleccion);
      if (a.asignacion === null) seleccion.delete(a.code);
      else seleccion.set(a.code, a.asignacion);
      return { ...s, finales: { ...s.finales, seleccion } };
    }
    case "SET_FINALES_REMINDER":
      return { ...s, finales: { ...s.finales, reminderHs: a.hs } };
    case "SET_FINALES_MARGEN":
      return { ...s, finales: { ...s.finales, margenDias: a.dias } };
    default:
      return s;
  }
}

interface Ctx {
  state: PlannerState;
  dispatch: Dispatch<Action>;
}
const PlannerContext = createContext<Ctx | null>(null);

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  // Value memoizado: sin esto el objeto de contexto es nuevo en cada render del
  // Provider y arrastra a re-renderizar a todo consumidor de usePlanner aunque
  // el estado no haya cambiado. `dispatch` es estable (useReducer); el value solo
  // cambia cuando cambia `state`.
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}

export function usePlanner(): Ctx {
  const c = useContext(PlannerContext);
  if (!c) throw new Error("usePlanner fuera de PlannerProvider");
  return c;
}
