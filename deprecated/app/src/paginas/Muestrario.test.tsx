import { render, screen, within } from "@testing-library/react";
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
      "Plan de estudios",
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

  /** R1: la sección del plan de estudios, con el control propio y la barra. */
  it("muestra la marca en sus cuatro estados y la barra en tres llenados", () => {
    render(<Muestrario />);

    const seccion = screen
      .getByRole("heading", { name: /Plan de estudios/ })
      .closest("section") as HTMLElement;

    for (const estado of [
      "pendiente",
      "aprobada con final",
      "cursada aprobada, falta el final",
      "cursando",
    ]) {
      expect(within(seccion).getByText(estado)).toBeInTheDocument();
    }

    for (const porcentaje of ["0 %", "50 %", "100 %"]) {
      expect(
        within(seccion).getByRole("progressbar", {
          name: `Ejemplo al ${porcentaje.replace(" %", "")} %`,
        }),
      ).toBeInTheDocument();
      expect(within(seccion).getByText(porcentaje)).toBeInTheDocument();
    }

    // Y la tarjeta del año 1 entera, con sus nueve materias.
    const tarjeta = within(seccion).getByRole("region", { name: "Año 1" });
    expect(within(tarjeta).getAllByRole("listitem")).toHaveLength(9);
  });

  it("no dibuja ningún control nativo con aspecto por defecto", () => {
    render(<Muestrario />);
    expect(
      document.querySelectorAll('input[type="checkbox"], select, progress'),
    ).toHaveLength(0);
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
