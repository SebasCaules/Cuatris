import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { indiceEjemplo, servidorEjemplo } from "./datos/ejemplo/servidor";
import { CLAVE_ALMACENAMIENTO } from "./estado/almacenamiento";
import { ProveedorPlanUsuario } from "./estado/contexto";
import { exportar, planUsuarioInicial } from "./estado/planUsuario";

/** Deja en localStorage un plan con 72.45 aprobada: ya no es el primer ingreso. */
function sembrarPlanConHistoria() {
  const plan = planUsuarioInicial();
  plan.historia["72.45"] = { estado: "aprobada" };
  window.localStorage.setItem(CLAVE_ALMACENAMIENTO, exportar(plan));
}

function montar(opciones?: Parameters<typeof servidorEjemplo>[0]) {
  vi.stubGlobal("fetch", servidorEjemplo(opciones).fetch);
  return render(
    <ProveedorPlanUsuario retardoGuardadoMs={0}>
      <App />
    </ProveedorPlanUsuario>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.location.hash = "";
});

describe("App", () => {
  it("en #/muestrario dibuja el muestrario sin esperar los datos", () => {
    window.location.hash = "#/muestrario";
    try {
      montar();
      expect(
        screen.getByRole("heading", { name: /Muestrario de primitivas/ }),
      ).toBeInTheDocument();
    } finally {
      window.location.hash = "";
    }
  });

  it("muestra la pantalla de carga y después el cascarón", async () => {
    montar();
    expect(screen.getByText(/Cargando los datos/)).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Ingeniería en Informática" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("plan S10-Rev23 · ITBA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Progreso" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("sin historia ni plan muestra el primer ingreso (13a) en vez del carrusel", async () => {
    montar();
    expect(
      await screen.findByText("Todavía no hay nada en tu plan"),
    ).toBeInTheDocument();
    // El panel derecho existe como región, pero sin progreso: el primer
    // ingreso no tiene nada que medir todavía.
    expect(
      screen.getByRole("complementary", { name: "Progreso" }),
    ).toBeEmptyDOMElement();
  });

  it("con historia tiene las tres regiones de 13b; «Sugerir corrección» sigue inerte", async () => {
    sembrarPlanConHistoria();
    montar();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Ingeniería en Informática" }),
      ).toBeInTheDocument();
    });

    expect(screen.getAllByRole("banner").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      await screen.findByRole("complementary", { name: "Progreso" }),
    ).not.toBeEmptyDOMElement();
    expect(
      screen.getByRole("button", { name: "Sugerir corrección" }),
    ).toBeDisabled();
  });

  it("lista los títulos, las electivas y los minors del plan cargado", async () => {
    sembrarPlanConHistoria();
    montar();
    const panel = await screen.findByRole("complementary", {
      name: "Progreso",
    });
    for (const nombre of [
      "Analista en Tecnología Informática",
      "Bachiller en Ingeniería",
      "Ingeniero/a en Informática",
      "Ciencia de Datos",
      "Inteligencia Artificial",
      "Imágenes y Realidad Virtual",
      "Arquitectura de Software",
    ]) {
      expect(panel).toHaveTextContent(nombre);
    }
    expect(panel).toHaveTextContent("Electivas");
  });

  it("muestra la pantalla de datos más nuevos ante ContratoIncompatible", async () => {
    montar({
      reemplazos: { "index.json": { ...indiceEjemplo, contrato: "2.0.0" } },
    });
    expect(
      await screen.findByText("Los datos son más nuevos que la aplicación"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("contrato 2.0.0");
  });

  it("muestra la pantalla de error con la red caída", async () => {
    montar({ caidos: ["index.json"] });
    expect(
      await screen.findByText("No se pudieron cargar los datos"),
    ).toBeInTheDocument();
  });

  it("abre la ficha cuando la ruta es #/materia/<codigo>", async () => {
    window.location.hash = "#/materia/72.45";
    montar();
    expect(
      await screen.findByRole("heading", { name: /72\.45 · Proyecto Final/ }),
    ).toBeInTheDocument();
  });

  it("la pestaña Progreso queda marcada con #/progreso", async () => {
    window.location.hash = "#/progreso";
    montar();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Progreso" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });
});
