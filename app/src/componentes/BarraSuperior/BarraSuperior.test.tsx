import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Ruta } from "../../rutas";
import { BarraSuperior, type PropsBarraSuperior } from "./BarraSuperior";

const BASE = {
  carrera: "Ingeniería en Informática",
  plan: "S10-Rev23",
  ruta: { vista: "plan" } as Ruta,
  ir: () => {},
};

function montar(extra: Partial<PropsBarraSuperior> = {}) {
  return render(<BarraSuperior {...BASE} {...extra} />);
}

describe("BarraSuperior", () => {
  it("muestra la carrera y el plan en mono, como en 13b", () => {
    montar();
    expect(
      screen.getByRole("heading", { name: "Ingeniería en Informática" }),
    ).toBeInTheDocument();
    expect(screen.getByText("plan S10-Rev23 · ITBA")).toHaveClass(
      "barra-superior__plan",
    );
  });

  it("marca la pestaña de la ruta activa y navega al pulsar la otra", async () => {
    const usuario = userEvent.setup();
    const ir = vi.fn();
    montar({ ir });

    expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Progreso" }),
    ).not.toHaveAttribute("aria-current");

    await usuario.click(screen.getByRole("button", { name: "Progreso" }));
    expect(ir).toHaveBeenCalledWith({ vista: "progreso" });
  });

  it("sin callbacks, búsqueda y «Sugerir corrección» quedan inertes", () => {
    montar();
    expect(
      screen.getByLabelText("Buscar materia, código o docente"),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sugerir corrección" }),
    ).toBeDisabled();
  });

  it("con onBuscar el campo escribe y avisa cada tecla", async () => {
    const usuario = userEvent.setup();
    const onBuscar = vi.fn();
    montar({ onBuscar });

    const campo = screen.getByLabelText("Buscar materia, código o docente");
    expect(campo).toBeEnabled();
    await usuario.type(campo, "alg");
    expect(onBuscar).toHaveBeenLastCalledWith("alg");
  });

  it("el menú ⋯ trae las tres acciones del plan y llama a la elegida", async () => {
    const usuario = userEvent.setup();
    const onExportar = vi.fn();
    montar({ onExportar });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Más acciones" }));

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Exportar plan",
      "Importar plan",
      "Borrar todo",
    ]);
    // Sin callback, el ítem no promete nada.
    expect(screen.getByRole("menuitem", { name: "Borrar todo" })).toBeDisabled();

    await usuario.click(screen.getByRole("menuitem", { name: "Exportar plan" }));
    expect(onExportar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("Escape cierra el menú", async () => {
    const usuario = userEvent.setup();
    montar({ onExportar: () => {} });

    await usuario.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
