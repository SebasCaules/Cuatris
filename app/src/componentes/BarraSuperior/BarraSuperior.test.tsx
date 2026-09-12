import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Ruta } from "../../rutas";
import { PanelLateral } from "../primitivas";
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
    const boton = screen.getByRole("button", { name: "Sugerir corrección" });
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).not.toHaveAttribute("onclick");
  });

  /**
   * F4.11: mientras 13j no exista el botón sigue apagado, pero deja de ser un
   * control muerto y mudo: dice cuándo llega, en el `title` y en una nota que
   * `aria-describedby` enlaza (igual que en la ficha de materia).
   */
  it("«Sugerir corrección» apagado explica cuándo llega", () => {
    montar();
    const boton = screen.getByRole("button", { name: "Sugerir corrección" });
    expect(boton).toHaveAttribute("title", "Llega en el Sprint 3");
    const id = boton.getAttribute("aria-describedby");
    expect(id).not.toBeNull();
    expect(document.getElementById(id ?? "")).toHaveTextContent(
      "Llega en el Sprint 3",
    );
  });

  /**
   * F4.11, residuo: el botón apagado tiene que recibir el mismo trato que los
   * del pie de la ficha (F4.12). Con `disabled` no recibía foco —con Tab no
   * había forma de llegar a él— y la nota que explica el motivo estaba
   * recortada fuera de la pantalla, así que los dos controles apagados de la
   * app se comportaban distinto.
   */
  it("«Sugerir corrección» apagado se alcanza con Tab y su nota está a la vista", async () => {
    const usuario = userEvent.setup();
    montar({ onBuscar: () => undefined });

    const boton = screen.getByRole("button", { name: "Sugerir corrección" });
    // `aria-disabled`, no `disabled`: se anuncia apagado pero se enfoca.
    expect(boton).toHaveAttribute("aria-disabled", "true");
    expect(boton).toBeEnabled();

    boton.focus();
    expect(boton).toHaveFocus();

    // Y se llega tabulando desde el campo de búsqueda que tiene al lado.
    screen.getByLabelText("Buscar materia, código o docente").focus();
    await usuario.tab();
    expect(boton).toHaveFocus();

    const nota = document.getElementById(
      boton.getAttribute("aria-describedby") ?? "",
    );
    expect(nota).not.toBeNull();
    // Visible: sin el recorte de 1x1 que la sacaba de la pantalla.
    expect(nota).toHaveClass("barra-superior__nota");
    expect(nota).toBeVisible();
    expect(nota).not.toHaveStyle({ clipPath: "inset(50%)" });
  });

  it("con onSugerir el botón se enciende y deja de excusarse", async () => {
    const usuario = userEvent.setup();
    const onSugerir = vi.fn();
    montar({ onSugerir });
    const boton = screen.getByRole("button", { name: "Sugerir corrección" });
    expect(boton).toBeEnabled();
    expect(boton).not.toHaveAttribute("aria-disabled");
    expect(boton).not.toHaveAttribute("title");
    expect(boton).not.toHaveAttribute("aria-describedby");
    expect(
      document.querySelector(".barra-superior__nota"),
    ).not.toBeInTheDocument();

    await usuario.click(boton);
    expect(onSugerir).toHaveBeenCalledTimes(1);
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
    expect(
      screen.getByRole("menuitem", { name: "Borrar todo" }),
    ).toBeDisabled();

    await usuario.click(
      screen.getByRole("menuitem", { name: "Exportar plan" }),
    );
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

  /**
   * Regresión de F4.9: con `atrapar: false` el Escape del panel se escucha en
   * el documento, y el menú ⋯ tenía su propio `keydown` en el documento. Un
   * solo Escape cerraba las dos capas y se perdía la consulta ya tipeada en el
   * panel. Ahora cada Escape cierra una capa: primero la de arriba.
   */
  it("con un panel abierto detrás, un Escape cierra solo el menú", async () => {
    const usuario = userEvent.setup();

    function Pantalla() {
      const [panelAbierto, setPanelAbierto] = useState(true);
      return (
        <>
          <BarraSuperior {...BASE} onExportar={() => {}} />
          <PanelLateral
            abierto={panelAbierto}
            titulo="Agregar a 2.º 2026"
            onCerrar={() => {
              setPanelAbierto(false);
            }}
          >
            <input aria-label="Buscar materia" defaultValue="cripto" />
          </PanelLateral>
        </>
      );
    }

    render(<Pantalla />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    // Primer Escape: se va el menú, el panel se queda con lo tipeado.
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar materia")).toHaveValue("cripto");

    // Segundo Escape: ahora sí cierra el panel.
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
