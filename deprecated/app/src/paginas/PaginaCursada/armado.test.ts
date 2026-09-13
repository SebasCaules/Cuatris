/**
 * Lo que la página calcula antes de dibujar, con el plan real y el corpus.
 */

import { describe, expect, it } from "vitest";

import { planUsuarioInicial, reducir } from "../../estado/planUsuario";
import { estadoMateria, motivosBloqueo } from "../../motor";
import {
  ABREVIACIONES,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
} from "../../motor/fixtures/reales";
import {
  autocolocar,
  CARGA_MAXIMA,
  creditosDelPeriodo,
  destinoValido,
  FechaIlegible,
  hitosDelPeriodo,
  materiasDeLaLista,
  materiasEnGrilla,
  materiasSinComision,
  materiasSinHorarioPublicado,
  nombreCorto,
  periodoDeFecha,
  periodosDelCarrusel,
  previsualizacionEn,
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
    ).toEqual([
      {
        codigo: "72.45",
        abreviacion: "PF",
        nombre: "Proyecto Final",
        color: 0,
        creditos: 12,
        // Rediseño: la fila lleva la insignia de troncal o las de minor.
        troncal: true,
        minors: [],
      },
    ]);
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

/**
 * Rediseño: la materia bajo el puntero en el panel de agregar se previsualiza
 * en cada tarjeta donde entra —sin correlativa pendiente ni choque—.
 */
describe("previsualizacionEn", () => {
  it("una disponible sin horarios en el período entra como fila", () => {
    // 72.40 Bases de Datos I: ciclo básico aprobado, nada la bloquea.
    const vista = previsualizacionEn(
      "72.40",
      PERIODO_FUTURO,
      PLAN_USUARIO,
      PLAN,
      ABREVIACIONES,
      null,
    );
    expect(vista).not.toBeNull();
    expect(vista?.codigo).toBe("72.40");
    expect(vista?.troncal).toBe(true);
    expect(vista?.enGrilla).toBeUndefined();
  });

  it("con horarios trae los bloques de la mejor comisión", () => {
    // 72.44 no está planificada en este plan vacío de cursada: con el corpus,
    // su única comisión S entra en la grilla.
    const vista = previsualizacionEn(
      "72.44",
      PERIODO_RARO,
      { ...PLAN_USUARIO, periodos: {} },
      PLAN,
      ABREVIACIONES,
      HORARIOS_RAROS,
    );
    expect(vista?.enGrilla?.comision).toBe("S");
    expect(vista?.enGrilla?.bloques.length).toBeGreaterThan(0);
  });

  it("no entra si está bloqueada, ya planificada o aprobada", () => {
    // 72.45 exige 160 créditos: en el cuatrimestre del corpus no entra.
    expect(
      previsualizacionEn(
        "72.45",
        PERIODO_RARO,
        { ...PLAN_USUARIO, periodos: {} },
        PLAN,
        ABREVIACIONES,
        null,
      ),
    ).toBeNull();
    // 72.41 ya está planificada en 1.º 2027: no se duplica en otro lado.
    expect(
      previsualizacionEn(
        "72.41",
        PERIODO_DEL_DESTRABE,
        PLAN_USUARIO,
        PLAN,
        ABREVIACIONES,
        null,
      ),
    ).toBeNull();
    // 93.26 está aprobada.
    expect(
      previsualizacionEn(
        "93.26",
        PERIODO_FUTURO,
        PLAN_USUARIO,
        PLAN,
        ABREVIACIONES,
        null,
      ),
    ).toBeNull();
  });

  it("no entra si su mejor comisión choca con lo que ya hay", () => {
    // Con 93.18 com. A ya en el corpus, la comisión S de 72.44 se pisa el
    // lunes de 15 a 16: la previsualización no se dibuja.
    const sinCripto = {
      ...PLAN_USUARIO,
      periodos: {
        ...PLAN_USUARIO.periodos,
        [PERIODO_RARO]: [{ codigo: "93.18", comision: "A" }],
      },
    };
    expect(
      previsualizacionEn(
        "72.44",
        PERIODO_RARO,
        sinCripto,
        PLAN,
        ABREVIACIONES,
        HORARIOS_RAROS,
      ),
    ).toBeNull();
  });
});

/** Rediseño: el arrastre entre tarjetas se valida con la simulación. */
describe("destinoValido", () => {
  it("mover una materia a donde sus correlativas ya están es válido", () => {
    // 72.42 POD de 1.º 2027 a 2.º 2027: sus correlativas siguen antes.
    expect(
      destinoValido("72.42", PERIODO_FUTURO, PERIODO_DEL_DESTRABE, PLAN_USUARIO, PLAN),
    ).toBe(true);
  });

  it("mover la correlativa después de lo que la necesita no es válido", () => {
    // 72.41 BD2 es correlativa de 72.80: con 72.80 en 2.º 2027, llevar 72.41 a
    // ese mismo cuatrimestre la deja bloqueada.
    const conBD2 = reducir(PLAN_USUARIO, {
      tipo: "agregarMateria",
      periodo: PERIODO_DEL_DESTRABE,
      codigo: "72.80",
    });
    expect(
      destinoValido("72.41", PERIODO_FUTURO, PERIODO_DEL_DESTRABE, conBD2, PLAN),
    ).toBe(false);
  });

  it("la misma tarjeta no es un destino", () => {
    expect(
      destinoValido("72.42", PERIODO_FUTURO, PERIODO_FUTURO, PLAN_USUARIO, PLAN),
    ).toBe(false);
  });
});

/** Rediseño: las troncales pendientes se autocolocan. */
describe("autocolocar", () => {
  const PERIODOS = periodosDelCarrusel(PLAN_USUARIO, PERIODO_RARO, HOY);

  it("coloca todas las troncales pendientes respetando correlativas y carga", () => {
    const colocaciones = autocolocar(PLAN_USUARIO, PLAN, PERIODOS);
    const pendientes = PLAN.materias.filter(
      (materia) =>
        materia.vigente &&
        materia.ciclo !== "electiva" &&
        PLAN_USUARIO.historia[materia.codigo] === undefined &&
        !Object.values(PLAN_USUARIO.periodos)
          .flat()
          .some((planificada) => planificada.codigo === materia.codigo),
    );
    expect(colocaciones.map((c) => c.codigo).sort()).toEqual(
      pendientes.map((m) => m.codigo).sort(),
    );

    // Sobre el plan resultante ninguna queda bloqueada donde cayó, y ningún
    // cuatrimestre pasa la carga máxima.
    const resultado = reducir(PLAN_USUARIO, { tipo: "agregarVarias", colocaciones });
    for (const { periodo, codigo } of colocaciones) {
      expect(motivosBloqueo(codigo, periodo, resultado, PLAN)).toEqual([]);
    }
    for (const periodo of Object.keys(resultado.periodos)) {
      expect(creditosDelPeriodo(periodo, resultado, PLAN)).toBeLessThanOrEqual(
        CARGA_MAXIMA,
      );
    }
  });

  it("lo que ya estaba planificado no se toca ni se repite", () => {
    const colocaciones = autocolocar(PLAN_USUARIO, PLAN, PERIODOS);
    expect(colocaciones.map((c) => c.codigo)).not.toContain("72.41");
    expect(colocaciones.map((c) => c.codigo)).not.toContain("72.45");
  });

  it("sin troncales pendientes no coloca nada", () => {
    const todo: Record<string, { estado: "aprobada" }> = {};
    for (const materia of PLAN.materias) {
      if (materia.ciclo !== "electiva") {
        todo[materia.codigo] = { estado: "aprobada" };
      }
    }
    const plan = { ...planUsuarioInicial(), historia: todo };
    expect(autocolocar(plan, PLAN, PERIODOS)).toEqual([]);
  });
});

/**
 * Rediseño: una materia planificada en el cuatrimestre con horarios pero que
 * la grilla no dibuja —llegó por arrastre y el período no la ofrece, o no
 * tiene comisión elegida— baja al pie como fila, en vez de desaparecer.
 */
describe("materiasSinComision", () => {
  it("lista lo que no se ofrece o no tiene comisión, y nada más", () => {
    // 72.42 POD no está en el corpus del período; 72.44 sí, sin comisión.
    const plan = {
      ...PLAN_USUARIO,
      periodos: {
        [PERIODO_RARO]: [
          { codigo: "93.18", comision: "A" },
          { codigo: "72.44" },
          { codigo: "72.42" },
          { codigo: "15.09" },
        ],
      },
    };
    const codigos = materiasSinComision(
      PERIODO_RARO,
      plan,
      PLAN,
      HORARIOS_RAROS,
      ABREVIACIONES,
    ).map((materia) => materia.codigo);
    // 93.18 está en la grilla; 15.09 se ofrece sin comisiones publicadas y va
    // por `materiasSinHorarioPublicado`.
    expect(codigos).toEqual(["72.44", "72.42"]);
  });

  it("con todo en la grilla no lista nada", () => {
    expect(
      materiasSinComision(
        PERIODO_RARO,
        PLAN_USUARIO,
        PLAN,
        HORARIOS_RAROS,
        ABREVIACIONES,
      ),
    ).toEqual([]);
  });
});
