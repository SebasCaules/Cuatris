/**
 * El escenario del mockup, de punta a punta, con datos reales.
 *
 * Es el recorrido que muestran las pantallas 13b, 13f y 13i: alguien que
 * terminó el ciclo básico, arma el cuatrimestre 2026-2C y se encuentra con un
 * choque y con Proyecto Final bloqueada.
 *
 * Dos diferencias con el mockup, anotadas acá para que no se lean como un
 * error del motor:
 *
 * - **72.45 Proyecto Final no tiene correlativas en S10-Rev23**: la bloquean los
 *   160 créditos y nada más. El plan real no la hace depender de 72.41. La regla
 *   de correlativas se ejercita con 72.80 Big Data, que sí exige 72.41.
 * - **93.18 Álgebra Lineal no es materia de S10-Rev23**: existe en el SGA y en
 *   el corpus de horarios, y es la que el mockup usa para el choque. Por eso
 *   aparece en el cuatrimestre del usuario pero no en las cuentas del plan.
 */

import { describe, expect, it } from "vitest";

import { creditosAlEmpezar } from "./creditos";
import { estadoMateria, motivosBloqueo, seDestrabaEn } from "./estado";
import { choques, ordenarComisiones } from "./horarios";
import { electivas, minors, progresoTitulos } from "./progreso";
import {
  codigosDelCiclo,
  historiaCon,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  planCon,
} from "./fixtures/reales";

const BASICO = codigosDelCiclo("basico");

/** 2026-2C con 72.41, 72.44 y 72.42, más el 93.18 del mockup. */
const PLAN_USUARIO = planCon(historiaCon(BASICO), {
  [PERIODO_RARO]: [
    { codigo: "72.41" },
    { codigo: "72.44", comision: "S" },
    { codigo: "72.42" },
    { codigo: "93.18", comision: "A" },
  ],
});

describe("escenario del mockup", () => {
  it("el ciclo básico aprobado alcanza para Analista y no para los otros dos", () => {
    const titulos = progresoTitulos(PLAN_USUARIO, PLAN);
    expect(
      titulos.map((titulo) => [titulo.id, titulo.alcanzado] as const),
    ).toEqual([
      ["analista", true],
      ["bachiller", false],
      ["ingeniero", false],
    ]);
    expect(titulos[0]?.creditos).toBe(147);
  });

  it("72.45 Proyecto Final está bloqueada por los 160 créditos", () => {
    expect(estadoMateria("72.45", PERIODO_RARO, PLAN_USUARIO, PLAN)).toBe(
      "bloqueada",
    );
    expect(motivosBloqueo("72.45", PERIODO_RARO, PLAN_USUARIO, PLAN)).toEqual([
      { tipo: "creditos", requeridos: 160, tienes: 147 },
    ]);
  });

  it("y se destraba en 2027-1C con lo planificado en 2026-2C", () => {
    // 147 + 72.41 (6) + 72.44 (6) + 72.42 (3) = 162 al empezar 2027-1C.
    expect(creditosAlEmpezar("2027-1C", PLAN_USUARIO, PLAN)).toBe(162);
    expect(seDestrabaEn("72.45", PLAN_USUARIO, PLAN)).toBe("2027-1C");
  });

  it("72.80 está bloqueada por una correlativa planificada en el mismo período", () => {
    expect(motivosBloqueo("72.80", PERIODO_RARO, PLAN_USUARIO, PLAN)).toEqual([
      {
        tipo: "correlativa",
        codigo: "72.41",
        estado: "planificada_en",
        periodo: PERIODO_RARO,
      },
    ]);
    expect(seDestrabaEn("72.80", PLAN_USUARIO, PLAN)).toBe("2027-1C");
  });

  it("93.18 comisión A choca con 72.44 comisión S el lunes", () => {
    const encontrados = choques(PERIODO_RARO, PLAN_USUARIO, HORARIOS_RAROS);
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]?.dia).toBe("lunes");
    expect(encontrados[0]?.desde).toBe("15:00");
    expect(encontrados[0]?.hasta).toBe("16:00");
  });

  it("y la primera comisión sugerida para 93.18 lo resuelve", () => {
    const mejor = ordenarComisiones(
      "93.18",
      PERIODO_RARO,
      PLAN_USUARIO,
      HORARIOS_RAROS,
    )[0];
    expect(mejor?.id).toBe("B");
    expect(mejor?.choques).toBe(0);
    expect(mejor?.cupoLleno).toBe(false);
    expect(mejor?.consecuencias).toEqual([]);
  });

  it("el panel de progreso muestra electivas en cero y los cuatro minors", () => {
    expect(electivas(PLAN_USUARIO, PLAN)).toEqual({
      aprobados: 0,
      planificados: 0,
      requeridos: 27,
      lista: [],
    });
    expect(
      minors(PLAN_USUARIO, PLAN).map((minor) => [minor.sigla, minor.faltan]),
    ).toEqual([
      ["CD", 14],
      ["IA", 14],
      ["IRV", 14],
      ["ARQ", 14],
    ]);
  });
});
