/**
 * Copia de seguridad del plan: exportar, importar y borrar todo.
 *
 * `URL.createObjectURL` no existe en jsdom: se define acá para quedarse con el
 * `Blob` y poder leer exactamente qué bytes se habrían descargado.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanUsuario } from "../../contrato/tipos";
import { CLAVE_ALMACENAMIENTO } from "../../estado/almacenamiento";
import { ProveedorPlanUsuario, usePlanUsuario } from "../../estado/contexto";
import { exportar, importar } from "../../estado/planUsuario";
import { MenuPlan } from "./MenuPlan";
import { nombreDeArchivo } from "./acciones";

const PLAN_CON_ALGO: PlanUsuario = {
  version: 1,
  plan: "S10-Rev23",
  historia: { "93.58": { estado: "aprobada" } },
  periodos: { "2026-1C": [{ codigo: "72.31" }] },
  colores: { "72.31": 0 },
  sugerencias: [],
  preferencias: { visibles: 2 },
};

const PLAN_VACIO: PlanUsuario = {
  version: 1,
  plan: "S10-Rev23",
  historia: {},
  periodos: {},
  colores: {},
  sugerencias: [],
  preferencias: { visibles: 2 },
};

/** Los `Blob` que pasaron por `createObjectURL`, en orden. */
let blobs: Blob[] = [];
/** El `download` del último enlace que se apretó. */
let nombreDescargado = "";

function definir(objeto: object, propiedad: string, valor: unknown): void {
  Object.defineProperty(objeto, propiedad, {
    value: valor,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  blobs = [];
  nombreDescargado = "";
  definir(
    URL,
    "createObjectURL",
    vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:cuatris/prueba";
    }),
  );
  definir(URL, "revokeObjectURL", vi.fn());
  // El clic sobre un `<a download>` no descarga nada en jsdom: alcanza con
  // anotar el nombre que llevaba el enlace.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      nombreDescargado = this.download;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Sonda() {
  const { plan } = usePlanUsuario();
  return <p data-sonda>{exportar(plan)}</p>;
}

function montar(inicial: PlanUsuario) {
  return render(
    <ProveedorPlanUsuario
      lecturaInicial={{ estado: "listo", plan: inicial }}
      retardoGuardadoMs={0}
    >
      <MenuPlan fecha="2026-09-12">
        {(acciones) => (
          <>
            <button type="button" onClick={acciones.exportar}>
              Exportar plan
            </button>
            <button type="button" onClick={acciones.importar}>
              Importar plan
            </button>
            <button type="button" onClick={acciones.borrarTodo}>
              Borrar todo
            </button>
          </>
        )}
      </MenuPlan>
      <Sonda />
    </ProveedorPlanUsuario>,
  );
}

function sonda(): string {
  const encontrada = document.querySelector("[data-sonda]");
  if (!(encontrada instanceof HTMLElement)) {
    throw new Error("La sonda no está montada.");
  }
  return encontrada.textContent ?? "";
}

/** jsdom no implementa `Blob.text()`: se lee con `FileReader`, como el módulo. */
function texto(blob: Blob): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      resolver(typeof lector.result === "string" ? lector.result : "");
    };
    lector.onerror = () => {
      rechazar(new Error("No se pudo leer el Blob."));
    };
    lector.readAsText(blob);
  });
}

function archivo(contenido: string, nombre = "cuatris-plan.json"): File {
  return new File([contenido], nombre, { type: "application/json" });
}

function selector(): HTMLInputElement {
  return screen.getByLabelText("Archivo de plan exportado");
}

describe("nombreDeArchivo", () => {
  it("lleva la fecha en YYYY-MM-DD", () => {
    expect(nombreDeArchivo("2026-09-12")).toBe("cuatris-plan-2026-09-12.json");
  });
});

describe("MenuPlan · exportar", () => {
  it("descarga cuatris-plan-<fecha>.json", async () => {
    montar(PLAN_CON_ALGO);
    await userEvent.click(screen.getByRole("button", { name: "Exportar plan" }));
    expect(nombreDescargado).toBe("cuatris-plan-2026-09-12.json");
  });

  it("lo exportado es JSON válido que importar acepta", async () => {
    montar(PLAN_CON_ALGO);
    await userEvent.click(screen.getByRole("button", { name: "Exportar plan" }));
    const primero = blobs[0];
    if (primero === undefined) {
      throw new Error("No se creó ningún Blob para descargar.");
    }
    expect(importar(await texto(primero))).toEqual(PLAN_CON_ALGO);
  });
});

describe("MenuPlan · importar", () => {
  it("un plan válido reemplaza el actual y va al plan", async () => {
    montar(PLAN_VACIO);
    await userEvent.upload(selector(), archivo(exportar(PLAN_CON_ALGO)));
    await waitFor(() => {
      expect(sonda()).toContain("93.58");
    });
    expect(window.location.hash).toBe("#/plan");
  });

  it("un JSON con version 99 muestra el error y no cambia el estado", async () => {
    montar(PLAN_CON_ALGO);
    const antes = sonda();
    await userEvent.upload(
      selector(),
      archivo(JSON.stringify({ ...PLAN_CON_ALGO, version: 99 })),
    );
    expect(
      await screen.findByText(/no hay migración desde 99 hacia 1/),
    ).toBeInTheDocument();
    expect(sonda()).toBe(antes);
    expect(window.location.hash).toBe("");
  });

  it("un JSON roto muestra el error y no cambia el estado", async () => {
    montar(PLAN_CON_ALGO);
    const antes = sonda();
    await userEvent.upload(selector(), archivo("{ esto no es json"));
    expect(
      await screen.findByText(/El plan guardado no se puede leer \(raiz\)/),
    ).toBeInTheDocument();
    expect(sonda()).toBe(antes);
  });
});

describe("MenuPlan · borrar todo", () => {
  it("pide confirmación con el texto del plan de sprints", async () => {
    montar(PLAN_CON_ALGO);
    await userEvent.click(screen.getByRole("button", { name: "Borrar todo" }));
    expect(
      screen.getByText(
        "Se borra el plan de este navegador. Exportalo antes si querés conservarlo.",
      ),
    ).toBeInTheDocument();
  });

  it("cancelar deja el plan intacto", async () => {
    montar(PLAN_CON_ALGO);
    const antes = sonda();
    await userEvent.click(screen.getByRole("button", { name: "Borrar todo" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(sonda()).toBe(antes);
  });

  it("confirmar vacía el estado y lo guardado", async () => {
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, exportar(PLAN_CON_ALGO));
    montar(PLAN_CON_ALGO);
    await userEvent.click(screen.getByRole("button", { name: "Borrar todo" }));
    const dialogo = screen.getByRole("dialog");
    await userEvent.click(
      within(dialogo).getByRole("button", { name: "Borrar todo" }),
    );
    await waitFor(() => {
      expect(sonda()).not.toContain("93.58");
    });
    expect(sonda()).not.toContain("72.31");
    await waitFor(() => {
      expect(
        window.localStorage.getItem(CLAVE_ALMACENAMIENTO) ?? "",
      ).not.toContain("93.58");
    });
  });
});
