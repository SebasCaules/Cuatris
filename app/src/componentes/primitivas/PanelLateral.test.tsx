import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PanelLateral } from "./PanelLateral";

describe("PanelLateral", () => {
  it("cerrado no deja nada en el documento", () => {
    render(
      <PanelLateral
        abierto={false}
        titulo="Agregar a 1.º 2026"
        onCerrar={() => {}}
      >
        <button type="button">+</button>
      </PanelLateral>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("no es modal: en 13c el carrusel se sigue viendo detrás", () => {
    render(
      <PanelLateral abierto titulo="Agregar a 1.º 2026" onCerrar={() => {}}>
        <button type="button">+</button>
      </PanelLateral>,
    );
    const panel = screen.getByRole("dialog", { name: "Agregar a 1.º 2026" });
    expect(panel).not.toHaveAttribute("aria-modal");
  });

  it("el ancho llega como variable CSS", () => {
    render(
      <PanelLateral
        abierto
        titulo="Agregar a 1.º 2026"
        ancho={330}
        onCerrar={() => {}}
      >
        <button type="button">+</button>
      </PanelLateral>,
    );
    expect(
      screen.getByRole("dialog").style.getPropertyValue("--panel-ancho"),
    ).toBe("330px");
  });

  it("Escape y ✕ cierran, y el foco entra al abrirse", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(
      <PanelLateral abierto titulo="Agregar a 1.º 2026" onCerrar={alCerrar}>
        <button type="button">+</button>
      </PanelLateral>,
    );

    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();

    await usuario.keyboard("{Escape}");
    expect(alCerrar).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(alCerrar).toHaveBeenCalledTimes(2);
  });

  it("buscar adentro no le roba el foco al campo", async () => {
    // Regresión: 13c es justamente buscar con el panel abierto. Si la trampa
    // de foco dependiera de la identidad de `onCerrar`, cada tecla mandaría el
    // foco al ✕ y la búsqueda sería inusable.
    const usuario = userEvent.setup();

    function Pantalla() {
      const [texto, setTexto] = useState("");
      return (
        <PanelLateral
          abierto
          titulo="Agregar a 1.º 2026"
          onCerrar={() => undefined}
        >
          <input
            aria-label="Buscar materia"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
          />
        </PanelLateral>
      );
    }

    render(<Pantalla />);
    const campo = screen.getByRole("textbox", { name: "Buscar materia" });
    await usuario.click(campo);
    await usuario.type(campo, "algebra");

    expect(campo).toHaveValue("algebra");
    expect(campo).toHaveFocus();
  });
});
