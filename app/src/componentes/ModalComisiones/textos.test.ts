/**
 * Los textos de 13d, con los datos del corpus: nada de valores a mano.
 */

import { describe, expect, it } from "vitest";

import type { Comision } from "../../contrato/tipos";
import {
  cursoDe,
  paresQueChocan,
  type BloqueUbicado,
  type Choque,
} from "../../motor";
import { HORARIOS_RAROS } from "../../motor/fixtures/reales";
import {
  consecuenciasDeComision,
  etiquetaDelColapsado,
  lineaDeBloque,
  resultadoDeVistaPrevia,
  sedesDeComision,
  subtituloDelModal,
  textoDeCupo,
} from "./textos";

const SEDES: Record<string, string> = { rectorado: "Rectorado", sdt: "SDT" };
const nombreDeSede = (id: string) => SEDES[id] ?? id;

function comisionDe(codigo: string, id: string): Comision {
  const curso = cursoDe(codigo, HORARIOS_RAROS);
  const comision = curso?.comisiones.find((candidata) => candidata.id === id);
  if (comision === undefined) {
    throw new Error(`El corpus no trae ${codigo} comisión ${id}.`);
  }
  return comision;
}

function ubicar(codigo: string, id: string): BloqueUbicado[] {
  const curso = cursoDe(codigo, HORARIOS_RAROS);
  if (curso === null) {
    throw new Error(`El corpus no trae ${codigo}.`);
  }
  return comisionDe(codigo, id).bloques.map((bloque) => ({
    codigo: curso.codigo,
    nombre: curso.nombre,
    comision: id,
    vigencia: { desde: curso.desde, hasta: curso.hasta },
    bloque,
  }));
}

/** El choque real de 13b: 93.18 com. A contra 72.44 com. S, lunes 15–16. */
function choqueDelLunes(): Choque {
  const choques = paresQueChocan([
    ...ubicar("93.18", "A"),
    ...ubicar("72.44", "S"),
  ]);
  const primero = choques[0];
  if (primero === undefined) {
    throw new Error("93.18 A y 72.44 S dejaron de chocar en el corpus.");
  }
  return primero;
}

describe("líneas de horario", () => {
  it("arma «Lun 14–16 · 001R Rectorado» con el bloque del corpus", () => {
    const bloque = comisionDe("93.18", "A").bloques[0];
    if (bloque === undefined) {
      throw new Error("93.18 com. A se quedó sin bloques.");
    }
    expect(lineaDeBloque(bloque, nombreDeSede)).toBe(
      "Lun 14–16 · 001R Rectorado",
    );
  });

  it("lista las dos aulas simultáneas de 93.18 com. B", () => {
    const miercoles = comisionDe("93.18", "B").bloques.find(
      (bloque) => bloque.dia === "miercoles",
    );
    if (miercoles === undefined) {
      throw new Error("93.18 com. B se quedó sin el miércoles.");
    }
    expect(miercoles.aulas).toEqual(["003T", "004T"]);
    expect(lineaDeBloque(miercoles, nombreDeSede)).toBe(
      "Mié 10–12 · 003T 004T SDT",
    );
  });

  it("un bloque sin sede ni aulas queda con la franja sola", () => {
    expect(
      lineaDeBloque(
        {
          dia: "jueves",
          desde: "19:00",
          hasta: "22:00",
          sede: null,
          modalidad: "virtual_sincronica",
          aulas: [],
        },
        nombreDeSede,
      ),
    ).toBe("Jue 19–22");
  });
});

describe("cupo", () => {
  it("usa el cupo y la ocupación del corpus", () => {
    expect(textoDeCupo(comisionDe("93.18", "A"))).toBe("cupo 48 / 48");
    expect(textoDeCupo(comisionDe("93.18", "B"))).toBe("cupo 48 / 49");
  });

  it("sin ninguno de los dos datos no hay línea", () => {
    expect(textoDeCupo({ id: "X", bloques: [], docentes: [] })).toBeNull();
  });

  it("con capacidad y sin ocupación se dice que no se sabe", () => {
    expect(
      textoDeCupo({
        id: "X",
        bloques: [],
        docentes: [],
        cupo: { capacidad: 30 },
      }),
    ).toBe("cupo — / 30");
  });
});

describe("sedes de la comisión", () => {
  it("93.18 com. A cruza dos sedes y la C se queda en una", () => {
    expect(sedesDeComision(comisionDe("93.18", "A"))).toBe(2);
    expect(sedesDeComision(comisionDe("93.18", "C"))).toBe(1);
  });
});

describe("línea de consecuencias", () => {
  it("con choque y cupo lleno: «▲ choque lun 15–16 · ◐ llena»", () => {
    const segmentos = consecuenciasDeComision({
      choques: [choqueDelLunes()],
      sedes: 2,
      llena: true,
      sinHorario: false,
    });
    expect(segmentos.map((segmento) => segmento.texto)).toEqual([
      "choque lun 15–16",
      "llena",
    ]);
    expect(segmentos.map((segmento) => segmento.glifo)).toEqual([
      "choque",
      "cupoLleno",
    ]);
  });

  it("sin choques y cruzando sedes: «✓ sin choques · ↕ 2 sedes»", () => {
    expect(
      consecuenciasDeComision({
        choques: [],
        sedes: 2,
        llena: false,
        sinHorario: false,
      }).map((segmento) => segmento.texto),
    ).toEqual(["sin choques", "2 sedes"]);
  });

  it("sin choques y en una sola sede: «✓ sin choques»", () => {
    expect(
      consecuenciasDeComision({
        choques: [],
        sedes: 1,
        llena: false,
        sinHorario: false,
      }).map((segmento) => segmento.texto),
    ).toEqual(["sin choques"]);
  });

  it("una comisión sin horario publicado lo dice en vez de «sin choques»", () => {
    expect(
      consecuenciasDeComision({
        choques: [],
        sedes: 0,
        llena: false,
        sinHorario: true,
      }).map((segmento) => segmento.texto),
    ).toEqual(["sin horario publicado"]);
  });
});

describe("línea de resultado de la vista previa", () => {
  const choque = choqueDelLunes();

  it("el choque que había y ya no está, desaparece", () => {
    expect(resultadoDeVistaPrevia([], choque)).toEqual({
      glifo: "aprobada",
      etiqueta: "Sin choques",
      texto: "el choque del lunes desaparece",
    });
  });

  it("el choque que sigue, sigue", () => {
    expect(resultadoDeVistaPrevia([choque], choque).texto).toBe(
      "sigue el choque del lunes",
    );
  });

  it("un choque nuevo no «sigue»", () => {
    expect(resultadoDeVistaPrevia([choque], null).texto).toBe(
      "choque el lunes",
    );
  });

  it("sin choque antes ni después: «sin choques»", () => {
    expect(resultadoDeVistaPrevia([], null).texto).toBe("sin choques");
  });
});

describe("subtítulo y colapsado", () => {
  it("el subtítulo es el de 13d", () => {
    expect(subtituloDelModal(9, "1.º 2026")).toBe(
      "9 comisiones · ordenadas por compatibilidad con tu 1.º 2026",
    );
    expect(subtituloDelModal(1, "2.º 2026")).toBe(
      "1 comisión · ordenada por compatibilidad con tu 2.º 2026",
    );
  });

  it("el colapsado lista las letras y cuenta cuántas son", () => {
    expect(etiquetaDelColapsado(["D", "E", "F", "G", "H"])).toBe(
      "D · E · F · G · H — 5 comisiones más",
    );
    expect(etiquetaDelColapsado(["K"])).toBe("K — 1 comisión más");
  });
});
