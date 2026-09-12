/**
 * 13a comparada contra el mockup, ya con la reformulación de R1: los textos
 * exactos, el campo de pegado a la vista y los dos caminos que quedan.
 *
 * El paso «Marcar materias a mano» se fue de acá: marcar es la pestaña «Plan»,
 * y el botón secundario lleva hasta ahí en vez de abrir otra lista.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

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

afterEach(() => {
  window.location.hash = "";
});

describe("PaginaInicio", () => {
  it("el título y la bajada son los del mockup", () => {
    montar();
    expect(
      screen.getByRole("heading", { name: "Todavía no hay nada en tu plan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Para empezar necesito saber qué aprobaste. Podés pegar tu historia " +
          "académica del sistema del ITBA o marcarlo vos mismo en el plan de " +
          "estudios; después agregás las que faltan a cada cuatrimestre.",
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

  it("el campo de pegado está a la vista y el botón primario le da el foco", async () => {
    montar();
    const area = screen.getByLabelText("PEGAR ACÁ · una materia por línea");
    expect(area).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Pegar historia académica" }),
    );
    expect(area).toHaveFocus();
  });

  /** R1: el segundo camino es la pestaña «Plan», no una lista aparte. */
  it("«Marcar en el plan» lleva a #/plan", async () => {
    montar();
    await userEvent.click(
      screen.getByRole("button", { name: "Marcar en el plan" }),
    );
    expect(window.location.hash).toBe("#/plan");
  });

  it("ya no ofrece «Marcar materias a mano»", () => {
    montar();
    expect(
      screen.queryByRole("button", { name: "Marcar materias a mano" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Marcar materias a mano/)).not.toBeInTheDocument();
  });

  /** La regla del autor, fijada también en el primer ingreso. */
  it("no tiene ningún control nativo con aspecto por defecto", () => {
    montar();
    expect(
      document.querySelectorAll('input[type="checkbox"], select, progress'),
    ).toHaveLength(0);
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
