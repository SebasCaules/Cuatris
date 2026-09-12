/**
 * 13i con el plan real: títulos, electivas contra 27 y minors contra 14.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLAN } from "../../motor/fixtures/reales";
import {
  planConElectivas,
  planDePrueba,
} from "../PaginaPlan/escenario";
import { electivasQueFaltan, pieDelTitulo, ProgresoConDatos } from "./PaginaProgreso";

describe("pieDelTitulo", () => {
  it("dice lo que falta y el cuatrimestre estimado", () => {
    expect(
      pieDelTitulo({
        id: "ingeniero",
        nombre: "Ingeniero/a en Informática",
        alcanzado: false,
        creditos: 184,
        requeridos: 243,
        faltanItems: [],
        estimado: "2028-1C",
      }),
    ).toBe("faltan 59 cr · estimado 1.º 2028");
  });

  it("descuenta lo planificado, que es la cuenta de 13i", () => {
    expect(
      pieDelTitulo(
        {
          id: "bachiller",
          nombre: "Bachiller en Ingeniería",
          alcanzado: false,
          creditos: 147,
          requeridos: 192,
          faltanItems: [],
          estimado: "2027-1C",
        },
        27,
      ),
    ).toBe("faltan 18 cr · estimado 1.º 2027");
  });

  it("avisa cuando lo planificado no alcanza", () => {
    expect(
      pieDelTitulo({
        id: "ingeniero",
        nombre: "Ingeniero/a en Informática",
        alcanzado: false,
        creditos: 147,
        requeridos: 243,
        faltanItems: [],
        estimado: null,
      }),
    ).toBe("faltan 96 cr · todavía no alcanza con lo planificado");
  });

  it("y no cuenta nada cuando el título ya está", () => {
    expect(
      pieDelTitulo({
        id: "analista",
        nombre: "Analista en Tecnología Informática",
        alcanzado: true,
        creditos: 147,
        requeridos: 147,
        faltanItems: [],
        estimado: null,
      }),
    ).toBe("alcanzado con lo aprobado");
  });
});

describe("electivasQueFaltan", () => {
  it("cuenta con el tamaño habitual de electiva del minor", () => {
    const plan = planConElectivas();
    const minor = {
      sigla: "CD",
      nombre: "Ciencia de Datos",
      creditos: 3,
      planificados: 3,
      minimos: 14,
      faltan: 11,
    };
    // Faltan 8 créditos y las electivas de Ciencia de Datos valen 3.
    expect(electivasQueFaltan(minor, PLAN, plan)).toBe(3);
  });

  it("un minor con electivas de 1 crédito sueltas no dispara una cuenta absurda", () => {
    // Arquitectura de Software tiene una electiva de 1 crédito y once de 3.
    expect(
      electivasQueFaltan(
        {
          sigla: "ARQ",
          nombre: "Arquitectura de Software",
          creditos: 0,
          planificados: 0,
          minimos: 14,
          faltan: 14,
        },
        PLAN,
        planConElectivas(),
      ),
    ).toBe(5);
  });

  it("un minor ya cubierto no pide nada", () => {
    expect(
      electivasQueFaltan(
        {
          sigla: "CD",
          nombre: "Ciencia de Datos",
          creditos: 14,
          planificados: 0,
          minimos: 14,
          faltan: 0,
        },
        PLAN,
        planConElectivas(),
      ),
    ).toBeNull();
  });
});

describe("PaginaProgreso", () => {
  it("escalona los tres títulos con su estado real", () => {
    render(<ProgresoConDatos plan={PLAN} planUsuario={planDePrueba()} />);
    const titulos = screen.getByRole("region", {
      name: "Títulos y electivas",
    });
    expect(within(titulos).getByText("✓ obtenible ya")).toBeVisible();
    expect(within(titulos).getByText("alcanzado con lo aprobado")).toBeVisible();
    // Como en 13i, la cuenta es lo aprobado (147) más lo planificado (27).
    expect(within(titulos).getByText("174 / 192 cr")).toBeVisible();
    expect(within(titulos).getByText("174 / 243 cr")).toBeVisible();
    expect(within(titulos).getAllByText("intermedio")).toHaveLength(2);
    expect(within(titulos).getByText("principal")).toBeVisible();
  });

  it("lista las electivas contra los 27 créditos, con su estado", () => {
    render(<ProgresoConDatos plan={PLAN} planUsuario={planConElectivas()} />);
    expect(screen.getByText("Electivas · 6 de 27 créditos")).toBeVisible();
    expect(screen.getByText("Introducción a la Bioinformática")).toBeVisible();
    expect(screen.getByText("✓ aprobada")).toBeVisible();
    expect(screen.getByText("Sistemas Tolerantes a Fallas")).toBeVisible();
    expect(screen.getByText("◇ planificada")).toBeVisible();
  });

  it("muestra los cuatro minors contra 14 créditos y lo que les falta", () => {
    render(<ProgresoConDatos plan={PLAN} planUsuario={planConElectivas()} />);
    const minors = screen.getByRole("region", { name: "Minors" });
    expect(within(minors).getByText("Ciencia de Datos")).toBeVisible();
    expect(within(minors).getByText("6 / 14 cr")).toBeVisible();
    expect(within(minors).getByText("3 electivas más y queda")).toBeVisible();
    expect(within(minors).getAllByText("0 / 14 cr")).toHaveLength(3);
    // 13i solo pone «n electivas más y queda» en el minor empezado.
    expect(
      within(minors).queryAllByText("5 electivas más y queda"),
    ).toHaveLength(0);
  });

  it("sin electivas cargadas lo dice en vez de mostrar una lista vacía", () => {
    render(<ProgresoConDatos plan={PLAN} planUsuario={planDePrueba()} />);
    expect(
      screen.getByText("Todavía no cargaste ninguna electiva."),
    ).toBeVisible();
  });
});
