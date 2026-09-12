import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

function Cuerpo() {
  return (
    <>
      <button type="button">Elegir</button>
      <button type="button">Elegida</button>
    </>
  );
}

describe("Modal", () => {
  it("cerrado no deja nada en el documento", () => {
    render(
      <Modal abierto={false} titulo="Elegir comisión" onCerrar={() => {}}>
        <Cuerpo />
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abierto es un diálogo modal nombrado por su título", () => {
    render(
      <Modal
        abierto
        titulo="93.18 Álgebra Lineal · elegir comisión"
        subtitulo="9 comisiones"
        onCerrar={() => {}}
      >
        <Cuerpo />
      </Modal>,
    );
    const dialogo = screen.getByRole("dialog", {
      name: "93.18 Álgebra Lineal · elegir comisión",
    });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveTextContent("9 comisiones");
  });

  it("el ancho llega como variable CSS, no como estilo suelto", () => {
    render(
      <Modal abierto titulo="Elegir comisión" ancho={1060} onCerrar={() => {}}>
        <Cuerpo />
      </Modal>,
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo.style.getPropertyValue("--modal-ancho")).toBe("1060px");
  });

  it("Escape y ✕ cierran", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(
      <Modal abierto titulo="Elegir comisión" onCerrar={alCerrar}>
        <Cuerpo />
      </Modal>,
    );

    await usuario.keyboard("{Escape}");
    expect(alCerrar).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(alCerrar).toHaveBeenCalledTimes(2);
  });

  it("el foco entra al abrirse y da la vuelta con Tab", async () => {
    const usuario = userEvent.setup();
    render(
      <Modal abierto titulo="Elegir comisión" onCerrar={() => {}}>
        <Cuerpo />
      </Modal>,
    );

    // El primero enfocable es ✕, que está antes que el cuerpo.
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();

    await usuario.tab();
    expect(screen.getByRole("button", { name: "Elegir" })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole("button", { name: "Elegida" })).toHaveFocus();
    // El último vuelve al primero: el foco no se escapa del diálogo.
    await usuario.tab();
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await usuario.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Elegida" })).toHaveFocus();
  });

  it("al cerrarse el foco vuelve a donde estaba", async () => {
    const usuario = userEvent.setup();

    function Pantalla() {
      const [abierto, setAbierto] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setAbierto(true);
            }}
          >
            Elegir comisión
          </button>
          <Modal
            abierto={abierto}
            titulo="Elegir comisión"
            onCerrar={() => {
              setAbierto(false);
            }}
          >
            <Cuerpo />
          </Modal>
        </>
      );
    }

    render(<Pantalla />);
    const disparador = screen.getByRole("button", { name: "Elegir comisión" });
    await usuario.click(disparador);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(disparador).toHaveFocus();
  });

  it("escribir adentro no le roba el foco al campo", async () => {
    // Regresión: con `onCerrar={() => …}` —lo normal— la prop cambia de
    // identidad en cada render del padre. Si la trampa de foco dependiera de
    // ella, cada tecla volvería a montar el efecto, el foco saltaría al ✕ y el
    // campo se comería la mitad de lo que se escribe.
    const usuario = userEvent.setup();

    function Pantalla() {
      const [texto, setTexto] = useState("");
      return (
        <Modal
          abierto
          titulo="Elegir comisión"
          onCerrar={() => undefined}
          subtitulo={texto}
        >
          <input
            aria-label="Buscar"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
          />
        </Modal>
      );
    }

    render(<Pantalla />);
    const campo = screen.getByRole("textbox", { name: "Buscar" });
    await usuario.click(campo);
    await usuario.type(campo, "algebra");

    expect(campo).toHaveValue("algebra");
    expect(campo).toHaveFocus();
  });
});
