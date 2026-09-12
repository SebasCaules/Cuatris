/**
 * Lo que la página calcula antes de dibujar, con el plan real y el corpus.
 */

import { describe, expect, it } from "vitest";

import { planUsuarioInicial } from "../../estado/planUsuario";
import { estadoMateria } from "../../motor";
import { PERIODO_RARO, PLAN, ABREVIACIONES } from "../../motor/fixtures/reales";
import {
  creditosDelPeriodo,
  FechaIlegible,
  hitosDelPeriodo,
  materiasDeLaLista,
  materiasEnGrilla,
  materiasSinHorarioPublicado,
  nombreCorto,
  periodoDeFecha,
  periodosDelCarrusel,
  resumenDelPeriodo,
} from "./armado";
import {
  DATOS,
  PERIODO_DEL_DESTRABE,
  PERIODO_FUTURO,
  planDePrueba,
  planQueAlcanzaElBachiller,
} from "./escenario";

const PLAN_USUARIO = planDePrueba();

/** El cuatrimestre de hoy que reciben los casos que no dependen de él. */
const HOY = "2026-2C";

describe("periodoDeFecha", () => {
  it("de agosto en adelante es el segundo cuatrimestre", () => {
    expect(periodoDeFecha("2026-09-12")).toBe("2026-2C");
    expect(periodoDeFecha("2026-08-01")).toBe("2026-2C");
    expect(periodoDeFecha("2026-12-31")).toBe("2026-2C");
  });

  it("y antes, el primero", () => {
    expect(periodoDeFecha("2026-03-15")).toBe("2026-1C");
    expect(periodoDeFecha("2027-01-02")).toBe("2027-1C");
  });

  it("una fecha que no es una fecha falla ruidosamente", () => {
    expect(() => periodoDeFecha("2026-09")).toThrow(FechaIlegible);
  });
});

describe("periodosDelCarrusel", () => {
  it("cubre del primero con materias al último, con dos vacíos al final", () => {
    expect(periodosDelCarrusel(PLAN_USUARIO, PERIODO_RARO, HOY)).toEqual([
      "2026-2C",
      "2027-1C",
      "2027-2C",
      "2028-1C",
      "2028-2C",
    ]);
  });

  it("incluye el período activo aunque no tenga materias", () => {
    const vacio = { ...PLAN_USUARIO, periodos: {} };
    expect(periodosDelCarrusel(vacio, "2026-1C", HOY)).toEqual([
      "2026-1C",
      "2026-2C",
      "2027-1C",
    ]);
  });

  it("rellena el hueco entre dos cuatrimestres planificados", () => {
    const salteado = {
      ...PLAN_USUARIO,
      periodos: {
        "2026-1C": [{ codigo: "72.44" }],
        "2027-2C": [{ codigo: "72.45" }],
      },
    };
    expect(periodosDelCarrusel(salteado, null, HOY)).toEqual([
      "2026-1C",
      "2026-2C",
      "2027-1C",
      "2027-2C",
      "2028-1C",
      "2028-2C",
    ]);
  });

  it("sin materias y sin período activo arranca en el cuatrimestre de hoy", () => {
    // Es el `data/index.json` real de hoy: `horarios` vacío. Quien acaba de
    // cargar su historia tiene que poder planificar igual.
    expect(
      periodosDelCarrusel({ ...PLAN_USUARIO, periodos: {} }, null, "2026-2C"),
    ).toEqual(["2026-2C", "2027-1C", "2027-2C"]);
  });

  it("un cuatrimestre abierto sin materias también cuenta", () => {
    const abierto = { ...PLAN_USUARIO, periodos: { "2027-1C": [] } };
    expect(periodosDelCarrusel(abierto, null, "2026-2C")).toEqual([
      "2027-1C",
      "2027-2C",
      "2028-1C",
    ]);
  });
});

describe("nombres y resúmenes", () => {
  it("usa la abreviación aprobada cuando existe", () => {
    expect(nombreCorto("72.44", PLAN, ABREVIACIONES)).toBe("Cripto");
  });

  it("cae al nombre del curso para un código que el plan no tiene", () => {
    // 93.18 existe en el SGA pero no en S10-Rev23 (ver `motor/mockup.test.ts`).
    expect(nombreCorto("93.18", PLAN, ABREVIACIONES, "Álgebra Lineal")).toBe(
      "Álgebra Lineal",
    );
  });

  it("arma «n materias · n cr · ▲ n» y respeta el singular", () => {
    expect(resumenDelPeriodo(7, 39, 1)).toBe("7 materias · 39 cr · ▲ 1");
    expect(resumenDelPeriodo(1, 12, 0)).toBe("1 materia · 12 cr");
    expect(resumenDelPeriodo(0, 0, 0)).toBeUndefined();
  });
});

describe("materias del período", () => {
  it("solo entran a la grilla las comisiones elegidas con bloques", () => {
    const enGrilla = materiasEnGrilla(
      PERIODO_RARO,
      PLAN_USUARIO,
      PLAN,
      DATOS.horarios!,
      ABREVIACIONES,
    );
    expect(enGrilla.map((materia) => materia.codigo)).toEqual([
      "93.18",
      "72.44",
    ]);
    expect(enGrilla[1]?.abreviacion).toBe("Cripto");
    expect(enGrilla[1]?.comision).toBe("S");
  });

  /**
   * F4.10: `estadoMateria` da precedencia a `bloqueada` sobre `planificada`
   * («una materia planificada que quedó bloqueada tiene que verse bloqueada»,
   * `motor/estado.ts`). Sin este estado en la grilla, el bloque se dibujaba
   * como uno normal —sin borde ni glifo— y nada avisaba que no se puede cursar.
   */
  it("una planificada y bloqueada se dibuja bloqueada, no en blanco", () => {
    const sinHistoria = {
      ...planUsuarioInicial(),
      periodos: { [PERIODO_RARO]: [{ codigo: "72.44", comision: "S" }] },
    };
    expect(estadoMateria("72.44", PERIODO_RARO, sinHistoria, PLAN)).toBe(
      "bloqueada",
    );
    const enGrilla = materiasEnGrilla(
      PERIODO_RARO,
      sinHistoria,
      PLAN,
      DATOS.horarios!,
      ABREVIACIONES,
    );
    expect(enGrilla.map((materia) => materia.estado)).toEqual(["bloqueada"]);
  });

  /**
   * Decisión N0 de F3.4, mitad de la grilla: `bloquesDelPeriodo` ya saltea las
   * aprobadas, así que dibujarlas acá dejaba un bloque que el motor de choques
   * no cuenta. Pasa con una historia pegada después de planificar.
   */
  it("una planificada que la historia da por aprobada no se dibuja", () => {
    const conAprobada = {
      ...PLAN_USUARIO,
      historia: { ...PLAN_USUARIO.historia, "72.44": { estado: "aprobada" } },
    } as typeof PLAN_USUARIO;
    const enGrilla = materiasEnGrilla(
      PERIODO_RARO,
      conAprobada,
      PLAN,
      DATOS.horarios!,
      ABREVIACIONES,
    );
    expect(enGrilla.map((materia) => materia.codigo)).not.toContain("72.44");
  });

  it("15.09 se ofrece sin comisiones y baja al pie", () => {
    expect(
      materiasSinHorarioPublicado(
        PERIODO_RARO,
        PLAN_USUARIO,
        PLAN,
        DATOS.horarios!,
        ABREVIACIONES,
      ),
    ).toEqual([
      { codigo: "15.09", abreviacion: "Agile, Lean y Lean Six Sigma" },
    ]);
  });

  it("los créditos del cuatrimestre salen del plan", () => {
    // 72.44 vale 6; 93.18 y 15.09 no son materias de S10-Rev23.
    expect(creditosDelPeriodo(PERIODO_RARO, PLAN_USUARIO, PLAN)).toBe(6);
    expect(creditosDelPeriodo(PERIODO_DEL_DESTRABE, PLAN_USUARIO, PLAN)).toBe(
      12,
    );
  });

  it("la lista sin horarios trae abreviación, color y créditos", () => {
    expect(
      materiasDeLaLista(
        PERIODO_DEL_DESTRABE,
        PLAN_USUARIO,
        PLAN,
        ABREVIACIONES,
      ),
    ).toEqual([{ codigo: "72.45", abreviacion: "PF", color: 0, creditos: 12 }]);
  });
});

describe("hitos del cuatrimestre", () => {
  it("anuncia el destrabe de 72.45 donde se cumplen los 160 créditos", () => {
    expect(
      hitosDelPeriodo(PERIODO_DEL_DESTRABE, PLAN_USUARIO, PLAN, PERIODO_RARO),
    ).toEqual(["72.45 Proyecto Final se destraba con 160 cr ✓"]);
  });

  it("y no lo repite en los cuatrimestres anteriores", () => {
    expect(
      hitosDelPeriodo(PERIODO_RARO, PLAN_USUARIO, PLAN, PERIODO_RARO),
    ).toEqual([]);
    expect(
      hitosDelPeriodo(PERIODO_FUTURO, PLAN_USUARIO, PLAN, PERIODO_RARO),
    ).toEqual([]);
  });

  it("anuncia el título que se alcanza al terminar el cuatrimestre", () => {
    expect(
      hitosDelPeriodo(
        PERIODO_RARO,
        planQueAlcanzaElBachiller(),
        PLAN,
        PERIODO_RARO,
      ),
    ).toEqual([
      "✓ Al aprobar este cuatrimestre: 192 cr · Bachiller en Ingeniería",
    ]);
  });
});
