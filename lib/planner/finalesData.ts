// ============================================================================
// Combinación de finales — mesas y correlativas
// ----------------------------------------------------------------------------
// El módulo resuelve las dos preguntas del combinador de finales:
//   1. ¿Cuándo se rinde cada final?  → mesas, en tres capas de precedencia
//      (ver más abajo). Las oficiales viven en `mesasFinales.ts`, generado por
//      `scripts/build-mesas-finales-data.mjs` desde las planillas archivadas en
//      `Electivas/finales-*.csv`.
//   2. ¿Qué finales hay que tener antes? → `CORRELATIVAS_FINAL`, que SIGUE
//      SIENDO UN MODELO DE REFERENCIA: `data.json` solo trae correlativas de
//      CURSADA, así que las de final están derivadas a mano de las principales.
//      Reemplazalas por las de tu plan cuando las tengas.
//
// PRECEDENCIA DE MESAS (de mayor a menor), decidida SIEMPRE por bloque
// período × año — nunca código por código, para no mezclar dos calendarios:
//   · ingesta   — la planilla que el usuario trajo o subió en esta sesión
//                 (`RUNTIME_MESAS`, ver 1b). Sirve para una planilla corregida
//                 o más nueva que la horneada, sin regenerar el sitio.
//   · publicada — las mesas horneadas en el sitio (`MESAS_PUBLICADAS`).
//   · ninguna   — el llamado todavía no publicó mesas: el final entra "sin
//                 fecha" y el usuario la carga a mano.
// `fuenteDeMesas()` expone ese estado para que la UI no rotule mal los datos.
// ============================================================================

import type { FinalLlamado, FinalPeriodo, MesaFinal } from "./types";
import type { FinalesBucket } from "./finales/parseFinales";
import { MESAS_PUBLICADAS } from "./mesasFinales";

/** Etiqueta legible de cada llamado. */
export const PERIODO_LABEL: Record<FinalPeriodo, string> = {
  julio: "Julio",
  diciembre: "Diciembre",
  febrero: "Febrero",
};

/** Ordinal del llamado dentro del año lectivo (1.º · 2.º · 3.º). */
export const PERIODO_ORDINAL: Record<FinalPeriodo, string> = {
  julio: "1º",
  diciembre: "2º",
  febrero: "3º",
};

/** Orden cronológico de los llamados (para el segmentado). */
export const PERIODOS: FinalPeriodo[] = ["julio", "diciembre", "febrero"];

/**
 * Mes (1-12) y año calendario que le corresponden a un llamado.
 * Convención del calendario académico: el llamado de **Febrero** cae en el
 * verano SIGUIENTE al año lectivo — para el ciclo 2026, Febrero es 2027.
 * Julio y Diciembre caen dentro del mismo año lectivo.
 */
export function periodoMesAnio(
  periodo: FinalPeriodo,
  anio: number,
): { month: number; year: number } {
  switch (periodo) {
    case "julio":
      return { month: 7, year: anio };
    case "diciembre":
      return { month: 12, year: anio };
    case "febrero":
      return { month: 2, year: anio + 1 };
  }
}

/** Año calendario en que ocurre el llamado (útil para etiquetas y el .ics). */
export const periodoAnioReal = (periodo: FinalPeriodo, anio: number): number =>
  periodoMesAnio(periodo, anio).year;

// ---------------------------------------------------------------------------
// 1. MESAS PUBLICADAS — período → año lectivo → llamado → código → mesa.
//    Datos oficiales horneados en el sitio: el módulo `mesasFinales.ts` lo
//    genera `scripts/build-mesas-finales-data.mjs` desde las planillas
//    archivadas en `Electivas/finales-*.csv`. Para sumar un llamado nuevo,
//    archivá su CSV con el nombre `finales-<AÑO>-<mes>.csv` y regenerá — acá
//    no hay nada que tocar a mano.
//    Ojo con la convención de año: Febrero cae en el verano SIGUIENTE, así que
//    las mesas de febrero de 2027 se indexan bajo el año lectivo 2026.
// ---------------------------------------------------------------------------
type MesasPorCodigo = Record<string, MesaFinal>;
type MesasPorLlamado = Partial<Record<FinalLlamado, MesasPorCodigo>>;

const MESAS_OFICIALES: Partial<
  Record<FinalPeriodo, Record<number, MesasPorLlamado>>
> = MESAS_PUBLICADAS;

// ---------------------------------------------------------------------------
// 1b. MESAS CARGADAS EN RUNTIME (parser de la planilla oficial) — store reactivo
//     ---------------------------------------------------------------------
//     Cuando el usuario trae/sube la planilla real (ver lib/planner/finales/*
//     y components/planner/FinalesIngesta.tsx), las mesas parseadas se guardan
//     acá y PISAN a las mesas publicadas de arriba para ese llamado/año.
//     `mesaOficial` y `fuenteDeMesas` consultan primero este store; lo horneado
//     queda como base (es lo que ve quien no sube nada, que es el caso normal).
//
//     Es un store de módulo (no vive en el estado del planner ni se persiste):
//     los datos oficiales se re-traen con un click. Para que la vista se
//     re-renderice al cargar, expone `subscribeMesasOficiales` +
//     `mesasOficialesVersion` (para `useSyncExternalStore`, SSR-safe).
// ---------------------------------------------------------------------------

/** Clave compuesta período|año|llamado|código dentro del store de runtime. */
const runtimeKey = (
  periodo: FinalPeriodo,
  anio: number,
  llamado: FinalLlamado,
  code: string,
) => `${periodo}|${anio}|${llamado}|${code}`;

let RUNTIME_MESAS: Map<string, MesaFinal> | null = null;
let mesasVersion = 0;
const mesasListeners = new Set<() => void>();

function emitMesas() {
  mesasVersion++;
  for (const l of mesasListeners) l();
}

/** Suscribe un listener a los cambios del store (para `useSyncExternalStore`). */
export function subscribeMesasOficiales(fn: () => void): () => void {
  mesasListeners.add(fn);
  return () => {
    mesasListeners.delete(fn);
  };
}

/** Snapshot barato: un contador que cambia en cada carga/limpieza. */
export function mesasOficialesVersion(): number {
  return mesasVersion;
}

/**
 * Aplica de una vez todos los buckets de una ingesta (una planilla puede traer
 * varios períodos, p. ej. Diciembre+Febrero juntos). Limpia primero cada
 * período/año presente en los buckets (ambos llamados) y emite UN solo cambio.
 */
export function setMesasOficialesBulk(buckets: readonly FinalesBucket[]): void {
  const next = new Map(RUNTIME_MESAS ?? []);
  const prefijos = new Set(buckets.map((b) => `${b.periodo}|${b.anio}|`));
  for (const k of [...next.keys()])
    for (const p of prefijos)
      if (k.startsWith(p)) {
        next.delete(k);
        break;
      }
  for (const b of buckets)
    for (const [code, mesa] of b.entries)
      next.set(runtimeKey(b.periodo, b.anio, b.llamado, code), mesa);
  RUNTIME_MESAS = next.size ? next : null;
  emitMesas();
}

/**
 * Limpia el store. Sin argumentos borra todo; con llamado/año borra solo ese
 * bloque (volviendo a las mesas publicadas para ese llamado).
 */
export function clearMesasOficiales(periodo?: FinalPeriodo, anio?: number): void {
  if (!RUNTIME_MESAS) return;
  if (periodo === undefined || anio === undefined) {
    RUNTIME_MESAS = null;
    emitMesas();
    return;
  }
  const prefix = `${periodo}|${anio}|`;
  const next = new Map(RUNTIME_MESAS);
  for (const k of [...next.keys()]) if (k.startsWith(prefix)) next.delete(k);
  RUNTIME_MESAS = next.size ? next : null;
  emitMesas();
}

/**
 * ¿Hay mesas que el usuario haya traído/subido en esta sesión para este
 * llamado/año? Mira SOLO el store de runtime — no las horneadas. Es lo que
 * necesita la ingesta para saber si tiene algo que limpiar; para preguntar
 * "¿estas fechas son oficiales?" usá `fuenteDeMesas`.
 */
export function hayMesasOficialesCargadas(
  periodo: FinalPeriodo,
  anio: number,
): boolean {
  if (!RUNTIME_MESAS) return false;
  const prefix = `${periodo}|${anio}|`;
  for (const k of RUNTIME_MESAS.keys()) if (k.startsWith(prefix)) return true;
  return false;
}

/** De dónde salen las mesas de un llamado (ver la precedencia del encabezado). */
export type FuenteMesas = "ingesta" | "publicada" | "ninguna";

/**
 * Origen de las mesas de un período/año. La UI lo usa para no mentir sobre los
 * datos: `"publicada"` son las fechas oficiales que trae el sitio, `"ingesta"`
 * las que el usuario cargó recién y `"ninguna"` un llamado sin mesas todavía.
 */
export function fuenteDeMesas(
  periodo: FinalPeriodo,
  anio: number,
): FuenteMesas {
  if (hayMesasOficialesCargadas(periodo, anio)) return "ingesta";
  const t = MESAS_OFICIALES[periodo]?.[anio];
  if (t && Object.values(t).some((mesas) => Object.keys(mesas).length > 0)) {
    return "publicada";
  }
  return "ninguna";
}

/**
 * Mesa oficial de un final para un período/año/llamado, o `undefined` si no
 * hay mesa publicada (el final entra "sin fecha" hasta que el usuario la
 * cargue a mano). Prioridad: ingesta del usuario → mesas publicadas.
 * Ojo: la decisión es por BLOQUE período/año, no por código — si hay una
 * ingesta para ese llamado, lo horneado no participa (evita mezclar una
 * planilla sin 2.º llamado con segundos de otra fuente).
 */
export function mesaOficial(
  code: string,
  periodo: FinalPeriodo,
  anio: number,
  llamado: FinalLlamado,
): MesaFinal | undefined {
  if (hayMesasOficialesCargadas(periodo, anio)) {
    return RUNTIME_MESAS?.get(runtimeKey(periodo, anio, llamado, code));
  }
  return MESAS_OFICIALES[periodo]?.[anio]?.[llamado]?.[code];
}

/** Ambos llamados oficiales de un final para un período/año (si existen). */
export function mesasOficialesDe(
  code: string,
  periodo: FinalPeriodo,
  anio: number,
): { primer?: MesaFinal; segundo?: MesaFinal } {
  return {
    primer: mesaOficial(code, periodo, anio, "primer"),
    segundo: mesaOficial(code, periodo, anio, "segundo"),
  };
}

/**
 * Llamado vigente al día de hoy: el próximo en el calendario académico, para
 * que el combinador abra en el que se está por rendir y no en uno vencido.
 *   ene-mar → Febrero (año lectivo anterior) · abr-jul → Julio · ago-dic → Diciembre.
 * Si ese llamado todavía no publicó mesas, avanza al siguiente que sí tenga
 * (hasta dar la vuelta) — así el usuario aterriza donde hay algo que planificar.
 *
 * NO llamarla durante el render inicial: usa la fecha del sistema, que difiere
 * entre server y cliente y rompería la hidratación del static export. El lugar
 * correcto es un effect post-montaje (ver PlannerApp).
 */
export function llamadoVigente(hoy: Date = new Date()): {
  periodo: FinalPeriodo;
  anio: number;
} {
  const mes = hoy.getMonth() + 1;
  const anioCal = hoy.getFullYear();
  const inicial: { periodo: FinalPeriodo; anio: number } =
    mes <= 3
      ? { periodo: "febrero", anio: anioCal - 1 }
      : mes <= 7
        ? { periodo: "julio", anio: anioCal }
        : { periodo: "diciembre", anio: anioCal };

  // Secuencia cronológica de llamados a partir del vigente, por si está vacío.
  let { periodo, anio } = inicial;
  for (let i = 0; i < PERIODOS.length * 2; i++) {
    if (llamadoTieneMesas(periodo, anio)) return { periodo, anio };
    const idx = PERIODOS.indexOf(periodo);
    if (idx === PERIODOS.length - 1) {
      periodo = PERIODOS[0];
      anio += 1; // tras Febrero arranca el año lectivo siguiente
    } else {
      periodo = PERIODOS[idx + 1];
    }
  }
  return inicial;
}

/** ¿El llamado tiene AL MENOS una mesa (traída por el usuario o publicada)? */
export function llamadoTieneMesas(
  periodo: FinalPeriodo,
  anio: number,
): boolean {
  return fuenteDeMesas(periodo, anio) !== "ninguna";
}

// ---------------------------------------------------------------------------
// 2. CORRELATIVAS DE FINAL (EJEMPLO) — final → finales que hay que tener
//    aprobados ANTES de rendirlo. Es más estricta que la correlativa de
//    cursada: no alcanza con tener la cursada de la anterior, hace falta su
//    FINAL rendido. Derivadas de las correlativas de cursada de data.json,
//    quedándose con la/las prerrequisito(s) principal(es). Reemplazar por las
//    correlativas de final reales de tu plan.
// ---------------------------------------------------------------------------
export const CORRELATIVAS_FINAL: Record<string, string[]> = {
  "93.28": ["93.26"], // Análisis Mat. II  ← final de Análisis Mat. I
  "93.41": ["93.26"], // Física I          ← final de Análisis Mat. I
  "93.42": ["93.28", "93.41"], // Física II ← finales de Análisis II + Física I
  "93.24": ["93.28"], // Probabilidad      ← final de Análisis Mat. II
  "72.33": ["72.31"], // POO               ← final de Programación Imperativa
  "72.34": ["72.33"], // EDA               ← final de POO
  "72.37": ["72.34"], // Base de Datos I   ← final de EDA
  "72.08": ["72.31"], // Arq. de Computadoras ← final de Prog. Imperativa
  "72.11": ["72.08", "72.34"], // Sistemas Operativos ← AC + EDA
};

/** Correlativas de FINAL de un código (finales que deben estar aprobados). */
export function correlativasFinal(code: string): string[] {
  return CORRELATIVAS_FINAL[code] ?? [];
}

/**
 * ¿Está habilitado a rendir el final de `code`? Requiere que TODAS sus
 * correlativas de final estén en `finalDone`. Devuelve además cuáles faltan
 * (para el tooltip del candado).
 */
export function finalHabilitado(
  code: string,
  finalDone: Set<string>,
): { ok: boolean; faltan: string[] } {
  const faltan = correlativasFinal(code).filter((c) => !finalDone.has(c));
  return { ok: faltan.length === 0, faltan };
}
