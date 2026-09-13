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

export const salaLabel = (s: Slot): string =>
  s.sala ||
  (isAsync(s)
    ? "asincr."
    : s.modalidad === "Virtual"
      ? "virtual"
      : s.modalidad || "");
