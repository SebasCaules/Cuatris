/**
 * La burbuja propia: aparece al foco, se enlaza con `aria-describedby`, y nunca
 * pone un `title=`.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RETARDO_TOOLTIP_MS, Tooltip, ubicar } from "./Tooltip";

describe("Tooltip", () => {
  it("al foco aparece con el texto exacto y se va al salir", async () => {
    const usuario = userEvent.setup();
    render(
      <>
        <Tooltip texto="Marcar todo el año como aprobado con final">
          <button type="button">Marcar</button>
        </Tooltip>
        <button type="button">Otro</button>
      </>,
    );
    const control = screen.getByRole("button", { name: "Marcar" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await usuario.tab();
    expect(control).toHaveFocus();
    const burbuja = screen.getByRole("tooltip");
    expect(burbuja).toHaveTextContent(
      "Marcar todo el año como aprobado con final",
    );
    expect(control).toHaveAttribute("aria-describedby", burbuja.id);

    await usuario.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(control).not.toHaveAttribute("aria-describedby");
  });

  it("con el mouse espera antes de aparecer", async () => {
    const usuario = userEvent.setup();
    render(
      <Tooltip texto="Plegar el año">
        <button type="button">Chevron</button>
      </Tooltip>,
    );
    await usuario.hover(screen.getByRole("button"));
    // El retardo es real: apenas entra el puntero todavía no hay burbuja.
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await waitFor(
      () => {
        expect(screen.getByRole("tooltip")).toBeInTheDocument();
      },
      { timeout: RETARDO_TOOLTIP_MS + 400 },
    );

    await usuario.unhover(screen.getByRole("button"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("nunca usa el `title` del navegador", () => {
    render(
      <Tooltip texto="Algo">
        <button type="button">Control</button>
      </Tooltip>,
    );
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
  });

  /** Con el texto vacío el envoltorio queda, pero no dibuja nada. */
  it("sin texto no muestra burbuja ni describe el control", () => {
    render(
      <Tooltip texto="">
        <button type="button">Control</button>
      </Tooltip>,
    );
    act(() => {
      screen.getByRole("button").focus();
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-describedby");
  });
});

/**
 * La burbuja se ubica contra el viewport: se da vuelta cuando no entra en el
 * lado pedido y se corre de costado sin dejar de apuntar al control.
 */
describe("Tooltip · ubicación", () => {
  const VIEWPORT = { width: 1000, height: 600 };
  const BURBUJA = { width: 120, height: 24 };

  function rect(left: number, top: number, width = 40, height = 20): DOMRect {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    };
  }

  it("arriba cuando entra, centrada sobre el control", () => {
    const donde = ubicar(rect(400, 300), BURBUJA, VIEWPORT, "arriba");
    expect(donde.lado).toBe("arriba");
    expect(donde.top).toBe(300 - 8 - 24);
    expect(donde.left).toBe(420 - 60);
    expect(donde.flecha).toBe(60);
  });

  it("se da vuelta hacia abajo si arriba no hay lugar", () => {
    const donde = ubicar(rect(400, 10), BURBUJA, VIEWPORT, "arriba");
    expect(donde.lado).toBe("abajo");
    expect(donde.top).toBe(30 + 8);
  });

  it("pegada al borde se corre y la flecha sigue sobre el control", () => {
    const donde = ubicar(rect(4, 300), BURBUJA, VIEWPORT, "arriba");
    expect(donde.left).toBe(8);
    // El centro del control está en 24; la flecha queda a 16 px del borde.
    expect(donde.flecha).toBe(16);
  });

  it("Escape la cierra", async () => {
    const usuario = userEvent.setup();
    render(
      <Tooltip texto="Cerrar con Escape">
        <button type="button">Control</button>
      </Tooltip>,
    );
    await usuario.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("un componente propio que no reenvía props se envuelve en un span", async () => {
    function Marca() {
      return <em>marca</em>;
    }
    const usuario = userEvent.setup();
    render(
      <Tooltip texto="Ciencia de Datos">
        <Marca />
      </Tooltip>,
    );
    const envoltorio = screen.getByText("marca").closest(".tooltip");
    expect(envoltorio).not.toBeNull();
    await usuario.hover(screen.getByText("marca"));
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Ciencia de Datos");
    });
  });
});
