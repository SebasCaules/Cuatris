import { describe, expect, it } from "vitest";

import { MateriaDesconocida, SinPeriodoDeReferencia } from "./errores";
import {
  estadoMateria,
  habilita,
  motivosBloqueo,
  seDestrabaEn,
} from "./estado";
import {
  codigosDelCiclo,
  historiaCon,
  PLAN,
  planCon,
  planVacio,
} from "./fixtures/reales";

const BASICO = codigosDelCiclo("basico");

describe("motivosBloqueo", () => {
  it("sin nada aprobado, una materia de primero no está bloqueada", () => {
    // 93.58 Álgebra: sin correlativas ni créditos requeridos.
    expect(motivosBloqueo("93.58", "2026-2C", planVacio(), PLAN)).toEqual([]);
  });

  it("informa las correlativas que faltan, en el orden del plan", () => {
    // 72.41 Base de Datos II exige 72.11 y 72.37.
    expect(motivosBloqueo("72.41", "2026-2C", planVacio(), PLAN)).toEqual([
      { tipo: "correlativa", codigo: "72.11", estado: "falta" },
      { tipo: "correlativa", codigo: "72.37", estado: "falta" },
    ]);
  });

  it("72.45 Proyecto Final queda bloqueada por créditos con el básico aprobado", () => {
    const plan = planCon(historiaCon(BASICO), {});
    expect(motivosBloqueo("72.45", "2026-2C", plan, PLAN)).toEqual([
      { tipo: "creditos", requeridos: 160, tienes: 147 },
    ]);
  });

  it("una correlativa planificada en el mismo período bloquea; en uno anterior, no", () => {
    // 72.80 Big Data exige solo 72.41.
    const plan = planCon(historiaCon(BASICO), {
      "2026-2C": [{ codigo: "72.41" }],
    });
    expect(motivosBloqueo("72.80", "2026-2C", plan, PLAN)).toEqual([
      {
        tipo: "correlativa",
        codigo: "72.41",
        estado: "planificada_en",
        periodo: "2026-2C",
      },
    ]);
    expect(motivosBloqueo("72.80", "2027-1C", plan, PLAN)).toEqual([]);
  });

  it("una correlativa planificada más adelante también bloquea", () => {
    const plan = planCon(historiaCon(BASICO), {
      "2026-2C": [],
      "2027-2C": [{ codigo: "72.41" }],
    });
    expect(motivosBloqueo("72.80", "2026-2C", plan, PLAN)).toEqual([
      {
        tipo: "correlativa",
        codigo: "72.41",
        estado: "planificada_en",
        periodo: "2027-2C",
      },
    ]);
  });

  it("una materia que el plan no conoce es un error, no una lista vacía", () => {
    expect(() => motivosBloqueo("93.18", "2026-2C", planVacio(), PLAN)).toThrow(
      MateriaDesconocida,
    );
  });
});

describe("estadoMateria", () => {
  const plan = planCon(historiaCon([...BASICO, "72.41"]), {
    "2026-2C": [{ codigo: "72.44" }],
  });

  it("lo aprobado manda sobre todo", () => {
    expect(estadoMateria("72.41", "2026-2C", plan, PLAN)).toBe("aprobada");
  });

  it("regular y cursando caen los dos en cursando", () => {
    const conRegular = planCon(historiaCon(["93.58"], "regular"), {});
    const conCursando = planCon(historiaCon(["93.58"], "cursando"), {});
    expect(estadoMateria("93.58", "2026-2C", conRegular, PLAN)).toBe("cursando");
    expect(estadoMateria("93.58", "2026-2C", conCursando, PLAN)).toBe(
      "cursando",
    );
  });

  it("lo planificado y sin bloqueos es planificada", () => {
    expect(estadoMateria("72.44", "2026-2C", plan, PLAN)).toBe("planificada");
  });

  it("lo que se puede cursar y no está en el plan es disponible", () => {
    expect(estadoMateria("72.42", "2026-2C", plan, PLAN)).toBe("disponible");
  });

  it("un bloqueo manda sobre el hecho de estar planificada", () => {
    const conBloqueo = planCon(historiaCon(BASICO), {
      "2026-2C": [{ codigo: "72.41" }, { codigo: "72.80" }],
    });
    expect(estadoMateria("72.80", "2026-2C", conBloqueo, PLAN)).toBe(
      "bloqueada",
    );
    expect(estadoMateria("72.41", "2026-2C", conBloqueo, PLAN)).toBe(
      "planificada",
    );
  });
});

describe("seDestrabaEn", () => {
  it("encuentra el período en que alcanzan los créditos (escenario del mockup)", () => {
    // Básico aprobado = 147 créditos; 72.45 exige 160. Planificando 72.41 (6),
    // 72.44 (6) y 72.42 (3) en 2026-2C se llega a 162 al empezar 2027-1C.
    const plan = planCon(historiaCon(BASICO), {
      "2026-2C": [{ codigo: "72.41" }, { codigo: "72.44" }, { codigo: "72.42" }],
    });
    expect(seDestrabaEn("72.45", plan, PLAN)).toBe("2027-1C");
    expect(seDestrabaEn("72.45", plan, PLAN, "2026-2C")).toBe("2027-1C");
  });

  it("devuelve el período en que la correlativa ya está cursada", () => {
    const plan = planCon(historiaCon(BASICO), {
      "2026-2C": [{ codigo: "72.41" }],
    });
    expect(seDestrabaEn("72.80", plan, PLAN, "2026-2C")).toBe("2027-1C");
  });

  it("devuelve null si no se destraba en el tramo mirado", () => {
    const plan = planCon({}, { "2026-2C": [] });
    expect(seDestrabaEn("72.45", plan, PLAN)).toBeNull();
  });

  it("es el propio período si ya está disponible", () => {
    expect(seDestrabaEn("93.58", planVacio(), PLAN, "2026-2C")).toBe("2026-2C");
  });

  it("sin períodos y sin punto de partida, falla ruidosamente", () => {
    expect(() => seDestrabaEn("72.45", planVacio(), PLAN)).toThrow(
      SinPeriodoDeReferencia,
    );
  });
});

describe("habilita", () => {
  it("lista las materias que tienen a esta como correlativa", () => {
    expect(habilita("72.41", PLAN)).toEqual([
      "72.54",
      "72.80",
      "72.82",
      "72.92",
      "73.40",
      "73.50",
    ]);
  });

  it("una materia terminal no habilita nada", () => {
    expect(habilita("72.45", PLAN)).toEqual([]);
  });

  it("un código que no está en el plan es un error", () => {
    expect(() => habilita("93.18", PLAN)).toThrow(MateriaDesconocida);
  });
});
