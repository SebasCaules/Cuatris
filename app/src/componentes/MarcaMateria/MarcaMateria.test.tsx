/**
 * El control propio de R1: cuatro estados, un ciclo y ni una casilla nativa.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CICLO_MARCA,
  ESTADO_GUARDADO,
  MarcaMateria,
  marcaDeHistoria,
  type EstadoMarca,
} from "./MarcaMateria";

/** La marca con su estado adentro, como la usa la página. */
function MarcaViva({ inicial = "pendiente" as EstadoMarca }) {
  const [estado, setEstado] = useState<EstadoMarca>(inicial);
  return (
    <MarcaMateria
      codigo="31.08"
      nombre="Sistemas de Representación"
      estado={estado}
      alCambiar={setEstado}
    />
  );
}

function marca(): HTMLElement {
  return screen.getByRole("button");
}

describe("MarcaMateria", () => {
  it("nombra el estado en el `aria-label`, con código y nombre", () => {
    const nombres: Record<EstadoMarca, string> = {
      pendiente: "31.08 Sistemas de Representación: pendiente",
      final: "31.08 Sistemas de Representación: aprobada con final",
      cursada:
        "31.08 Sistemas de Representación: cursada aprobada, falta el final",
      cursando: "31.08 Sistemas de Representación: cursando",
    };
    for (const [estado, nombre] of Object.entries(nombres)) {
      const { unmount } = render(
        <MarcaMateria
          codigo="31.08"
          nombre="Sistemas de Representación"
          estado={estado as EstadoMarca}
          alCambiar={() => undefined}
        />,
      );
      expect(marca()).toHaveAccessibleName(nombre);
      unmount();
    }
  });

  it("lleva la ayuda de qué hace el clic", () => {
    render(<MarcaViva />);
    expect(marca()).toHaveAttribute("title", "Clic: cambia el estado");
  });

  it("el clic cicla pendiente → final → cursada → cursando → pendiente", async () => {
    const usuario = userEvent.setup();
    render(<MarcaViva />);

    expect(marca()).toHaveClass("marca-materia--pendiente");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--final");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--cursada");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--cursando");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--pendiente");
  });

  it("Enter y Espacio hacen lo mismo que el clic", async () => {
    const usuario = userEvent.setup();
    render(<MarcaViva />);

    marca().focus();
    await usuario.keyboard("{Enter}");
    expect(marca()).toHaveClass("marca-materia--final");
    await usuario.keyboard(" ");
    expect(marca()).toHaveClass("marca-materia--cursada");
  });

  it("avisa el estado siguiente, no el actual", async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    render(
      <MarcaMateria
        codigo="31.08"
        nombre="Sistemas de Representación"
        estado="final"
        alCambiar={alCambiar}
      />,
    );
    await usuario.click(marca());
    expect(alCambiar).toHaveBeenCalledWith("cursada");
  });

  it("dibuja sus glifos en SVG propio, sin casilla ni tipografía de iconos", () => {
    /*
     * Cada estado se monta de cero. `rerender` no sirve acá: `MarcaViva`
     * guarda `inicial` en un `useState`, y volver a renderizarla con otro
     * valor no cambia el estado que ya tiene adentro.
     */
    const glifos = (estado: EstadoMarca) => {
      const { unmount } = render(
        <MarcaMateria
          codigo="31.08"
          nombre="Sistemas de Representación"
          estado={estado}
          alCambiar={() => undefined}
        />,
      );
      const cuenta = {
        paths: document.querySelectorAll(".marca-materia__glifo path").length,
        circulos:
          document.querySelectorAll(".marca-materia__glifo circle").length,
        glifo: document.querySelector(".marca-materia__glifo") !== null,
        nativos: document.querySelectorAll(
          'input[type="checkbox"], select, progress',
        ).length,
      };
      unmount();
      return cuenta;
    };

    // Doble tilde: dos trazos. Tilde simple: uno. Cursando: un punto.
    expect(glifos("final")).toEqual({
      paths: 2,
      circulos: 0,
      glifo: true,
      nativos: 0,
    });
    expect(glifos("cursada")).toEqual({
      paths: 1,
      circulos: 0,
      glifo: true,
      nativos: 0,
    });
    expect(glifos("cursando")).toEqual({
      paths: 0,
      circulos: 1,
      glifo: true,
      nativos: 0,
    });
    expect(glifos("pendiente")).toEqual({
      paths: 0,
      circulos: 0,
      glifo: false,
      nativos: 0,
    });
  });
});

describe("traducción entre la marca y lo guardado", () => {
  it("cada marca guarda lo que dice el contrato; pendiente no guarda nada", () => {
    expect(ESTADO_GUARDADO).toEqual({
      pendiente: null,
      final: "aprobada",
      cursada: "regular",
      cursando: "cursando",
    });
  });

  it("`marcaDeHistoria` es la vuelta, y sin entrada da pendiente", () => {
    expect(marcaDeHistoria("aprobada")).toBe("final");
    expect(marcaDeHistoria("regular")).toBe("cursada");
    expect(marcaDeHistoria("cursando")).toBe("cursando");
    expect(marcaDeHistoria(undefined)).toBe("pendiente");
  });

  it("el ciclo recorre los cuatro estados y cierra", () => {
    let estado: EstadoMarca = "pendiente";
    const recorrido: EstadoMarca[] = [];
    for (let paso = 0; paso < 4; paso += 1) {
      estado = CICLO_MARCA[estado];
      recorrido.push(estado);
    }
    expect(recorrido).toEqual(["final", "cursada", "cursando", "pendiente"]);
  });
});
