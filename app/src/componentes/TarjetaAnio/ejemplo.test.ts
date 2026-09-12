/**
 * La copia del año 1 contra el plan real: si el plan cambia, esto rompe.
 */

import { describe, expect, it } from "vitest";

import { PLAN } from "../../motor/fixtures/reales";
import {
  COLUMNAS_ANIO_1,
  PRIMER_CUATRIMESTRE,
  SEGUNDO_CUATRIMESTRE,
} from "./ejemplo";

function delPlan(sugerido: number) {
  return PLAN.materias.filter(
    (materia) => materia.cuatrimestre_sugerido === sugerido,
  );
}

describe("ejemplo del año 1", () => {
  it("el 1.º cuatrimestre es igual al del plan publicado", () => {
    expect(PRIMER_CUATRIMESTRE).toEqual(delPlan(1));
  });

  it("el 2.º cuatrimestre es igual al del plan publicado", () => {
    expect(SEGUNDO_CUATRIMESTRE).toEqual(delPlan(2));
  });

  it("las columnas llevan el rótulo y el nombre que usa la tarjeta", () => {
    expect(COLUMNAS_ANIO_1.map((columna) => columna.rotulo)).toEqual([
      "1.º CUATRIMESTRE",
      "2.º CUATRIMESTRE",
    ]);
    expect(COLUMNAS_ANIO_1.map((columna) => columna.materias.length)).toEqual([
      5, 4,
    ]);
  });
});
