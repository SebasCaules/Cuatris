import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Etiqueta } from "./Etiqueta";

describe("Etiqueta", () => {
  it("es plana por defecto", () => {
    render(<Etiqueta>93.18</Etiqueta>);
    expect(screen.getByText("93.18")).toHaveClass(
      "etiqueta",
      "etiqueta--plana",
    );
  });

  it("la variante con contorno toma el color de la materia", () => {
    render(
      <Etiqueta variante="contorno" color="var(--materia-4)">
        101T
      </Etiqueta>,
    );
    const etiqueta = screen.getByText("101T");
    expect(etiqueta).toHaveClass("etiqueta--contorno");
    expect(etiqueta.style.getPropertyValue("--etiqueta-color")).toBe(
      "var(--materia-4)",
    );
  });

  it("un aula abreviada puede llevar su nombre accesible", () => {
    render(<Etiqueta titulo="Aula 101, sede SDT">101T</Etiqueta>);
    expect(screen.getByLabelText("Aula 101, sede SDT")).toHaveTextContent(
      "101T",
    );
  });
});
