import { afterEach, describe, expect, it, vi } from "vitest";

import type { Indice } from "../contrato/tipos";
import {
  cargarAbreviaciones,
  cargarHorarios,
  cargarIndice,
  cargarPlan,
  cargarVocabulario,
  ContratoIncompatible,
  DatosNoDisponibles,
  NoEstaEnElIndice,
  periodoActivo,
} from "./cargar";
import {
  indiceEjemplo,
  servidorEjemplo,
  type ServidorSimulado,
} from "./ejemplo/servidor";

function montar(
  opciones?: Parameters<typeof servidorEjemplo>[0],
): ServidorSimulado {
  const servidor = servidorEjemplo(opciones);
  vi.stubGlobal("fetch", servidor.fetch);
  return servidor;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cargar", () => {
  it("trae el índice desde <base>data/index.json", async () => {
    const servidor = montar();
    const indice = await cargarIndice();
    expect(indice.contrato).toBe("1.0.0");
    expect(servidor.peticiones).toEqual([
      { archivo: "index.json", version: null },
    ]);
  });

  it("pide cada archivo con el hash del índice como ?v=", async () => {
    const servidor = montar();
    const indice = await cargarIndice();
    await cargarPlan("S10-Rev23", indice);
    await cargarHorarios("2026-2C", indice);
    await cargarAbreviaciones(indice);
    await cargarVocabulario(indice);

    const entradaPlan = indice.planes[0];
    expect(entradaPlan).toBeDefined();
    expect(servidor.peticiones.slice(1)).toEqual([
      { archivo: "v1/planes/S10-Rev23.json", version: entradaPlan?.hash },
      {
        archivo: "v1/horarios/2026-2C.json",
        version: indice.horarios[0]?.hash,
      },
      {
        archivo: "v1/abreviaciones.json",
        version: indice.abreviaciones.hash,
      },
      { archivo: "v1/vocabulario.json", version: indice.vocabulario.hash },
    ]);
  });

  it("carga el ejemplo completo: dos cursos y dos comisiones", async () => {
    montar();
    const indice = await cargarIndice();
    const horarios = await cargarHorarios("2026-2C", indice);
    expect(horarios.cursos.map((curso) => curso.codigo)).toEqual([
      "93.18",
      "72.45",
    ]);
    expect(
      horarios.cursos.flatMap((curso) =>
        curso.comisiones.map((comision) => comision.id),
      ),
    ).toEqual(["A", "B"]);

    const plan = await cargarPlan("S10-Rev23", indice);
    expect(plan.carrera).toBe("Ingeniería en Informática");
    expect(plan.titulos).toHaveLength(3);
    expect(plan.minors.map((minor) => minor.sigla)).toEqual([
      "CD",
      "IA",
      "IRV",
      "ARQ",
    ]);

    const abreviaciones = await cargarAbreviaciones(indice);
    expect(abreviaciones.abreviaciones["72.45"]).toBe("PF");

    const vocabulario = await cargarVocabulario(indice);
    expect(vocabulario.sedes.map((sede) => sede.id)).toEqual([
      "rectorado",
      "sdt",
    ]);
  });

  it("vuelve a pedir el índice si no se lo pasan", async () => {
    const servidor = montar();
    await cargarPlan("S10-Rev23");
    expect(servidor.peticiones.map((p) => p.archivo)).toEqual([
      "index.json",
      "v1/planes/S10-Rev23.json",
    ]);
  });

  it("un major distinto de 1 lanza ContratoIncompatible", async () => {
    montar({
      reemplazos: { "index.json": { ...indiceEjemplo, contrato: "2.0.0" } },
    });
    await expect(cargarIndice()).rejects.toBeInstanceOf(ContratoIncompatible);
    await expect(cargarIndice()).rejects.toThrow(
      /más nuevos que la aplicación/,
    );
  });

  it("un archivo interno con major nuevo también corta la carga", async () => {
    montar({
      reemplazos: {
        "v1/planes/S10-Rev23.json": { contrato: "3.1.0", plan: "S10-Rev23" },
      },
    });
    const indice = await cargarIndice();
    await expect(cargarPlan("S10-Rev23", indice)).rejects.toBeInstanceOf(
      ContratoIncompatible,
    );
  });

  it("la red caída lanza DatosNoDisponibles", async () => {
    montar({ caidos: ["index.json"] });
    await expect(cargarIndice()).rejects.toBeInstanceOf(DatosNoDisponibles);
  });

  it("un 404 lanza DatosNoDisponibles con el código", async () => {
    montar({ reemplazos: {} });
    const indice = await cargarIndice();
    const torcido: Indice = {
      ...indice,
      planes: [
        { plan: "S10-Rev23", archivo: "v1/planes/no-existe.json", hash: "x" },
      ],
    };
    await expect(cargarPlan("S10-Rev23", torcido)).rejects.toThrow(/404/);
  });

  it("un archivo sin campo contrato no se acepta en silencio", async () => {
    montar({ reemplazos: { "index.json": { actualizado: "2026-09-20" } } });
    await expect(cargarIndice()).rejects.toThrow(/contrato/);
  });

  it("pedir algo que el índice no lista lanza NoEstaEnElIndice", async () => {
    montar();
    const indice = await cargarIndice();
    await expect(cargarPlan("S10-Rev22", indice)).rejects.toBeInstanceOf(
      NoEstaEnElIndice,
    );
    await expect(cargarHorarios("2027-1C", indice)).rejects.toBeInstanceOf(
      NoEstaEnElIndice,
    );
  });
});

describe("periodoActivo", () => {
  const indice = indiceEjemplo as unknown as Indice;

  it("devuelve el período activo cuando hoy cae adentro", () => {
    const elegido = periodoActivo(indice, "2026-09-20");
    expect(elegido).not.toBeNull();
    expect(elegido?.estado).toBe("activo");
    expect(elegido?.entrada.periodo).toBe("2026-2C");
  });

  it("los límites desde y hasta son inclusivos", () => {
    expect(periodoActivo(indice, "2026-07-26")?.estado).toBe("activo");
    expect(periodoActivo(indice, "2026-12-31")?.estado).toBe("activo");
  });

  it("sin activo, muestra el próximo como vista previa", () => {
    const elegido = periodoActivo(indice, "2026-05-01");
    expect(elegido?.estado).toBe("vista_previa");
    expect(elegido?.entrada.periodo).toBe("2026-2C");
  });

  it("elige el más próximo entre varios futuros", () => {
    const dos: Indice = {
      ...indice,
      horarios: [
        {
          periodo: "2027-1C",
          archivo: "v1/horarios/2027-1C.json",
          publicado: "2026-11-10",
          desde: "2027-03-01",
          hasta: "2027-07-15",
          hash: "sha256:0",
        },
        ...indice.horarios,
      ],
    };
    expect(periodoActivo(dos, "2026-05-01")?.entrada.periodo).toBe("2026-2C");
  });

  it("devuelve null cuando todo terminó", () => {
    expect(periodoActivo(indice, "2027-01-01")).toBeNull();
  });

  it("devuelve null cuando el índice no publica horarios", () => {
    expect(periodoActivo({ ...indice, horarios: [] }, "2026-09-20")).toBeNull();
  });
});
