// Persistencia en localStorage. MISMAS claves heredadas del planner standalone
// para no perder estado de usuarios actuales, + claves nuevas para los inputs
// del combinador y del plan (preferencias, comisiones fijadas). Solo cliente.
// (sv-theme lo maneja el portal, no el planner.)
import type {
  ComboParams,
  FinalAsignacion,
  FinalesState,
  FinalPeriodo,
  MesaFinal,
  OptMethod,
  PlannerState,
  PlanStart,
  ViewKey,
} from "./types";

// Claves de la carrera por defecto (Informática): las históricas, sin prefijo,
// para no perder el estado de nadie. Las demás carreras usan las mismas claves
// con el prefijo `c:<CODIGO>:` (setPersistCarrera): cada carrera guarda su
// propio progreso, plan y finales.
const K_BASE = {
  view: "plan_view_v1",
  approved: "plan_aprobadas_v3",
  finalDone: "plan_finales_v1",
  cursando: "plan_cursando_v1",
  combo: "plan_combo_v3",
  pool: "plan_pool_v3",
  fixed: "plan_fixed_v3",
  locked: "plan_locked_v1",
  lockPins: "plan_lock_pins_v1",
  sidebar: "plan_sidebar",
  comboParams: "plan_combo_params_v1",
  fixedCom: "plan_fixed_com_v1",
  planOpts: "plan_opts_v1",
  finalesCombo: "plan_finales_combo_v1",
  introDismissed: "plan_intro_dismissed_v1",
  comboSolo: "plan_combo_solo_v1",
} as const;

/** Claves activas (mutable in place: todo el módulo las lee de acá). */
const K: { -readonly [P in keyof typeof K_BASE]: string } = { ...K_BASE };
/** Carrera cuyo estado se lee y escribe. */
export const PERSIST_DEFAULT_CARRERA = "S";
let persistCarrera = PERSIST_DEFAULT_CARRERA;
/** Clave de la carrera elegida (una por perfil, compartida por sus carreras). */
export const K_CARRERA = "plan_carrera_v1";

// ---------------------------------------------------------------------------
// Perfiles: configuraciones completas guardadas aparte en este navegador
// (carrera elegida + progreso, plan, combinaciones y finales de cada carrera).
// Cada perfil es un espacio de claves: el principal (id "") usa las claves
// históricas tal cual; los demás las mismas con el prefijo `p:<id>:`, por
// delante del de carrera. Cambiar de perfil = cambiar el prefijo y remontar el
// planner, igual que al cambiar de carrera. El registro de perfiles y cuál
// está activo son globales (`plan_perfiles_v1`).
// ---------------------------------------------------------------------------
export const PERFIL_PRINCIPAL = "";
export const NOMBRE_PERFIL_PRINCIPAL = "Principal";
export const K_PERFILES = "plan_perfiles_v1";
let persistPerfil = PERFIL_PRINCIPAL;

export interface Perfil {
  id: string;
  nombre: string;
  /** fecha de creación (ISO) */
  creado: string;
  /** color del perfil (hex de PERFIL_COLORES); sin color, el acento del sitio */
  color?: string;
}
export interface Perfiles {
  activo: string;
  perfiles: Perfil[];
}

const prefijoPerfil = (id: string) => (id === PERFIL_PRINCIPAL ? "" : `p:${id}:`);
const prefijoCarrera = (codigo: string) =>
  codigo === PERSIST_DEFAULT_CARRERA ? "" : `c:${codigo}:`;

function recalcularClaves(): void {
  const prefix = prefijoPerfil(persistPerfil) + prefijoCarrera(persistCarrera);
  for (const k of Object.keys(K_BASE) as (keyof typeof K_BASE)[]) K[k] = prefix + K_BASE[k];
}

/** Apunta la persistencia a otra carrera. Llamar ANTES de hidratar el estado. */
export function setPersistCarrera(codigo: string): void {
  persistCarrera = codigo;
  recalcularClaves();
}
export const getPersistCarrera = (): string => persistCarrera;

/** Apunta la persistencia a otro perfil (y a su carrera elegida, si tiene).
 *  Llamar ANTES de resolver la carrera e hidratar. */
export function setPersistPerfil(id: string): void {
  persistPerfil = id;
  recalcularClaves();
}
export const getPersistPerfil = (): string => persistPerfil;

/** ¿Hay materias aprobadas guardadas para esa carrera (en el perfil activo)?
 *  (para señalar en el selector dónde está el progreso del usuario). */
export function tieneProgreso(codigo: string): boolean {
  try {
    const raw = localStorage.getItem(
      prefijoPerfil(persistPerfil) + prefijoCarrera(codigo) + K_BASE.approved,
    );
    return !!raw && raw !== "[]";
  } catch {
    return false;
  }
}

/** Carrera guardada por el usuario en el perfil activo (null si nunca eligió). */
export function loadCarreraPref(): string | null {
  try {
    return localStorage.getItem(prefijoPerfil(persistPerfil) + K_CARRERA);
  } catch {
    return null;
  }
}
export function saveCarreraPref(codigo: string): void {
  try {
    localStorage.setItem(prefijoPerfil(persistPerfil) + K_CARRERA, codigo);
  } catch {
    /* almacenamiento no disponible */
  }
}

const isPerfil = (x: unknown): x is Perfil =>
  !!x &&
  typeof x === "object" &&
  typeof (x as Perfil).id === "string" &&
  typeof (x as Perfil).nombre === "string";

const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Registro de perfiles. Sin registro (usuario de antes de los perfiles) el
 *  único es el principal, con las claves históricas. Si el usuario borró
 *  todos, se crea uno nuevo vacío para que siempre haya uno activo; si el
 *  activo guardado ya no existe, queda el primero. */
export function loadPerfiles(): Perfiles {
  let activo = PERFIL_PRINCIPAL;
  let perfiles: Perfil[] | null = null;
  try {
    const raw = localStorage.getItem(K_PERFILES);
    const v = raw ? (JSON.parse(raw) as Partial<Perfiles>) : null;
    if (v && Array.isArray(v.perfiles)) perfiles = v.perfiles.filter(isPerfil);
    if (v && typeof v.activo === "string") activo = v.activo;
  } catch {
    /* sin registro */
  }
  if (perfiles == null) {
    perfiles = [{ id: PERFIL_PRINCIPAL, nombre: NOMBRE_PERFIL_PRINCIPAL, creado: "" }];
  } else if (perfiles.length === 0) {
    perfiles = [{ id: nuevoId(), nombre: "Nuevo perfil", creado: new Date().toISOString() }];
    activo = perfiles[0].id;
    savePerfiles({ activo, perfiles });
  }
  if (!perfiles.some((p) => p.id === activo)) activo = perfiles[0].id;
  return { activo, perfiles };
}
function savePerfiles(v: Perfiles): void {
  try {
    localStorage.setItem(K_PERFILES, JSON.stringify(v));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Claves de localStorage que pertenecen a un perfil: las de estado de cada
 *  carrera y su carrera elegida. Devuelve la clave «pelada» (sin el prefijo
 *  del perfil) o null si no es de ese perfil. */
function claveDePerfil(key: string, id: string): string | null {
  const pp = prefijoPerfil(id);
  if (pp) return key.startsWith(pp) ? key.slice(pp.length) : null;
  if (key.startsWith("p:")) return null;
  const pelada = key.replace(/^c:[A-Za-z0-9]+:/, "");
  return pelada === K_CARRERA || Object.values(K_BASE).includes(pelada as never) ? key : null;
}
function clavesDe(id: string): string[] {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && claveDePerfil(k, id) != null) out.push(k);
    }
  } catch {
    /* sin almacenamiento */
  }
  return out;
}

/** Crea un perfil (vacío, o copia de `desde`: todo lo guardado en ese perfil,
 *  carrera elegida incluida) y lo registra. No lo activa. */
export function crearPerfil(nombre: string, desde: string | null = null): Perfil {
  const reg = loadPerfiles();
  const id = nuevoId();
  const perfil: Perfil = { id, nombre: nombre.trim() || "Perfil", creado: new Date().toISOString() };
  if (desde != null) {
    try {
      for (const k of clavesDe(desde)) {
        const pelada = claveDePerfil(k, desde);
        const v = localStorage.getItem(k);
        if (pelada != null && v != null) localStorage.setItem(prefijoPerfil(id) + pelada, v);
      }
    } catch {
      /* almacenamiento no disponible */
    }
  }
  savePerfiles({ ...reg, perfiles: [...reg.perfiles, perfil] });
  return perfil;
}

export function renombrarPerfil(id: string, nombre: string): void {
  const reg = loadPerfiles();
  savePerfiles({
    ...reg,
    perfiles: reg.perfiles.map((p) => (p.id === id ? { ...p, nombre: nombre.trim() || p.nombre } : p)),
  });
}

/** Marca el perfil activo en el registro y apunta la persistencia a él. */
export function activarPerfil(id: string): void {
  const reg = loadPerfiles();
  if (!reg.perfiles.some((p) => p.id === id)) return;
  savePerfiles({ ...reg, activo: id });
  setPersistPerfil(id);
}

/** Color del perfil (hex de PERFIL_COLORES, o null para volver al acento). */
export function colorearPerfil(id: string, color: string | null): void {
  const reg = loadPerfiles();
  savePerfiles({
    ...reg,
    perfiles: reg.perfiles.map((p) =>
      p.id === id ? { ...p, color: color ?? undefined } : p,
    ),
  });
}

/** Borra un perfil (también el principal) y todo lo guardado en él. Si era el
 *  activo queda el primero de los que quedan; sin ninguno, `loadPerfiles` crea
 *  uno nuevo vacío. Devuelve el id que queda activo. */
export function borrarPerfil(id: string): string {
  vaciarPerfil(id);
  const reg = loadPerfiles();
  const perfiles = reg.perfiles.filter((p) => p.id !== id);
  const activo = reg.activo === id ? (perfiles[0]?.id ?? "") : reg.activo;
  savePerfiles({ activo, perfiles });
  return loadPerfiles().activo;
}

/** Elimina todo lo guardado de un perfil (queda como recién creado). */
export function vaciarPerfil(id: string): void {
  try {
    for (const k of clavesDe(id)) localStorage.removeItem(k);
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Cuatrimestres a la vista en el carrusel del Plan de cursada. Preferencia
 *  de pantalla, no de progreso: una sola clave para todas las carreras. */
export type PlanCols = 2 | 3 | 4;
export const K_PLAN_COLS = "plan_cols_v1";
export function loadPlanCols(): PlanCols {
  try {
    const n = Number(localStorage.getItem(K_PLAN_COLS));
    return n === 3 || n === 4 ? n : 2;
  } catch {
    return 2;
  }
}
export function savePlanCols(n: PlanCols): void {
  try {
    localStorage.setItem(K_PLAN_COLS, String(n));
  } catch {
    /* almacenamiento no disponible */
  }
}

export interface PlanOpts {
  start: PlanStart;
  maxCred: number;
  maxMat: number;
  avoid: boolean;
  method?: OptMethod;
  capCredByIdx?: [number, number][];
  capMatByIdx?: [number, number][];
}

/** Forma serializable de `FinalesState` (Maps → arrays de pares). */
export interface PersistedFinales {
  periodo: FinalPeriodo;
  anio: number;
  mesas: [string, MesaFinal][];
  /** asignación por materia. El formato viejo era `string[]` (solo códigos):
   *  `parseFinales` lo migra a pares con el período persistido y 1.º llamado. */
  seleccion: [string, FinalAsignacion][];
  reminderHs: number;
  margenDias: number;
}

export interface Persisted {
  /** última vista abierta (retomar donde quedó). null = primera visita → el
   *  consumidor conserva su default (cuatri). */
  view: ViewKey | null;
  approved: string[] | null;
  finalDone: string[] | null;
  cursando: string[] | null;
  combo: string[] | null;
  pool: string[] | null;
  fixed: [string, number][] | null;
  lockedIdx: number[] | null;
  /** registro índice→códigos pineados por cada lock (ver PlanState.lockPins). */
  lockPins: [number, string[]][] | null;
  comboParams: ComboParams | null;
  fixedCom: [string, string][] | null;
  planOpts: PlanOpts | null;
  finales: PersistedFinales | null;
  sideCollapsed: boolean;
  /** banner de primer uso cerrado (flag simple, como sideCollapsed). */
  introDismissed: boolean;
  /** modo "ignorar progreso" del combinador (flag simple, como sideCollapsed). */
  comboSolo: boolean;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Como `read`, pero descarta a `null` cualquier valor que no pase el guard de
 *  forma (JSON válido del tipo equivocado). */
function readShape<T>(key: string, guard: (x: unknown) => x is T): T | null {
  const raw = read<unknown>(key);
  return guard(raw) ? raw : null;
}

export function loadPersisted(): Persisted {
  // Toda clave que HYDRATE convierte a Set/Map se valida por forma antes de
  // devolverla: un JSON válido pero con el tipo equivocado (schema viejo
  // cacheado, escritura truncada, extensión) cae a su default en vez de
  // reventar el `new Set(...)`/`new Map(...)` del reducer. Cada clave se valida
  // por separado: una corrupta no arrastra a las demás.
  return {
    view: readShape(K.view, isViewKey),
    approved: readShape(K.approved, isStrArr),
    finalDone: readShape(K.finalDone, isStrArr),
    cursando: readShape(K.cursando, isStrArr),
    combo: readShape(K.combo, isStrArr),
    pool: readShape(K.pool, isStrArr),
    fixed: readShape(K.fixed, (x): x is [string, number][] => isPairArr(x, isNum)),
    lockedIdx: readShape(K.locked, isNumArr),
    lockPins: readShape(K.lockPins, isLockPinsArr),
    comboParams: read<ComboParams>(K.comboParams),
    fixedCom: readShape(K.fixedCom, (x): x is [string, string][] => isPairArr(x, isStr)),
    planOpts: read<PlanOpts>(K.planOpts),
    // mismo validador que el import de archivo: un JSON corrupto en
    // localStorage (p. ej. `mesas` no-iterable) cae a default en vez de
    // reventar el `new Map(...)` del reducer.
    finales: parseFinales(read<unknown>(K.finalesCombo)),
    sideCollapsed: ((): boolean => {
      try {
        return localStorage.getItem(K.sidebar) === "1";
      } catch {
        return false;
      }
    })(),
    introDismissed: ((): boolean => {
      try {
        return localStorage.getItem(K.introDismissed) === "1";
      } catch {
        return false;
      }
    })(),
    comboSolo: ((): boolean => {
      try {
        return localStorage.getItem(K.comboSolo) === "1";
      } catch {
        return false;
      }
    })(),
  };
}

/** Borra SOLO las claves del planner (no toca `sv-theme` ni nada del portal).
 *  Recuperación de último recurso para el ErrorBoundary: estado persistido
 *  corrupto que ni la validación por forma pudo salvar. */
export function clearPlannerStorage() {
  try {
    for (const key of Object.values(K)) localStorage.removeItem(key);
  } catch {
    /* almacenamiento no disponible */
  }
}

const write = (key: string, val: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* almacenamiento no disponible */
  }
};

export const saveView = (view: ViewKey) => write(K.view, view);
export const saveApproved = (s: Set<string>) => write(K.approved, [...s]);
export const saveFinalDone = (s: Set<string>) => write(K.finalDone, [...s]);
export const saveCursando = (s: Set<string>) => write(K.cursando, [...s]);
export const saveCombo = (s: Set<string>) => write(K.combo, [...s]);
export const savePlanPool = (pool: Set<string>, fixed: Map<string, number>) => {
  write(K.pool, [...pool]);
  write(K.fixed, [...fixed]);
};
export const saveLocked = (s: Set<number>) => write(K.locked, [...s]);
export const saveLockPins = (m: Map<number, string[]>) =>
  write(K.lockPins, [...m]);

/** Serializa `FinalesState` (Map/Set) a su forma persistible (arrays). */
export const serializeFinales = (f: FinalesState): PersistedFinales => ({
  periodo: f.periodo,
  anio: f.anio,
  mesas: [...f.mesas],
  seleccion: [...f.seleccion],
  reminderHs: f.reminderHs,
  margenDias: f.margenDias,
});
export const saveFinalesCombo = (f: FinalesState) =>
  write(K.finalesCombo, serializeFinales(f));
export const saveComboParams = (p: ComboParams) => write(K.comboParams, p);
export const saveFixedCom = (m: Map<string, string>) =>
  write(K.fixedCom, [...m]);
export const savePlanOpts = (o: PlanOpts) => write(K.planOpts, o);
export const saveSidebar = (collapsed: boolean) => {
  try {
    localStorage.setItem(K.sidebar, collapsed ? "1" : "0");
  } catch {
    /* noop */
  }
};
export const saveIntroDismissed = (dismissed: boolean) => {
  try {
    localStorage.setItem(K.introDismissed, dismissed ? "1" : "0");
  } catch {
    /* noop */
  }
};
export const saveComboSolo = (solo: boolean) => {
  try {
    localStorage.setItem(K.comboSolo, solo ? "1" : "0");
  } catch {
    /* noop */
  }
};

/* =========================================================================
   EXPORT / IMPORT de preferencias (archivo .json portable)
   Un único bundle autocontenido con TODO el estado persistible del planner,
   para descargar y volver a cargar el mismo template más adelante (o en otro
   navegador). El shape mapea 1:1 a `Persisted` → se reimporta vía HYDRATE.
   ========================================================================= */

export const PREF_VERSION = 1;
const PREF_APP = "studyvaults-planner";

/** Bundle serializable de preferencias del planner. */
export interface PreferenceBundle {
  app: typeof PREF_APP;
  v: number;
  exported?: string; // fecha legible, informativa
  /** carrera cuyo progreso es (código del SGA); ausente en bundles viejos = Informática. */
  carrera?: string;
  approved: string[];
  finalDone: string[];
  /** opcional: bundles anteriores al estado «cursando» no lo traen */
  cursando?: string[];
  combo: string[];
  pool: string[];
  fixed: [string, number][];
  lockedIdx: number[];
  lockPins: [number, string[]][];
  fixedCom: [string, string][];
  comboParams: ComboParams;
  planOpts: PlanOpts;
  finales: PersistedFinales;
  sideCollapsed: boolean;
  comboSolo: boolean;
}

/** Arma el bundle exportable a partir del estado vivo del planner. */
export function buildPreferenceBundle(
  state: PlannerState,
  exported?: string,
): PreferenceBundle {
  return {
    app: PREF_APP,
    v: PREF_VERSION,
    exported,
    carrera: persistCarrera,
    approved: [...state.approved],
    finalDone: [...state.finalDone],
    cursando: [...state.cursando],
    combo: [...state.combo],
    pool: [...state.plan.pool],
    fixed: [...state.plan.fixed],
    lockedIdx: [...state.plan.lockedIdx],
    lockPins: [...state.plan.lockPins],
    fixedCom: [...state.fixedCom],
    comboParams: state.comboParams,
    planOpts: {
      start: state.plan.start,
      maxCred: state.plan.maxCred,
      maxMat: state.plan.maxMat,
      avoid: state.plan.avoid,
      method: state.plan.method,
      capCredByIdx: [...state.plan.capCredByIdx],
      capMatByIdx: [...state.plan.capMatByIdx],
    },
    finales: serializeFinales(state.finales),
    sideCollapsed: state.sideCollapsed,
    comboSolo: state.comboSolo,
  };
}

/** Serializa el bundle a texto JSON legible (para descargar como archivo). */
export const serializePreferences = (
  state: PlannerState,
  exported?: string,
): string => JSON.stringify(buildPreferenceBundle(state, exported), null, 2);

const VIEW_KEYS: readonly ViewKey[] = [
  "cuatri",
  "elect",
  "combo",
  "plan",
  "grafo",
  "finales",
  "ref",
];
const isViewKey = (x: unknown): x is ViewKey =>
  typeof x === "string" && (VIEW_KEYS as readonly string[]).includes(x);
const isStrArr = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((v) => typeof v === "string");
const isPairArr = <B>(x: unknown, second: (v: unknown) => v is B): x is [string, B][] =>
  Array.isArray(x) &&
  x.every(
    (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "string" && second(p[1]),
  );
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNumPairArr = (x: unknown): x is [number, number][] =>
  Array.isArray(x) &&
  x.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]));
const isNumArr = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every(isNum);
const isLockPinsArr = (x: unknown): x is [number, string[]][] =>
  Array.isArray(x) &&
  x.every(
    (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isStrArr(p[1]),
  );

const isMesa = (v: unknown): v is MesaFinal =>
  !!v &&
  typeof v === "object" &&
  isStr((v as Record<string, unknown>).fecha) &&
  isStr((v as Record<string, unknown>).hora);

const isPeriodo = (v: unknown): v is FinalPeriodo =>
  v === "julio" || v === "diciembre" || v === "febrero";

const isAsignacion = (v: unknown): v is FinalAsignacion =>
  !!v &&
  typeof v === "object" &&
  isPeriodo((v as Record<string, unknown>).periodo) &&
  ((v as Record<string, unknown>).llamado === "primer" ||
    (v as Record<string, unknown>).llamado === "segundo");

/** Parsea el bloque de finales de un bundle; tolerante (campos inválidos → default). */
function parseFinales(x: unknown): PersistedFinales | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Record<string, unknown>;
  const periodo: FinalPeriodo = isPeriodo(f.periodo) ? f.periodo : "julio";
  const mesas =
    Array.isArray(f.mesas) &&
    f.mesas.every(
      (p) => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isMesa(p[1]),
    )
      ? (f.mesas as [string, MesaFinal][])
      : [];
  // seleccion: formato nuevo = [código, FinalAsignacion][]; el viejo era solo
  // string[] → se migra asignando el período persistido y el 1.º llamado.
  let seleccion: [string, FinalAsignacion][] = [];
  if (Array.isArray(f.seleccion)) {
    if (
      f.seleccion.every(
        (p) =>
          Array.isArray(p) && p.length === 2 && isStr(p[0]) && isAsignacion(p[1]),
      )
    ) {
      seleccion = f.seleccion as [string, FinalAsignacion][];
    } else if (isStrArr(f.seleccion)) {
      seleccion = f.seleccion.map((code) => [
        code,
        { periodo, llamado: "primer" },
      ]);
    }
  }
  return {
    periodo,
    anio: isNum(f.anio) ? f.anio : 2026,
    mesas,
    seleccion,
    reminderHs: isNum(f.reminderHs) ? f.reminderHs : 72,
    margenDias: isNum(f.margenDias) ? f.margenDias : 2,
  };
}

/**
 * Parsea un archivo de preferencias exportado → `Persisted` (lo que consume
 * HYDRATE). Tolerante: campos faltantes o inválidos caen a `null` (HYDRATE los
 * ignora y conserva el estado actual). Devuelve `null` si el JSON es inválido o
 * no parece un bundle del planner.
 */
export function parsePreferences(text: string): Persisted | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  // acepta bundles nuestros; si viene con `app` debe matchear
  if ("app" in b && b.app !== PREF_APP) return null;

  const po = (b.planOpts && typeof b.planOpts === "object"
    ? (b.planOpts as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const start =
    po.start && typeof po.start === "object"
      ? (po.start as PlanStart)
      : null;
  const planOpts: PlanOpts | null = start
    ? {
        start,
        // 0 = sin dato: al hidratar queda el tope nominal del plan (state.tsx)
        maxCred: isNum(po.maxCred) ? po.maxCred : 0,
        maxMat: isNum(po.maxMat) ? po.maxMat : 0,
        avoid: typeof po.avoid === "boolean" ? po.avoid : true,
        method: (po.method === "cuatris" ||
        po.method === "dias" ||
        po.method === "balance"
          ? po.method
          : "cuatris") as OptMethod,
        capCredByIdx: isNumPairArr(po.capCredByIdx) ? po.capCredByIdx : [],
        capMatByIdx: isNumPairArr(po.capMatByIdx) ? po.capMatByIdx : [],
      }
    : null;

  return {
    // la vista es preferencia de sesión propia, no parte del bundle portable:
    // importar preferencias no cambia dónde estás parado (el deep-link ?view=
    // sigue siendo la vía para forzar una vista).
    view: null,
    approved: isStrArr(b.approved) ? b.approved : null,
    finalDone: isStrArr(b.finalDone) ? b.finalDone : null,
    // bundles viejos no traen cursando → null (HYDRATE conserva el actual)
    cursando: isStrArr(b.cursando) ? b.cursando : null,
    combo: isStrArr(b.combo) ? b.combo : null,
    pool: isStrArr(b.pool) ? b.pool : null,
    fixed: isPairArr(b.fixed, isNum) ? b.fixed : null,
    lockedIdx: isNumArr(b.lockedIdx) ? b.lockedIdx : null,
    // bundles viejos no traen lockPins → null (HYDRATE resuelve el default)
    lockPins: isLockPinsArr(b.lockPins) ? b.lockPins : null,
    comboParams:
      b.comboParams && typeof b.comboParams === "object"
        ? (b.comboParams as ComboParams)
        : null,
    fixedCom: isPairArr(b.fixedCom, isStr) ? b.fixedCom : null,
    planOpts,
    finales: parseFinales(b.finales),
    sideCollapsed: typeof b.sideCollapsed === "boolean" ? b.sideCollapsed : false,
    // quien importa preferencias no es un primer uso: no revivir el banner
    // (HYDRATE además hace OR con el estado actual).
    introDismissed: true,
    // bundles viejos no traen comboSolo → false (modo por defecto).
    comboSolo: typeof b.comboSolo === "boolean" ? b.comboSolo : false,
  };
}
