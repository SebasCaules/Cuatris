/**
 * El ejemplo está transcrito, así que hay que probar que sigue siendo cierto.
 *
 * Cada bloque, cada crédito y cada abreviación se compara contra la fuente
 * real. Si mañana cambia el corpus, el plan o el vocabulario, rompe esta
 * prueba y no el muestrario en silencio.
 */

import { describe, expect, it } from "vitest";

import vocabularioCrudo from "../../../../data/v1/vocabulario.json";
import {
  ABREVIACIONES,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
} from "../../motor/fixtures/reales";
import type { MateriaEnGrilla } from "./GrillaSemanal";
import {
  ACCIONAMIENTOS,
  ALGEBRA,
  ALGEBRA_B,
  CAMBIOS_DE_SEDE,
  CHOQUES,
  CRIPTO,
  HITOS,
  HORARIOS_ESPERADOS,
  MATERIAS_SIN_HORARIOS,
  nombreDeSede,
  PERIODO,
  SIN_HORARIO,
} from "./ejemplo";

function delCorpus(codigo: string, comision: string) {
  const curso = HORARIOS_RAROS.cursos.find(
    (candidato) => candidato.codigo === codigo,
  );
  if (curso === undefined) {
    throw new Error(`El corpus ya no trae ${codigo}.`);
  }
  const encontrada = curso.comisiones.find(
    (candidata) => candidata.id === comision,
  );
  if (encontrada === undefined) {
    throw new Error(`${codigo} ya no tiene comisión ${comision}.`);
  }
  return { curso, comision: encontrada };
}

describe("ejemplo de la Ola 3", () => {
  it("es el período del archivo de casos raros", () => {
    expect(PERIODO).toBe(PERIODO_RARO);
  });

  it.each([ALGEBRA, ALGEBRA_B, CRIPTO, ACCIONAMIENTOS])(
    "copia los bloques reales de $codigo comisión $comision",
    (materia: MateriaEnGrilla) => {
      const { curso, comision } = delCorpus(materia.codigo, materia.comision);
      expect(materia.nombre).toBe(curso.nombre);
      expect(materia.bloques).toEqual(comision.bloques);
    },
  );

  it("15.09 se ofrece sin comisiones: es la materia sin horario publicado", () => {
    const curso = HORARIOS_RAROS.cursos.find(
      (candidato) => candidato.codigo === SIN_HORARIO.codigo,
    );
    expect(curso?.nombre).toBe(SIN_HORARIO.nombre);
    expect(curso?.comisiones).toEqual([]);
  });

  it("usa la abreviación aprobada de las materias que están en el plan", () => {
    expect(ABREVIACIONES.abreviaciones[CRIPTO.codigo]).toBe(CRIPTO.abreviacion);
    for (const materia of MATERIAS_SIN_HORARIOS) {
      expect(ABREVIACIONES.abreviaciones[materia.codigo]).toBe(
        materia.abreviacion,
      );
    }
    // 93.18, 30.28 y 15.09 no son materias de S10-Rev23: su abreviación sale
    // del mockup 13b, no del CSV aprobado.
    for (const codigo of [
      ALGEBRA.codigo,
      ACCIONAMIENTOS.codigo,
      SIN_HORARIO.codigo,
    ]) {
      expect(ABREVIACIONES.abreviaciones[codigo]).toBeUndefined();
    }
  });

  it("los créditos de la lista sin horarios salen del plan", () => {
    for (const materia of MATERIAS_SIN_HORARIOS) {
      const delPlan = PLAN.materias.find(
        (candidata) => candidata.codigo === materia.codigo,
      );
      expect(delPlan?.creditos).toBe(materia.creditos);
    }
  });

  it("los hitos citan números del plan", () => {
    const ingeniero = PLAN.titulos.find((titulo) => titulo.id === "ingeniero");
    expect(HITOS[0]).toContain(String(ingeniero?.creditos));
    expect(HITOS[0]).toContain(ingeniero?.nombre ?? "");
    const proyecto = PLAN.materias.find(
      (materia) => materia.codigo === "72.45",
    );
    expect(HITOS[1]).toContain(String(proyecto?.creditos_requeridos));
  });

  it("los nombres de sede son los del vocabulario", () => {
    for (const sede of vocabularioCrudo.sedes) {
      expect(nombreDeSede(sede.id)).toBe(sede.nombre);
    }
  });

  it("el mes esperado tiene la forma de `horarios_esperados`", () => {
    expect(HORARIOS_ESPERADOS).toMatch(/^\d{4}-\d{2}$/);
  });

  it("el motor encuentra un solo choque: 93.18 A ↔ 72.44 S el lunes 15–16", () => {
    expect(CHOQUES).toHaveLength(1);
    expect(CHOQUES[0]?.dia).toBe("lunes");
    expect(CHOQUES[0]?.desde).toBe("15:00");
    expect(CHOQUES[0]?.hasta).toBe("16:00");
  });

  it("el cambio de sede derivado es uno solo, el jueves a las 16:00", () => {
    expect(CAMBIOS_DE_SEDE).toHaveLength(1);
    expect(CAMBIOS_DE_SEDE[0]?.dia).toBe("jueves");
    expect(CAMBIOS_DE_SEDE[0]?.hora).toBe("16:00");
    expect(CAMBIOS_DE_SEDE[0]?.a.bloque.sede).toBe("rectorado");
    expect(CAMBIOS_DE_SEDE[0]?.b.bloque.sede).toBe("sdt");
  });
});
