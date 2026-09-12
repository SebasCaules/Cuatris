import { describe, expect, it } from "vitest";

import type { PlanUsuario } from "../contrato/tipos";
import {
  COLORES_DISPONIBLES,
  colorAsignado,
  exportar,
  importar,
  migrar,
  planUsuarioInicial,
  PlanUsuarioCorrupto,
  reducir,
} from "./planUsuario";

function conMaterias(codigos: string[]): PlanUsuario {
  return codigos.reduce(
    (estado, codigo) =>
      reducir(estado, { tipo: "agregarMateria", periodo: "2026-2C", codigo }),
    planUsuarioInicial(),
  );
}

describe("reducir", () => {
  it("arranca vacío y con dos tarjetas visibles", () => {
    const inicial = planUsuarioInicial();
    expect(inicial.version).toBe(1);
    expect(inicial.plan).toBe("S10-Rev23");
    expect(inicial.periodos).toEqual({});
    expect(inicial.preferencias.visibles).toBe(2);
  });

  it("agrega una materia y le asigna color por orden de agregado", () => {
    const estado = conMaterias(["93.18", "72.44", "72.45"]);
    expect(estado.periodos["2026-2C"]).toEqual([
      { codigo: "93.18" },
      { codigo: "72.44" },
      { codigo: "72.45" },
    ]);
    expect(estado.colores).toEqual({ "93.18": 0, "72.44": 1, "72.45": 2 });
  });

  it("no duplica una materia ya agregada al período", () => {
    const una = conMaterias(["93.18"]);
    const otra = reducir(una, {
      tipo: "agregarMateria",
      periodo: "2026-2C",
      codigo: "93.18",
    });
    expect(otra).toBe(una);
  });

  it("recicla la paleta después de diez materias", () => {
    const codigos = Array.from({ length: COLORES_DISPONIBLES + 2 }, (_, i) => {
      const numero = String(i).padStart(2, "0");
      return `72.${numero}`;
    });
    const estado = conMaterias(codigos);
    expect(estado.colores["72.00"]).toBe(0);
    expect(estado.colores["72.09"]).toBe(9);
    expect(estado.colores["72.10"]).toBe(0);
    expect(estado.colores["72.11"]).toBe(1);
  });

  it("colorAsignado respeta el color que la materia ya tenía", () => {
    expect(colorAsignado({ "93.18": 7 }, "93.18")).toBe(7);
    expect(colorAsignado({ "93.18": 7 }, "72.44")).toBe(1);
  });

  it("quitarMateria no libera el color: identifica a la materia", () => {
    const estado = reducir(conMaterias(["93.18", "72.44"]), {
      tipo: "quitarMateria",
      periodo: "2026-2C",
      codigo: "93.18",
    });
    expect(estado.periodos["2026-2C"]).toEqual([{ codigo: "72.44" }]);
    expect(estado.colores["93.18"]).toBe(0);
  });

  it("elige comisión solo para una materia del período", () => {
    const estado = reducir(conMaterias(["93.18"]), {
      tipo: "elegirComision",
      periodo: "2026-2C",
      codigo: "93.18",
      comision: "A",
    });
    expect(estado.periodos["2026-2C"]).toEqual([
      { codigo: "93.18", comision: "A" },
    ]);

    const sinCambio = reducir(estado, {
      tipo: "elegirComision",
      periodo: "2026-2C",
      codigo: "72.44",
      comision: "B",
    });
    expect(sinCambio).toBe(estado);
  });

  it("mueve una materia entre períodos y deja atrás la comisión", () => {
    const conComision = reducir(conMaterias(["93.18"]), {
      tipo: "elegirComision",
      periodo: "2026-2C",
      codigo: "93.18",
      comision: "A",
    });
    const movida = reducir(conComision, {
      tipo: "moverMateria",
      desde: "2026-2C",
      hacia: "2027-1C",
      codigo: "93.18",
    });
    expect(movida.periodos["2026-2C"]).toEqual([]);
    expect(movida.periodos["2027-1C"]).toEqual([{ codigo: "93.18" }]);
  });

  it("marcarAprobada y cargarHistoria escriben la historia", () => {
    const cargada = reducir(planUsuarioInicial(), {
      tipo: "cargarHistoria",
      historia: { "93.18": { estado: "cursando" } },
    });
    expect(cargada.historia).toEqual({ "93.18": { estado: "cursando" } });

    const aprobada = reducir(cargada, {
      tipo: "marcarAprobada",
      codigo: "93.18",
    });
    expect(aprobada.historia["93.18"]).toEqual({ estado: "aprobada" });
  });

  it("marcarAprobada saca la materia de todos los períodos planificados", () => {
    const conPlan = reducir(
      reducir(conMaterias(["93.18", "72.44"]), {
        tipo: "elegirComision",
        periodo: "2026-2C",
        codigo: "93.18",
        comision: "A",
      }),
      { tipo: "agregarMateria", periodo: "2027-1C", codigo: "93.18" },
    );
    expect(conPlan.periodos["2026-2C"]).toEqual([
      { codigo: "93.18", comision: "A" },
      { codigo: "72.44" },
    ]);

    const aprobada = reducir(conPlan, {
      tipo: "marcarAprobada",
      codigo: "93.18",
    });
    expect(aprobada.periodos["2026-2C"]).toEqual([{ codigo: "72.44" }]);
    expect(aprobada.periodos["2027-1C"]).toEqual([]);
    // El color no se libera: identifica a la materia para toda la carrera.
    expect(aprobada.colores["93.18"]).toBe(0);
  });

  it("marcar aprobada algo que no estaba planificado deja los períodos como estaban", () => {
    const conPlan = conMaterias(["72.44"]);
    const aprobada = reducir(conPlan, {
      tipo: "marcarAprobada",
      codigo: "93.18",
    });
    expect(aprobada.periodos).toBe(conPlan.periodos);
  });

  /*
   * R1: cuatro estados por materia y un control que cicla. El reducer tiene que
   * saber ir a cada uno y volver a «pendiente», que es la ausencia de entrada.
   */
  it("marcarEstado recorre los cuatro estados y vuelve a pendiente", () => {
    let estado = planUsuarioInicial();

    estado = reducir(estado, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: "aprobada",
    });
    expect(estado.historia["93.18"]).toEqual({ estado: "aprobada" });

    estado = reducir(estado, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: "regular",
    });
    expect(estado.historia["93.18"]).toEqual({ estado: "regular" });

    estado = reducir(estado, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: "cursando",
    });
    expect(estado.historia["93.18"]).toEqual({ estado: "cursando" });

    estado = reducir(estado, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: null,
    });
    expect(estado.historia).not.toHaveProperty("93.18");
  });

  it("marcarEstado en aprobada limpia los períodos; regular y cursando no", () => {
    const conPlan = conMaterias(["93.18", "72.44"]);

    const regular = reducir(conPlan, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: "regular",
    });
    expect(regular.periodos["2026-2C"]).toEqual([
      { codigo: "93.18" },
      { codigo: "72.44" },
    ]);

    const cursando = reducir(regular, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: "cursando",
    });
    expect(cursando.periodos["2026-2C"]).toEqual([
      { codigo: "93.18" },
      { codigo: "72.44" },
    ]);

    const aprobada = reducir(cursando, {
      tipo: "marcarEstado",
      codigo: "93.18",
      estado: "aprobada",
    });
    expect(aprobada.periodos["2026-2C"]).toEqual([{ codigo: "72.44" }]);
  });

  it("marcarVarias escribe todas en una sola transición y limpia los períodos", () => {
    const conPlan = conMaterias(["93.18", "72.44"]);
    const marcadas = reducir(conPlan, {
      tipo: "marcarVarias",
      codigos: ["93.18", "72.44", "31.08"],
      estado: "aprobada",
    });
    expect(marcadas.historia).toEqual({
      "93.18": { estado: "aprobada" },
      "72.44": { estado: "aprobada" },
      "31.08": { estado: "aprobada" },
    });
    expect(marcadas.periodos["2026-2C"]).toEqual([]);
  });

  it("marcarVarias con null desmarca y no toca lo que no nombra", () => {
    const marcadas = reducir(planUsuarioInicial(), {
      tipo: "marcarVarias",
      codigos: ["93.18", "72.44"],
      estado: "aprobada",
    });
    const desmarcadas = reducir(marcadas, {
      tipo: "marcarVarias",
      codigos: ["93.18"],
      estado: null,
    });
    expect(desmarcadas.historia).toEqual({ "72.44": { estado: "aprobada" } });
  });

  it("marcarVarias sin códigos devuelve el mismo estado", () => {
    const antes = conMaterias(["93.18"]);
    expect(
      reducir(antes, { tipo: "marcarVarias", codigos: [], estado: "aprobada" }),
    ).toBe(antes);
  });

  it("setVisibles cambia la preferencia del carrusel", () => {
    const estado = reducir(planUsuarioInicial(), {
      tipo: "setVisibles",
      visibles: 3,
    });
    expect(estado.preferencias.visibles).toBe(3);
  });

  it("asignarColor no pisa un color existente", () => {
    const uno = reducir(planUsuarioInicial(), {
      tipo: "asignarColor",
      codigo: "93.18",
    });
    const dos = reducir(uno, { tipo: "asignarColor", codigo: "93.18" });
    expect(dos.colores).toEqual({ "93.18": 0 });
  });

  it("no muta el estado anterior", () => {
    const antes = conMaterias(["93.18"]);
    const copia = structuredClone(antes);
    reducir(antes, {
      tipo: "agregarMateria",
      periodo: "2026-2C",
      codigo: "72.44",
    });
    expect(antes).toEqual(copia);
  });
});

describe("exportar e importar", () => {
  it("hace ida y vuelta sin perder nada", () => {
    const estado = reducir(conMaterias(["93.18", "72.44"]), {
      tipo: "elegirComision",
      periodo: "2026-2C",
      codigo: "93.18",
      comision: "A",
    });
    expect(importar(exportar(estado))).toEqual(estado);
  });

  it("produce JSON canónico: claves ordenadas y salto final", () => {
    const texto = exportar(planUsuarioInicial());
    expect(texto.endsWith("\n")).toBe(true);
    const claves = Object.keys(JSON.parse(texto) as object);
    expect(claves).toEqual([...claves].sort());
    expect(claves).toEqual([
      "colores",
      "historia",
      "periodos",
      "plan",
      "preferencias",
      "sugerencias",
      "version",
    ]);
  });

  it("no escapa los acentos", () => {
    const estado: PlanUsuario = {
      ...planUsuarioInicial(),
      sugerencias: [{ issue: 12, fecha: "2026-09-20" }],
    };
    expect(exportar(estado)).toContain('"fecha": "2026-09-20"');
    expect(exportar(estado)).not.toContain("\\u");
  });

  it("rechaza un texto que no es JSON", () => {
    expect(() => importar("{no json")).toThrow(PlanUsuarioCorrupto);
  });
});

describe("migrar", () => {
  it("acepta un documento válido", () => {
    const estado = conMaterias(["93.18"]);
    expect(migrar(JSON.parse(exportar(estado)) as unknown)).toEqual(estado);
  });

  it("rechaza una versión desconocida", () => {
    const futuro = { ...planUsuarioInicial(), version: 2 };
    expect(() => migrar(futuro)).toThrow(/version/);
  });

  it("rechaza otro plan de estudios", () => {
    const otro = { ...planUsuarioInicial(), plan: "S10-Rev22" };
    expect(() => migrar(otro)).toThrow(PlanUsuarioCorrupto);
  });

  it("rechaza un estado de historia desconocido", () => {
    const roto = {
      ...planUsuarioInicial(),
      historia: { "93.18": { estado: "promocionada" } },
    };
    expect(() => migrar(roto)).toThrow(/historia\.93\.18\.estado/);
  });

  it("rechaza un código con forma inválida", () => {
    const roto = { ...planUsuarioInicial(), colores: { "9318": 0 } };
    expect(() => migrar(roto)).toThrow(PlanUsuarioCorrupto);
  });

  it("rechaza un color fuera de la paleta", () => {
    const roto = { ...planUsuarioInicial(), colores: { "93.18": 10 } };
    expect(() => migrar(roto)).toThrow(/colores\.93\.18/);
  });

  it("rechaza un período con forma inválida", () => {
    const roto = {
      ...planUsuarioInicial(),
      periodos: { "2026-3C": [] },
    };
    expect(() => migrar(roto)).toThrow(PlanUsuarioCorrupto);
  });

  it("rechaza preferencias fuera de 1–3", () => {
    const roto = { ...planUsuarioInicial(), preferencias: { visibles: 4 } };
    expect(() => migrar(roto)).toThrow(/preferencias\.visibles/);
  });

  it("rechaza algo que no es un objeto", () => {
    expect(() => migrar(null)).toThrow(PlanUsuarioCorrupto);
    expect(() => migrar([1, 2, 3])).toThrow(PlanUsuarioCorrupto);
  });
});
