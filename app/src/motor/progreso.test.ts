import { describe, expect, it } from "vitest";

import { electivas, minors, progresoTitulos } from "./progreso";
import {
  codigosDelCiclo,
  historiaCon,
  PLAN,
  planCon,
  planVacio,
} from "./fixtures/reales";

const BASICO = codigosDelCiclo("basico");
const PROFESIONAL = codigosDelCiclo("profesional");

function titulo(id: string, resultado: ReturnType<typeof progresoTitulos>) {
  const encontrado = resultado.find((entrada) => entrada.id === id);
  if (encontrado === undefined) {
    throw new Error(`El plan no declara el título ${id}`);
  }
  return encontrado;
}

describe("progresoTitulos", () => {
  it("con el ciclo básico aprobado, Analista está alcanzado", () => {
    const resultado = progresoTitulos(planCon(historiaCon(BASICO), {}), PLAN);
    const analista = titulo("analista", resultado);
    expect(analista.alcanzado).toBe(true);
    expect(analista.creditos).toBe(147);
    expect(analista.requeridos).toBe(147);
    expect(analista.faltanItems).toEqual([]);
    expect(analista.estimado).toBeNull();
  });

  it("Analista exige los ítems de 0 créditos del ciclo básico", () => {
    // 94.51 Inglés I vale 0 créditos: sin él sobran créditos y falta el ítem.
    const sinIngles = BASICO.filter((codigo) => codigo !== "94.51");
    const resultado = progresoTitulos(planCon(historiaCon(sinIngles), {}), PLAN);
    const analista = titulo("analista", resultado);
    expect(analista.creditos).toBe(147);
    expect(analista.faltanItems).toEqual(["94.51"]);
    expect(analista.alcanzado).toBe(false);
  });

  it("estima el cuatrimestre en que la simulación optimista alcanza Bachiller", () => {
    // 147 del básico + 45 créditos del ciclo profesional planificados = 192.
    const planificadas = [
      "72.40",
      "72.41",
      "72.42",
      "93.75",
      "72.25",
      "72.27",
      "72.43",
      "72.44",
      "72.20",
    ];
    const plan = planCon(historiaCon(BASICO), {
      "2026-2C": planificadas.map((codigo) => ({ codigo })),
    });
    const bachiller = titulo("bachiller", progresoTitulos(plan, PLAN));
    expect(bachiller.alcanzado).toBe(false);
    expect(bachiller.creditos).toBe(147);
    expect(bachiller.requeridos).toBe(192);
    expect(bachiller.estimado).toBe("2026-2C");
  });

  it("sin plan que alcance el título, el estimado es null", () => {
    const bachiller = titulo(
      "bachiller",
      progresoTitulos(planCon(historiaCon(BASICO), {}), PLAN),
    );
    expect(bachiller.estimado).toBeNull();
  });

  it("Ingeniero exige además los ítems del ciclo profesional", () => {
    const plan = planCon(historiaCon([...BASICO, ...PROFESIONAL]), {});
    const ingeniero = titulo("ingeniero", progresoTitulos(plan, PLAN));
    expect(ingeniero.faltanItems).toEqual([]);
    // 147 + 69 = 216 créditos: faltan los 27 de electivas para llegar a 243.
    expect(ingeniero.creditos).toBe(216);
    expect(ingeniero.requeridos).toBe(243);
    expect(ingeniero.alcanzado).toBe(false);
  });

  it("devuelve los tres títulos del plan, en el orden del plan", () => {
    expect(progresoTitulos(planVacio(), PLAN).map((entrada) => entrada.id)).toEqual(
      ["analista", "bachiller", "ingeniero"],
    );
  });
});

describe("electivas", () => {
  it("separa lo aprobado de lo planificado contra los 27 créditos", () => {
    const plan = planCon(historiaCon(["72.80"]), {
      "2026-2C": [{ codigo: "72.54" }, { codigo: "72.41" }],
    });
    const resultado = electivas(plan, PLAN);
    expect(resultado.requeridos).toBe(27);
    expect(resultado.aprobados).toBe(3);
    expect(resultado.planificados).toBe(3);
    // 72.41 es del ciclo profesional: no suma a electivas.
    expect(resultado.lista).toEqual([
      { codigo: "72.80", creditos: 3, estado: "aprobada" },
      { codigo: "72.54", creditos: 3, estado: "planificada" },
    ]);
  });

  it("sin electivas, todo en cero", () => {
    const resultado = electivas(planVacio(), PLAN);
    expect(resultado).toEqual({
      aprobados: 0,
      planificados: 0,
      requeridos: 27,
      lista: [],
    });
  });
});

describe("minors", () => {
  it("son cuatro y el mínimo es 14 créditos", () => {
    const resultado = minors(planVacio(), PLAN);
    expect(resultado.map((minor) => minor.sigla)).toEqual([
      "CD",
      "IA",
      "IRV",
      "ARQ",
    ]);
    expect(resultado.every((minor) => minor.minimos === 14)).toBe(true);
    expect(resultado.every((minor) => minor.faltan === 14)).toBe(true);
  });

  it("una electiva de varios minors suma en todos ellos", () => {
    // 72.80 Big Data (3 créditos) pertenece a CD, IA e IRV.
    const plan = planCon(historiaCon(["72.80"]), {});
    const resultado = minors(plan, PLAN);
    const porSigla = new Map(resultado.map((minor) => [minor.sigla, minor]));
    expect(porSigla.get("CD")?.creditos).toBe(3);
    expect(porSigla.get("CD")?.faltan).toBe(11);
    expect(porSigla.get("IA")?.creditos).toBe(3);
    expect(porSigla.get("IRV")?.creditos).toBe(3);
    expect(porSigla.get("ARQ")?.creditos).toBe(0);
  });

  it("lo planificado se informa aparte de lo aprobado", () => {
    const plan = planCon({}, { "2026-2C": [{ codigo: "72.80" }] });
    const porSigla = new Map(
      minors(plan, PLAN).map((minor) => [minor.sigla, minor]),
    );
    expect(porSigla.get("CD")?.creditos).toBe(0);
    expect(porSigla.get("CD")?.planificados).toBe(3);
    expect(porSigla.get("CD")?.faltan).toBe(14);
  });
});
