import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CLAVE_ALMACENAMIENTO,
  leer,
} from "./almacenamiento";
import { ProveedorPlanUsuario, usePlanUsuario } from "./contexto";

function Sonda() {
  const { plan, despachar, errorGuardado, crudoGuardado, descartarGuardado } =
    usePlanUsuario();
  const materias = plan.periodos["2026-2C"] ?? [];
  return (
    <div>
      <p data-testid="materias">{materias.map((m) => m.codigo).join(",")}</p>
      <p data-testid="error">{errorGuardado?.donde ?? "sin error"}</p>
      <p data-testid="crudo">{crudoGuardado ?? "sin crudo"}</p>
      <button
        type="button"
        onClick={() => {
          despachar({
            tipo: "agregarMateria",
            periodo: "2026-2C",
            codigo: "93.18",
          });
        }}
      >
        agregar
      </button>
      <button type="button" onClick={descartarGuardado}>
        descartar
      </button>
    </div>
  );
}

describe("ProveedorPlanUsuario", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persiste los cambios en localStorage después del debounce", async () => {
    render(
      <ProveedorPlanUsuario retardoGuardadoMs={0}>
        <Sonda />
      </ProveedorPlanUsuario>,
    );

    await act(async () => {
      screen.getByText("agregar").click();
    });
    await act(async () => {
      await new Promise((listo) => setTimeout(listo, 5));
    });

    expect(screen.getByTestId("materias")).toHaveTextContent("93.18");
    const lectura = leer();
    expect(lectura.estado).toBe("listo");
    if (lectura.estado === "listo") {
      expect(lectura.plan.periodos["2026-2C"]).toEqual([{ codigo: "93.18" }]);
    }
  });

  it("expone el error cuando lo guardado está corrupto y arranca vacío", async () => {
    const original = '{"version": 99}';
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, original);
    render(
      <ProveedorPlanUsuario retardoGuardadoMs={0}>
        <Sonda />
      </ProveedorPlanUsuario>,
    );
    expect(screen.getByTestId("error")).toHaveTextContent("version");
    expect(screen.getByTestId("materias")).toHaveTextContent("");

    // Aunque se siga editando, el original no se pisa.
    await act(async () => {
      screen.getByText("agregar").click();
    });
    await act(async () => {
      await new Promise((listo) => setTimeout(listo, 5));
    });
    expect(window.localStorage.getItem(CLAVE_ALMACENAMIENTO)).toBe(original);
  });

  /**
   * F4.1: el plan corrupto se queda en disco hasta que el usuario acepta
   * perderlo. Sin esta salida, la sesión entera trabajaba sobre un documento
   * que no se persistía nunca y se perdía al cerrar la pestaña.
   */
  it("al descartar lo corrupto vuelve a guardar y el error se apaga", async () => {
    const original = '{"version": 99}';
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, original);
    render(
      <ProveedorPlanUsuario retardoGuardadoMs={0}>
        <Sonda />
      </ProveedorPlanUsuario>,
    );
    // El crudo se publica entero para poder exportarlo antes de perderlo.
    expect(screen.getByTestId("crudo")).toHaveTextContent("version");

    await act(async () => {
      screen.getByText("descartar").click();
    });
    await act(async () => {
      await new Promise((listo) => setTimeout(listo, 5));
    });

    expect(screen.getByTestId("error")).toHaveTextContent("sin error");
    expect(screen.getByTestId("crudo")).toHaveTextContent("sin crudo");

    await act(async () => {
      screen.getByText("agregar").click();
    });
    await act(async () => {
      await new Promise((listo) => setTimeout(listo, 5));
    });

    const lectura = leer();
    expect(lectura.estado).toBe("listo");
    if (lectura.estado === "listo") {
      expect(lectura.plan.periodos["2026-2C"]).toEqual([{ codigo: "93.18" }]);
    }
  });

  it("usar el hook fuera del proveedor es un error ruidoso", () => {
    // React escribe el error en la consola además de propagarlo; se silencia
    // para que la salida de los tests no parezca una falla.
    const callado = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Sonda />)).toThrow(/ProveedorPlanUsuario/);
    } finally {
      callado.mockRestore();
    }
  });
});
