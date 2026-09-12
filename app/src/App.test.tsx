import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    // Sin progreso que medir, el primer ingreso no dibuja el panel derecho.
    expect(
      screen.queryByRole("complementary", { name: "Progreso" }),
    ).not.toBeInTheDocument();
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
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sugerir corrección" }),
    ).toHaveAttribute("aria-disabled", "true");
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

  /**
   * F4.8: 13i es de ancho completo. Con el panel derecho montado, la misma
   * información —tres títulos, electivas y cuatro minors— se leía dos veces.
   */
  it("#/progreso no repite el progreso en el panel derecho (13i)", async () => {
    sembrarPlanConHistoria();
    window.location.hash = "#/progreso";
    montar();
    expect(
      await screen.findByRole("region", { name: "Títulos y electivas" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Progreso" }),
    ).not.toBeInTheDocument();
    // Un solo «Ingeniero/a en Informática» en toda la pantalla.
    expect(screen.getAllByText("Ingeniero/a en Informática")).toHaveLength(1);
  });

  /**
   * F4.11: el botón sigue apagado porque 13j no existe, pero ya no es mudo.
   */
  it("«Sugerir corrección» dice cuándo llega", async () => {
    sembrarPlanConHistoria();
    montar();
    const boton = await screen.findByRole("button", {
      name: "Sugerir corrección",
    });
    // `aria-disabled` y no `disabled`: el mismo trato que en la ficha (F4.12),
    // así el botón recibe foco y con Tab se llega a él.
    expect(boton).toHaveAttribute("aria-disabled", "true");
    boton.focus();
    expect(boton).toHaveFocus();
    expect(boton).toHaveAttribute("title", "Llega en el Sprint 3");
    const id = boton.getAttribute("aria-describedby");
    expect(id).not.toBeNull();
    const nota = document.getElementById(id ?? "");
    expect(nota).toHaveTextContent("Llega en el Sprint 3");
    // La nota está a la vista, no recortada a 1x1 fuera de la pantalla.
    expect(nota).toBeVisible();
    expect(nota).not.toHaveStyle({ clipPath: "inset(50%)" });
  });

  /**
   * F4.13: `useMenuPlan` monta un `<input type="file">` recortado pero
   * alcanzable; en el primer ingreso se montaba dos veces (App y PaginaInicio) y
   * el foco desaparecía dos veces en puntos sin nada visible.
   */
  it("en el primer ingreso hay un solo selector de archivo, fuera del Tab", async () => {
    montar();
    expect(
      await screen.findByText("Todavía no hay nada en tu plan"),
    ).toBeInTheDocument();
    const selectores = screen.getAllByLabelText("Archivo de plan exportado");
    expect(selectores).toHaveLength(1);
    expect(selectores[0]).toHaveAttribute("tabindex", "-1");
    // Los dos botones que lo abren siguen en la cadena de tabulación.
    expect(
      screen.getByRole("button", { name: "Importar un plan guardado" }),
    ).toBeEnabled();
  });

  /**
   * F4.7: el campo de la barra y la consulta del panel son la misma búsqueda
   * (13c). Antes el callback descartaba el texto y había que volver a tipearlo.
   */
  it("lo que se escribe en la barra superior llega al panel de agregar", async () => {
    const usuario = userEvent.setup();
    sembrarPlanConHistoria();
    montar();
    const buscador = await screen.findByLabelText(
      "Buscar materia, código o docente",
    );

    await usuario.type(buscador, "cripto");

    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveAccessibleName(/Agregar a/);
    expect(within(panel).getByLabelText("Buscar materia")).toHaveValue(
      "cripto",
    );
    // El foco se queda arriba: la consulta no se parte en dos campos.
    expect(document.activeElement).toBe(buscador);
  });

  /**
   * F4.6: el panel de 13c es una columna propia de 330 px, no el hueco de
   * 250 px del progreso.
   */
  it("el panel de agregar es su propia columna, no el hueco del progreso", async () => {
    const usuario = userEvent.setup();
    sembrarPlanConHistoria();
    montar();
    const buscador = await screen.findByLabelText(
      "Buscar materia, código o docente",
    );
    await usuario.type(buscador, "cripto");

    const panel = await screen.findByRole("dialog");
    expect(panel).toHaveStyle({ "--panel-ancho": "330px" });
    expect(panel.closest(".disposicion__panel")).toBeNull();
    expect(panel.parentElement).toHaveClass("disposicion__cuerpo");
  });

  /**
   * Regresión de F4.9: al mover el Escape del panel de la caja al documento
   * (para que siguiera cerrando con el foco afuera), el menú ⋯ —que tenía su
   * propio `keydown` en el documento— y el panel oían el mismo Escape y se
   * cerraban los dos de un saque, perdiendo la consulta ya tipeada. Ahora las
   * capas se apilan y cada Escape cierra una sola: la de más arriba.
   */
  it("con el panel abierto, el Escape del menú ⋯ no se lleva el panel", async () => {
    const usuario = userEvent.setup();
    sembrarPlanConHistoria();
    montar();
    const buscador = await screen.findByLabelText(
      "Buscar materia, código o docente",
    );
    await usuario.type(buscador, "cripto");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Más acciones" }));
    expect(
      screen.getByRole("menuitem", { name: "Exportar plan" }),
    ).toBeInTheDocument();

    // Primer Escape: cierra el menú y el panel se queda con lo tipeado.
    await usuario.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const panel = screen.getByRole("dialog");
    expect(within(panel).getByLabelText("Buscar materia")).toHaveValue(
      "cripto",
    );

    // Segundo Escape: recién ahora cierra el panel.
    await usuario.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

/**
 * F4.1: CONTRATO-v1 §6 —«nunca se descarta un plan guardado sin exportarlo
 * antes»—. Con lo guardado ilegible, la aplicación arrancaba con un plan vacío
 * y sin ningún cartel, y nada de lo que el usuario hiciera se persistía.
 */
describe("App · plan guardado ilegible", () => {
  const CORRUPTO = '{"version": 99}';

  it("avisa, ofrece descargarlo y recién después deja empezar de cero", async () => {
    const usuario = userEvent.setup();
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, CORRUPTO);
    const descargas: string[] = [];
    // jsdom no implementa estas dos; se agregan y se sacan en el `finally`.
    const objeto = URL as unknown as {
      createObjectURL?: (dato: Blob) => string;
      revokeObjectURL?: (url: string) => void;
    };
    objeto.createObjectURL = () => "blob:falso";
    objeto.revokeObjectURL = () => undefined;
    const clicOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function registrar(
      this: HTMLAnchorElement,
    ) {
      descargas.push(this.download);
    };

    try {
      montar();

      expect(
        screen.getByText("No pude leer el plan guardado en este navegador"),
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("version");

      const empezar = screen.getByRole("button", { name: "Empezar de cero" });
      expect(empezar).toBeDisabled();

      await usuario.click(
        screen.getByRole("button", { name: "Descargar el plan guardado" }),
      );
      expect(descargas).toHaveLength(1);
      expect(descargas[0]).toMatch(
        /^cuatris-plan-ilegible-\d{4}-\d{2}-\d{2}\.json$/,
      );
      // Lo guardado sigue intacto: descargar no borra nada.
      expect(window.localStorage.getItem(CLAVE_ALMACENAMIENTO)).toBe(CORRUPTO);

      expect(empezar).toBeEnabled();
      await usuario.click(empezar);

      expect(
        await screen.findByText("Todavía no hay nada en tu plan"),
      ).toBeInTheDocument();
    } finally {
      HTMLAnchorElement.prototype.click = clicOriginal;
      delete objeto.createObjectURL;
      delete objeto.revokeObjectURL;
    }
  });
});
