import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Disposicion } from "./Disposicion";

afterEach(() => {
  window.location.hash = "";
});

describe("Disposicion", () => {
  // Rediseño: la columna derecha de progreso se fue; quedan barra y principal.
  it("tiene las dos regiones de 13b que quedan", () => {
    render(
      <Disposicion
        barra={<header>barra</header>}
        principal={<p>carrusel</p>}
      />,
    );
    expect(screen.getByRole("banner")).toHaveTextContent("barra");
    expect(screen.getByRole("main")).toHaveTextContent("carrusel");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("sin banner de conflictos no deja hueco", () => {
    const { container } = render(
      <Disposicion
        barra={<header>barra</header>}
        principal={<p>carrusel</p>}
      />,
    );
    expect(container.querySelector(".disposicion__banner")).toBeNull();
  });

  it("el banner va dentro de la zona principal, arriba del carrusel", () => {
    render(
      <Disposicion
        barra={<header>barra</header>}
        banner={<p>3 conflictos sin resolver en 1.º 2026</p>}
        principal={<p>carrusel</p>}
      />,
    );
    const principal = screen.getByRole("main");
    const banner = screen.getByText("3 conflictos sin resolver en 1.º 2026");
    expect(principal).toContainElement(banner);
    expect(principal.textContent).toBe(
      "3 conflictos sin resolver en 1.º 2026carrusel",
    );
  });

  /**
   * F4.6: el panel de 13c trae su propio ancho de 330 px, así que va como
   * columna del cuerpo.
   */
  it("el panel de agregar es una columna propia del cuerpo", () => {
    render(
      <Disposicion
        barra={<header>barra</header>}
        principal={<p>carrusel</p>}
        agregar={<div data-testid="agregar">agregar materia</div>}
      />,
    );
    const agregar = screen.getByTestId("agregar");
    expect(agregar.parentElement).toHaveClass("disposicion__cuerpo");
  });
});

/**
 * F4.4: sin un techo de alto, `.panel-lateral__cuerpo` nunca activa su scroll
 * interno y es la página la que se estira (medido: 6638 px con «Agregar
 * materia» abierto), dejando fuera de pantalla la barra superior, el carrusel y
 * la cabecera del propio panel. jsdom no calcula layout, así que lo que se fija
 * acá son las declaraciones que lo acotan.
 */
describe("Disposicion · alto acotado (F4.4)", () => {
  const CSS = readFileSync(
    resolve(process.cwd(), "src/componentes/Disposicion/Disposicion.css"),
    "utf8",
  );

  /** Las declaraciones de una regla, sin comentarios ni saltos. */
  function reglaDe(selector: string): string {
    const desde = CSS.indexOf(`${selector} {`);
    expect(desde).toBeGreaterThanOrEqual(0);
    const hasta = CSS.indexOf("}", desde);
    return CSS.slice(desde, hasta).replace(/\s+/g, " ");
  }

  it("el contenedor mide la ventana y el cuerpo no la desborda", () => {
    expect(reglaDe(".disposicion")).toContain("height: 100vh");
    expect(reglaDe(".disposicion")).not.toContain("min-height: 100%");
    expect(reglaDe(".disposicion__cuerpo")).toContain("overflow: hidden");
    expect(reglaDe(".disposicion__cuerpo")).toContain("min-height: 0");
  });

  it("la zona principal scrollea por dentro y nunca en horizontal", () => {
    expect(reglaDe(".disposicion__principal")).toContain("overflow-y: auto");
    expect(reglaDe(".disposicion__principal")).toContain("overflow-x: hidden");
  });
});
