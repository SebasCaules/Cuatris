import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Boton } from "./Boton";

describe("Boton", () => {
  it("es de tipo button por defecto, para no enviar formularios sin querer", () => {
    render(<Boton>Elegir</Boton>);
    expect(screen.getByRole("button", { name: "Elegir" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("lleva las clases de su variante y su tamaño", () => {
    render(
      <Boton variante="primario" tamano="chico">
        +
      </Boton>,
    );
    const boton = screen.getByRole("button", { name: "+" });
    expect(boton).toHaveClass("boton", "boton--primario", "boton--chico");
  });

  it("por defecto es secundario y de tamaño normal", () => {
    render(<Boton>Sugerir corrección</Boton>);
    expect(
      screen.getByRole("button", { name: "Sugerir corrección" }),
    ).toHaveClass("boton--secundario", "boton--normal");
  });

  it("llama al callback y deja de hacerlo deshabilitado", async () => {
    const usuario = userEvent.setup();
    const alPulsar = vi.fn();
    const { rerender } = render(<Boton onClick={alPulsar}>Resolver</Boton>);

    await usuario.click(screen.getByRole("button", { name: "Resolver" }));
    expect(alPulsar).toHaveBeenCalledTimes(1);

    rerender(
      <Boton onClick={alPulsar} disabled>
        Resolver
      </Boton>,
    );
    await usuario.click(screen.getByRole("button", { name: "Resolver" }));
    expect(alPulsar).toHaveBeenCalledTimes(1);
  });
});
