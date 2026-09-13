import { describe, expect, it } from "vitest";

import {
  altoDeColumna,
  desplazamiento,
  enHoras,
  etiquetaDeFranja,
  etiquetaDeHora,
  HoraIlegible,
  ladosDelChoque,
  restar,
} from "./geometria";
import { CHOQUES } from "./ejemplo";

describe("geometría de la grilla", () => {
  it("convierte HH:MM a horas decimales", () => {
    expect(enHoras("08:00")).toBe(8);
    expect(enHoras("14:30")).toBe(14.5);
    expect(enHoras("22:00")).toBe(22);
  });

  it("una hora que no tiene la forma del contrato revienta con el fragmento", () => {
    expect(() => enHoras("8:00")).toThrow(HoraIlegible);
    expect(() => enHoras("25:00")).toThrow(/25:00/);
  });

  it("las 14:00 caen a seis horas del borde", () => {
    expect(desplazamiento(14, 15)).toBe(90);
    expect(desplazamiento(14, 18)).toBe(108);
    expect(altoDeColumna(15)).toBe(210);
  });

  it("restar deja los tramos exclusivos de cada materia", () => {
    // 93.18 de 14 a 16 contra el choque de 15 a 16: le queda 14–15.
    expect(
      restar({ desde: 14, hasta: 16 }, [{ desde: 15, hasta: 16 }]),
    ).toEqual([{ desde: 14, hasta: 15 }]);
    // 72.44 de 15 a 18 contra el mismo choque: le queda 16–18.
    expect(
      restar({ desde: 15, hasta: 18 }, [{ desde: 15, hasta: 16 }]),
    ).toEqual([{ desde: 16, hasta: 18 }]);
    // Un choque en el medio parte el bloque en dos.
    expect(restar({ desde: 8, hasta: 12 }, [{ desde: 9, hasta: 10 }])).toEqual([
      { desde: 8, hasta: 9 },
      { desde: 10, hasta: 12 },
    ]);
    // Tapado del todo: no queda nada que dibujar.
    expect(restar({ desde: 9, hasta: 10 }, [{ desde: 8, hasta: 12 }])).toEqual(
      [],
    );
  });

  it("las horas en punto se escriben sin los minutos", () => {
    expect(etiquetaDeHora("15:00")).toBe("15");
    expect(etiquetaDeHora("14:30")).toBe("14:30");
    expect(etiquetaDeFranja("15:00", "16:00")).toBe("15–16");
  });

  it("el choque se lee empezando por la materia que arranca antes", () => {
    const choque = CHOQUES[0];
    if (choque === undefined) {
      throw new Error("El ejemplo dejó de tener un choque.");
    }
    // El motor ordena por código (72.44 antes que 93.18); 13b muestra primero
    // a 93.18, que empieza a las 14.
    expect(choque.a.codigo).toBe("72.44");
    expect(ladosDelChoque(choque).map((lado) => lado.codigo)).toEqual([
      "93.18",
      "72.44",
    ]);
  });
});
