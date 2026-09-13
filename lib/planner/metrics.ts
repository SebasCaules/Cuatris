// Métricas y disponibilidad. Funciones puras: reciben `approved` explícito.
import { byId, credOf, isElectiva } from "./model";
import type { Materia } from "./types";

export function approvedCredits(approved: Set<string>): number {
  let s = 0;
  approved.forEach((c) => (s += credOf(c)));
  return s;
}

export function electiveCredits(approved: Set<string>): number {
  let s = 0;
  approved.forEach((c) => {
    if (isElectiva(c)) s += credOf(c);
  });
  return s;
}

/** ¿La materia está disponible para cursar? (no aprobada, créditos req. y correlativas OK) */
export function isAvailable(m: Materia, approved: Set<string>): boolean {
  if (approved.has(m.codigo)) return false;
  if ((Number(m.creditosReq) || 0) > approvedCredits(approved)) return false;
  return (m.correlativas || []).every((c) => approved.has(c));
}

/** Cantidad de materias disponibles ahora (para el stat tile). */
export function availableCount(approved: Set<string>): number {
  let n = 0;
  byId.forEach((m) => {
    if (isAvailable(m, approved)) n++;
  });
  return n;
}
