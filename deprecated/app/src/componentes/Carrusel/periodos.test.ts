import { describe, expect, it } from "vitest";

import { etiquetaCorta, etiquetaLarga, PeriodoInvalido } from "./periodos";

describe("etiquetas de período", () => {
  it("la corta es la del chip de 13b", () => {
    expect(etiquetaCorta("2026-1C")).toBe("1.º 2026");
    expect(etiquetaCorta("2027-2C")).toBe("2.º 2027");
  });

  it("la larga es la del título de la tarjeta de 13b", () => {
    expect(etiquetaLarga("2026-1C")).toBe("1.º cuatrimestre 2026");
    expect(etiquetaLarga("2026-2C")).toBe("2.º cuatrimestre 2026");
  });

  it.each(["2026", "2026-3C", "26-1C", "2026-1c", ""])(
    "«%s» revienta en vez de devolver un nombre a medias",
    (roto) => {
      expect(() => etiquetaCorta(roto)).toThrow(PeriodoInvalido);
      expect(() => etiquetaLarga(roto)).toThrow(/no es un identificador/);
    },
  );
});
