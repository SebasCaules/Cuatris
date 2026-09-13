/**
 * La lista al pie, con el choque real del corpus y el cambio de sede derivado.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CAMBIOS_DE_SEDE,
  CHOQUES,
  nombreDeSede,
} from "../GrillaSemanal/ejemplo";
import { ListaConflictos } from "./ListaConflictos";

const CHOQUE = CHOQUES[0];
const CAMBIO = CAMBIOS_DE_SEDE[0];
if (CHOQUE === undefined || CAMBIO === undefined) {
  throw new Error("El ejemplo dejó de traer un choque y un cambio de sede.");
}

describe("ListaConflictos", () => {
  it("sin conflictos no dibuja nada", () => {
    const { container } = render(<ListaConflictos choques={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("cuenta los choques y los cambios de sede juntos", () => {
    render(
      <ListaConflictos choques={CHOQUES} cambiosDeSede={CAMBIOS_DE_SEDE} />,
    );
    expect(screen.getByText("CONFLICTOS · 2")).toBeInTheDocument();
  });

  it("la fila 1 es el choque del lunes, con las dos materias", () => {
    render(<ListaConflictos choques={CHOQUES} />);
    const fila = screen.getAllByRole("listitem")[0];
    expect(fila).toHaveTextContent(
      "Lun 15–16 · 93.18 Álgebra Lineal ↔ 72.44 Criptografía y Seguridad",
    );
    expect(fila).toHaveTextContent("1");
  });

  it("acepta un nombre más corto para la materia", () => {
    render(
      <ListaConflictos
        choques={CHOQUES}
        nombreDeMateria={(codigo) =>
          codigo === "93.18" ? "Álgebra" : "Criptografía"
        }
      />,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "Lun 15–16 · 93.18 Álgebra ↔ 72.44 Criptografía",
    );
  });

  it("el cambio de sede va con ↕ y con «Ver», no con «Resolver»", () => {
    render(
      <ListaConflictos
        choques={[]}
        cambiosDeSede={CAMBIOS_DE_SEDE}
        nombreDeSede={nombreDeSede}
        alVer={() => undefined}
        alResolver={() => undefined}
      />,
    );
    const fila = screen.getAllByRole("listitem")[0];
    expect(fila).toHaveTextContent("Jue 16:00 Rectorado → SDT");
    expect(fila).toHaveTextContent("Cambio de sede");
    expect(screen.getByRole("button", { name: "Ver" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resolver" }),
    ).not.toBeInTheDocument();
  });

  it("la fila activa es la del choque que tiene el mouse encima", () => {
    const { rerender } = render(<ListaConflictos choques={CHOQUES} />);
    expect(screen.getAllByRole("listitem")[0]).not.toHaveAttribute(
      "aria-current",
    );
    rerender(<ListaConflictos choques={CHOQUES} activo={CHOQUE} />);
    const fila = screen.getAllByRole("listitem")[0];
    expect(fila).toHaveAttribute("aria-current", "true");
    expect(fila?.className).toContain("conflictos__fila--activa");
  });

  it("«Resolver» devuelve el choque de esa fila", async () => {
    const usuario = userEvent.setup();
    const alResolver = vi.fn();
    render(<ListaConflictos choques={CHOQUES} alResolver={alResolver} />);
    await usuario.click(screen.getByRole("button", { name: "Resolver" }));
    expect(alResolver).toHaveBeenCalledWith(CHOQUE);
  });

  it("«Ver» devuelve el cambio de sede de esa fila", async () => {
    const usuario = userEvent.setup();
    const alVer = vi.fn();
    render(
      <ListaConflictos
        choques={[]}
        cambiosDeSede={CAMBIOS_DE_SEDE}
        alVer={alVer}
      />,
    );
    await usuario.click(screen.getByRole("button", { name: "Ver" }));
    expect(alVer).toHaveBeenCalledWith(CAMBIO);
  });
});
