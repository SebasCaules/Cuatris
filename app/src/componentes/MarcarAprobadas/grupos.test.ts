/**
 * Agrupación, filtro y cadena de correlativas, contra el plan real.
 */

import { describe, expect, it } from "vitest";

import { PLAN } from "../../motor/fixtures/reales";
import {
  agrupar,
  anioYCuatrimestre,
  correlativasSinMarcar,
  filtrar,
  TITULO_ELECTIVAS,
} from "./grupos";

describe("anioYCuatrimestre", () => {
  it("cuenta de corrido: el 3 es el primero del segundo año", () => {
    expect(anioYCuatrimestre(1)).toEqual({ anio: 1, cuatrimestre: 1 });
    expect(anioYCuatrimestre(2)).toEqual({ anio: 1, cuatrimestre: 2 });
    expect(anioYCuatrimestre(3)).toEqual({ anio: 2, cuatrimestre: 1 });
    expect(anioYCuatrimestre(10)).toEqual({ anio: 5, cuatrimestre: 2 });
  });
});

describe("agrupar", () => {
  const grupos = agrupar(PLAN);

  it("los cuatrimestres van en orden y las electivas al final", () => {
    expect(grupos.map((grupo) => grupo.titulo)).toEqual([
      "Año 1 · Cuatrimestre 1",
      "Año 1 · Cuatrimestre 2",
      "Año 2 · Cuatrimestre 1",
      "Año 2 · Cuatrimestre 2",
      "Año 3 · Cuatrimestre 1",
      "Año 3 · Cuatrimestre 2",
      "Año 4 · Cuatrimestre 1",
      "Año 4 · Cuatrimestre 2",
      "Año 5 · Cuatrimestre 1",
      "Año 5 · Cuatrimestre 2",
      TITULO_ELECTIVAS,
    ]);
  });

  it("entran las 129 materias vigentes y ninguna de las otras", () => {
    const total = grupos.reduce(
      (suma, grupo) => suma + grupo.materias.length,
      0,
    );
    expect(total).toBe(PLAN.materias.filter((materia) => materia.vigente).length);
    expect(total).toBe(129);
  });

  it("una obligatoria cae en su cuatrimestre sugerido", () => {
    const primero = grupos[0];
    expect(primero?.materias.map((materia) => materia.codigo)).toContain(
      "93.58",
    );
  });
});

describe("filtrar", () => {
  const grupos = agrupar(PLAN);

  it("sin texto no filtra nada", () => {
    expect(filtrar(grupos, "  ")).toEqual(grupos);
  });

  it("ignora acentos y mayúsculas", () => {
    const encontrado = filtrar(grupos, "algebra");
    const codigos = encontrado.flatMap((grupo) =>
      grupo.materias.map((materia) => materia.codigo),
    );
    expect(codigos).toContain("93.58");
  });

  it("filtra por código y descarta los grupos vacíos", () => {
    const encontrado = filtrar(grupos, "72.31");
    expect(encontrado).toHaveLength(1);
    expect(encontrado[0]?.materias.map((materia) => materia.codigo)).toEqual([
      "72.31",
    ]);
  });
});

describe("correlativasSinMarcar", () => {
  it("72.31 arrastra 93.58 y 72.03", () => {
    expect(correlativasSinMarcar("72.31", PLAN, new Set())).toEqual([
      "72.03",
      "93.58",
    ]);
  });

  it("no repite lo que ya está marcado", () => {
    expect(correlativasSinMarcar("72.31", PLAN, new Set(["93.58"]))).toEqual([
      "72.03",
    ]);
  });

  it("una materia sin correlativas no arrastra nada", () => {
    expect(correlativasSinMarcar("93.58", PLAN, new Set())).toEqual([]);
  });

  it("sigue la cadena entera, no solo el primer nivel", () => {
    // 72.37 Base de Datos I pide 72.34 y 93.35; 72.34 a su vez pide más.
    const cadena = correlativasSinMarcar("72.37", PLAN, new Set());
    expect(cadena).toContain("72.34");
    expect(cadena.length).toBeGreaterThan(2);
  });
});
