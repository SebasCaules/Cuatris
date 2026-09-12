import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { indiceEjemplo, servidorEjemplo } from "./datos/ejemplo/servidor";
import { ProveedorPlanUsuario } from "./estado/contexto";

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
});

describe("App", () => {
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
    expect(screen.getByRole("button", { name: "Progreso" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("tiene las tres regiones de 13b y los controles inertes", async () => {
    montar();
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Ingeniería en Informática" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Progreso" }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Buscar materia, código o docente"),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Sugerir corrección" }),
    ).toBeDisabled();
  });

  it("lista los títulos, las electivas y los minors del plan cargado", async () => {
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
      await screen.findByRole("heading", { name: "72.45 Proyecto Final" }),
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
