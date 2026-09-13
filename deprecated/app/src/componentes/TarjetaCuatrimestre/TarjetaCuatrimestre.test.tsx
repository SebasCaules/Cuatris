/**
 * Las tres variantes de la tarjeta, con los datos del corpus y del plan.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CAMBIOS_DE_SEDE,
  CHOQUES,
  HITOS,
  HORARIOS_ESPERADOS,
  MATERIAS,
  MATERIAS_SIN_HORARIOS,
  nombreDeSede,
  PERIODO,
  SIN_HORARIO,
} from "../GrillaSemanal/ejemplo";
import {
  mesDeAnio,
  MesIlegible,
  TarjetaCuatrimestre,
  textoDePublicacion,
} from "./TarjetaCuatrimestre";

describe("formatos de la tarjeta", () => {
  it("`horarios_esperados` se lee como mes de año", () => {
    expect(mesDeAnio("2026-11")).toBe("noviembre de 2026");
    expect(() => mesDeAnio("2026-13")).toThrow(MesIlegible);
    expect(() => mesDeAnio("noviembre")).toThrow(/noviembre/);
  });

  it("la nota de publicación cuenta los días", () => {
    expect(textoDePublicacion("2026-09-09", "2026-09-12")).toBe(
      "Horarios publicados hace 3 días · pueden cambiar hasta la inscripción",
    );
    expect(textoDePublicacion("2026-09-11", "2026-09-12")).toContain(
      "hace 1 día",
    );
    expect(textoDePublicacion("2026-09-12", "2026-09-12")).toContain(
      "publicados hoy",
    );
  });
});

describe("TarjetaCuatrimestre · con horarios", () => {
  function dibujar() {
    return render(
      <TarjetaCuatrimestre
        variante="conHorarios"
        periodo={PERIODO}
        resumen="3 materias · ▲ 1"
        bloques={MATERIAS}
        choques={CHOQUES}
        horaPx={15}
        sinHorarioPublicado={[
          { codigo: SIN_HORARIO.codigo, abreviacion: SIN_HORARIO.abreviacion },
        ]}
        publicado="2026-09-09"
        hoy="2026-09-12"
        nombreDeSede={nombreDeSede}
        alResolver={() => undefined}
      />,
    );
  }

  it("titula el cuatrimestre a partir del período y muestra el resumen", () => {
    dibujar();
    expect(
      screen.getByRole("heading", { name: "2.º cuatrimestre 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 materias · ▲ 1")).toBeInTheDocument();
  });

  it("lleva la grilla con la franja del choque y la lista al pie", () => {
    dibujar();
    expect(
      screen.getByRole("img", { name: /^Choque lunes/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("CONFLICTOS · 1")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "Lun 15–16 · 93.18 Álgebra Lineal ↔ 72.44 Criptografía y Seguridad",
    );
  });

  it("baja al pie la materia sin horario publicado, con nota punteada", () => {
    dibujar();
    expect(
      screen.getByText("— 15.09 Agile / Lean · sin horario publicado"),
    ).toBeInTheDocument();
  });

  it("dice hace cuánto se publicaron los horarios", () => {
    dibujar();
    expect(
      screen.getByText(
        "Horarios publicados hace 3 días · pueden cambiar hasta la inscripción",
      ),
    ).toBeInTheDocument();
  });

  it("al pasar por la franja se enciende la fila de la lista", async () => {
    const usuario = userEvent.setup();
    dibujar();
    const fila = screen.getAllByRole("listitem")[0];
    expect(fila).not.toHaveAttribute("aria-current");
    await usuario.hover(screen.getByRole("img", { name: /^Choque lunes/ }));
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("el cambio de sede entra en la misma lista", () => {
    render(
      <TarjetaCuatrimestre
        variante="conHorarios"
        periodo={PERIODO}
        bloques={MATERIAS}
        cambiosDeSede={CAMBIOS_DE_SEDE}
        nombreDeSede={nombreDeSede}
        alVer={() => undefined}
      />,
    );
    expect(screen.getByText("CONFLICTOS · 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver" })).toBeInTheDocument();
  });
});

describe("TarjetaCuatrimestre · sin horarios", () => {
  it("dice cuándo salen los horarios y lista materias con créditos", async () => {
    const usuario = userEvent.setup();
    const alAgregar = vi.fn();
    render(
      <TarjetaCuatrimestre
        variante="sinHorarios"
        periodo="2027-1C"
        resumen="3 materias · 21 cr"
        materias={MATERIAS_SIN_HORARIOS}
        horariosEsperados={HORARIOS_ESPERADOS}
        hitos={HITOS}
        alAgregar={alAgregar}
      />,
    );
    expect(
      screen.getByText(
        "Sin horarios publicados: salen en noviembre de 2026. Hasta entonces se " +
          "planifica por carga y correlativas.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("BD2")).toBeInTheDocument();
    expect(screen.getByText("12 cr")).toBeInTheDocument();
    for (const hito of HITOS) {
      expect(screen.getByText(hito)).toBeInTheDocument();
    }
    await usuario.click(
      screen.getByRole("button", { name: "+ agregar materia" }),
    );
    expect(alAgregar).toHaveBeenCalledTimes(1);
  });

  it("sin `horarios_esperados` la nota es la corta", () => {
    render(
      <TarjetaCuatrimestre
        variante="sinHorarios"
        periodo="2027-2C"
        materias={MATERIAS_SIN_HORARIOS}
      />,
    );
    expect(screen.getByText("Sin horarios publicados.")).toBeInTheDocument();
    expect(screen.queryByText(/noviembre/)).not.toBeInTheDocument();
  });

  it("no dibuja grilla ni lista de conflictos", () => {
    render(
      <TarjetaCuatrimestre
        variante="sinHorarios"
        periodo="2027-1C"
        materias={MATERIAS_SIN_HORARIOS}
      />,
    );
    expect(screen.queryByText("LUN")).not.toBeInTheDocument();
    expect(screen.queryByText(/CONFLICTOS/)).not.toBeInTheDocument();
  });
});

describe("TarjetaCuatrimestre · vacía", () => {
  it("solo el título y «+ agregar materia»", () => {
    render(<TarjetaCuatrimestre variante="vacia" periodo="2028-1C" />);
    expect(
      screen.getByRole("heading", { name: "1.º cuatrimestre 2028" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ agregar materia" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("LUN")).not.toBeInTheDocument();
  });
});
