import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Glifo, NOMBRES_GLIFO, type NombreGlifo } from "./Glifo";

/** Los nueve estados de `tokens.md`, con el signo que les toca. */
const ESPERADOS: Array<[NombreGlifo, string, string]> = [
  ["aprobada", "✓", "Aprobada"],
  ["cursando", "●", "Cursando"],
  ["planificada", "◇", "Planificada"],
  ["disponible", "○", "Disponible"],
  ["bloqueada", "⊘", "Bloqueada"],
  ["sinHorario", "—", "Sin horario publicado"],
  ["choque", "▲", "Choque de horario"],
  ["cupoLleno", "◐", "Cupo lleno"],
  ["cambioDeSede", "↕", "Cambio de sede"],
];

describe("Glifo", () => {
  it("cubre los nueve estados de tokens.md", () => {
    expect(NOMBRES_GLIFO).toEqual(ESPERADOS.map(([nombre]) => nombre));
  });

  it.each(ESPERADOS)(
    "«%s» dibuja %s y se anuncia como «%s»",
    (nombre, signo, etiqueta) => {
      render(<Glifo nombre={nombre} />);
      const glifo = screen.getByRole("img", { name: etiqueta });
      expect(glifo).toHaveTextContent(signo);
      expect(glifo).toHaveClass(`glifo--${nombre}`);
    },
  );

  it("el contexto puede precisar el nombre accesible", () => {
    render(<Glifo nombre="choque" etiqueta="Choque lun 15–16" />);
    expect(
      screen.getByRole("img", { name: "Choque lun 15–16" }),
    ).toHaveTextContent("▲");
  });
});
