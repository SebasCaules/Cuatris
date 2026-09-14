// Tiempo / modalidad / conflictos de horario. Puro (espejo de planner.js).
import type { Comision, Slot } from "./types";

export const toMin = (h: string): number => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};

export const isAsync = (s: Slot): boolean =>
  !!s.async || /asincr/i.test(s.aula || "");

export function comModalidad(com: Comision): string {
  const m = com.slots
    .filter((s) => !isAsync(s))
    .map((s) => s.modalidad)
    .filter(Boolean) as string[];
  if (!m.length) return "Asincrónico";
  const c: Record<string, number> = {};
  m.forEach((x) => (c[x] = (c[x] || 0) + 1));
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
}

// Sede física de un slot, o null si no ata a un campus (asincrónico o virtual,
// que no requieren traslado). Slots sin sede declarada tampoco atan.
const physSede = (s: Slot): string | null => {
  if (isAsync(s)) return null;
  if (s.modalidad === "Virtual") return null;
  return s.sede ? s.sede : null;
};

export function slotsConflict(a: Slot, b: Slot): boolean {
  if (a.dia !== b.dia) return false;
  const aD = toMin(a.desde),
    aH = toMin(a.hasta),
    bD = toMin(b.desde),
    bH = toMin(b.hasta);
  // superposición temporal directa
  if (aD < bH && bD < aH) return true;
  // back-to-back en sedes distintas: una termina justo cuando arranca la otra,
  // sin tiempo para trasladarse entre campus → cuenta como superposición.
  if (aH === bD || bH === aD) {
    const sa = physSede(a),
      sb = physSede(b);
    if (sa && sb && sa !== sb) return true;
  }
  return false;
}

export function comConflict(ca: Comision, cb: Comision): boolean {
  const A = ca.slots.filter((s) => !isAsync(s));
  const B = cb.slots.filter((s) => !isAsync(s));
  for (const x of A) for (const y of B) if (slotsConflict(x, y)) return true;
  return false;
}

/* ---------- viajes al campus ---------- */

/** Separación (min) a partir de la cual dos bloques del mismo día y sede
 *  cuentan como dos idas distintas a la facultad. */
export const VIAJE_GAP_MIN = 120;

export interface Viajes {
  /** idas a la facultad por semana: bloques presenciales del mismo día y sede
   *  pegados (o con menos de VIAJE_GAP_MIN de espera) cuentan una sola. */
  viajes: number;
  /** días distintos con clase presencial. */
  dias: number;
  /** minutos de espera dentro de las idas (entre bloques de una misma ida). */
  espera: number;
}

/** Cuenta las idas a la facultad que implica un conjunto de comisiones (las
 *  de un cuatrimestre). Sólo bloques presenciales (ni asincrónicos ni
 *  virtuales); un cambio de sede dentro del día es otra ida. */
export function viajesDe(coms: (Comision | null | undefined)[]): Viajes {
  const porDia = new Map<string, Slot[]>();
  for (const c of coms) {
    if (!c) continue;
    for (const s of c.slots) {
      if (isAsync(s) || s.modalidad === "Virtual") continue;
      const arr = porDia.get(s.dia);
      if (arr) arr.push(s);
      else porDia.set(s.dia, [s]);
    }
  }
  let viajes = 0;
  let espera = 0;
  for (const slots of porDia.values()) {
    slots.sort((a, b) => toMin(a.desde) - toMin(b.desde));
    let fin = -Infinity;
    let sede: string | null = null;
    for (const s of slots) {
      const ini = toMin(s.desde);
      const sd = s.sede || null;
      const misma = sede === null || sd === null || sd === sede;
      if (fin === -Infinity || !misma || ini - fin > VIAJE_GAP_MIN) viajes++;
      else if (ini > fin) espera += ini - fin;
      fin = Math.max(fin, toMin(s.hasta));
      if (sd) sede = sd;
    }
  }
  return { viajes, dias: porDia.size, espera };
}

export const salaLabel = (s: Slot): string =>
  s.sala ||
  (isAsync(s)
    ? "asincr."
    : s.modalidad === "Virtual"
      ? "virtual"
      : s.modalidad || "");
