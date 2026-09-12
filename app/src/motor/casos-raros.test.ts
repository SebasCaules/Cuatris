/**
 * Los siete casos raros reales del SGA contra el motor entero.
 *
 * El fixture `tests/fixtures/deben-pasar/horarios-casos-raros.json` trae los
 * siete casos verificados en `material-raw/02-sga/HALLAZGOS.md`. Ninguna
 * función del motor puede lanzar con ellos, y las que pueden decir algo sobre
 * un caso lo dicen acá explícitamente.
 */

import { describe, expect, it } from "vitest";

import { buscar, docentesPorMateria } from "./buscar";
import { creditosAlEmpezar, creditosAprobados, itemsAprobados } from "./creditos";
import { estadoMateria, habilita, motivosBloqueo, seDestrabaEn } from "./estado";
import { parsearHistoria } from "./historia";
import {
  bloquesDelPeriodo,
  cambiosDeSede,
  choques,
  cupoLleno,
  cursoDe,
  ordenarComisiones,
  seOfrece,
} from "./horarios";
import { electivas, minors, progresoTitulos } from "./progreso";
import {
  ABREVIACIONES,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  planCon,
} from "./fixtures/reales";

/** Todas las comisiones del corpus, elegidas a la vez. */
const TODAS = HORARIOS_RAROS.cursos.flatMap((curso) =>
  curso.comisiones.map((comision) => ({
    codigo: curso.codigo,
    comision: comision.id,
  })),
);

const PLAN_USUARIO = planCon({}, { [PERIODO_RARO]: TODAS });

describe("los siete casos raros", () => {
  it("período corto: 15.09 se dicta del 18/09 al 16/10 y no tiene comisiones", () => {
    const curso = cursoDe("15.09", HORARIOS_RAROS);
    expect(curso?.desde).toBe("2026-09-18");
    expect(curso?.hasta).toBe("2026-10-16");
    expect(curso?.comisiones).toEqual([]);
    expect(seOfrece("15.09", HORARIOS_RAROS)).toBe(true);
  });

  it("homónimas con distinto código: 23.05 y 25.66 conviven", () => {
    expect(cursoDe("23.05", HORARIOS_RAROS)?.nombre).toBe(
      "Acústica para Ingenieros",
    );
    expect(cursoDe("25.66", HORARIOS_RAROS)?.nombre).toBe(
      "Acústica para Ingenieros",
    );
  });

  it("letras no contiguas: 93.18 tiene A–H y K", () => {
    const ids = cursoDe("93.18", HORARIOS_RAROS)?.comisiones.map(
      (comision) => comision.id,
    );
    expect(ids).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "K"]);
  });

  it("modalidades mixtas: 30.28 com. A mezcla blended y presencial", () => {
    const bloques = cursoDe("30.28", HORARIOS_RAROS)?.comisiones[0]?.bloques;
    expect(bloques?.map((bloque) => bloque.modalidad)).toEqual([
      "blended",
      "presencial",
    ]);
  });

  it("cupo completo: 93.18 com. A es 48 de 48", () => {
    const comision = cursoDe("93.18", HORARIOS_RAROS)?.comisiones.find(
      (candidata) => candidata.id === "A",
    );
    expect(comision !== undefined && cupoLleno(comision)).toBe(true);
  });

  it("dos aulas simultáneas y cruce de sedes no rompen nada", () => {
    const bloques = bloquesDelPeriodo(
      PERIODO_RARO,
      PLAN_USUARIO,
      HORARIOS_RAROS,
    );
    expect(bloques.some((ubicado) => ubicado.bloque.aulas.length === 2)).toBe(
      true,
    );
    const sedes = new Set(
      bloques
        .filter((ubicado) => ubicado.codigo === "93.18")
        .map((ubicado) => ubicado.bloque.sede),
    );
    expect(sedes.size).toBeGreaterThan(1);
  });
});

describe("ninguna función del motor lanza con el corpus raro", () => {
  it("las de horarios, con todas las comisiones elegidas a la vez", () => {
    expect(() => {
      bloquesDelPeriodo(PERIODO_RARO, PLAN_USUARIO, HORARIOS_RAROS);
      choques(PERIODO_RARO, PLAN_USUARIO, HORARIOS_RAROS);
      cambiosDeSede(PERIODO_RARO, PLAN_USUARIO, HORARIOS_RAROS);
      for (const curso of HORARIOS_RAROS.cursos) {
        ordenarComisiones(
          curso.codigo,
          PERIODO_RARO,
          PLAN_USUARIO,
          HORARIOS_RAROS,
        );
        seOfrece(curso.codigo, HORARIOS_RAROS);
      }
      docentesPorMateria(HORARIOS_RAROS);
    }).not.toThrow();
  });

  it("las de créditos, estado y progreso, para todas las materias del plan", () => {
    expect(() => {
      itemsAprobados(PLAN_USUARIO.historia, PLAN);
      creditosAprobados(PLAN_USUARIO.historia, PLAN);
      creditosAlEmpezar(PERIODO_RARO, PLAN_USUARIO, PLAN);
      progresoTitulos(PLAN_USUARIO, PLAN);
      electivas(PLAN_USUARIO, PLAN);
      minors(PLAN_USUARIO, PLAN);
      for (const materia of PLAN.materias) {
        estadoMateria(
          materia.codigo,
          PERIODO_RARO,
          PLAN_USUARIO,
          PLAN,
          HORARIOS_RAROS,
        );
        motivosBloqueo(materia.codigo, PERIODO_RARO, PLAN_USUARIO, PLAN);
        seDestrabaEn(materia.codigo, PLAN_USUARIO, PLAN);
        habilita(materia.codigo, PLAN);
      }
    }).not.toThrow();
  });

  it("la búsqueda, con los nombres y docentes del corpus", () => {
    expect(() => {
      for (const curso of HORARIOS_RAROS.cursos) {
        buscar(curso.codigo, PLAN, ABREVIACIONES, HORARIOS_RAROS);
        buscar(curso.nombre, PLAN, ABREVIACIONES, HORARIOS_RAROS);
        for (const comision of curso.comisiones) {
          for (const docente of comision.docentes) {
            buscar(docente, PLAN, ABREVIACIONES, HORARIOS_RAROS);
          }
        }
      }
    }).not.toThrow();
  });

  it("el parser de historia, con los nombres del corpus", () => {
    const texto = HORARIOS_RAROS.cursos
      .map((curso) => `${curso.codigo} ${curso.nombre} Aprobada`)
      .join("\n");
    expect(() => parsearHistoria(texto, PLAN)).not.toThrow();
    const { reconocidas, noReconocidas } = parsearHistoria(texto, PLAN);
    // De los seis cursos del corpus, solo 72.44 está en S10-Rev23.
    expect(Object.keys(reconocidas)).toEqual(["72.44"]);
    expect(noReconocidas).toHaveLength(5);
  });
});
