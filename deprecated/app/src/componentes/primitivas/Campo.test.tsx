import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Campo } from "./Campo";

describe("Campo", () => {
  it("tiene nombre accesible aunque el mockup no dibuje etiqueta visible", () => {
    render(<Campo etiqueta="Buscar materia, código o docente" />);
    expect(
      screen.getByLabelText("Buscar materia, código o docente"),
    ).toBeInTheDocument();
  });

  it("avisa cada tecla por onCambio", async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(
      <Campo tipo="busqueda" etiqueta="Buscar" onCambio={alCambiar} />,
    );

    await usuario.type(screen.getByLabelText("Buscar"), "algo");
    expect(alCambiar).toHaveBeenCalledTimes(4);
    expect(alCambiar).toHaveBeenLastCalledWith("algo");
  });

  it("el tipo de búsqueda usa input search; el de texto, text", () => {
    const { rerender } = render(<Campo etiqueta="Uno" />);
    expect(screen.getByLabelText("Uno")).toHaveAttribute("type", "text");

    rerender(<Campo tipo="busqueda" etiqueta="Uno" />);
    expect(screen.getByLabelText("Uno")).toHaveAttribute("type", "search");
    expect(screen.getByLabelText("Uno")).toHaveClass("campo--busqueda");
  });

  it("deshabilitado no acepta texto", async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(<Campo etiqueta="Uno" onCambio={alCambiar} disabled />);

    await usuario.type(screen.getByLabelText("Uno"), "algo");
    expect(alCambiar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Uno")).toBeDisabled();
  });
});
