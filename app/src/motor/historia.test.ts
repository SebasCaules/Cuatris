import { describe, expect, it } from "vitest";

import { parsearHistoria } from "./historia";
import { PLAN } from "./fixtures/reales";

describe("parsearHistoria", () => {
  it("lee el formato del mockup con materias del plan", () => {
    const texto = [
      "93.58 Álgebra 9 Aprobada",
      "93.26 Análisis Matemático I 6 Aprobada",
      "72.31 Programación Imperativa 9 Cursando",
      "72.33 Programación Orientada a Objetos 6 Regular",
    ].join("\n");
    const { reconocidas, noReconocidas } = parsearHistoria(texto, PLAN);
    expect(reconocidas).toEqual({
      "93.58": { estado: "aprobada" },
      "93.26": { estado: "aprobada" },
      "72.31": { estado: "cursando" },
      "72.33": { estado: "regular" },
    });
    expect(noReconocidas).toEqual([]);
  });

  it("sin palabra clave de estado asume aprobada", () => {
    const { reconocidas } = parsearHistoria("93.58 Álgebra 9", PLAN);
    expect(reconocidas).toEqual({ "93.58": { estado: "aprobada" } });
  });

  it("la línea del mockup con 93.18 no se reconoce: no es de este plan", () => {
    // `93.18 Álgebra Lineal 9 Aprobada` es el ejemplo del mockup, y 93.18 no
    // está en S10-Rev23. La línea vuelve tal cual para marcarla a mano.
    const linea = "93.18 Álgebra Lineal 9 Aprobada";
    const { reconocidas, noReconocidas } = parsearHistoria(linea, PLAN);
    expect(reconocidas).toEqual({});
    expect(noReconocidas).toEqual([linea]);
  });

  it("devuelve verbatim lo que no tiene código, y saltea las líneas vacías", () => {
    const texto = [
      "Historia académica",
      "",
      "93.58 Álgebra 9 Aprobada",
      "   ",
      "Total de créditos: 9",
    ].join("\n");
    const { reconocidas, noReconocidas } = parsearHistoria(texto, PLAN);
    expect(reconocidas).toEqual({ "93.58": { estado: "aprobada" } });
    expect(noReconocidas).toEqual(["Historia académica", "Total de créditos: 9"]);
  });

  it("no toma dos dígitos de adentro de un número más largo", () => {
    const linea = "Legajo 61234.5678 sin materia";
    expect(parsearHistoria(linea, PLAN).noReconocidas).toEqual([linea]);
  });

  it("acepta variantes de la palabra clave", () => {
    const texto = [
      "72.31 Programación Imperativa — APROBADO",
      "72.33 Programación Orientada a Objetos — cursándola",
    ].join("\n");
    expect(parsearHistoria(texto, PLAN).reconocidas).toEqual({
      "72.31": { estado: "aprobada" },
      "72.33": { estado: "cursando" },
    });
  });

  it("si la misma materia aparece dos veces gana la última línea", () => {
    const texto = ["93.58 Álgebra Cursando", "93.58 Álgebra Aprobada"].join("\n");
    expect(parsearHistoria(texto, PLAN).reconocidas).toEqual({
      "93.58": { estado: "aprobada" },
    });
  });

  it("un texto vacío no produce nada", () => {
    expect(parsearHistoria("", PLAN)).toEqual({
      reconocidas: {},
      noReconocidas: [],
    });
  });
});
