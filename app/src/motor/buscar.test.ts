import { describe, expect, it } from "vitest";

import { buscar, docentesPorMateria, normalizar } from "./buscar";
import { ABREVIACIONES, HORARIOS_RAROS, PLAN } from "./fixtures/reales";

describe("normalizar", () => {
  it("baja a minúsculas, saca acentos y aprieta espacios", () => {
    expect(normalizar("  Álgebra   LINEAL ")).toBe("algebra lineal");
    expect(normalizar("Criptografía")).toBe("criptografia");
    expect(normalizar("Peña, Nelly")).toBe("pena, nelly");
  });
});

describe("buscar", () => {
  it("encuentra 72.42 por su abreviación POD", () => {
    expect(buscar("pod", PLAN, ABREVIACIONES)).toEqual(["72.42"]);
  });

  it("encuentra 72.44 con «cripto» y la pone antes que la coincidencia por nombre", () => {
    // 73.89 «Introducción a Blockchain y Criptomonedas» contiene «cripto» en el
    // nombre; 72.44 «Criptografía y Seguridad» empieza con él.
    expect(buscar("cripto", PLAN, ABREVIACIONES)).toEqual(["72.44", "73.89"]);
  });

  it("la abreviación va antes que el nombre («compiladores»)", () => {
    // 72.23 «Autómatas, Teoría de Lenguajes y Compiladores» tiene la
    // abreviación «Compiladores»; 72.39 «Diseño de Compiladores» coincide solo
    // por el nombre. Ninguna de las dos empieza con el texto buscado.
    expect(ABREVIACIONES.abreviaciones["72.23"]).toBe("Compiladores");
    expect(ABREVIACIONES.abreviaciones["72.39"]).toBe("Autómatas");
    expect(buscar("compiladores", PLAN, ABREVIACIONES)).toEqual([
      "72.23",
      "72.39",
    ]);
  });

  it("el código exacto va primero", () => {
    expect(buscar("72.44", PLAN, ABREVIACIONES)).toEqual(["72.44"]);
    expect(buscar("72.4", PLAN, ABREVIACIONES)[0]).toBe("72.40");
  });

  it("busca por nombre sin acentos ni mayúsculas", () => {
    expect(buscar("ALGEBRA", PLAN, ABREVIACIONES)).toEqual(["93.58"]);
  });

  it("un texto vacío no busca nada", () => {
    expect(buscar("   ", PLAN, ABREVIACIONES)).toEqual([]);
  });

  it("sin coincidencias devuelve la lista vacía", () => {
    expect(buscar("zzzz", PLAN, ABREVIACIONES, HORARIOS_RAROS)).toEqual([]);
  });

  it("la búsqueda por docente solo alcanza a materias del plan", () => {
    // «Cabana, Adriana Elena» dicta 93.18 Álgebra Lineal, que es del SGA pero
    // no de S10-Rev23: por eso la búsqueda no la devuelve.
    expect(buscar("cabana", PLAN, ABREVIACIONES, HORARIOS_RAROS)).toEqual([]);
    expect(buscar("cabana", PLAN, ABREVIACIONES)).toEqual([]);
  });
});

describe("docentesPorMateria", () => {
  it("junta los docentes de todas las comisiones de un curso", () => {
    const indice = docentesPorMateria(HORARIOS_RAROS);
    const docentes = indice.get("93.18");
    expect(docentes?.has("Cabana, Adriana Elena")).toBe(true);
    expect(docentes?.has("Peña, Nelly Haydee")).toBe(true);
    // Un curso sin docentes publicados queda con el conjunto vacío, no ausente.
    expect(indice.get("72.44")?.size).toBe(0);
    expect(indice.has("15.09")).toBe(true);
  });
});
