/**
 * El armado del plan de estudios, contra el plan real (`S10-Rev23.json`).
 *
 * Se prueba con el archivo publicado y no con un plan de juguete: lo que tiene
 * que salir bien es el plan del ITBA, con sus 163 materias, sus electivas no
 * vigentes y sus ítems de cero créditos.
 */

import { describe, expect, it } from "vitest";

import type { Materia, Plan } from "../../contrato/tipos";
import { ABREVIACIONES, PLAN } from "../../motor/fixtures/reales";
import {
  anioYCuatrimestre,
  aniosDelPlan,
  electivasDelPlan,
  filtrarElectivas,
  ROTULO_CICLO,
  seMuestra,
  type Historia,
} from "./armado";

const SIN_HISTORIA: Historia = {};

describe("anioYCuatrimestre", () => {
  it("parte el cuatrimestre sugerido en año y mitad: impar es el 1.º", () => {
    expect(anioYCuatrimestre(1)).toEqual({ anio: 1, cuatrimestre: 1 });
    expect(anioYCuatrimestre(2)).toEqual({ anio: 1, cuatrimestre: 2 });
    expect(anioYCuatrimestre(3)).toEqual({ anio: 2, cuatrimestre: 1 });
    expect(anioYCuatrimestre(9)).toEqual({ anio: 5, cuatrimestre: 1 });
    expect(anioYCuatrimestre(10)).toEqual({ anio: 5, cuatrimestre: 2 });
  });
});

describe("aniosDelPlan", () => {
  it("arma los cinco años, con sus dos columnas cada uno", () => {
    const { anios, sinCuatrimestre } = aniosDelPlan(PLAN, SIN_HISTORIA);
    expect(anios.map((anio) => anio.titulo)).toEqual([
      "Año 1",
      "Año 2",
      "Año 3",
      "Año 4",
      "Año 5",
    ]);
    for (const anio of anios) {
      expect(anio.columnas.map((columna) => columna.rotulo)).toEqual([
        "1.º CUATRIMESTRE",
        "2.º CUATRIMESTRE",
      ]);
    }
    // Hoy todas las obligatorias del plan traen cuatrimestre sugerido.
    expect(sinCuatrimestre).toBeNull();
  });

  it("el año 1 trae 5 + 4 materias, en el orden del archivo del plan", () => {
    const { anios } = aniosDelPlan(PLAN, SIN_HISTORIA);
    const [anio1] = anios;
    const columnas = anio1?.columnas ?? [];
    expect(columnas[0]?.materias.map((materia) => materia.codigo)).toEqual([
      "31.08",
      "72.03",
      "93.26",
      "93.58",
      "94.24",
    ]);
    expect(columnas[1]?.materias.map((materia) => materia.codigo)).toEqual([
      "72.31",
      "93.28",
      "93.41",
      "93.59",
    ]);
  });

  it("rotula el ciclo del año, y con los dos los separa con «·»", () => {
    const { anios } = aniosDelPlan(PLAN, SIN_HISTORIA);
    expect(anios[0]?.ciclo).toBe(ROTULO_CICLO.basico);
    // El año 5 es todo profesional.
    expect(anios[4]?.ciclo).toBe(ROTULO_CICLO.profesional);
    const mezclados = anios.filter((anio) => anio.ciclo.includes(" · "));
    for (const anio of mezclados) {
      expect(anio.ciclo).toBe(
        `${ROTULO_CICLO.basico} · ${ROTULO_CICLO.profesional}`,
      );
    }
  });

  it("no deja ninguna obligatoria afuera", () => {
    const { anios } = aniosDelPlan(PLAN, SIN_HISTORIA);
    const listadas = anios.flatMap((anio) =>
      anio.columnas.flatMap((columna) =>
        columna.materias.map((materia) => materia.codigo),
      ),
    );
    const obligatorias = PLAN.materias.filter(
      (materia) => materia.ciclo !== "electiva",
    );
    expect(listadas).toHaveLength(obligatorias.length);
    expect(new Set(listadas).size).toBe(obligatorias.length);
  });

  /**
   * El contrato permite una obligatoria sin cuatrimestre sugerido. Hoy no hay
   * ninguna, pero si apareciera no se puede esconder ni inventarle un año.
   */
  it("una obligatoria sin cuatrimestre sugerido cae en su propia tarjeta", () => {
    const suelta: Materia = {
      codigo: "99.99",
      nombre: "Materia sin año",
      creditos: 3,
      ciclo: "profesional",
      correlativas: [],
      creditos_requeridos: 0,
      cuatrimestre_sugerido: null,
      minors: [],
      vigente: true,
    };
    const plan: Plan = { ...PLAN, materias: [...PLAN.materias, suelta] };
    const { anios, sinCuatrimestre } = aniosDelPlan(plan, SIN_HISTORIA);
    expect(anios).toHaveLength(5);
    expect(sinCuatrimestre?.columnas[0]?.materias).toEqual([suelta]);
  });
});

describe("seMuestra", () => {
  const noVigente = PLAN.materias.find((materia) => !materia.vigente);

  it("el plan real tiene materias no vigentes con las que probar", () => {
    expect(noVigente).toBeDefined();
  });

  it("una no vigente se esconde, salvo que esté en la historia", () => {
    const materia = noVigente as Materia;
    expect(seMuestra(materia, SIN_HISTORIA)).toBe(false);
    expect(
      seMuestra(materia, { [materia.codigo]: { estado: "aprobada" } }),
    ).toBe(true);
  });

  it("una vigente se muestra siempre", () => {
    const materia = PLAN.materias.find(
      (candidata) => candidata.codigo === "93.58",
    ) as Materia;
    expect(seMuestra(materia, SIN_HISTORIA)).toBe(true);
  });
});

describe("electivasDelPlan", () => {
  it("lista solo electivas vigentes, por nombre", () => {
    const lista = electivasDelPlan(PLAN, SIN_HISTORIA);
    expect(lista.every((materia) => materia.ciclo === "electiva")).toBe(true);
    expect(lista.every((materia) => materia.vigente)).toBe(true);
    const nombres = lista.map((materia) => materia.nombre);
    expect(nombres).toEqual([...nombres].sort((uno, otro) =>
      uno.localeCompare(otro, "es"),
    ));
  });

  it("una electiva no vigente entra si está marcada", () => {
    const noVigente = PLAN.materias.find(
      (materia) => materia.ciclo === "electiva" && !materia.vigente,
    ) as Materia;
    const codigos = () =>
      electivasDelPlan(PLAN, SIN_HISTORIA).map((materia) => materia.codigo);
    expect(codigos()).not.toContain(noVigente.codigo);
    const conHistoria = electivasDelPlan(PLAN, {
      [noVigente.codigo]: { estado: "aprobada" },
    }).map((materia) => materia.codigo);
    expect(conHistoria).toContain(noVigente.codigo);
  });
});

describe("filtrarElectivas", () => {
  const lista = electivasDelPlan(PLAN, SIN_HISTORIA);

  it("sin texto no filtra nada", () => {
    expect(filtrarElectivas(lista, "", ABREVIACIONES)).toHaveLength(
      lista.length,
    );
    expect(filtrarElectivas(lista, "   ", ABREVIACIONES)).toHaveLength(
      lista.length,
    );
  });

  /**
   * «PDI» no aparece en «Procesamiento de Imágenes»: si la búsqueda la
   * encuentra es porque miró la abreviación.
   */
  it("filtra por abreviación", () => {
    const filtrada = filtrarElectivas(lista, "pdi", ABREVIACIONES);
    expect(filtrada.map((materia) => materia.codigo)).toContain("22.48");
  });

  it("filtra por nombre, sin acentos, y por código", () => {
    expect(
      filtrarElectivas(lista, "cripto", ABREVIACIONES).map(
        (materia) => materia.codigo,
      ),
    ).toEqual(["73.89"]);
    expect(
      filtrarElectivas(lista, "22.48", ABREVIACIONES).map(
        (materia) => materia.codigo,
      ),
    ).toEqual(["22.48"]);
  });

  it("lo que no está da una lista vacía, no la lista entera", () => {
    expect(filtrarElectivas(lista, "zzzz", ABREVIACIONES)).toEqual([]);
  });
});
