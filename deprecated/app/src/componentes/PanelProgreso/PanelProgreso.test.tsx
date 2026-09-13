/**
 * El panel derecho de 13b, con el plan real y el plan de usuario del escenario.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { PlanUsuario } from "../../contrato/tipos";
import { planUsuarioInicial } from "../../estado/planUsuario";
import { PLAN } from "../../motor/fixtures/reales";
import { planDePrueba } from "../../paginas/PaginaCursada/escenario";
import {
  BannerProgreso,
  colaDeCarga,
  creditosPlanificados,
  cuatrimestresHasta,
  egresoEstimado,
  faltantesDelTitulo,
  listarItems,
  unirPartes,
  verboDeFaltantes,
} from "./PanelProgreso";

describe("cuentas del panel", () => {
  it("cuenta los cuatrimestres que faltan hasta el estimado", () => {
    // 13b: estimado 1.º 2028 desde 1.º 2026 son 4 cuatrimestres.
    expect(cuatrimestresHasta("2026-1C", "2028-1C")).toBe(4);
    expect(cuatrimestresHasta("2026-1C", "2026-2C")).toBe(1);
    expect(cuatrimestresHasta("2026-1C", "2026-1C")).toBe(0);
    expect(cuatrimestresHasta("2027-1C", "2026-1C")).toBe(0);
  });

  it("dice cuántos cuatrimestres faltan, o que no alcanza", () => {
    expect(colaDeCarga("2028-1C", "2026-1C")).toBe(
      "Con la carga actual, 4 cuatrimestres.",
    );
    expect(colaDeCarga("2026-2C", "2026-1C")).toBe(
      "Con la carga actual, 1 cuatrimestre.",
    );
    expect(colaDeCarga(null, "2026-1C")).toBe(
      "Todavía no alcanza con lo planificado.",
    );
  });
});

/**
 * Rediseño: el panel lateral pasó a ser un banner de una fila. Los títulos
 * secundarios y la prosa de «faltan…» viajan en tooltips; a la vista quedan
 * créditos, electivas, minors y egreso estimado.
 */
describe("BannerProgreso", () => {
  function dibujar() {
    return render(<BannerProgreso plan={PLAN} planUsuario={planDePrueba()} />);
  }

  it("muestra el título principal con su cuenta de créditos", () => {
    dibujar();
    expect(screen.getByText("Ingeniero/a en Informática")).toBeVisible();
    // Se mide contra lo aprobado más lo planificado, como en 13b: 147
    // aprobados + 27 planificados (72.44, 72.41, 72.42 y 72.45).
    expect(screen.getByText("174/243")).toBeVisible();
  });

  it("los otros títulos viajan en el tooltip del bloque de créditos", async () => {
    const usuario = userEvent.setup();
    dibujar();
    await usuario.tab();
    const burbuja = screen.getByRole("tooltip");
    expect(burbuja).toHaveTextContent("Analista en Tecnología Informática: obtenible ya");
    expect(burbuja).toHaveTextContent("Bachiller en Ingeniería: 174 de 192 créditos");
    expect(burbuja).toHaveTextContent(
      "Faltan 16 materias (12.83, 61.23, 61.32 y 13 más), 69 créditos y 27 " +
        "de electivas para el título principal.",
    );
  });

  it("cuenta los créditos planificados que todavía no están aprobados", () => {
    expect(creditosPlanificados(planDePrueba(), PLAN)).toBe(27);
  });

  it("cuenta las electivas contra los 27 créditos del plan", () => {
    dibujar();
    expect(screen.getByText("Electivas")).toBeVisible();
    expect(screen.getByText("0/27")).toBeVisible();
  });

  it("lista los cuatro minors contra los 14 créditos del plan", () => {
    dibujar();
    const minors = screen.getByRole("list", { name: "Minors" });
    expect(within(minors).getByText("CD")).toBeVisible();
    expect(within(minors).getByText("ARQ")).toBeVisible();
    expect(within(minors).getAllByText("0/14")).toHaveLength(4);
  });

  it("cierra con el egreso estimado, o con que todavía no alcanza", () => {
    dibujar();
    expect(screen.getByText("Egreso")).toBeVisible();
    expect(
      screen.getByText("Todavía no alcanza con lo planificado"),
    ).toBeVisible();
    expect(egresoEstimado("2028-1C", "2026-1C")).toBe(
      "1.º 2028 · 4 cuatrimestres",
    );
  });
});

/**
 * F4.3: el título se alcanza por **ítems**, no por créditos. Con los 243
 * créditos juntos y una materia de 0 créditos sin aprobar, el panel dibujaba la
 * barra al 100 %, «243/243» y «Faltan 0 créditos»: nada decía que faltaba
 * 94.52 «Inglés II».
 */
describe("BannerProgreso · ítems que faltan (F4.3)", () => {
  /**
   * La historia de la reproducción: los ítems de los dos ciclos que exige el
   * título principal menos 94.52 «Inglés II» (0 créditos), más electivas hasta
   * los 27 créditos que el título pide. Da 243 de 243 créditos y el título sin
   * alcanzar.
   */
  function historiaDeLaReproduccion(): PlanUsuario {
    const historia: PlanUsuario["historia"] = {};
    for (const materia of PLAN.materias) {
      if (
        !materia.vigente ||
        materia.codigo === "94.52" ||
        !["basico", "profesional"].includes(materia.ciclo)
      ) {
        continue;
      }
      historia[materia.codigo] = { estado: "aprobada" };
    }
    let electivas = 0;
    for (const materia of PLAN.materias) {
      if (electivas >= 27 || !materia.vigente || materia.ciclo !== "electiva") {
        continue;
      }
      historia[materia.codigo] = { estado: "aprobada" };
      electivas += materia.creditos;
    }
    return { ...planUsuarioInicial(), historia };
  }

  it("nombra el ítem que falta aunque los créditos ya estén", async () => {
    const usuario = userEvent.setup();
    render(
      <BannerProgreso plan={PLAN} planUsuario={historiaDeLaReproduccion()} />,
    );

    // Los 243 créditos están y el título igual no se alcanzó: no hay ✓.
    expect(screen.getByText("243/243")).toBeVisible();
    expect(screen.queryByText("✓ 243")).not.toBeInTheDocument();

    // El detalle vive en el tooltip del bloque de créditos (rediseño).
    await usuario.tab();
    const burbuja = screen.getByRole("tooltip");
    expect(burbuja).toHaveTextContent("Falta 1 materia (94.52)");
    expect(burbuja).not.toHaveTextContent("Faltan 0 créditos");
  });
});

describe("armado del texto de faltantes", () => {
  it("enumera hasta tres códigos y después cuenta", () => {
    expect(listarItems(["94.52"])).toBe("94.52");
    expect(listarItems(["94.51", "94.52"])).toBe("94.51 y 94.52");
    expect(listarItems(["12.09", "93.26", "93.58"])).toBe(
      "12.09, 93.26 y 93.58",
    );
    expect(listarItems(["12.09", "93.26", "93.58", "93.59", "94.51"])).toBe(
      "12.09, 93.26, 93.58 y 2 más",
    );
  });

  it("los ítems van antes que los créditos y que las electivas", () => {
    const titulo = {
      id: "ing",
      nombre: "Ingeniero/a",
      alcanzado: false,
      creditos: 243,
      requeridos: 243,
      faltanItems: ["94.52"],
      estimado: null,
    };
    expect(faltantesDelTitulo(titulo, 0, 0)).toEqual(["1 materia (94.52)"]);
    expect(faltantesDelTitulo(titulo, 9, 3)).toEqual([
      "1 materia (94.52)",
      "9 créditos",
      "3 de electivas",
    ]);
    expect(faltantesDelTitulo(undefined, 9, 0)).toEqual(["9 créditos"]);
    expect(unirPartes(["a", "b", "c"])).toBe("a, b y c");
    expect(unirPartes([])).toBe("");
  });

  it("la concordancia la manda la primera parte", () => {
    expect(verboDeFaltantes(["1 materia (94.52)", "9 créditos"])).toBe("Falta");
    expect(verboDeFaltantes(["2 materias", "1 crédito"])).toBe("Faltan");
    expect(verboDeFaltantes(["1 crédito"])).toBe("Falta");
    expect(verboDeFaltantes([])).toBe("Faltan");
  });

  it("un solo crédito no es «1 créditos»", () => {
    expect(faltantesDelTitulo(undefined, 1, 0)).toEqual(["1 crédito"]);
  });
});
