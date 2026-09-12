/**
 * 13a comparada contra el mockup: los textos exactos y los tres caminos.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProveedorPlanUsuario } from "../../estado/contexto";
import { PLAN } from "../../motor/fixtures/reales";
import { PaginaInicio } from "./PaginaInicio";

function montar() {
  return render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "vacio" }}>
      <PaginaInicio plan={PLAN} />
    </ProveedorPlanUsuario>,
  );
}

describe("PaginaInicio", () => {
  it("el título y la bajada son los del mockup", () => {
    montar();
    expect(
      screen.getByRole("heading", { name: "Todavía no hay nada en tu plan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Para empezar necesito saber qué aprobaste. Podés pegar tu historia " +
          "académica del sistema del ITBA o ir marcando las materias a mano; " +
          "después agregás las que faltan a cada cuatrimestre.",
      ),
    ).toBeInTheDocument();
  });

  it("cierra con la nota de que todo queda en este navegador", () => {
    montar();
    expect(
      screen.getByText(
        "Todo queda en este navegador. No hay cuenta ni servidor.",
      ),
    ).toBeInTheDocument();
  });

  it("arranca con «Pegar historia académica» abierto", () => {
    montar();
    expect(
      screen.getByRole("button", { name: "Pegar historia académica" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByLabelText("PEGAR ACÁ · una materia por línea"),
    ).toBeInTheDocument();
  });

  it("el segundo botón cambia al camino de marcar a mano", async () => {
    montar();
    await userEvent.click(
      screen.getByRole("button", { name: "Marcar materias a mano" }),
    );
    expect(
      screen.queryByLabelText("PEGAR ACÁ · una materia por línea"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Año 1 · Cuatrimestre 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marcar materias a mano" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("ofrece importar un plan guardado", () => {
    montar();
    expect(
      screen.getByRole("button", { name: "Importar un plan guardado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Archivo de plan exportado"),
    ).toBeInTheDocument();
  });
});
