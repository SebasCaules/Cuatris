/**
 * Las pruebas de la grilla, con los datos del corpus.
 *
 * El choque no se escribe a mano: sale del motor corriendo sobre
 * `tests/fixtures/deben-pasar/horarios-casos-raros.json`, igual que en
 * `motor/mockup.test.ts`. Así, si el motor cambia de opinión sobre qué se
 * pisa, la grilla se entera.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { choques as choquesDelPeriodo } from "../../motor";
import {
  codigosDelCiclo,
  historiaCon,
  HORARIOS_RAROS,
  PERIODO_RARO,
  planCon,
} from "../../motor/fixtures/reales";
import { GrillaSemanal } from "./GrillaSemanal";
import {
  ACCIONAMIENTOS_PEGADO,
  ALGEBRA,
  ALGEBRA_B,
  CAMBIOS_DE_SEDE,
  CRIPTO,
  CRIPTO_SABADO,
  MATERIAS,
  nombreDeSede,
} from "./ejemplo";

/** El 2026-2C del mockup: 93.18 comisión A y 72.44 comisión S. */
const PLAN_USUARIO = planCon(historiaCon(codigosDelCiclo("basico")), {
  [PERIODO_RARO]: [
    { codigo: "93.18", comision: "A" },
    { codigo: "72.44", comision: "S" },
  ],
});

/** Los choques reales del período, calculados por el motor. */
const CHOQUES_REALES = choquesDelPeriodo(
  PERIODO_RARO,
  PLAN_USUARIO,
  HORARIOS_RAROS,
);

function caja(elemento: HTMLElement): [string, string] {
  return [elemento.style.top, elemento.style.height];
}

describe("GrillaSemanal", () => {
  it("un bloque de 14 a 16 arranca a seis horas y mide dos", () => {
    render(<GrillaSemanal bloques={[ALGEBRA]} horaPx={15} />);
    const miercoles = screen.getByRole("img", {
      name: /miércoles 14:00–16:00/,
    });
    expect(caja(miercoles)).toEqual(["90px", "30px"]);
  });

  it("la escala es un dato: con 18 px por hora el mismo bloque se estira", () => {
    render(<GrillaSemanal bloques={[ALGEBRA]} horaPx={18} />);
    expect(
      caja(screen.getByRole("img", { name: /miércoles 14:00–16:00/ })),
    ).toEqual(["108px", "36px"]);
  });

  it("una comisión en dos aulas a la vez las muestra separadas por punto", () => {
    render(<GrillaSemanal bloques={[ALGEBRA_B]} horaPx={15} />);
    expect(screen.getByText("003T · 004T")).toBeInTheDocument();
  });

  it("dibuja las quince horas de 08 a 22 y los cinco días", () => {
    render(<GrillaSemanal bloques={[]} horaPx={15} />);
    expect(screen.getByText("08")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    for (const dia of ["LUN", "MAR", "MIÉ", "JUE", "VIE"]) {
      expect(screen.getByText(dia)).toBeInTheDocument();
    }
    expect(screen.queryByText("SÁB")).not.toBeInTheDocument();
  });

  describe("con el choque real 93.18 A ↔ 72.44 S", () => {
    function dibujar() {
      return render(
        <GrillaSemanal
          bloques={MATERIAS}
          choques={CHOQUES_REALES}
          horaPx={15}
        />,
      );
    }

    it("cada materia conserva su tramo exclusivo", () => {
      dibujar();
      // 93.18 va de 14 a 16 y le queda 14–15; 72.44 de 15 a 18 y le queda 16–18.
      expect(
        caja(screen.getByRole("img", { name: /93\.18.*lunes 14:00–16:00/ })),
      ).toEqual(["90px", "15px"]);
      expect(
        caja(screen.getByRole("img", { name: /72\.44.*lunes 15:00–18:00/ })),
      ).toEqual(["120px", "30px"]);
    });

    it("un tramo de una hora no lleva etiqueta de aula", () => {
      dibujar();
      // El aula de 93.18 el lunes es 001R y el tramo que le queda es de 1 h.
      expect(screen.queryByText("001R")).not.toBeInTheDocument();
      // El de 72.44 mide dos horas y sí la lleva.
      expect(screen.getByText("002R")).toBeInTheDocument();
    });

    it("la franja compartida se dibuja encima, sobre las 15–16", () => {
      const { container } = dibujar();
      const franja = screen.getByRole("img", { name: /^Choque lunes/ });
      expect(caja(franja)).toEqual(["105px", "15px"]);
      expect(franja.className).toContain("grilla__choque");
      const bloques = container.querySelectorAll(".grilla__bloque");
      const franjas = container.querySelectorAll(".grilla__choque");
      expect(bloques.length).toBeGreaterThan(0);
      expect(franjas).toHaveLength(1);
    });

    it("el nombre accesible nombra a las dos materias y sus comisiones", () => {
      dibujar();
      expect(
        screen.getByRole("img", {
          name:
            "Choque lunes de 15:00 a 16:00: 93.18 Álgebra Lineal (comisión A) " +
            "y 72.44 Criptografía y Seguridad (comisión S)",
        }),
      ).toBeInTheDocument();
    });

    it("la etiqueta del choque existe para el mouse, con códigos y franja", () => {
      dibujar();
      expect(screen.getByText("▲ 93.18 ↔ 72.44 · 15–16")).toBeInTheDocument();
    });

    it("avisa cuándo el mouse entra y sale de la franja", async () => {
      const usuario = userEvent.setup();
      const alPasarChoque = vi.fn();
      render(
        <GrillaSemanal
          bloques={MATERIAS}
          choques={CHOQUES_REALES}
          horaPx={15}
          alPasarChoque={alPasarChoque}
        />,
      );
      const franja = screen.getByRole("img", { name: /^Choque lunes/ });
      await usuario.hover(franja);
      expect(alPasarChoque).toHaveBeenLastCalledWith(CHOQUES_REALES[0]);
      await usuario.unhover(franja);
      expect(alPasarChoque).toHaveBeenLastCalledWith(null);
    });
  });

  it("el cambio de sede se marca en el borde entre los dos bloques", () => {
    render(
      <GrillaSemanal
        bloques={[ALGEBRA, ACCIONAMIENTOS_PEGADO]}
        cambiosDeSede={CAMBIOS_DE_SEDE}
        nombreDeSede={nombreDeSede}
        horaPx={15}
      />,
    );
    const marca = screen.getByRole("img", {
      name: "Cambio de sede el jueves a las 16:00: Rectorado → SDT",
    });
    // Las 16:00 son ocho horas después de las 08:00.
    expect(marca.style.top).toBe("120px");
    // Sin `title=` (R2): el nombre accesible ya dice de qué sede a cuál.
    expect(marca).not.toHaveAttribute("title");
    // No bloquea: los dos bloques siguen dibujados enteros.
    expect(
      caja(screen.getByRole("img", { name: /93\.18.*jueves 14:00–16:00/ })),
    ).toEqual(["90px", "30px"]);
    expect(
      caja(screen.getByRole("img", { name: /30\.28.*jueves 16:00–19:00/ })),
    ).toEqual(["120px", "45px"]);
  });

  it("los bloques de sábado no van en la grilla: se listan al pie", () => {
    render(<GrillaSemanal bloques={[CRIPTO_SABADO]} horaPx={15} />);
    const pie = screen.getByRole("list", {
      name: "Bloques fuera de la grilla",
    });
    expect(pie).toHaveTextContent("sáb 09–12 · 002R");
    expect(
      screen.getByLabelText(
        "72.44 Criptografía y Seguridad · comisión S · sábado 09:00–12:00 · 002R",
      ),
    ).toBeInTheDocument();
  });

  it("sin bloques raros no hay pie", () => {
    render(<GrillaSemanal bloques={[CRIPTO]} horaPx={15} />);
    expect(
      screen.queryByRole("list", { name: "Bloques fuera de la grilla" }),
    ).not.toBeInTheDocument();
  });

  it("el estado cambia el borde y agrega el glifo, no el relleno", () => {
    const { container } = render(
      <GrillaSemanal
        bloques={[{ ...ALGEBRA, estado: "planificada" }]}
        horaPx={15}
      />,
    );
    const bloque = container.querySelector(".grilla__bloque");
    expect(bloque?.className).toContain("grilla__bloque--planificada");
    expect(bloque?.getAttribute("style")).toContain(
      "--materia: var(--materia-0)",
    );
    expect(screen.getAllByText("◇").length).toBeGreaterThan(0);
  });

  /**
   * F4.10: el motor prioriza `bloqueada` sobre `planificada`, así que la grilla
   * tiene que saber dibujarla; antes caía en `undefined` y el bloque quedaba
   * sin borde ni glifo, igual que uno cualquiera.
   */
  it("«bloqueada» tiene su borde y su ⊘, como los demás estados", () => {
    const { container } = render(
      <GrillaSemanal
        bloques={[{ ...ALGEBRA, estado: "bloqueada" }]}
        horaPx={15}
      />,
    );
    const bloque = container.querySelector(".grilla__bloque");
    expect(bloque?.className).toContain("grilla__bloque--bloqueada");
    expect(bloque?.getAttribute("style")).toContain(
      "--materia: var(--materia-0)",
    );
    expect(screen.getAllByLabelText("Bloqueada").length).toBeGreaterThan(0);
    expect(screen.getAllByText("⊘").length).toBeGreaterThan(0);
  });

  it("con `alClic` los bloques son botones y avisan el código", async () => {
    const usuario = userEvent.setup();
    const alClic = vi.fn();
    const alPasar = vi.fn();
    render(
      <GrillaSemanal
        bloques={[CRIPTO]}
        horaPx={15}
        alClic={alClic}
        alPasar={alPasar}
      />,
    );
    const bloque = screen.getByRole("button", { name: /72\.44/ });
    await usuario.click(bloque);
    expect(alClic).toHaveBeenCalledWith("72.44");
    expect(alPasar).toHaveBeenCalledWith(
      expect.objectContaining({ bloque: CRIPTO.bloques[0] }),
    );
  });
});
