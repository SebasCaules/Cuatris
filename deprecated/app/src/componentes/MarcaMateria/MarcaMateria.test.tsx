/**
 * El control propio: cuatro estados, el ciclo cronológico de R2, tooltip propio
 * y ni una casilla nativa.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ayudaDeMarca,
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

  /** La regla de R2: la ayuda es una burbuja propia, jamás el `title`. */
  it("al foco muestra un tooltip propio con el estado y el próximo clic", async () => {
    const usuario = userEvent.setup();
    render(<MarcaViva />);

    expect(marca()).not.toHaveAttribute("title");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await usuario.tab();
    expect(marca()).toHaveFocus();
    const burbuja = screen.getByRole("tooltip");
    expect(burbuja).toHaveTextContent("Pendiente · clic: cursando");
    expect(marca()).toHaveAttribute("aria-describedby", burbuja.id);

    await usuario.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("el texto del tooltip nombra los cuatro pasos del ciclo", () => {
    expect(ayudaDeMarca("pendiente")).toBe("Pendiente · clic: cursando");
    expect(ayudaDeMarca("cursando")).toBe("Cursando · clic: cursada aprobada");
    expect(ayudaDeMarca("cursada")).toBe(
      "Cursada aprobada, falta el final · clic: aprobada con final",
    );
    expect(ayudaDeMarca("final")).toBe(
      "Aprobada con final · clic: pendiente",
    );
  });

  it("el clic cicla pendiente → cursando → cursada → final → pendiente", async () => {
    const usuario = userEvent.setup();
    render(<MarcaViva />);

    expect(marca()).toHaveClass("marca-materia--pendiente");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--cursando");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--cursada");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--final");
    await usuario.click(marca());
    expect(marca()).toHaveClass("marca-materia--pendiente");
  });

  /** Con el ciclo cronológico, llegar a *final* cuesta exactamente tres clics. */
  it("marcar el final desde pendiente son tres clics", async () => {
    const usuario = userEvent.setup();
    render(<MarcaViva />);
    for (let clic = 0; clic < 3; clic += 1) {
      await usuario.click(marca());
    }
    expect(marca()).toHaveClass("marca-materia--final");
  });

  it("Enter y Espacio hacen lo mismo que el clic", async () => {
    const usuario = userEvent.setup();
    render(<MarcaViva />);

    await usuario.tab();
    expect(marca()).toHaveFocus();
    await usuario.keyboard("{Enter}");
    expect(marca()).toHaveClass("marca-materia--cursando");
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
    expect(alCambiar).toHaveBeenCalledWith("pendiente");
  });

  /** Sin `alCambiar` es un dibujo: lo que necesita la leyenda. */
  it("sin `alCambiar` no es un control", () => {
    render(
      <MarcaMateria
        codigo="31.08"
        nombre="Sistemas de Representación"
        estado="final"
        tamano={16}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    const dibujo = document.querySelector(".marca-materia");
    expect(dibujo).toHaveAttribute("aria-hidden", "true");
    expect(dibujo).toHaveStyle({ "--marca-lado": "16px" });
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
        nativos: document.querySelectorAll("input, select, progress, [title]")
          .length,
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

  /** La doble tilde es la de la referencia, con su lienzo apaisado. */
  it("la doble tilde usa el lienzo 24×16 y los trazos de la referencia", () => {
    render(
      <MarcaMateria
        codigo="31.08"
        nombre="Sistemas de Representación"
        estado="final"
        alCambiar={() => undefined}
      />,
    );
    const svg = document.querySelector(".marca-materia__glifo--doble");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 16");
    expect(svg).toHaveAttribute("width", "19");
    const trazos = [...document.querySelectorAll(".marca-materia__glifo path")]
      .map((path) => path.getAttribute("d"));
    expect(trazos).toEqual(["M2.5 8.5L6 12L11.5 4.5", "M9.5 8.5L13 12L18.5 4.5"]);
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

  it("el ciclo recorre los cuatro estados en orden cronológico y cierra", () => {
    let estado: EstadoMarca = "pendiente";
    const recorrido: EstadoMarca[] = [];
    for (let paso = 0; paso < 4; paso += 1) {
      estado = CICLO_MARCA[estado];
      recorrido.push(estado);
    }
    expect(recorrido).toEqual(["cursando", "cursada", "final", "pendiente"]);
  });
});
