/**
 * El panel derecho de 13b, con el plan real y el plan de usuario del escenario.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLAN } from "../../motor/fixtures/reales";
import { planDePrueba } from "../../paginas/PaginaPlan/escenario";
import {
  colaDeCarga,
  creditosPlanificados,
  cuatrimestresHasta,
  PanelProgreso,
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

describe("PanelProgreso", () => {
  function dibujar() {
    return render(<PanelProgreso plan={PLAN} planUsuario={planDePrueba()} />);
  }

  it("muestra los tres títulos del plan con su cuenta de créditos", () => {
    dibujar();
    expect(screen.getByText("Analista en Tecnología Informática")).toBeVisible();
    expect(screen.getByText("Bachiller en Ingeniería")).toBeVisible();
    expect(screen.getByText("Ingeniero/a en Informática")).toBeVisible();
    // El ciclo básico aprobado son 147 créditos: Analista ya está.
    expect(screen.getByText("✓ 147")).toBeVisible();
    // Los otros dos se miden contra lo aprobado más lo planificado, como en
    // 13b: 147 aprobados + 27 planificados (72.44, 72.41, 72.42 y 72.45).
    expect(screen.getByText("174/192")).toBeVisible();
    expect(screen.getByText("174/243")).toBeVisible();
    expect(screen.getByText("obtenible ya")).toBeVisible();
  });

  it("cuenta los créditos planificados que todavía no están aprobados", () => {
    expect(creditosPlanificados(planDePrueba(), PLAN)).toBe(27);
  });

  it("cuenta las electivas contra los 27 créditos del plan", () => {
    dibujar();
    expect(screen.getByText("Electivas · 0 de 27 cr")).toBeVisible();
    // 27 créditos en segmentos de 3 son nueve segmentos.
    expect(document.querySelectorAll(".panel-progreso__segmento")).toHaveLength(
      9,
    );
  });

  it("lista los cuatro minors contra los 14 créditos del plan", () => {
    dibujar();
    expect(screen.getByText("MINORS")).toBeVisible();
    expect(screen.getByText("Ciencia de Datos")).toBeVisible();
    expect(screen.getByText("Arquitectura de Software")).toBeVisible();
    expect(screen.getAllByText("0 / 14 cr")).toHaveLength(4);
  });

  it("cierra con lo que falta para el título principal", () => {
    dibujar();
    const resumen = document.querySelector(".panel-progreso__resumen");
    expect(resumen).toHaveTextContent(
      "Faltan 69 créditos y 27 de electivas para el título principal. " +
        "Todavía no alcanza con lo planificado.",
    );
  });
});
