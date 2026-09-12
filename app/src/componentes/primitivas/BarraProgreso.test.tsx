import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarraProgreso } from "./BarraProgreso";

function relleno(): HTMLElement {
  const elemento = document.querySelector(".barra-progreso__relleno");
  if (!(elemento instanceof HTMLElement)) {
    throw new Error("La barra no dibujó su relleno.");
  }
  return elemento;
}

function pista(): HTMLElement {
  return screen.getByRole("progressbar");
}

describe("BarraProgreso", () => {
  it("informa valor y máximo, y llena la parte proporcional", () => {
    render(<BarraProgreso valor={9} maximo={9} etiqueta="Año 1: 9 de 9" />);
    expect(pista()).toHaveAttribute("aria-valuenow", "9");
    expect(pista()).toHaveAttribute("aria-valuemax", "9");
    expect(pista()).toHaveAttribute("aria-valuemin", "0");
    expect(pista()).toHaveAccessibleName("Año 1: 9 de 9");
    expect(pista().style.getPropertyValue("--barra-progreso-relleno")).toBe(
      "100%",
    );
    expect(relleno()).toBeInTheDocument();
  });

  it("a la mitad llena la mitad", () => {
    render(<BarraProgreso valor={5} maximo={10} etiqueta="mitad" />);
    expect(pista().style.getPropertyValue("--barra-progreso-relleno")).toBe(
      "50%",
    );
  });

  it("en cero no llena nada", () => {
    render(<BarraProgreso valor={0} maximo={9} etiqueta="vacía" />);
    expect(pista().style.getPropertyValue("--barra-progreso-relleno")).toBe(
      "0%",
    );
  });

  it("recorta lo que se sale del rango y tolera un máximo de cero", () => {
    const { rerender } = render(
      <BarraProgreso valor={20} maximo={9} etiqueta="pasada" />,
    );
    expect(pista()).toHaveAttribute("aria-valuenow", "9");
    expect(pista().style.getPropertyValue("--barra-progreso-relleno")).toBe(
      "100%",
    );

    rerender(<BarraProgreso valor={-3} maximo={9} etiqueta="negativa" />);
    expect(pista()).toHaveAttribute("aria-valuenow", "0");

    rerender(<BarraProgreso valor={3} maximo={0} etiqueta="sin tope" />);
    expect(pista().style.getPropertyValue("--barra-progreso-relleno")).toBe(
      "0%",
    );
  });

  /** La regla del autor: ningún control nativo con aspecto por defecto. */
  it("no usa el `<progress>` del navegador", () => {
    render(<BarraProgreso valor={5} maximo={10} etiqueta="propia" />);
    expect(document.querySelector("progress")).toBeNull();
  });
});
