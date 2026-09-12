/**
 * Marcar materias a mano, con el plan real de 129 materias vigentes.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProveedorPlanUsuario, usePlanUsuario } from "../../estado/contexto";
import { PLAN } from "../../motor/fixtures/reales";
import { MarcarAprobadas } from "./MarcarAprobadas";

/** Deja ver la historia que quedó en el estado. */
function Sonda() {
  const { plan } = usePlanUsuario();
  return (
    <p data-sonda>
      {Object.entries(plan.historia)
        .map(([codigo, entrada]) => `${codigo}:${entrada.estado}`)
        .sort()
        .join(" ")}
    </p>
  );
}

function montar(historia: Record<string, { estado: "aprobada" }> = {}) {
  return render(
    <ProveedorPlanUsuario
      lecturaInicial={{
        estado: "listo",
        plan: {
          version: 1,
          plan: "S10-Rev23",
          historia,
          periodos: {},
          colores: {},
          sugerencias: [],
          preferencias: { visibles: 2 },
        },
      }}
    >
      <MarcarAprobadas plan={PLAN} />
      <Sonda />
    </ProveedorPlanUsuario>,
  );
}

function sonda(): HTMLElement {
  const encontrada = document.querySelector("[data-sonda]");
  if (!(encontrada instanceof HTMLElement)) {
    throw new Error("La sonda no está montada.");
  }
  return encontrada;
}

/** La casilla de una materia, por el nombre accesible de su etiqueta. */
function casilla(codigo: string, nombre: string): HTMLElement {
  return screen.getByRole("checkbox", {
    name: new RegExp(`${codigo.replace(".", "\\.")}\\s*${nombre}`),
  });
}

function contador(): HTMLElement {
  return screen.getByRole("status");
}

describe("MarcarAprobadas", () => {
  it("agrupa por año y cuatrimestre, y tiene su sección de electivas", () => {
    montar();
    expect(
      screen.getByRole("heading", { name: "Año 1 · Cuatrimestre 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Año 5 · Cuatrimestre 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Electivas" }),
    ).toBeInTheDocument();
  });

  it("arranca en cero y suma los créditos reales de lo que se marca", async () => {
    montar();
    expect(contador()).toHaveTextContent("0 créditos · 0 materias");
    // 93.58 Álgebra son 9 créditos en el plan real.
    await userEvent.click(casilla("93.58", "Álgebra"));
    expect(contador()).toHaveTextContent("9 créditos · 1 materia");
    // 72.03 Introducción a la Informática, 3 créditos.
    await userEvent.click(casilla("72.03", "Introducción a la Informática"));
    expect(contador()).toHaveTextContent("12 créditos · 2 materias");
  });

  it("desmarcar descuenta", async () => {
    montar();
    const alg = casilla("93.58", "Álgebra");
    await userEvent.click(alg);
    await userEvent.click(alg);
    expect(contador()).toHaveTextContent("0 créditos · 0 materias");
  });

  it("marcar 72.31 no marca sus correlativas, pero ofrece el enlace", async () => {
    montar();
    expect(
      screen.queryByRole("button", { name: /marcar también sus correlativas/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(casilla("72.31", "Programación Imperativa"));
    // 72.31 son 9 créditos: las correlativas siguen sin contarse.
    expect(contador()).toHaveTextContent("9 créditos · 1 materia");

    const enlace = screen.getByRole("button", {
      name: /marcar también sus correlativas/,
    });
    expect(enlace).toHaveTextContent("72.03, 93.58");
  });

  it("el enlace marca 93.58 y 72.03", async () => {
    montar();
    await userEvent.click(casilla("72.31", "Programación Imperativa"));
    await userEvent.click(
      screen.getByRole("button", { name: /marcar también sus correlativas/ }),
    );
    expect(casilla("93.58", "Álgebra")).toBeChecked();
    expect(casilla("72.03", "Introducción a la Informática")).toBeChecked();
    // 9 + 9 + 3 créditos.
    expect(contador()).toHaveTextContent("21 créditos · 3 materias");
    expect(
      screen.queryByRole("button", { name: /marcar también sus correlativas/ }),
    ).not.toBeInTheDocument();
  });

  it("el buscador filtra la lista", async () => {
    montar();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Buscar materia o código" }),
      "algebra",
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(casilla("93.58", "Álgebra")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Año 1 · Cuatrimestre 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Electivas" }),
    ).not.toBeInTheDocument();
  });

  it("«Listo» guarda la historia y va al plan", async () => {
    montar();
    await userEvent.click(casilla("93.58", "Álgebra"));
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(sonda()).toHaveTextContent("93.58:aprobada");
    expect(window.location.hash).toBe("#/plan");
  });

  it("no pisa lo que estaba en curso y no se tocó", async () => {
    render(
      <ProveedorPlanUsuario
        lecturaInicial={{
          estado: "listo",
          plan: {
            version: 1,
            plan: "S10-Rev23",
            historia: { "72.33": { estado: "cursando" } },
            periodos: {},
            colores: {},
            sugerencias: [],
            preferencias: { visibles: 2 },
          },
        }}
      >
        <MarcarAprobadas plan={PLAN} />
        <Sonda />
      </ProveedorPlanUsuario>,
    );
    await userEvent.click(casilla("93.58", "Álgebra"));
    await userEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(sonda()).toHaveTextContent("72.33:cursando 93.58:aprobada");
  });
});
