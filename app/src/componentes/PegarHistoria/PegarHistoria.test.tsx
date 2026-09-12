/**
 * Pegar historia académica, con el plan real y el texto de ejemplo del mockup.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProveedorPlanUsuario, usePlanUsuario } from "../../estado/contexto";
import { PLAN } from "../../motor/fixtures/reales";
import { EJEMPLO, MARCADOR, PegarHistoria } from "./PegarHistoria";

/**
 * El ejemplo del mockup con los códigos que S10-Rev23 sí tiene.
 *
 * El del diseño usa `93.18 Álgebra Lineal`, que no está en este plan: se prueba
 * aparte, porque el caso interesante es justamente que no se reconozca.
 */
const TRES_DEL_PLAN = [
  "93.58  Álgebra  9  Aprobada",
  "72.37  Base de Datos I  6  Aprobada",
  "72.31  Programación Imperativa  9  Aprobada",
].join("\n");

/** Deja ver la historia que quedó en el estado, para poder afirmar sobre ella. */
function Sonda() {
  const { plan } = usePlanUsuario();
  return (
    <p data-sonda>
      {Object.entries(plan.historia)
        .map(([codigo, entrada]) => `${codigo}:${entrada.estado}`)
        .sort()
        .join(" ")}
    </p>
  );
}

function montar() {
  return render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "vacio" }}>
      <PegarHistoria plan={PLAN} />
      <Sonda />
    </ProveedorPlanUsuario>,
  );
}

function sonda(): HTMLElement {
  const encontrada = document.querySelector("[data-sonda]");
  if (!(encontrada instanceof HTMLElement)) {
    throw new Error("La sonda no está montada.");
  }
  return encontrada;
}

function area(): HTMLTextAreaElement {
  return screen.getByLabelText(MARCADOR);
}

describe("PegarHistoria", () => {
  it("el marcador de posición son las tres líneas del mockup", () => {
    montar();
    expect(area()).toHaveAttribute("placeholder", EJEMPLO);
  });

  it("sin texto avisa que no encontró códigos", () => {
    montar();
    expect(
      screen.getByText("No encontré códigos de materia (por ejemplo 93.18)"),
    ).toBeInTheDocument();
  });

  it("un texto sin ningún código avisa lo mismo", async () => {
    montar();
    await userEvent.type(area(), "Historia académica del alumno");
    expect(
      screen.getByText("No encontré códigos de materia (por ejemplo 93.18)"),
    ).toBeInTheDocument();
  });

  it("tres líneas del plan se leen como tres aprobadas", async () => {
    montar();
    await userEvent.click(area());
    await userEvent.paste(TRES_DEL_PLAN);
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 aprobadas · 0 en curso · 0 líneas sin reconocer",
    );
  });

  it("el ejemplo literal del mockup deja 93.18 sin reconocer", async () => {
    // `93.18 Álgebra Lineal` no pertenece a S10-Rev23 (motor/historia.ts).
    montar();
    await userEvent.click(area());
    await userEvent.paste(EJEMPLO);
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 aprobadas · 0 en curso · 1 línea sin reconocer",
    );
    // `getByText` normaliza los espacios: el mockup separa con dos.
    expect(
      screen.getByText("93.18 Álgebra Lineal 9 Aprobada"),
    ).toBeInTheDocument();
  });

  it("una línea sin código aparece entre las no reconocidas", async () => {
    montar();
    await userEvent.click(area());
    await userEvent.paste(
      ["93.58  Álgebra  9  Aprobada", "Total de créditos: 9"].join("\n"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 aprobada · 0 en curso · 1 línea sin reconocer",
    );
    expect(screen.getByText("Total de créditos: 9")).toBeInTheDocument();
  });

  it("cuenta como en curso lo regular y lo que se está cursando", async () => {
    montar();
    await userEvent.click(area());
    await userEvent.paste(
      [
        "93.58  Álgebra  9  Aprobada",
        "72.31  Programación Imperativa  9  Cursando",
        "72.33  Programación Orientada a Objetos  6  Regular",
      ].join("\n"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 aprobada · 2 en curso · 0 líneas sin reconocer",
    );
  });

  it("«Usar esta historia» carga lo reconocido y va al plan", async () => {
    montar();
    await userEvent.click(area());
    await userEvent.paste(TRES_DEL_PLAN);
    await userEvent.click(
      screen.getByRole("button", { name: "Usar esta historia" }),
    );
    expect(sonda()).toHaveTextContent(
      "72.31:aprobada 72.37:aprobada 93.58:aprobada",
    );
    expect(window.location.hash).toBe("#/plan");
  });

  it("sin nada reconocido no se puede usar la historia", async () => {
    montar();
    await userEvent.click(area());
    await userEvent.paste("93.18  Álgebra Lineal  9  Aprobada");
    expect(
      screen.getByRole("button", { name: "Usar esta historia" }),
    ).toBeDisabled();
  });
});
