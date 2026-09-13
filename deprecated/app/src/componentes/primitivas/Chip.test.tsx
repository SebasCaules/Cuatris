import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Chip } from "./Chip";

describe("Chip", () => {
  it("sin onClick no es un control: una marca que no hace nada no se pulsa", () => {
    render(<Chip variante="minor">CD</Chip>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("CD")).toHaveClass("chip", "chip--minor");
  });

  it("con onClick es un botón y avisa si está seleccionado", async () => {
    const usuario = userEvent.setup();
    const alPulsar = vi.fn();
    const { rerender } = render(
      <Chip variante="contorno" onClick={alPulsar}>
        1.º 2027
      </Chip>,
    );

    const chip = screen.getByRole("button", { name: "1.º 2027" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await usuario.click(chip);
    expect(alPulsar).toHaveBeenCalledTimes(1);

    rerender(
      <Chip variante="seleccionado" onClick={alPulsar}>
        1.º 2027
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "1.º 2027" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("la sigla de un minor se nombra con el minor entero (14b)", () => {
    render(
      <Chip variante="minor" titulo="Ciencia de Datos">
        CD
      </Chip>,
    );
    expect(screen.getByLabelText("Ciencia de Datos")).toHaveTextContent("CD");
  });

  it("la pastilla es la forma de los chips de período de 13b", () => {
    render(
      <Chip pastilla variante="seleccionado">
        1.º 2026
      </Chip>,
    );
    expect(screen.getByText("1.º 2026")).toHaveClass(
      "chip--pastilla",
      "chip--seleccionado",
    );
  });
});
