import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Nota } from "./Nota";

describe("Nota", () => {
  it("la variante en línea es la de «sin horario publicado»", () => {
    render(<Nota>— 15.09 Agile / Lean · sin horario publicado</Nota>);
    expect(
      screen.getByText("— 15.09 Agile / Lean · sin horario publicado"),
    ).toHaveClass("nota", "nota--linea");
  });

  it("la variante en caja lleva el relleno de la nota de 13g", () => {
    render(
      <Nota variante="caja">
        Sin horarios publicados: salen en noviembre de 2026.
      </Nota>,
    );
    expect(
      screen.getByText(/Sin horarios publicados/),
    ).toHaveClass("nota--caja");
  });
});
