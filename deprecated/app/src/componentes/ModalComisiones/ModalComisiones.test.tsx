/**
 * 13d con los datos reales: 93.18 Álgebra Lineal (nueve comisiones, A–H y K)
 * del archivo de casos raros, y un plan con 72.44 Criptografía comisión S —la
 * que ocupa el lunes de 15 a 18— ya puesta en el período.
 *
 * Todo lo que se espera acá sale del corpus, no del mockup: donde 13d dibujó
 * horarios de relleno (la comisión K con el horario de la A, «cupo 12 / 48» en
 * la C), la prueba usa el dato publicado.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Codigo, PeriodoId, PlanUsuario } from "../../contrato/tipos";
import { ProveedorPlanUsuario } from "../../estado/contexto";
import { ABREVIACIONES, HORARIOS_RAROS, planVacio } from "../../motor/fixtures/reales";
import { ModalComisiones } from "./ModalComisiones";

const PERIODO: PeriodoId = HORARIOS_RAROS.periodo.id;
const ALGEBRA: Codigo = "93.18";
const CRIPTO: Codigo = "72.44";

const SEDES: Record<string, string> = { rectorado: "Rectorado", sdt: "SDT" };
const nombreDeSede = (id: string) => SEDES[id] ?? id;

/** El plan de 13b: Criptografía com. S ya elegida, y lo que se le agregue. */
function planCon(
  materias: readonly { codigo: Codigo; comision?: string }[],
): PlanUsuario {
  const base = planVacio();
  return {
    ...base,
    periodos: { [PERIODO]: materias.map((materia) => ({ ...materia })) },
    colores: { [CRIPTO]: 5, [ALGEBRA]: 0 },
  };
}

function dibujar(
  plan: PlanUsuario,
  extra: { fijada?: Codigo; alCerrar?: () => void } = {},
) {
  const alCerrar = extra.alCerrar ?? vi.fn();
  render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "listo", plan }}>
      <ModalComisiones
        periodo={PERIODO}
        codigo={ALGEBRA}
        horarios={HORARIOS_RAROS}
        abreviaciones={ABREVIACIONES.abreviaciones}
        nombreDeSede={nombreDeSede}
        alCerrar={alCerrar}
        {...(extra.fijada === undefined ? {} : { fijada: extra.fijada })}
      />
    </ProveedorPlanUsuario>,
  );
  return { alCerrar };
}

/** La tarjeta de una comisión de la lista. */
function tarjeta(id: string): HTMLElement {
  return screen.getByRole("article", { name: `Comisión ${id}` });
}

/** Los ids de las comisiones visibles, en el orden en que están dibujadas. */
function idsVisibles(): string[] {
  return screen
    .getAllByRole("article")
    .map((elemento) => elemento.getAttribute("aria-label") ?? "")
    .map((etiqueta) => etiqueta.replace("Comisión ", ""));
}

describe("ModalComisiones · lista", () => {
  it("titula con el curso del período y cuenta las nueve comisiones", () => {
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]));
    expect(
      screen.getByRole("dialog", {
        name: "93.18 Álgebra Lineal · elegir comisión",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "9 comisiones · ordenadas por compatibilidad con tu 2.º 2026",
      ),
    ).toBeInTheDocument();
  });

  it("pone antes las comisiones sin choque con lo que ya hay planificado", () => {
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]));
    // 72.44 com. S ocupa el lunes de 15 a 18: A y H son las únicas que chocan,
    // así que quedan al final y no entran entre las cuatro visibles.
    expect(idsVisibles()).toEqual(["B", "C", "D", "K"]);
    expect(screen.queryByRole("article", { name: "Comisión A" })).toBeNull();
  });

  it("la comisión A muestra «▲ choque lun 15–16 · ◐ llena»", async () => {
    const usuario = userEvent.setup();
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]));
    await usuario.click(screen.getByRole("button", { name: /comisiones más/ }));

    const caja = within(tarjeta("A"));
    expect(caja.getByText("choque lun 15–16")).toBeInTheDocument();
    expect(caja.getByText("llena")).toBeInTheDocument();
    expect(caja.getByText("cupo 48 / 48")).toBeInTheDocument();
    expect(caja.getByText("Lun 14–16 · 001R Rectorado")).toBeInTheDocument();
    expect(caja.getByText("Mié 14–16 · 201T SDT")).toBeInTheDocument();
  });

  it("la comisión B no choca y cruza dos sedes", () => {
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]));
    const caja = within(tarjeta("B"));
    expect(caja.getByText("sin choques")).toBeInTheDocument();
    expect(caja.getByText("2 sedes")).toBeInTheDocument();
    expect(caja.getByText("cupo 48 / 49")).toBeInTheDocument();
    expect(caja.getByText("Mié 10–12 · 003T 004T SDT")).toBeInTheDocument();
  });

  it("el colapsado dice cuántas faltan y se expande al clic", async () => {
    const usuario = userEvent.setup();
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]));

    const mas = screen.getByRole("button", {
      name: "E · F · G · H · A — 5 comisiones más",
    });
    await usuario.click(mas);

    expect(idsVisibles()).toEqual(["B", "C", "D", "K", "E", "F", "G", "H", "A"]);
    expect(screen.queryByRole("button", { name: /comisiones más/ })).toBeNull();
  });

  it("la comisión ya elegida se marca con «Elegida»", () => {
    dibujar(
      planCon([
        { codigo: CRIPTO, comision: "S" },
        { codigo: ALGEBRA, comision: "B" },
      ]),
    );
    expect(
      within(tarjeta("B")).getByRole("button", { name: "Elegida" }),
    ).toBeInTheDocument();
    expect(
      within(tarjeta("C")).getByRole("button", { name: "Elegir" }),
    ).toBeInTheDocument();
  });
});

describe("ModalComisiones · vista previa", () => {
  it("sin cursor encima muestra la comisión elegida", () => {
    dibujar(
      planCon([
        { codigo: CRIPTO, comision: "S" },
        { codigo: ALGEBRA, comision: "A" },
      ]),
      { fijada: CRIPTO },
    );
    expect(
      screen.getByRole("heading", { name: "Tu 2.º 2026 con la comisión A" }),
    ).toBeInTheDocument();
    expect(screen.getByText("sigue el choque del lunes")).toBeInTheDocument();
  });

  it("el cursor sobre B recalcula la vista previa y la línea de resultado", async () => {
    const usuario = userEvent.setup();
    dibujar(
      planCon([
        { codigo: CRIPTO, comision: "S" },
        { codigo: ALGEBRA, comision: "A" },
      ]),
      { fijada: CRIPTO },
    );

    await usuario.hover(tarjeta("B"));

    expect(
      screen.getByRole("heading", { name: "Tu 2.º 2026 con la comisión B" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("el choque del lunes desaparece"),
    ).toBeInTheDocument();
    // La grilla se redibuja con el horario de B: el lunes de 12 a 14.
    expect(
      screen.getByRole("img", {
        name: /93\.18 Álgebra Lineal · comisión B · lunes 12:00–14:00/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Choque lunes/ })).toBeNull();

    await usuario.unhover(tarjeta("B"));
    expect(
      screen.getByRole("heading", { name: "Tu 2.º 2026 con la comisión A" }),
    ).toBeInTheDocument();
  });

  it("sin materia elegida ni cursor, la vista previa usa la primera del orden", () => {
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]));
    const previa = screen.getByRole("complementary", {
      name: "Vista previa con la comisión B",
    });
    expect(
      within(previa).getByRole("heading", {
        name: "Tu 2.º 2026 con la comisión B",
      }),
    ).toBeInTheDocument();
    expect(within(previa).getByText("sin choques")).toBeInTheDocument();
  });
});

describe("ModalComisiones · elegir", () => {
  it("agrega la materia, guarda la comisión y cierra", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]), { alCerrar });

    await usuario.click(
      within(tarjeta("C")).getByRole("button", { name: "Elegir" }),
    );

    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(
      within(tarjeta("C")).getByRole("button", { name: "Elegida" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tu 2.º 2026 con la comisión C" }),
    ).toBeInTheDocument();
  });

  it("elegir una comisión llena está permitido", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    dibujar(planCon([{ codigo: CRIPTO, comision: "S" }]), { alCerrar });
    await usuario.click(screen.getByRole("button", { name: /comisiones más/ }));

    const boton = within(tarjeta("A")).getByRole("button", { name: "Elegir" });
    expect(boton).toBeEnabled();
    await usuario.click(boton);

    expect(alCerrar).toHaveBeenCalledTimes(1);
    expect(
      within(tarjeta("A")).getByRole("button", { name: "Elegida" }),
    ).toBeInTheDocument();
  });
});

describe("ModalComisiones · sin comisiones publicadas", () => {
  it("15.09 se puede agregar sin comisión", async () => {
    const usuario = userEvent.setup();
    const alCerrar = vi.fn();
    render(
      <ProveedorPlanUsuario
        lecturaInicial={{ estado: "listo", plan: planVacio() }}
      >
        <ModalComisiones
          periodo={PERIODO}
          codigo="15.09"
          horarios={HORARIOS_RAROS}
          nombreDeSede={nombreDeSede}
          alCerrar={alCerrar}
        />
      </ProveedorPlanUsuario>,
    );

    expect(
      screen.getByRole("dialog", {
        name: "15.09 Agile, Lean y Lean Six Sigma · elegir comisión",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Todavía no publicaron las comisiones de esta materia."),
    ).toBeInTheDocument();

    await usuario.click(
      screen.getByRole("button", { name: "Agregar sin comisión" }),
    );
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("una materia que el período no publica lo dice con su nombre", () => {
    render(
      <ProveedorPlanUsuario
        lecturaInicial={{ estado: "listo", plan: planVacio() }}
      >
        <ModalComisiones
          periodo={PERIODO}
          codigo="72.41"
          nombre="Base de Datos II"
          horarios={HORARIOS_RAROS}
          alCerrar={vi.fn()}
        />
      </ProveedorPlanUsuario>,
    );
    expect(
      screen.getByRole("dialog", {
        name: "72.41 Base de Datos II · elegir comisión",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Esta materia no aparece en los horarios de 2.º 2026.",
      ),
    ).toBeInTheDocument();
  });
});
