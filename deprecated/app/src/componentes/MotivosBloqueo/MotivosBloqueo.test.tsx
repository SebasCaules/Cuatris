/**
 * 13f con el plan real: los créditos de 72.45 y las correlativas de 72.41.
 *
 * La historia de 147 créditos no se escribe a mano: se arma con las materias
 * vigentes del plan real hasta llegar justo a 147, y el test lo comprueba antes
 * de usarla.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { Codigo, EntradaHistoria, PlanUsuario } from "../../contrato/tipos";
import { ProveedorPlanUsuario, usePlanUsuario } from "../../estado/contexto";
import { creditosAprobados } from "../../motor";
import {
  PLAN,
  historiaCon,
  planCon,
} from "../../motor/fixtures/reales";
import { MotivosBloqueo, textoDeSalida } from "./MotivosBloqueo";

/** El período del corpus; el destrabe cae en el siguiente. */
const PERIODO = "2026-2C";
const SIGUIENTE = "2027-1C";

/** Créditos aprobados de 13f: 147, «tenés 147 al empezar». */
const CREDITOS_DE_13F = 147;

/**
 * Historia aprobada que suma exactamente 147 créditos con materias vigentes
 * del plan real, en orden de código y sin 72.45 (la que se va a mirar).
 */
function historiaDe147(): Record<Codigo, EntradaHistoria> {
  const codigos: Codigo[] = [];
  let total = 0;
  const ordenadas = [...PLAN.materias].sort((una, otra) =>
    una.codigo < otra.codigo ? -1 : una.codigo > otra.codigo ? 1 : 0,
  );
  for (const materia of ordenadas) {
    if (!materia.vigente || materia.codigo === "72.45") {
      continue;
    }
    if (total + materia.creditos > CREDITOS_DE_13F) {
      continue;
    }
    codigos.push(materia.codigo);
    total += materia.creditos;
    if (total === CREDITOS_DE_13F) {
      break;
    }
  }
  if (total !== CREDITOS_DE_13F) {
    throw new Error(
      `El plan real ya no admite una historia de ${String(CREDITOS_DE_13F)} créditos.`,
    );
  }
  return historiaCon(codigos);
}

function montar(plan: PlanUsuario, hijos: ReactNode) {
  return render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "listo", plan }}>
      {hijos}
    </ProveedorPlanUsuario>,
  );
}

/** Muestra dónde quedó planificada 72.45 después de la acción. */
function Sonda() {
  const { plan } = usePlanUsuario();
  const periodos = Object.entries(plan.periodos)
    .filter(([, materias]) =>
      materias.some((materia) => materia.codigo === "72.45"),
    )
    .map(([periodo]) => periodo);
  return (
    <p data-testid="donde">
      {periodos.length === 0 ? "en ningún lado" : periodos.join(",")}
    </p>
  );
}

describe("textoDeSalida", () => {
  it("nombra solo lo que faltaba", () => {
    expect(textoDeSalida([{ tipo: "creditos", requeridos: 160, tienes: 147 }], 205)).toBe(
      "Con lo que ya está en el plan llegás a 205 créditos.",
    );
    expect(
      textoDeSalida(
        [{ tipo: "correlativa", codigo: "72.41", estado: "falta" }],
        0,
      ),
    ).toBe("Con lo que ya está en el plan 72.41 queda aprobada.");
    expect(
      textoDeSalida(
        [
          { tipo: "correlativa", codigo: "72.11", estado: "falta" },
          { tipo: "correlativa", codigo: "72.37", estado: "falta" },
          { tipo: "creditos", requeridos: 160, tienes: 147 },
        ],
        205,
      ),
    ).toBe(
      "Con lo que ya está en el plan llegás a 205 créditos y 72.11, 72.37 quedan aprobadas.",
    );
  });
});

describe("MotivosBloqueo", () => {
  it("la historia de 147 créditos es la del plan real", () => {
    expect(creditosAprobados(historiaDe147(), PLAN)).toBe(CREDITOS_DE_13F);
  });

  it("72.45 con 147 créditos explica el bloqueo como 13f", () => {
    montar(
      planCon(historiaDe147(), {}),
      <MotivosBloqueo codigo="72.45" periodo={PERIODO} plan={PLAN} />,
    );

    expect(
      screen.getByText("Materia bloqueada para este cuatrimestre"),
    ).toBeInTheDocument();
    expect(screen.getByText("72.45 · Proyecto Final")).toBeInTheDocument();
    expect(screen.getByText("12 cr")).toBeInTheDocument();
    expect(screen.getByText("Bloqueada para 2.º 2026")).toBeInTheDocument();

    const fila = screen.getByRole("listitem");
    expect(fila).toHaveTextContent("Requiere 160 créditos aprobados");
    expect(fila).toHaveTextContent("tenés 147 al empezar");
  });

  it("sin nada planificado, dice que no se destraba", () => {
    montar(
      planCon(historiaDe147(), {}),
      <MotivosBloqueo codigo="72.45" periodo={PERIODO} plan={PLAN} />,
    );

    expect(
      screen.getByText("No se destraba con lo planificado hasta ahora."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Planificar en/ }),
    ).not.toBeInTheDocument();
  });

  it("con 18 créditos más en el plan, se destraba al cuatrimestre siguiente", async () => {
    const usuario = userEvent.setup();
    montar(
      planCon(historiaDe147(), {
        [PERIODO]: [
          { codigo: "72.37" },
          { codigo: "72.41" },
          { codigo: "72.44" },
        ],
      }),
      <>
        <MotivosBloqueo codigo="72.45" periodo={PERIODO} plan={PLAN} />
        <Sonda />
      </>,
    );

    expect(screen.getByText("Se destraba en 1.º 2027")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Con lo que ya está en el plan llegás a 165 créditos.",
      ),
    ).toBeInTheDocument();

    await usuario.click(
      screen.getByRole("button", { name: "Planificar en 1.º 2027" }),
    );
    expect(screen.getByTestId("donde")).toHaveTextContent(SIGUIENTE);
    expect(window.location.hash).toBe("#/plan");
  });

  it("72.41 muestra la correlativa que falta y la que ya está", () => {
    montar(
      planCon(historiaCon(["72.11"]), { [PERIODO]: [{ codigo: "72.37" }] }),
      <MotivosBloqueo codigo="72.41" periodo={PERIODO} plan={PLAN} />,
    );

    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent("Correlativa 72.37 Base de Datos I");
    expect(filas[0]).toHaveTextContent("la cursás en 2.º 2026");
    expect(filas[1]).toHaveTextContent(
      "Correlativa 72.11 Sistemas Operativos",
    );
    expect(filas[1]).toHaveTextContent("aprobada");

    expect(
      screen.getByText(
        "Con lo que ya está en el plan 72.37 queda aprobada.",
      ),
    ).toBeInTheDocument();
  });

  it("una materia que no está bloqueada no dibuja nada", () => {
    const { container } = montar(
      planCon(historiaCon(["72.11", "72.37"]), {}),
      <MotivosBloqueo codigo="72.41" periodo={PERIODO} plan={PLAN} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("la tarjeta rayada lleva el código y los créditos juntos", () => {
    montar(
      planCon(historiaDe147(), {}),
      <MotivosBloqueo codigo="72.45" periodo={PERIODO} plan={PLAN} />,
    );
    const tarjeta = screen.getByRole("region", {
      name: "72.45 bloqueada para 2.º 2026",
    });
    expect(within(tarjeta).getByText("12 cr")).toBeInTheDocument();
  });
});
