/**
 * 13c de punta a punta, con el plan real y la fixture de casos raros como
 * horarios del período.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Codigo, Horarios } from "../../contrato/tipos";
import { ProveedorPlanUsuario, usePlanUsuario } from "../../estado/contexto";
import {
  ABREVIACIONES,
  codigosDelCiclo,
  historiaCon,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  planCon,
} from "../../motor/fixtures/reales";
import { horariosConCupoLleno } from "./fixtures";
import { PanelAgregar } from "./PanelAgregar";

const BASICO = codigosDelCiclo("basico");
/** El escenario de 13b: ciclo básico aprobado, 147 créditos. */
const CON_BASICO = planCon(historiaCon(BASICO), {});

/** Deja ver lo que el panel escribió en el plan del usuario. */
function Sonda() {
  const { plan } = usePlanUsuario();
  const materias = plan.periodos[PERIODO_RARO] ?? [];
  return (
    <p data-testid="planificadas">
      {materias.map((materia) => materia.codigo).join(",")}
    </p>
  );
}

interface OpcionesMontaje {
  horarios: Horarios | null;
  alElegirComision: (codigo: Codigo) => void;
  alCerrar: () => void;
  msAvisoAgregada: number;
  alPrevisualizar: (codigo: Codigo | null) => void;
}

function montar(opciones: Partial<OpcionesMontaje> = {}) {
  const usuario = userEvent.setup();
  // `??` no sirve acá: `horarios: null` es un caso a propósito, no un hueco.
  const horarios =
    "horarios" in opciones ? (opciones.horarios ?? null) : HORARIOS_RAROS;
  render(
    <ProveedorPlanUsuario
      lecturaInicial={{ estado: "listo", plan: CON_BASICO }}
      retardoGuardadoMs={0}
    >
      <PanelAgregar
        periodo={PERIODO_RARO}
        plan={PLAN}
        abreviaciones={ABREVIACIONES}
        horarios={horarios}
        alCerrar={opciones.alCerrar ?? (() => undefined)}
        alElegirComision={opciones.alElegirComision ?? (() => undefined)}
        msAvisoAgregada={opciones.msAvisoAgregada ?? 30}
        {...(opciones.alPrevisualizar === undefined
          ? {}
          : { alPrevisualizar: opciones.alPrevisualizar })}
      />
      <Sonda />
    </ProveedorPlanUsuario>,
  );
  return usuario;
}

function campo(): HTMLElement {
  return screen.getByRole("searchbox", { name: "Buscar materia" });
}

/** La fila de un código, buscada por su etiqueta de código en mono. */
function fila(codigo: Codigo): HTMLElement {
  const marca = within(screen.getByRole("dialog")).getByText(codigo);
  const caja = marca.closest("li");
  if (caja === null) {
    throw new Error(`${codigo} no está en la lista de resultados.`);
  }
  return caja;
}

describe("PanelAgregar", () => {
  it("la cabecera nombra el cuatrimestre y el campo se lleva el foco", () => {
    montar();
    expect(
      screen.getByRole("dialog", { name: "Agregar a 2.º 2026" }),
    ).toBeInTheDocument();
    expect(campo()).toHaveFocus();
  });

  it("«pod» pone 72.42 primero en la lista", async () => {
    const usuario = montar();
    await usuario.type(campo(), "pod");
    const filas = screen.getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("72.42");
    expect(filas[0]).toHaveTextContent("Programación de Objetos Distribuidos");
  });

  /**
   * Rediseño: dos toggles independientes, «Troncales» y «Electivas». Con los
   * dos prendidos se ve todo; apagar uno saca su mitad. Lo aprobado ya no se
   * esconde: se ve tachado y atenuado.
   */
  it("apagar «Troncales» deja solo las electivas", async () => {
    const usuario = montar();
    await usuario.type(campo(), "análisis");
    // 93.26 Análisis Matemático I es del ciclo básico (aprobada): se ve igual.
    expect(fila("93.26")).toHaveClass("fila-materia--aprobada");
    expect(fila("72.72")).toBeInTheDocument();

    const troncales = screen.getByRole("button", { name: "Troncales" });
    expect(troncales).toHaveAttribute("aria-pressed", "true");
    await usuario.click(troncales);
    expect(troncales).toHaveAttribute("aria-pressed", "false");
    expect(
      within(screen.getByRole("dialog")).queryByText("93.26"),
    ).not.toBeInTheDocument();
    expect(fila("72.72")).toBeInTheDocument();
  });

  it("con los dos toggles apagados no pasa ninguna materia", async () => {
    const usuario = montar();
    await usuario.click(screen.getByRole("button", { name: "Troncales" }));
    await usuario.click(screen.getByRole("button", { name: "Electivas" }));
    expect(
      screen.getByText("Ninguna materia pasa estos filtros."),
    ).toBeInTheDocument();
  });

  it("una materia bloqueada muestra el motivo y no tiene «+»", async () => {
    const usuario = montar();
    await usuario.type(campo(), "72.45");
    const caja = fila("72.45");
    expect(caja).toHaveTextContent("requiere 160 cr, tenés 147");
    expect(
      within(caja).queryByRole("button", { name: /^Agregar 72\.45/ }),
    ).not.toBeInTheDocument();
  });

  it("«+» sobre una materia con comisiones abre la elección de comisión", async () => {
    const alElegirComision = vi.fn();
    const usuario = montar({ alElegirComision });
    await usuario.type(campo(), "72.44");
    await usuario.click(
      within(fila("72.44")).getByRole("button", { name: /^Agregar 72\.44/ }),
    );
    expect(alElegirComision).toHaveBeenCalledWith("72.44");
    expect(screen.getByTestId("planificadas")).toHaveTextContent("");
  });

  it("«+» sobre una materia sin horarios la agrega y avisa en la fila", async () => {
    const alElegirComision = vi.fn();
    const usuario = montar({ alElegirComision });
    // 72.42 no tiene curso en el archivo de horarios del período.
    await usuario.type(campo(), "72.42");
    expect(fila("72.42")).toHaveTextContent("sin horario publicado");

    await usuario.click(
      within(fila("72.42")).getByRole("button", { name: /^Agregar 72\.42/ }),
    );
    expect(alElegirComision).not.toHaveBeenCalled();
    expect(screen.getByTestId("planificadas")).toHaveTextContent("72.42");
    expect(screen.getByRole("status")).toHaveTextContent("agregada");

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("con todas las comisiones llenas muestra ◐ y conserva el «+»", async () => {
    const alElegirComision = vi.fn();
    const usuario = montar({
      horarios: horariosConCupoLleno(),
      alElegirComision,
    });
    await usuario.type(campo(), "72.44");
    const caja = fila("72.44");
    expect(caja).toHaveTextContent("cupo 70/70");
    expect(caja).toHaveTextContent("Lun 15–18");
    expect(caja).toHaveTextContent("002R");
    expect(
      within(caja).getByRole("button", { name: /^Agregar 72\.44/ }),
    ).toBeInTheDocument();
  });

  it("lo que ya está en el plan se marca con su cuatrimestre y pierde el «+»", async () => {
    const usuario = montar();
    await usuario.type(campo(), "72.42");
    await usuario.click(
      within(fila("72.42")).getByRole("button", { name: /^Agregar 72\.42/ }),
    );
    const caja = fila("72.42");
    expect(caja).toHaveTextContent("en 2.º 2026");
    expect(caja).toHaveClass("fila-materia--enElPlan");
    expect(
      within(caja).queryByRole("button", { name: /^Agregar 72\.42/ }),
    ).not.toBeInTheDocument();
  });

  it("las insignias de minor salen de la electiva y llevan el nombre del minor", async () => {
    const usuario = montar();
    await usuario.type(campo(), "72.72");
    const caja = fila("72.72");
    expect(
      within(caja).getByLabelText("Ciencia de Datos"),
    ).toHaveTextContent("CD");
    expect(
      within(caja).getByLabelText("Arquitectura de Software"),
    ).toHaveTextContent("ARQ");
    // Una electiva no lleva la insignia de troncal.
    expect(within(caja).queryByText("troncal")).not.toBeInTheDocument();
  });

  it("una obligatoria lleva la insignia de troncal y ninguna de minor", async () => {
    const usuario = montar();
    await usuario.type(campo(), "72.44");
    const caja = fila("72.44");
    expect(within(caja).getByText("troncal")).toBeInTheDocument();
    expect(caja.querySelectorAll(".insignia--minor")).toHaveLength(0);
  });

  it("la aula se dibuja aparte y grande", async () => {
    const usuario = montar();
    await usuario.type(campo(), "72.44");
    const caja = fila("72.44");
    expect(within(caja).getByText("Lun 15–18")).toHaveClass(
      "fila-materia__franja",
    );
    expect(within(caja).getByText("002R")).toHaveClass("fila-materia__aula");
  });

  it("pasar el puntero por una materia disponible pide previsualizarla", async () => {
    const alPrevisualizar = vi.fn();
    const usuario = montar({ alPrevisualizar });
    await usuario.type(campo(), "72.42");
    await usuario.hover(fila("72.42"));
    expect(alPrevisualizar).toHaveBeenLastCalledWith("72.42");
    await usuario.unhover(fila("72.42"));
    expect(alPrevisualizar).toHaveBeenLastCalledWith(null);

    // Una aprobada no se previsualiza: no hay dónde ponerla.
    alPrevisualizar.mockClear();
    await usuario.clear(campo());
    await usuario.type(campo(), "93.26");
    await usuario.hover(fila("93.26"));
    expect(alPrevisualizar).not.toHaveBeenCalled();
  });

  it("el pie arma la leyenda con los minors del plan", () => {
    montar();
    expect(
      screen.getByText(
        /Las siglas marcan a qué minor suma la electiva: CD Ciencia de Datos · IA Inteligencia Artificial · IRV Imágenes y Realidad Virtual · ARQ Arquitectura de Software/,
      ),
    ).toBeInTheDocument();
  });

  it("sin coincidencias explica cómo buscar", async () => {
    const usuario = montar();
    await usuario.type(campo(), "xyz");
    expect(
      screen.getByText("Nada con «xyz». Probá con el código, el nombre o el docente."),
    ).toBeInTheDocument();
  });

  it("el ✕ cierra el panel", async () => {
    const alCerrar = vi.fn();
    const usuario = montar({ alCerrar });
    await usuario.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("sin horarios publicados todas las filas lo dicen", async () => {
    const usuario = montar({ horarios: null });
    await usuario.type(campo(), "72.44");
    expect(fila("72.44")).toHaveTextContent("sin horario publicado");
  });
});
