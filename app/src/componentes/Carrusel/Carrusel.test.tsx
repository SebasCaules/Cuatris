import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type RefObject } from "react";
import { describe, expect, it, vi } from "vitest";

import type { PeriodoId, Visibles } from "../../contrato/tipos";
import { ASOMO_PX, Carrusel, type ManijaCarrusel } from "./Carrusel";
import { PeriodoFueraDelCarrusel } from "./periodos";

/** Los cinco períodos del carrusel de 13b. */
const PERIODOS: PeriodoId[] = [
  "2026-1C",
  "2026-2C",
  "2027-1C",
  "2027-2C",
  "2028-1C",
];

function montar(
  opciones: {
    visibles?: Visibles;
    manija?: RefObject<ManijaCarrusel>;
    onMover?: (primero: PeriodoId) => void;
    periodos?: PeriodoId[];
  } = {},
) {
  const {
    visibles = 2,
    manija,
    onMover,
    periodos = PERIODOS,
  } = opciones;
  return render(
    <Carrusel
      ref={manija}
      periodos={periodos}
      visibles={visibles}
      {...(onMover === undefined ? {} : { onMover })}
      render={(periodo) => <p>tarjeta {periodo}</p>}
    />,
  );
}

function pista(): HTMLElement {
  const elemento = document.querySelector(".carrusel__pista");
  if (!(elemento instanceof HTMLElement)) {
    throw new Error("El carrusel no dibujó su pista.");
  }
  return elemento;
}

function indiceActual(): string {
  const carrusel = document.querySelector(".carrusel");
  if (!(carrusel instanceof HTMLElement)) {
    throw new Error("No hay carrusel en el documento.");
  }
  return carrusel.style.getPropertyValue("--carrusel-indice");
}

describe("Carrusel", () => {
  it("renderiza como hijos las tarjetas que le pasen", () => {
    montar();
    for (const periodo of PERIODOS) {
      expect(screen.getByText(`tarjeta ${periodo}`)).toBeInTheDocument();
    }
    // Igualar el alto entre tarjetas es cosa de la pista, no de cada tarjeta.
    expect(pista()).toHaveClass("carrusel__pista");
  });

  it("dice cuántas se ven de cuántas hay", () => {
    montar({ visibles: 2 });
    expect(screen.getByText("2 de 5 visibles")).toBeInTheDocument();
  });

  it("no promete más tarjetas visibles que períodos hay", () => {
    montar({ visibles: 3, periodos: ["2026-1C"] });
    expect(screen.getByText("1 de 1 visibles")).toBeInTheDocument();
  });

  it("las flechas se deshabilitan en los extremos", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });

    const anterior = screen.getByRole("button", {
      name: "Cuatrimestre anterior",
    });
    const siguiente = screen.getByRole("button", {
      name: "Cuatrimestre siguiente",
    });
    expect(anterior).toBeDisabled();
    expect(siguiente).toBeEnabled();

    // Con 5 períodos y 2 visibles, el último primer-visible es el índice 3.
    await usuario.click(siguiente);
    await usuario.click(siguiente);
    await usuario.click(siguiente);
    expect(indiceActual()).toBe("3");
    expect(siguiente).toBeDisabled();
    expect(anterior).toBeEnabled();
  });

  it("el chip del período visible queda seleccionado y el resto no", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });

    expect(
      screen.getByRole("button", { name: "1.º 2026" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "1.º 2027" }),
    ).toHaveAttribute("aria-pressed", "false");

    await usuario.click(screen.getByRole("button", { name: "1.º 2028" }));
    expect(
      screen.getByRole("button", { name: "1.º 2028" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(indiceActual()).toBe("3");
  });

  it("las flechas del teclado lo mueven cuando tiene el foco", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });

    const ventana = document.querySelector(".carrusel__ventana");
    if (!(ventana instanceof HTMLElement)) {
      throw new Error("El carrusel no dibujó su ventana.");
    }
    ventana.focus();

    await usuario.keyboard("{ArrowRight}{ArrowRight}");
    expect(indiceActual()).toBe("2");
    await usuario.keyboard("{ArrowLeft}");
    expect(indiceActual()).toBe("1");
    // En el extremo izquierdo no se pasa de largo.
    await usuario.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(indiceActual()).toBe("0");
  });

  it("irA() por ref mueve el carrusel hasta el período pedido", () => {
    const manija = createRef<ManijaCarrusel>();
    const onMover = vi.fn();
    montar({ visibles: 2, manija, onMover });

    expect(manija.current?.primerVisible()).toBe("2026-1C");

    // «Planificar en 2.º 2027» es lo que dispara esto desde otra pantalla.
    // `act` porque la llamada viene de afuera de React, no de un evento.
    act(() => {
      manija.current?.irA("2027-2C");
    });
    expect(indiceActual()).toBe("3");
    expect(onMover).toHaveBeenCalledWith("2027-2C");

    // Un período que ya se ve no mueve nada.
    onMover.mockClear();
    act(() => {
      manija.current?.irA("2028-1C");
    });
    expect(indiceActual()).toBe("3");
    expect(onMover).not.toHaveBeenCalled();

    // Uno que no está en la lista es un error de quien llama, no un no-op:
    // quedarse quieto en silencio esconde el problema hasta la captura de
    // pantalla.
    expect(() => {
      manija.current?.irA("2099-1C");
    }).toThrow(PeriodoFueraDelCarrusel);
    expect(() => {
      manija.current?.irA("2099-1C");
    }).toThrow("«2099-1C»");
    expect(indiceActual()).toBe("3");
    expect(onMover).not.toHaveBeenCalled();
  });

  it("la barra de posición es proporcional a lo que se ve", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });

    const carrusel = document.querySelector(".carrusel");
    if (!(carrusel instanceof HTMLElement)) {
      throw new Error("No hay carrusel en el documento.");
    }
    // 2 de 5 tarjetas: el tramo ocupa el 40 % y arranca en 0.
    expect(carrusel.style.getPropertyValue("--carrusel-barra-ancho")).toBe(
      "40%",
    );
    expect(carrusel.style.getPropertyValue("--carrusel-barra-desde")).toBe(
      "0%",
    );

    await usuario.click(
      screen.getByRole("button", { name: "Cuatrimestre siguiente" }),
    );
    expect(carrusel.style.getPropertyValue("--carrusel-barra-desde")).toBe(
      "20%",
    );
  });

  it("cambiar a una tarjeta visible reacomoda el índice", async () => {
    const usuario = userEvent.setup();
    const { rerender } = montar({ visibles: 3 });

    await usuario.click(
      screen.getByRole("button", { name: "Cuatrimestre siguiente" }),
    );
    await usuario.click(
      screen.getByRole("button", { name: "Cuatrimestre siguiente" }),
    );
    expect(indiceActual()).toBe("2");

    // Con 1 visible el índice 2 sigue siendo válido; con 3, el máximo es 2.
    rerender(
      <Carrusel
        periodos={PERIODOS}
        visibles={1}
        render={(periodo) => <p>tarjeta {periodo}</p>}
      />,
    );
    expect(indiceActual()).toBe("2");
    expect(screen.getByText("1 de 5 visibles")).toBeInTheDocument();
  });

  it("las acciones del encabezado se dibujan donde 13b las pone", () => {
    render(
      <Carrusel
        periodos={PERIODOS}
        visibles={2}
        acciones={<button type="button">Agregar materia</button>}
        render={(periodo) => <p>tarjeta {periodo}</p>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Agregar materia" }),
    ).toBeInTheDocument();
  });
});

/**
 * F4.2: todas las tarjetas siguen en el DOM, pero las de afuera de la ventana
 * van `inert`. Con sus controles alcanzables, un Tab hasta una tarjeta
 * recortada hacía que el navegador scrolleara la ventana recortada: los chips y
 * el contador seguían diciendo una cosa y la pantalla mostraba otra, sin forma
 * de volver salvo recargando.
 */
describe("Carrusel · tarjetas fuera de la ventana", () => {
  function tarjetas(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(".carrusel__tarjeta"),
    );
  }

  it("las de afuera de [indice, indice + visibles) van inert", () => {
    montar({ visibles: 2 });
    const inertes = tarjetas().map((tarjeta) => tarjeta.hasAttribute("inert"));
    expect(inertes).toEqual([false, false, true, true, true]);
  });

  it("mover el carrusel mueve también qué tarjetas son inert", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });
    await usuario.click(
      screen.getByRole("button", { name: "Cuatrimestre siguiente" }),
    );
    expect(indiceActual()).toBe("1");
    expect(tarjetas().map((t) => t.hasAttribute("inert"))).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
  });

  it("con todas a la vista ninguna queda inert", () => {
    montar({ visibles: 3, periodos: ["2026-1C", "2026-2C", "2027-1C"] });
    expect(tarjetas().every((t) => !t.hasAttribute("inert"))).toBe(true);
  });
});

/**
 * F4.5: 13b deja asomar la tarjeta siguiente («el tercero asomando, que es lo
 * que avisa que hay más»). El reparto exacto de la ventana entre las `visibles`
 * no dejaba ni un píxel de la siguiente.
 */
describe("Carrusel · asomo de la tarjeta siguiente", () => {
  function asomo(): string {
    const carrusel = document.querySelector(".carrusel");
    if (!(carrusel instanceof HTMLElement)) {
      throw new Error("No hay carrusel en el documento.");
    }
    return carrusel.style.getPropertyValue("--carrusel-asomo");
  }

  it("con más períodos que tarjetas visibles, la siguiente asoma", () => {
    montar({ visibles: 2 });
    expect(asomo()).toBe(`${String(ASOMO_PX)}px`);
  });

  it("con tantos períodos como tarjetas visibles no hay asomo", () => {
    montar({ visibles: 2, periodos: ["2026-1C", "2026-2C"] });
    expect(asomo()).toBe("0px");
  });

  it("con menos períodos que tarjetas visibles tampoco", () => {
    montar({ visibles: 3, periodos: ["2026-1C"] });
    expect(asomo()).toBe("0px");
  });
});
