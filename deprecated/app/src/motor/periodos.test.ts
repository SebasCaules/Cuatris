import { describe, expect, it } from "vitest";

import { PeriodoInvalido } from "./errores";
import {
  compararPeriodos,
  esPeriodoId,
  ordenarPeriodos,
  parsearPeriodo,
  periodosDelPlan,
  periodosDesde,
  primerPeriodoDelPlan,
  siguientePeriodo,
} from "./periodos";
import { planCon, planVacio } from "./fixtures/reales";

describe("parsearPeriodo", () => {
  it("parte año y cuatrimestre", () => {
    expect(parsearPeriodo("2026-2C")).toEqual({ anio: 2026, cuatrimestre: "2C" });
    expect(parsearPeriodo("2031-1C")).toEqual({ anio: 2031, cuatrimestre: "1C" });
  });

  it("rechaza lo que no tiene la forma del contrato", () => {
    for (const invalido of ["2026-3C", "26-1C", "2026", "2026-1c", ""]) {
      expect(() => parsearPeriodo(invalido)).toThrow(PeriodoInvalido);
    }
    expect(esPeriodoId("2026-2C")).toBe(true);
    expect(esPeriodoId("2026-3C")).toBe(false);
  });

  it("la forma está anclada: nada de texto pegado alrededor", () => {
    // Sin `^` ni `$` un período válido escondido en cualquier texto pasaría.
    for (const invalido of [
      " 2026-1C",
      "2026-1C ",
      "x2026-1C",
      "2026-1Cx",
      "basura 2026-1C basura",
      "12026-1C",
      "2026-1C2",
      "\n2026-1C",
    ]) {
      expect(esPeriodoId(invalido)).toBe(false);
      expect(() => parsearPeriodo(invalido)).toThrow(PeriodoInvalido);
    }
  });
});

describe("orden cronológico", () => {
  it("ordena por año y después por cuatrimestre", () => {
    expect(compararPeriodos("2026-1C", "2026-2C")).toBeLessThan(0);
    expect(compararPeriodos("2026-2C", "2027-1C")).toBeLessThan(0);
    expect(compararPeriodos("2027-1C", "2026-2C")).toBeGreaterThan(0);
    expect(compararPeriodos("2026-2C", "2026-2C")).toBe(0);
  });

  it("ordena una lista desordenada", () => {
    expect(
      ordenarPeriodos(["2027-1C", "2026-1C", "2026-2C", "2025-2C"]),
    ).toEqual(["2025-2C", "2026-1C", "2026-2C", "2027-1C"]);
  });
});

describe("siguientePeriodo y periodosDesde", () => {
  it("pasa de segundo cuatrimestre al primero del año siguiente", () => {
    expect(siguientePeriodo("2026-1C")).toBe("2026-2C");
    expect(siguientePeriodo("2026-2C")).toBe("2027-1C");
  });

  it("arma una secuencia que incluye el período inicial", () => {
    expect(periodosDesde("2026-2C", 4)).toEqual([
      "2026-2C",
      "2027-1C",
      "2027-2C",
      "2028-1C",
    ]);
    expect(periodosDesde("2026-2C", 0)).toEqual([]);
    expect(() => periodosDesde("2026-3C", 0)).toThrow(PeriodoInvalido);
  });
});

describe("períodos del plan del usuario", () => {
  it("los devuelve en orden, sin depender del orden de las claves", () => {
    const plan = planCon({}, { "2027-1C": [], "2026-2C": [{ codigo: "72.41" }] });
    expect(periodosDelPlan(plan)).toEqual(["2026-2C", "2027-1C"]);
    expect(primerPeriodoDelPlan(plan)).toBe("2026-2C");
  });

  it("sin períodos no hay primero", () => {
    expect(primerPeriodoDelPlan(planVacio())).toBeNull();
  });
});
