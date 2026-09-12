/**
 * Ficha 13e con los datos reales: el plan `S10-Rev23` y el corpus de casos
 * raros. Nada se inventa acá; cuando el mockup y el plan real no coinciden,
 * gana el plan (ver `notes` de la unidad).
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { PlanUsuario } from "../../contrato/tipos";
import { ProveedorPlanUsuario, usePlanUsuario } from "../../estado/contexto";
import {
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  historiaCon,
  planCon,
  planVacio,
} from "../../motor/fixtures/reales";
import { FichaMateria, textoCreditos } from "./FichaMateria";

/** `rectorado` → `Rectorado`, como lo publica `vocabulario.json`. */
function nombreDeSede(id: string): string {
  return id === "rectorado" ? "Rectorado" : id === "sdt" ? "SDT" : id;
}

function montar(plan: PlanUsuario, hijos: ReactNode) {
  return render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "listo", plan }}>
      {hijos}
    </ProveedorPlanUsuario>,
  );
}

/** El plan con 72.44 comisión S en el período del corpus. */
function conCriptoElegida(): PlanUsuario {
  return planCon({}, { [PERIODO_RARO]: [{ codigo: "72.44", comision: "S" }] });
}

describe("textoCreditos", () => {
  it("singulariza solo el 1", () => {
    expect(textoCreditos(0)).toBe("0 créditos");
    expect(textoCreditos(1)).toBe("1 crédito");
    expect(textoCreditos(6)).toBe("6 créditos");
  });
});

describe("FichaMateria", () => {
  it("72.41 lista sus correlativas reales con el estado de cada una", () => {
    montar(
      planCon(historiaCon(["72.37"]), {
        "2027-1C": [{ codigo: "72.11" }],
      }),
      <FichaMateria codigo="72.41" periodo="2026-2C" plan={PLAN} />,
    );

    expect(
      screen.getByRole("heading", { name: "72.41 · Base de Datos II" }),
    ).toBeInTheDocument();

    const ficha = screen.getByRole("region", {
      name: "72.41 Base de Datos II",
    });
    // El orden es el que declara el plan: `correlativas: ["72.11", "72.37"]`.
    const filas = within(ficha).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("72.11");
    expect(filas[0]).toHaveTextContent("Sistemas Operativos");
    expect(filas[0]).toHaveTextContent("planificada en 1.º 2027");
    expect(filas[1]).toHaveTextContent("72.37");
    expect(filas[1]).toHaveTextContent("Base de Datos I");
    expect(filas[1]).toHaveTextContent("aprobada");
  });

  it("«HABILITA» muestra lo que el motor deriva del plan real", () => {
    montar(
      planVacio(),
      <FichaMateria codigo="72.41" periodo="2026-2C" plan={PLAN} />,
    );

    // `habilita("72.41")` en `data/v1/planes/S10-Rev23.json`. El mockup 13e
    // dibuja 72.45 y 72.20, que en el plan real no dependen de 72.41.
    for (const codigo of ["72.54", "72.80", "72.82", "72.92", "73.40"]) {
      expect(screen.getAllByText(codigo).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("OLAP y Explotación de Datos")).toBeInTheDocument();
    // 73.50 también la tiene de correlativa, pero no está vigente: el panel de
    // agregar nunca la va a ofrecer, así que la ficha no la promete.
    expect(screen.queryByText("73.50")).not.toBeInTheDocument();
  });

  it("la línea mono trae departamento, créditos, ciclo y período", () => {
    montar(
      conCriptoElegida(),
      <FichaMateria
        codigo="72.44"
        periodo={PERIODO_RARO}
        plan={PLAN}
        horarios={HORARIOS_RAROS}
      />,
    );

    expect(
      screen.getByText(
        "Sistemas Digitales y Datos · 6 créditos · troncal · 2.º 2026",
      ),
    ).toBeInTheDocument();
  });

  it("el horario de la comisión elegida va con aulas, sede y modalidad", () => {
    montar(
      conCriptoElegida(),
      <FichaMateria
        codigo="72.44"
        periodo={PERIODO_RARO}
        plan={PLAN}
        horarios={HORARIOS_RAROS}
        nombreDeSede={nombreDeSede}
      />,
    );

    expect(screen.getByText("HORARIO · COMISIÓN S")).toBeInTheDocument();
    expect(screen.getByText("Lunes 15:00–18:00")).toBeInTheDocument();
    expect(
      screen.getByText("002R · Rectorado · Presencial"),
    ).toBeInTheDocument();
    // El corpus no publica docentes para esta comisión: no se inventa la sección.
    expect(screen.queryByText("DOCENTES")).not.toBeInTheDocument();
  });

  it("los chips muestran el estado, la comisión y el cupo del corpus", () => {
    montar(
      conCriptoElegida(),
      <FichaMateria
        codigo="72.44"
        periodo={PERIODO_RARO}
        plan={PLAN}
        horarios={HORARIOS_RAROS}
      />,
    );

    // 72.44 exige 72.07, que no está aprobada: la simulación la da bloqueada.
    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText("Comisión S")).toBeInTheDocument();
    expect(screen.getByText("cupo 51 / 70")).toBeInTheDocument();
  });

  it("sin curso en el período avisa que no hay horario publicado", () => {
    montar(
      planCon({}, { [PERIODO_RARO]: [{ codigo: "72.41" }] }),
      <FichaMateria
        codigo="72.41"
        periodo={PERIODO_RARO}
        plan={PLAN}
        horarios={HORARIOS_RAROS}
      />,
    );

    expect(
      screen.getByText("— Sin horario publicado para 2.º 2026"),
    ).toBeInTheDocument();
  });

  it("«Quitar del plan» pide confirmación y recién después quita", async () => {
    const usuario = userEvent.setup();
    montar(
      conCriptoElegida(),
      <>
        <FichaMateria
          codigo="72.44"
          periodo={PERIODO_RARO}
          plan={PLAN}
          horarios={HORARIOS_RAROS}
        />
        <Sonda />
      </>,
    );

    expect(screen.getByTestId("planificadas")).toHaveTextContent("72.44");

    await usuario.click(screen.getByRole("button", { name: "Quitar del plan" }));
    expect(
      screen.getByText(/¿Quitar 72.44 de 2\.º 2026\?/),
    ).toBeInTheDocument();
    // Mientras no se confirme, el plan no se toca.
    expect(screen.getByTestId("planificadas")).toHaveTextContent("72.44");

    await usuario.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByTestId("planificadas")).toHaveTextContent("72.44");

    await usuario.click(screen.getByRole("button", { name: "Quitar del plan" }));
    await usuario.click(screen.getByRole("button", { name: "Sí" }));
    expect(screen.getByTestId("planificadas")).toHaveTextContent("vacío");
    expect(
      screen.queryByRole("button", { name: "Quitar del plan" }),
    ).not.toBeInTheDocument();
  });

  it("«Cambiar de comisión» avisa a quien abre el modal de U3.4", async () => {
    const usuario = userEvent.setup();
    const alCambiarComision = vi.fn();
    montar(
      conCriptoElegida(),
      <FichaMateria
        codigo="72.44"
        periodo={PERIODO_RARO}
        plan={PLAN}
        horarios={HORARIOS_RAROS}
        alCambiarComision={alCambiarComision}
      />,
    );

    await usuario.click(
      screen.getByRole("button", { name: "Cambiar de comisión" }),
    );
    expect(alCambiarComision).toHaveBeenCalledWith("72.44", PERIODO_RARO);
  });

  it("las acciones de sprints siguientes quedan apagadas y lo dicen", async () => {
    montar(
      planVacio(),
      <FichaMateria codigo="72.41" periodo="2026-2C" plan={PLAN} />,
    );

    const mover = screen.getByRole("button", {
      name: "Mover a otro cuatrimestre",
    });
    // `aria-disabled` y no `disabled`: el motivo tiene que llegar también por
    // teclado y por lector de pantalla, y un botón `disabled` no recibe foco.
    expect(mover).toHaveAttribute("aria-disabled", "true");
    expect(mover).not.toBeDisabled();
    expect(mover).toHaveAttribute("title", "Llega en el Sprint 2");

    const sugerir = screen.getByRole("button", { name: "Sugerir corrección" });
    expect(sugerir).toHaveAttribute("aria-disabled", "true");
    expect(sugerir).not.toBeDisabled();
    expect(sugerir).toHaveAttribute("title", "Llega en el Sprint 3");

    // El motivo está a la vista y enlazado desde cada botón.
    for (const [boton, texto] of [
      [mover, "Mover a otro cuatrimestre: Llega en el Sprint 2."],
      [sugerir, "Sugerir corrección: Llega en el Sprint 3."],
    ] as const) {
      const id = boton.getAttribute("aria-describedby");
      expect(id).not.toBeNull();
      expect(document.getElementById(id ?? "")).toHaveTextContent(texto);
    }

    // Y se alcanzan con el teclado, que es lo que `disabled` impedía.
    await userEvent.tab();
    let vueltas = 0;
    while (document.activeElement !== mover && vueltas < 40) {
      await userEvent.tab();
      vueltas += 1;
    }
    expect(document.activeElement).toBe(mover);
  });

  it("un código que el plan no tiene se dice, no se dibuja a medias", () => {
    montar(
      planVacio(),
      <FichaMateria codigo="93.18" periodo="2026-2C" plan={PLAN} />,
    );

    expect(
      screen.getByText("93.18 no está en el plan S10-Rev23."),
    ).toBeInTheDocument();
  });
});

/** Muestra lo planificado en el período del corpus, para ver el efecto real. */
function Sonda() {
  const { plan } = usePlanUsuario();
  const codigos = (plan.periodos[PERIODO_RARO] ?? []).map(
    (materia) => materia.codigo,
  );
  return (
    <p data-testid="planificadas">
      {codigos.length === 0 ? "vacío" : codigos.join(",")}
    </p>
  );
}
