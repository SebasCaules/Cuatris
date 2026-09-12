import { describe, expect, it } from "vitest";

import {
  aprobadasAlEmpezar,
  creditosAlEmpezar,
  creditosAprobados,
  itemsAprobados,
  primerPeriodoPlanificado,
} from "./creditos";
import {
  codigosDelCiclo,
  historiaCon,
  PLAN,
  planCon,
  planVacio,
} from "./fixtures/reales";

const BASICO = codigosDelCiclo("basico");

describe("itemsAprobados y creditosAprobados", () => {
  it("suma los 147 créditos del ciclo básico completo (datos reales)", () => {
    const historia = historiaCon(BASICO);
    expect(itemsAprobados(historia, PLAN)).toEqual([...BASICO].sort());
    expect(creditosAprobados(historia, PLAN)).toBe(147);
  });

  it("cuenta los ítems de cero créditos como ítems", () => {
    // 94.51 Inglés I vale 0 créditos y es un ítem del ciclo básico.
    const historia = historiaCon(["94.51"]);
    expect(itemsAprobados(historia, PLAN)).toEqual(["94.51"]);
    expect(creditosAprobados(historia, PLAN)).toBe(0);
  });

  it("no cuenta regular ni cursando", () => {
    expect(creditosAprobados(historiaCon(["93.58"], "regular"), PLAN)).toBe(0);
    expect(creditosAprobados(historiaCon(["93.58"], "cursando"), PLAN)).toBe(0);
    expect(creditosAprobados(historiaCon(["93.58"]), PLAN)).toBe(9);
  });

  it("ignora un código que el plan no tiene", () => {
    // 93.18 Álgebra Lineal existe en el SGA pero no en S10-Rev23.
    const historia = historiaCon(["93.58", "93.18"]);
    expect(itemsAprobados(historia, PLAN)).toEqual(["93.58"]);
    expect(creditosAprobados(historia, PLAN)).toBe(9);
  });
});

describe("primerPeriodoPlanificado", () => {
  it("gana el período más temprano si la materia está repetida", () => {
    const plan = planCon(
      {},
      {
        "2027-1C": [{ codigo: "72.41" }],
        "2026-2C": [{ codigo: "72.41" }, { codigo: "72.44" }],
      },
    );
    const indice = primerPeriodoPlanificado(plan);
    expect(indice.get("72.41")).toBe("2026-2C");
    expect(indice.get("72.44")).toBe("2026-2C");
  });
});

describe("creditosAlEmpezar", () => {
  it("suma lo planificado en períodos anteriores, no lo del propio período", () => {
    const plan = planCon(historiaCon(BASICO), {
      // 72.41 (6) + 72.44 (6) + 72.42 (3) = 15 créditos.
      "2026-2C": [{ codigo: "72.41" }, { codigo: "72.44" }, { codigo: "72.42" }],
      "2027-1C": [{ codigo: "72.20" }],
    });
    expect(creditosAlEmpezar("2026-2C", plan, PLAN)).toBe(147);
    expect(creditosAlEmpezar("2027-1C", plan, PLAN)).toBe(162);
    expect(creditosAlEmpezar("2027-2C", plan, PLAN)).toBe(168);
  });

  it("no cuenta dos veces una materia aprobada que además está planificada", () => {
    const plan = planCon(historiaCon(["93.58"]), {
      "2026-2C": [{ codigo: "93.58" }],
    });
    expect(creditosAlEmpezar("2027-1C", plan, PLAN)).toBe(9);
  });

  it("sin historia ni plan, cero", () => {
    expect(creditosAlEmpezar("2026-2C", planVacio(), PLAN)).toBe(0);
  });
});

describe("aprobadasAlEmpezar", () => {
  it("da por aprobado lo planificado antes y no lo del mismo período", () => {
    const plan = planCon(historiaCon(["93.58"]), {
      "2026-2C": [{ codigo: "72.31" }],
      "2027-1C": [{ codigo: "72.33" }],
    });
    expect([...aprobadasAlEmpezar("2026-2C", plan, PLAN)].sort()).toEqual([
      "93.58",
    ]);
    expect([...aprobadasAlEmpezar("2027-1C", plan, PLAN)].sort()).toEqual([
      "72.31",
      "93.58",
    ]);
    expect([...aprobadasAlEmpezar("2027-2C", plan, PLAN)].sort()).toEqual([
      "72.31",
      "72.33",
      "93.58",
    ]);
  });
});
