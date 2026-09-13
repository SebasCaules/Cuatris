/**
 * La burbuja propia: aparece al foco, se enlaza con `aria-describedby`, y nunca
 * pone un `title=`.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RETARDO_TOOLTIP_MS, Tooltip } from "./Tooltip";

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
