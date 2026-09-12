/**
 * La tarjeta de un año, sola: cabecera, cuenta, las dos columnas y las cuatro
 * acciones de grupo. El estado vive afuera, así que acá se prueba lo que la
 * tarjeta avisa, no lo que guarda.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Codigo } from "../../contrato/tipos";
import type { EstadoMarca } from "../MarcaMateria";
import { COLUMNAS_ANIO_1 } from "./ejemplo";
import { TarjetaAnio } from "./TarjetaAnio";

const TODOS = COLUMNAS_ANIO_1.flatMap((columna) =>
  columna.materias.map((materia) => materia.codigo),
);

function montar(
  estados: Record<Codigo, EstadoMarca> = {},
  espias: {
    alCambiar?: (codigo: Codigo, siguiente: EstadoMarca) => void;
    alMarcarVarias?: (codigos: Codigo[], estado: EstadoMarca) => void;
  } = {},
) {
  return render(
    <TarjetaAnio
      titulo="Año 1"
      ciclo="CICLO BÁSICO"
      columnas={COLUMNAS_ANIO_1}
      estadoDe={(codigo) => estados[codigo] ?? "pendiente"}
      alCambiar={espias.alCambiar ?? (() => undefined)}
      alMarcarVarias={espias.alMarcarVarias ?? (() => undefined)}
    />
  );
}

describe("TarjetaAnio", () => {
  it("es una región con el año por nombre, y muestra el ciclo", () => {
    montar();
    const tarjeta = screen.getByRole("region", { name: "Año 1" });
    expect(
      within(tarjeta).getByRole("heading", { name: "Año 1" }),
    ).toBeInTheDocument();
    expect(within(tarjeta).getByText("CICLO BÁSICO")).toBeInTheDocument();
  });

  it("cuenta solo las que tienen final, no las cursando ni las regulares", () => {
    montar({ "31.08": "final", "72.03": "cursada", "93.26": "cursando" });
    expect(screen.getByText("1/9")).toBeInTheDocument();
    const barra = screen.getAllByRole("progressbar")[0];
    expect(barra).toHaveAttribute("aria-valuenow", "1");
    expect(barra).toHaveAttribute("aria-valuemax", "9");
    expect(barra).toHaveAccessibleName("Año 1: 1 de 9 con final");
  });

  it("la cuenta de cada columna es la suya", () => {
    montar({ "31.08": "final", "72.31": "final", "93.28": "final" });
    const columnas = screen.getAllByRole("group");
    expect(within(columnas[0] as HTMLElement).getByText("1/5")).toBeInTheDocument();
    expect(within(columnas[1] as HTMLElement).getByText("2/4")).toBeInTheDocument();
  });

  it("«Marcar año» manda las nueve a final y «Desmarcar» a pendiente", async () => {
    const usuario = userEvent.setup();
    const alMarcarVarias = vi.fn();
    montar({}, { alMarcarVarias });

    await usuario.click(screen.getByRole("button", { name: "Marcar Año 1" }));
    expect(alMarcarVarias).toHaveBeenCalledWith(TODOS, "final");

    await usuario.click(screen.getByRole("button", { name: "Desmarcar Año 1" }));
    expect(alMarcarVarias).toHaveBeenCalledWith(TODOS, "pendiente");
  });

  it("las acciones del cuatrimestre mandan solo sus códigos", async () => {
    const usuario = userEvent.setup();
    const alMarcarVarias = vi.fn();
    montar({}, { alMarcarVarias });

    await usuario.click(
      screen.getByRole("button", { name: "Marcar 2.º cuatrimestre de Año 1" }),
    );
    expect(alMarcarVarias).toHaveBeenCalledWith(
      ["72.31", "93.28", "93.41", "93.59"],
      "final",
    );
  });

  /**
   * Las acciones se esconden con opacidad, no con `display: none`: si no
   * estuvieran en el DOM no habría forma de marcar un año sin mouse.
   */
  it("las acciones siguen alcanzables con el teclado", async () => {
    const usuario = userEvent.setup();
    montar();
    const marcar = screen.getByRole("button", { name: "Marcar Año 1" });
    await usuario.tab();
    expect(marcar).toHaveFocus();
  });

  it("la marca de cada materia avisa el estado siguiente del ciclo", async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    montar({ "93.58": "final" }, { alCambiar });

    await usuario.click(
      screen.getByRole("button", { name: /^93\.58 Álgebra:/ }),
    );
    expect(alCambiar).toHaveBeenCalledWith("93.58", "cursada");
  });

  it("no dibuja ningún control nativo con aspecto por defecto", () => {
    montar();
    expect(
      document.querySelectorAll('input[type="checkbox"], select, progress'),
    ).toHaveLength(0);
  });
});
