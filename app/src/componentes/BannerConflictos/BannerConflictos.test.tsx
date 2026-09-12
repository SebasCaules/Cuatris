/**
 * El banner de 13h, con los choques que el motor saca del corpus.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CAMBIOS_DE_SEDE, CHOQUES } from "../GrillaSemanal/ejemplo";
import { BannerConflictos, textoDeConflictos } from "./BannerConflictos";

describe("textoDeConflictos", () => {
  it("resuelve el singular y el plural", () => {
    expect(textoDeConflictos(1, "2026-1C")).toBe(
      "1 conflicto sin resolver en 1.º 2026",
    );
    expect(textoDeConflictos(3, "2026-1C")).toBe(
      "3 conflictos sin resolver en 1.º 2026",
    );
  });
});

describe("BannerConflictos", () => {
  it("con cero choques no se dibuja", () => {
    const { container } = render(
      <BannerConflictos periodo="2026-1C" choques={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("con un choque avisa en singular", () => {
    render(<BannerConflictos periodo="2026-2C" choques={CHOQUES} />);
    expect(
      screen.getByText("1 conflicto sin resolver en 2.º 2026"),
    ).toBeVisible();
  });

  it("cuenta también los cambios de sede, como en 13h", () => {
    render(
      <BannerConflictos
        periodo="2026-1C"
        choques={CHOQUES}
        cambiosDeSede={CAMBIOS_DE_SEDE}
      />,
    );
    expect(
      screen.getByText("2 conflictos sin resolver en 1.º 2026"),
    ).toBeVisible();
  });

  it("«Resolver de a uno» dispara el primer choque", async () => {
    const alResolver = vi.fn();
    render(
      <BannerConflictos
        periodo="2026-2C"
        choques={CHOQUES}
        alResolver={alResolver}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Resolver de a uno" }),
    );
    expect(alResolver).toHaveBeenCalledWith(CHOQUES[0]);
  });

  it("sin `alResolver` no ofrece un botón que no hace nada", () => {
    render(<BannerConflictos periodo="2026-2C" choques={CHOQUES} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
