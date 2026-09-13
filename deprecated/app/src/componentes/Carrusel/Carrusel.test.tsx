import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type RefObject } from "react";
import { describe, expect, it, vi } from "vitest";

import type { PeriodoId, Visibles } from "../../contrato/tipos";
import { Carrusel, type ManijaCarrusel } from "./Carrusel";
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
      acciones={<span>acciones</span>}
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

function ventana(): HTMLElement {
  const elemento = document.querySelector(".carrusel__ventana");
  if (!(elemento instanceof HTMLElement)) {
    throw new Error("El carrusel no dibujó su ventana.");
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

const anterior = () =>
  screen.queryByRole("button", { name: "Cuatrimestre anterior" });
const siguiente = () =>
  screen.queryByRole("button", { name: "Cuatrimestre siguiente" });

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

  /**
   * Rediseño: las flechas no se deshabilitan, **desaparecen** cuando no hay
   * más tarjetas en ese sentido; su sola presencia es el aviso de que el
   * carrusel sigue.
   */
  it("las flechas se ocultan en los extremos", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });

    expect(anterior()).toBeNull();
    expect(siguiente()).not.toBeNull();

    // Con 5 períodos y 2 visibles, el último primer-visible es el índice 3.
    for (let paso = 0; paso < 3; paso += 1) {
      const flecha = siguiente();
      if (flecha === null) {
        throw new Error("La flecha siguiente desapareció antes del final.");
      }
      await usuario.click(flecha);
    }
    expect(indiceActual()).toBe("3");
    expect(siguiente()).toBeNull();
    expect(anterior()).not.toBeNull();
  });

  it("con todas a la vista no hay ninguna flecha", () => {
    montar({ visibles: 3, periodos: ["2026-1C", "2026-2C", "2027-1C"] });
    expect(anterior()).toBeNull();
    expect(siguiente()).toBeNull();
  });

  it("las flechas del teclado lo mueven cuando tiene el foco", async () => {
    const usuario = userEvent.setup();
    montar({ visibles: 2 });

    ventana().focus();

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

  it("cambiar a una tarjeta visible reacomoda el índice", async () => {
    const usuario = userEvent.setup();
    const { rerender } = montar({ visibles: 3 });

    const flecha = siguiente();
    if (flecha === null) {
      throw new Error("Falta la flecha siguiente.");
    }
    await usuario.click(flecha);
    await usuario.click(flecha);
    expect(indiceActual()).toBe("2");

    // Con 1 visible el índice 2 sigue siendo válido; con 3, el máximo es 2.
    rerender(
      <Carrusel
        periodos={PERIODOS}
        visibles={1}
        acciones={<span>acciones</span>}
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
 * Rediseño: el desplazamiento es el nativo del navegador. La ventana scrollea
 * en X con `scroll-snap`, cada tarjeta lleva su `data-periodo` para que el
 * arrastre de materias sepa dónde cayó, y ninguna va `inert`: con scroll real,
 * enfocar una tarjeta de afuera la trae a la vista y el índice la sigue —el
 * desfase que motivó el `inert` (F4.2) ya no puede pasar.
 */
describe("Carrusel · desplazamiento nativo", () => {
  function tarjetas(): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(".carrusel__tarjeta"),
    );
  }

  it("la ventana es el único contenedor con scroll horizontal", () => {
    montar({ visibles: 2 });
    expect(ventana()).toHaveAttribute("tabindex", "0");
    expect(document.querySelector(".carrusel__posicion")).toBeNull();
    expect(document.querySelector(".carrusel__chips")).toBeNull();
  });

  it("cada tarjeta lleva su período y ninguna es inert", () => {
    montar({ visibles: 2 });
    expect(tarjetas().map((t) => t.dataset["periodo"])).toEqual(PERIODOS);
    expect(tarjetas().every((t) => !t.hasAttribute("inert"))).toBe(true);
  });

  it("`claseDe` decora la tarjeta de un período", () => {
    render(
      <Carrusel
        periodos={PERIODOS}
        visibles={2}
        claseDe={(periodo) =>
          periodo === "2027-1C" ? "carrusel__tarjeta--destino-valido" : undefined
        }
        render={(periodo) => <p>tarjeta {periodo}</p>}
      />,
    );
    const marcadas = tarjetas().filter((t) =>
      t.classList.contains("carrusel__tarjeta--destino-valido"),
    );
    expect(marcadas.map((t) => t.dataset["periodo"])).toEqual(["2027-1C"]);
  });
});
