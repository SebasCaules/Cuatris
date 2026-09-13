/**
 * El campo de búsqueda propio: escribe, avisa cada tecla y no es un `<input>`.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CampoBusqueda } from "./CampoBusqueda";

function CampoVivo({ inicial = "" }) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <CampoBusqueda
        etiqueta="Buscar electiva"
        placeholder="Buscar electiva"
        valor={valor}
        onCambio={setValor}
      />
      <p data-testid="eco">{valor}</p>
    </>
  );
}

function campo(): HTMLElement {
  return screen.getByLabelText("Buscar electiva");
}

describe("CampoBusqueda", () => {
  it("es una caja de búsqueda propia, sin control nativo", () => {
    render(<CampoVivo />);
    expect(campo()).toHaveAttribute("role", "searchbox");
    expect(campo().tagName).toBe("SPAN");
    expect(
      document.querySelectorAll("input, select, progress, [title]"),
    ).toHaveLength(0);
  });

  it("avisa lo que se escribe y lo que se borra", async () => {
    const usuario = userEvent.setup();
    render(<CampoVivo />);

    await usuario.type(campo(), "cripto");
    expect(screen.getByTestId("eco")).toHaveTextContent("cripto");

    await usuario.clear(campo());
    expect(screen.getByTestId("eco")).toBeEmptyDOMElement();
  });

  it("arranca con el valor que le dan", () => {
    render(<CampoVivo inicial="pdi" />);
    expect(campo()).toHaveTextContent("pdi");
  });

  /**
   * Lo único que un editable hace y un `<input>` no: aceptar marcado al pegar.
   * El pegado se aplana a una sola línea de texto plano, así el filtro recibe
   * lo mismo que habría recibido de un control nativo.
   */
  it("al pegar aplana el texto a una sola línea", async () => {
    const usuario = userEvent.setup();
    render(<CampoVivo />);

    act(() => {
      campo().focus();
    });
    await usuario.paste("  cripto\ny  redes  ");

    expect(screen.getByTestId("eco")).toHaveTextContent("cripto y redes");
    expect(campo().textContent).not.toContain("\n");
    expect(campo().querySelector("*")).toBeNull();
  });

  it("apagado no se edita ni entra en la cadena de tabulación", () => {
    render(
      <CampoBusqueda
        etiqueta="Buscar electiva"
        valor=""
        onCambio={() => undefined}
        deshabilitado
      />,
    );
    expect(campo()).toHaveAttribute("aria-disabled", "true");
    expect(campo()).toHaveAttribute("contenteditable", "false");
    expect(campo()).toHaveAttribute("tabindex", "-1");
  });

  it("lleva el texto de ayuda como dato, no como contenido", () => {
    render(<CampoVivo />);
    expect(campo()).toHaveAttribute("data-placeholder", "Buscar electiva");
    expect(campo()).toBeEmptyDOMElement();
  });
});
