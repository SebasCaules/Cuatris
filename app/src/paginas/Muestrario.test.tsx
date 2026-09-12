import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Muestrario } from "./Muestrario";

describe("Muestrario", () => {
  it("dibuja una sección por familia de primitivas", () => {
    render(<Muestrario />);
    for (const titulo of [
      "Barra superior",
      "Botones",
      "Chips",
      "Campos",
      "Etiquetas",
      "Glifos de estado",
      "Notas",
      "Capas",
      "Carrusel",
      "Colores de materia",
    ]) {
      expect(
        screen.getByRole("heading", { name: new RegExp(titulo) }),
      ).toBeInTheDocument();
    }
  });

  it("muestra los nueve glifos de tokens.md", () => {
    render(<Muestrario />);
    for (const etiqueta of [
      "Aprobada",
      "Cursando",
      "Planificada",
      "Disponible",
      "Bloqueada",
      "Sin horario publicado",
      "Choque de horario",
      "Cupo lleno",
      "Cambio de sede",
    ]) {
      expect(screen.getByRole("img", { name: etiqueta })).toBeInTheDocument();
    }
  });

  it("«Planificar en 2.º 2027» mueve el carrusel", async () => {
    const usuario = userEvent.setup();
    const { container } = render(<Muestrario />);

    const carrusel = container.querySelector(".carrusel");
    if (!(carrusel instanceof HTMLElement)) {
      throw new Error("El muestrario no dibujó el carrusel.");
    }
    expect(carrusel.style.getPropertyValue("--carrusel-indice")).toBe("0");

    await usuario.click(
      screen.getByRole("button", { name: "Planificar en 2.º 2027" }),
    );
    expect(carrusel.style.getPropertyValue("--carrusel-indice")).toBe("3");
  });

  it("abre y cierra el modal de 13d", async () => {
    const usuario = userEvent.setup();
    render(<Muestrario />);

    await usuario.click(screen.getByRole("button", { name: "Abrir el modal" }));
    expect(
      screen.getByRole("dialog", {
        name: "93.18 Álgebra Lineal · elegir comisión",
      }),
    ).toBeInTheDocument();

    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
