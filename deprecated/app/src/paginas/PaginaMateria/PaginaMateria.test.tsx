/**
 * La pantalla `#/materia/<codigo>`: el código sale de la ruta y el bloque 13f
 * aparece solo cuando la materia está bloqueada para el período.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { Codigo, EntradaHistoria, PlanUsuario } from "../../contrato/tipos";
import { ProveedorPlanUsuario } from "../../estado/contexto";
import {
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  historiaCon,
  planCon,
  planVacio,
} from "../../motor/fixtures/reales";
import { PaginaMateria, type DatosDeMateria } from "./PaginaMateria";

const DATOS: DatosDeMateria = {
  plan: PLAN,
  horarios: HORARIOS_RAROS,
  vocabulario: {
    contrato: "1.0.0",
    sedes: [
      { id: "rectorado", nombre: "Rectorado" },
      { id: "sdt", nombre: "SDT" },
    ],
  },
  periodoActivo: PERIODO_RARO,
};

function montar(plan: PlanUsuario, hijos: ReactNode) {
  return render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "listo", plan }}>
      {hijos}
    </ProveedorPlanUsuario>,
  );
}

/** Historia aprobada con todo lo que 72.45 necesita menos los créditos. */
function historiaCorta(): Record<Codigo, EntradaHistoria> {
  return historiaCon(["72.11", "72.37"]);
}

describe("PaginaMateria", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("lee el código de la ruta y vuelve al plan con un enlace", () => {
    window.location.hash = "#/materia/72.41";
    montar(planVacio(), <PaginaMateria datos={DATOS} />);

    expect(
      screen.getByRole("heading", { name: "72.41 · Base de Datos II" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Plan" })).toHaveAttribute(
      "href",
      "#/plan",
    );
  });

  it("una materia bloqueada trae el bloque 13f antes de la ficha", () => {
    window.location.hash = "#/materia/72.45";
    montar(
      planCon(historiaCorta(), { [PERIODO_RARO]: [{ codigo: "72.45" }] }),
      <PaginaMateria datos={DATOS} />,
    );

    expect(
      screen.getByText("Materia bloqueada para este cuatrimestre"),
    ).toBeInTheDocument();
    expect(screen.getByText("Requiere 160 créditos aprobados")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "72.45 · Proyecto Final" }),
    ).toBeInTheDocument();
  });

  it("una materia disponible no trae el bloque de bloqueo", () => {
    window.location.hash = "#/materia/72.41";
    montar(planCon(historiaCorta(), {}), <PaginaMateria datos={DATOS} />);

    expect(
      screen.queryByText("Materia bloqueada para este cuatrimestre"),
    ).not.toBeInTheDocument();
  });

  it("un código que no está en el plan se dice sin dibujar la ficha", () => {
    window.location.hash = "#/materia/93.18";
    montar(planVacio(), <PaginaMateria datos={DATOS} />);

    expect(
      screen.getByText("93.18 no está en el plan S10-Rev23."),
    ).toBeInTheDocument();
    expect(screen.queryByText("CORRELATIVAS")).not.toBeInTheDocument();
  });

  it("sin código en la ruta lo dice en vez de adivinar uno", () => {
    window.location.hash = "#/plan";
    montar(planVacio(), <PaginaMateria datos={DATOS} />);

    expect(
      screen.getByText("La dirección no trae ningún código de materia."),
    ).toBeInTheDocument();
  });
});
