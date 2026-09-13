/**
 * Reglas de la lista de 13c, con el plan real y la fixture de casos raros.
 * Nada inventado: los códigos y los créditos salen de `data/v1/`.
 */

import { describe, expect, it } from "vitest";

import {
  ABREVIACIONES,
  codigosDelCiclo,
  historiaCon,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  planCon,
  planVacio,
} from "../../motor/fixtures/reales";
import {
  estadoDeFila,
  filasDeResultados,
  FILTROS_INICIALES,
  leyendaDeMinors,
  ofertaDeFila,
  textoDeMotivo,
  type EstadoFila,
  type Filtros,
  type OpcionesLista,
} from "./resultados";

const BASICO = codigosDelCiclo("basico");
/** El escenario de 13b: ciclo básico aprobado, nada planificado todavía. */
const CON_BASICO = planCon(historiaCon(BASICO), {});

function lista(
  texto: string,
  filtros: Partial<Filtros> = {},
  planUsuario = CON_BASICO,
): string[] {
  const opciones: OpcionesLista = {
    texto,
    filtros: { ...FILTROS_INICIALES, ...filtros },
    periodo: PERIODO_RARO,
    plan: PLAN,
    abreviaciones: ABREVIACIONES,
    planUsuario,
    horarios: HORARIOS_RAROS,
  };
  return filasDeResultados(opciones).map((fila) => fila.materia.codigo);
}

/** El motivo que la fila muestra en su única línea. */
function primerMotivo(estado: EstadoFila): string {
  if (estado.tipo !== "bloqueada") {
    return "";
  }
  const motivo = estado.motivos[0];
  return motivo === undefined ? "" : textoDeMotivo(motivo, ABREVIACIONES);
}

describe("filasDeResultados", () => {
  it("«pod» pone 72.42 primero: es su abreviación", () => {
    expect(lista("pod")[0]).toBe("72.42");
  });

  it("sin texto ordena por cuatrimestre sugerido y después por código", () => {
    const codigos = lista("", {}, planVacio());
    expect(codigos.length).toBeGreaterThan(100);
    const claves = codigos.map((codigo) => {
      const materia = PLAN.materias.find(
        (candidata) => candidata.codigo === codigo,
      );
      // Las electivas no tienen cuatrimestre sugerido: van al final.
      const sugerido =
        materia?.cuatrimestre_sugerido ?? Number.MAX_SAFE_INTEGER;
      return `${String(sugerido).padStart(20, "0")}-${codigo}`;
    });
    expect(claves).toEqual([...claves].sort());
    expect(codigos[0]).toBe("31.08");
  });

  // Rediseño: dos toggles independientes por ciclo, sin filtro de créditos.
  it("sin «Troncales» quedan solo las electivas", () => {
    const electivas = lista("análisis", { troncales: false });
    expect(electivas).toContain("72.72");
    // 93.26 Análisis Matemático I es del ciclo básico.
    expect(electivas).not.toContain("93.26");
    expect(lista("análisis")).toContain("93.26");
    for (const codigo of electivas) {
      const materia = PLAN.materias.find(
        (candidata) => candidata.codigo === codigo,
      );
      expect(materia?.ciclo).toBe("electiva");
    }
  });

  it("sin «Electivas» quedan solo las troncales", () => {
    const troncales = lista("análisis", { electivas: false });
    expect(troncales).toContain("93.26");
    expect(troncales).not.toContain("72.72");
  });

  it("con los dos toggles apagados no queda nada", () => {
    expect(lista("", { troncales: false, electivas: false })).toEqual([]);
  });

  it("las aprobadas se listan igual, al final cuando no hay texto", () => {
    // 93.26 está en el ciclo básico, que la historia da por aprobado.
    expect(lista("93.26")).toEqual(["93.26"]);
    const todas = lista("");
    const aprobadas = todas.filter(
      (codigo) => CON_BASICO.historia[codigo]?.estado === "aprobada",
    );
    expect(aprobadas.length).toBeGreaterThan(0);
    expect(todas.slice(-aprobadas.length)).toEqual(aprobadas);
  });

  it("las bloqueadas siguen en la lista, como dice el pie de 13c", () => {
    expect(lista("72.45")).toContain("72.45");
  });

  it("una materia que el plan no marca vigente nunca se lista", () => {
    const noVigente = PLAN.materias.find((materia) => !materia.vigente);
    expect(noVigente).toBeDefined();
    if (noVigente === undefined) {
      return;
    }
    expect(lista(noVigente.codigo)).toEqual([]);
  });

  it("sin coincidencias devuelve la lista vacía", () => {
    expect(lista("xyz")).toEqual([]);
  });
});

describe("estadoDeFila", () => {
  it("72.45 está bloqueada por los 160 créditos", () => {
    const estado = estadoDeFila("72.45", PERIODO_RARO, CON_BASICO, PLAN);
    expect(estado.tipo).toBe("bloqueada");
    if (estado.tipo !== "bloqueada") {
      return;
    }
    expect(primerMotivo(estado)).toBe("requiere 160 cr, tenés 147");
  });

  it("una correlativa que falta se nombra con su abreviación", () => {
    const estado = estadoDeFila("72.20", PERIODO_RARO, planVacio(), PLAN);
    expect(estado.tipo).toBe("bloqueada");
    if (estado.tipo !== "bloqueada") {
      return;
    }
    // 72.07 es la única correlativa de 72.20 en el plan real.
    expect(primerMotivo(estado)).toBe("falta 72.07 Protos");
  });

  it("una correlativa planificada en el mismo período dice dónde está", () => {
    const conPlan = planCon(historiaCon(BASICO), {
      [PERIODO_RARO]: [{ codigo: "72.41" }],
    });
    const estado = estadoDeFila("72.80", PERIODO_RARO, conPlan, PLAN);
    expect(estado.tipo).toBe("bloqueada");
    if (estado.tipo !== "bloqueada") {
      return;
    }
    expect(primerMotivo(estado)).toBe("72.41 BD2 la cursás en 2.º 2026");
  });

  it("lo que ya está en otro cuatrimestre se marca con su período", () => {
    const conPlan = planCon(historiaCon(BASICO), {
      "2027-1C": [{ codigo: "72.42" }],
    });
    expect(estadoDeFila("72.42", PERIODO_RARO, conPlan, PLAN)).toEqual({
      tipo: "enElPlan",
      periodo: "2027-1C",
    });
  });

  it("las aprobadas y las que estás cursando se distinguen", () => {
    expect(estadoDeFila("93.26", PERIODO_RARO, CON_BASICO, PLAN)).toEqual({
      tipo: "aprobada",
    });
    const cursando = planCon(historiaCon(["93.26"], "cursando"), {});
    expect(estadoDeFila("93.26", PERIODO_RARO, cursando, PLAN)).toEqual({
      tipo: "cursando",
    });
  });
});

describe("ofertaDeFila", () => {
  it("muestra el primer bloque de la comisión con menos choques", () => {
    // 72.44 Criptografía tiene una sola comisión, «S», lunes 15–18 en 002R.
    expect(
      ofertaDeFila("72.44", PERIODO_RARO, CON_BASICO, HORARIOS_RAROS),
    ).toEqual({
      comisiones: 1,
      cupoLleno: false,
      horario: "Lun 15–18 · 002R",
      franja: "Lun 15–18",
      aulas: ["002R"],
      cupo: "51/70",
    });
  });

  it("con varias comisiones toma la mejor y su bloque más temprano", () => {
    // 93.18 tiene nueve comisiones (A–H y K). Sin nada planificado ninguna
    // choca, así que gana la primera con cupo: la A está 48/48 y queda atrás.
    const oferta = ofertaDeFila(
      "93.18",
      PERIODO_RARO,
      planVacio(),
      HORARIOS_RAROS,
    );
    expect(oferta.comisiones).toBe(9);
    expect(oferta.horario).toBe("Lun 12–14 · 007R");
    expect(oferta.cupoLleno).toBe(false);
  });

  it("un curso sin comisiones publicadas no ofrece nada", () => {
    // 15.09 Agile / Lean está en el archivo sin ninguna comisión.
    expect(
      ofertaDeFila("15.09", PERIODO_RARO, CON_BASICO, HORARIOS_RAROS),
    ).toEqual({
      comisiones: 0,
      cupoLleno: false,
      horario: "",
      franja: "",
      aulas: [],
      cupo: "",
    });
  });

  it("una materia que no se dicta en el período tampoco", () => {
    expect(
      ofertaDeFila("72.42", PERIODO_RARO, CON_BASICO, HORARIOS_RAROS).comisiones,
    ).toBe(0);
  });

  it("los horarios de otro período se ignoran en vez de romper", () => {
    expect(
      ofertaDeFila("72.44", "2027-1C", CON_BASICO, HORARIOS_RAROS).comisiones,
    ).toBe(0);
  });
});

describe("leyendaDeMinors", () => {
  it("sale del plan, no de una lista escrita a mano", () => {
    expect(leyendaDeMinors(PLAN)).toBe(
      "CD Ciencia de Datos · IA Inteligencia Artificial · " +
        "IRV Imágenes y Realidad Virtual · ARQ Arquitectura de Software",
    );
  });
});
