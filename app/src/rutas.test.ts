import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { navegar, parsearRuta, rutaAHash, useRuta } from "./rutas";

describe("parsearRuta", () => {
  it("reconoce todas las vistas", () => {
    expect(parsearRuta("#/plan")).toEqual({ vista: "plan" });
    expect(parsearRuta("#/cursada")).toEqual({ vista: "cursada" });
    expect(parsearRuta("#/progreso")).toEqual({ vista: "progreso" });
    expect(parsearRuta("#/muestrario")).toEqual({ vista: "muestrario" });
    expect(parsearRuta("#/inicio")).toEqual({ vista: "inicio" });
    expect(parsearRuta("#/materia/72.41")).toEqual({
      vista: "materia",
      codigo: "72.41",
    });
  });

  it("tolera el hash vacío, sin barra y con barras de más", () => {
    expect(parsearRuta("")).toEqual({ vista: "plan" });
    expect(parsearRuta("#")).toEqual({ vista: "plan" });
    expect(parsearRuta("#progreso")).toEqual({ vista: "progreso" });
    expect(parsearRuta("#//progreso")).toEqual({ vista: "progreso" });
  });

  it("cae en el plan ante algo desconocido", () => {
    expect(parsearRuta("#/inventada")).toEqual({ vista: "plan" });
    expect(parsearRuta("#/plan/de más")).toEqual({ vista: "plan" });
    expect(parsearRuta("#/cursada/de más")).toEqual({ vista: "plan" });
    expect(parsearRuta("#/materia")).toEqual({ vista: "plan" });
  });

  it("rechaza un código que no tiene forma de código", () => {
    expect(parsearRuta("#/materia/7241")).toEqual({ vista: "plan" });
    expect(parsearRuta("#/materia/abc.de")).toEqual({ vista: "plan" });
    expect(parsearRuta("#/materia/72.41/extra")).toEqual({ vista: "plan" });
  });
});

describe("rutaAHash", () => {
  it("es la vuelta de parsearRuta", () => {
    const rutas = [
      { vista: "plan" },
      { vista: "cursada" },
      { vista: "progreso" },
      { vista: "materia", codigo: "93.18" },
    ] as const;
    for (const ruta of rutas) {
      expect(parsearRuta(rutaAHash(ruta))).toEqual(ruta);
    }
  });
});

describe("useRuta", () => {
  it("sigue los cambios de location.hash", () => {
    window.location.hash = "#/plan";
    const { result } = renderHook(() => useRuta());
    expect(result.current.ruta).toEqual({ vista: "plan" });

    act(() => {
      navegar({ vista: "materia", codigo: "72.41" });
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.ruta).toEqual({
      vista: "materia",
      codigo: "72.41",
    });

    act(() => {
      result.current.ir({ vista: "progreso" });
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.ruta).toEqual({ vista: "progreso" });
    expect(window.location.hash).toBe("#/progreso");
  });
});
