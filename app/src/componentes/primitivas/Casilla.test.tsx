/**
 * La casilla propia: tres estados, teclado, y ni un `<input>` a la vista.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Casilla } from "./Casilla";

function casilla(): HTMLElement {
  return screen.getByRole("checkbox");
}

describe("Casilla", () => {
  it("dice su estado en `aria-checked`, incluido el mixto", () => {
    const { rerender } = render(
      <Casilla marcada={false} etiqueta="Todo Año 1" alAccionar={() => undefined} />,
    );
    expect(casilla()).toHaveAttribute("aria-checked", "false");
    expect(casilla()).toHaveAccessibleName("Todo Año 1");

    rerender(
      <Casilla marcada="mixed" etiqueta="Todo Año 1" alAccionar={() => undefined} />,
    );
    expect(casilla()).toHaveAttribute("aria-checked", "mixed");

    rerender(
      <Casilla marcada etiqueta="Todo Año 1" alAccionar={() => undefined} />,
    );
    expect(casilla()).toHaveAttribute("aria-checked", "true");
  });

  it("el clic y el Espacio la accionan", async () => {
    const usuario = userEvent.setup();
    const alAccionar = vi.fn();
    render(
      <Casilla marcada={false} etiqueta="Todo Año 1" alAccionar={alAccionar} />,
    );

    await usuario.tab();
    expect(casilla()).toHaveFocus();
    await usuario.keyboard(" ");
    expect(alAccionar).toHaveBeenCalledTimes(1);

    await usuario.click(casilla());
    expect(alAccionar).toHaveBeenCalledTimes(2);
  });

  /** Marcar no es plegar: el evento no sale de la casilla. */
  it("el clic no llega al contenedor", async () => {
    const usuario = userEvent.setup();
    const alContenedor = vi.fn();
    render(
      <div onClick={alContenedor}>
        <Casilla marcada={false} etiqueta="Todo Año 1" alAccionar={() => undefined} />
      </div>,
    );
    await usuario.click(casilla());
    expect(alContenedor).not.toHaveBeenCalled();
  });

  it("dibuja la tilde marcada, el guion mixta y nada vacía, sin `<input>`", () => {
    const trazos = (marcada: boolean | "mixed") => {
      const { unmount } = render(
        <Casilla marcada={marcada} etiqueta="x" alAccionar={() => undefined} />,
      );
      const cuenta = {
        paths: document.querySelectorAll(".casilla__glifo path").length,
        nativos: document.querySelectorAll("input, select, progress, [title]")
          .length,
      };
      unmount();
      return cuenta;
    };
    expect(trazos(true)).toEqual({ paths: 1, nativos: 0 });
    expect(trazos("mixed")).toEqual({ paths: 1, nativos: 0 });
    expect(trazos(false)).toEqual({ paths: 0, nativos: 0 });
  });
});
