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

  /**
   * F4.9: el panel no es un modal, así que tampoco atrapa el Tab. Con la
   * trampa puesta, quien navegaba con teclado quedaba encerrado y no llegaba a
   * las flechas, los chips ni los bloques de la tarjeta, que es justo lo que el
   * panel prometía dejar a la vista.
   */
  it("el Tab sale del panel en vez de dar la vuelta adentro", async () => {
    const usuario = userEvent.setup();
    render(
      <>
        <PanelLateral abierto titulo="Agregar a 1.º 2026" onCerrar={() => {}}>
          <button type="button">+</button>
        </PanelLateral>
        <button type="button">Cuatrimestre siguiente</button>
      </>,
    );

    // Arranca en el ✕, sigue por el «+» y el siguiente Tab sale del panel.
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole("button", { name: "+" })).toHaveFocus();
    await usuario.tab();
    expect(
      screen.getByRole("button", { name: "Cuatrimestre siguiente" }),
    ).toHaveFocus();
    expect(screen.getByRole("dialog")).not.toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  /**
   * F4.9 (segunda mitad): con el `keydown` enganchado en la caja, salir del
   * panel con un clic afuera dejaba a Escape sin efecto.
   */
  it("Escape cierra aunque el foco se haya ido del panel", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(
      <>
        <PanelLateral abierto titulo="Agregar a 1.º 2026" onCerrar={alCerrar}>
          <button type="button">+</button>
        </PanelLateral>
        <button type="button">Cuatrimestre siguiente</button>
      </>,
    );

    await usuario.click(
      screen.getByRole("button", { name: "Cuatrimestre siguiente" }),
    );
    await usuario.keyboard("{Escape}");
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("con `enfocarAlAbrir` en falso el foco se queda donde estaba", () => {
    const afuera = document.createElement("button");
    document.body.appendChild(afuera);
    afuera.focus();
    render(
      <PanelLateral
        abierto
        titulo="Agregar a 1.º 2026"
        enfocarAlAbrir={false}
        onCerrar={() => {}}
      >
        <button type="button">+</button>
      </PanelLateral>,
    );
    expect(afuera).toHaveFocus();
    afuera.remove();
  });
});
