/**
 * La tarjeta de un año, sola: cabecera compacta, casillas de grupo, cuenta,
 * las dos columnas y el plegado automático del año terminado.
 *
 * El estado del plan vive afuera, así que acá se prueba lo que la tarjeta
 * avisa, no lo que guarda. El plegado sí es suyo: es estado de pantalla.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Codigo } from "../../contrato/tipos";
import type { EstadoMarca } from "../MarcaMateria";
import { estadoDeCasilla, siguienteDeCasilla } from "./casilla";
import { COLUMNAS_ANIO_1 } from "./ejemplo";
import { TarjetaAnio } from "./TarjetaAnio";

const TODOS = COLUMNAS_ANIO_1.flatMap((columna) =>
  columna.materias.map((materia) => materia.codigo),
);

/** Todas en final: el año terminado, que es el que se pliega solo. */
const TODO_FINAL = Object.fromEntries(
  TODOS.map((codigo) => [codigo, "final" as EstadoMarca]),
) as Record<Codigo, EstadoMarca>;

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
    />,
  );
}

/** La casilla del año, por su nombre accesible. */
function casillaDelAnio(): HTMLElement {
  return screen.getByRole("checkbox", { name: "Todo Año 1 aprobado con final" });
}

function cuerpo(): HTMLElement {
  const elemento = document.querySelector(".tarjeta-anio__cuerpo");
  if (!(elemento instanceof HTMLElement)) {
    throw new Error("La tarjeta no dibujó su cuerpo.");
  }
  return elemento;
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

  it("cuenta solo las que tienen final, y las empezadas van al segmento ámbar", () => {
    montar({ "31.08": "final", "72.03": "cursada", "93.26": "cursando" });
    expect(screen.getByText("1")).toBeInTheDocument();
    const barra = screen.getAllByRole("progressbar")[0] as HTMLElement;
    expect(barra).toHaveAttribute("aria-valuenow", "1");
    expect(barra).toHaveAttribute("aria-valuemax", "9");
    expect(barra).toHaveAccessibleName("Año 1: 1 de 9 con final");
    // Una de nueve terminada, dos empezadas.
    expect(barra.style.getPropertyValue("--barra-progreso-parcial")).toBe(
      `${String((2 / 9) * 100)}%`,
    );
  });

  it("la cuenta de cada columna es la suya", () => {
    montar({ "31.08": "final", "72.31": "final", "93.28": "final" });
    const columnas = screen.getAllByRole("group");
    expect(
      within(columnas[0] as HTMLElement).getByText("1/5"),
    ).toBeInTheDocument();
    expect(
      within(columnas[1] as HTMLElement).getByText("2/4"),
    ).toBeInTheDocument();
  });
});

describe("TarjetaAnio · casillas de grupo", () => {
  it("sin nada marcado la casilla del año está vacía y marca las nueve", async () => {
    const usuario = userEvent.setup();
    const alMarcarVarias = vi.fn();
    montar({}, { alMarcarVarias });

    expect(casillaDelAnio()).toHaveAttribute("aria-checked", "false");
    await usuario.click(casillaDelAnio());
    expect(alMarcarVarias).toHaveBeenCalledWith(TODOS, "final");
  });

  it("con una sola empezada la casilla queda mixta", () => {
    montar({ "31.08": "cursada" });
    expect(casillaDelAnio()).toHaveAttribute("aria-checked", "mixed");
  });

  it("con las nueve en final queda marcada y el clic las quita", async () => {
    const usuario = userEvent.setup();
    const alMarcarVarias = vi.fn();
    montar(TODO_FINAL, { alMarcarVarias });

    expect(casillaDelAnio()).toHaveAttribute("aria-checked", "true");
    await usuario.click(casillaDelAnio());
    expect(alMarcarVarias).toHaveBeenCalledWith(TODOS, "pendiente");
  });

  it("la casilla del cuatrimestre manda solo sus códigos", async () => {
    const usuario = userEvent.setup();
    const alMarcarVarias = vi.fn();
    montar({}, { alMarcarVarias });

    await usuario.click(
      screen.getByRole("checkbox", {
        name: "Todo el 2.º cuatrimestre de Año 1 aprobado con final",
      }),
    );
    expect(alMarcarVarias).toHaveBeenCalledWith(
      ["72.31", "93.28", "93.41", "93.59"],
      "final",
    );
  });

  /** Marcar un año no es cerrarlo: el clic en la casilla no burbujea. */
  it("el clic en la casilla no pliega la tarjeta", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(casillaDelAnio());
    expect(
      screen.getByRole("button", { name: "Plegar Año 1" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("la casilla y la marca no son controles nativos", () => {
    montar();
    expect(
      document.querySelectorAll("input, select, progress, [title]"),
    ).toHaveLength(0);
  });
});

describe("TarjetaAnio · plegado", () => {
  it("el año terminado arranca plegado y su lista queda `inert`", () => {
    montar(TODO_FINAL);
    expect(
      screen.getByRole("button", { name: "Desplegar Año 1" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(cuerpo()).toHaveAttribute("inert");
  });

  it("al completarse se pliega solo, tras la pausa", async () => {
    const { rerender } = montar({});
    const chevron = () =>
      document.querySelector("[aria-expanded]") as HTMLElement;
    expect(chevron()).toHaveAttribute("aria-expanded", "true");

    rerender(
      <TarjetaAnio
        titulo="Año 1"
        ciclo="CICLO BÁSICO"
        columnas={COLUMNAS_ANIO_1}
        estadoDe={(codigo) => TODO_FINAL[codigo] ?? "pendiente"}
        alCambiar={() => undefined}
        alMarcarVarias={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(chevron()).toHaveAttribute("aria-expanded", "false");
    });
    expect(cuerpo()).toHaveAttribute("inert");
  });

  it("al quitar una marca se despliega y deja de estar `inert`", () => {
    const { rerender } = montar(TODO_FINAL);
    expect(cuerpo()).toHaveAttribute("inert");

    const menos: Record<Codigo, EstadoMarca> = { ...TODO_FINAL, "31.08": "cursada" };
    rerender(
      <TarjetaAnio
        titulo="Año 1"
        ciclo="CICLO BÁSICO"
        columnas={COLUMNAS_ANIO_1}
        estadoDe={(codigo) => menos[codigo] ?? "pendiente"}
        alCambiar={() => undefined}
        alMarcarVarias={() => undefined}
      />,
    );

    expect(cuerpo()).not.toHaveAttribute("inert");
    expect(
      screen.getByRole("button", { name: "Plegar Año 1" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("la cabecera entera alterna el plegado, y el chevron también con Enter", async () => {
    const usuario = userEvent.setup();
    montar();
    const cabecera = document.querySelector(
      ".tarjeta-anio__cabecera",
    ) as HTMLElement;

    await usuario.click(
      within(cabecera).getByRole("heading", { name: "Año 1" }),
    );
    expect(cuerpo()).toHaveAttribute("inert");

    await usuario.click(screen.getByRole("button", { name: "Desplegar Año 1" }));
    expect(cuerpo()).not.toHaveAttribute("inert");

    act(() => {
      screen.getByRole("button", { name: "Plegar Año 1" }).focus();
    });
    await usuario.keyboard("{Enter}");
    expect(cuerpo()).toHaveAttribute("inert");
  });

  /**
   * El entregable 3 pide `aria-expanded` **en la cabecera**, no solo en el
   * chevron, y que la cabecera se accione con Enter. Para eso la cabecera es
   * la parada de Tab —el chevron salió de la cadena para no duplicarla— y no
   * lleva `role="button"`: un rol de botón volvería presentacionales a la
   * casilla y a la barra de progreso que tiene adentro.
   */
  it("la cabecera lleva `aria-expanded`, recibe el foco y responde a Enter", async () => {
    const usuario = userEvent.setup();
    montar();
    const cabecera = document.querySelector(
      ".tarjeta-anio__cabecera",
    ) as HTMLElement;

    expect(cabecera).toHaveAttribute("aria-expanded", "true");
    expect(cabecera).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByRole("button", { name: "Plegar Año 1" }),
    ).toHaveAttribute("tabindex", "-1");

    act(() => {
      cabecera.focus();
    });
    expect(cabecera).toHaveFocus();

    await usuario.keyboard("{Enter}");
    expect(cabecera).toHaveAttribute("aria-expanded", "false");
    expect(cuerpo()).toHaveAttribute("inert");

    await usuario.keyboard("{Enter}");
    expect(cabecera).toHaveAttribute("aria-expanded", "true");
    expect(cuerpo()).not.toHaveAttribute("inert");
  });
});

describe("TarjetaAnio · marcas de materia", () => {
  it("la marca de cada materia avisa el estado siguiente del ciclo", async () => {
    const usuario = userEvent.setup();
    const alCambiar = vi.fn();
    montar({ "93.58": "cursada" }, { alCambiar });

    await usuario.click(
      screen.getByRole("button", { name: /^93\.58 Álgebra:/ }),
    );
    expect(alCambiar).toHaveBeenCalledWith("93.58", "final");
  });
});

describe("estadoDeCasilla", () => {
  it("vacía sin nada, mixta con algo, marcada con todo en final", () => {
    expect(estadoDeCasilla([])).toBe(false);
    expect(estadoDeCasilla(["pendiente", "pendiente"])).toBe(false);
    expect(estadoDeCasilla(["final", "pendiente"])).toBe("mixed");
    expect(estadoDeCasilla(["cursando", "pendiente"])).toBe("mixed");
    expect(estadoDeCasilla(["final", "final"])).toBe(true);
  });

  it("la casilla marcada quita y cualquier otra marca", () => {
    expect(siguienteDeCasilla(true)).toBe("pendiente");
    expect(siguienteDeCasilla(false)).toBe("final");
    expect(siguienteDeCasilla("mixed")).toBe("final");
  });
});
