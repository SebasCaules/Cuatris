import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Disposicion } from "./Disposicion";

afterEach(() => {
  window.location.hash = "";
});

describe("Disposicion", () => {
  it("tiene las tres regiones de 13b", () => {
    render(
      <Disposicion
        barra={<header>barra</header>}
        principal={<p>carrusel</p>}
        panel={<p>progreso</p>}
      />,
    );
    expect(screen.getByRole("banner")).toHaveTextContent("barra");
    expect(screen.getByRole("main")).toHaveTextContent("carrusel");
    expect(
      screen.getByRole("complementary", { name: "Progreso" }),
    ).toHaveTextContent("progreso");
  });

  it("sin banner de conflictos no deja hueco", () => {
    const { container } = render(
      <Disposicion
        barra={<header>barra</header>}
        principal={<p>carrusel</p>}
        panel={<p>progreso</p>}
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
        panel={<p>progreso</p>}
      />,
    );
    const principal = screen.getByRole("main");
    const banner = screen.getByText("3 conflictos sin resolver en 1.º 2026");
    expect(principal).toContainElement(banner);
    expect(principal.textContent).toBe(
      "3 conflictos sin resolver en 1.º 2026carrusel",
    );
  });
});
