import { beforeEach, describe, expect, it } from "vitest";

import {
  CLAVE_ALMACENAMIENTO,
  guardarYa,
  leer,
} from "./almacenamiento";
import { exportar, planUsuarioInicial, reducir } from "./planUsuario";

describe("almacenamiento", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("devuelve «vacio» cuando no hay nada guardado", () => {
    expect(leer()).toEqual({ estado: "vacio" });
  });

  it("guarda y vuelve a leer el mismo plan", () => {
    const estado = reducir(planUsuarioInicial(), {
      tipo: "agregarMateria",
      periodo: "2026-2C",
      codigo: "93.18",
    });
    guardarYa(estado);
    const lectura = leer();
    expect(lectura.estado).toBe("listo");
    if (lectura.estado === "listo") {
      expect(lectura.plan).toEqual(estado);
    }
  });

  it("guarda en forma canónica bajo cuatris.plan_usuario", () => {
    const estado = planUsuarioInicial();
    guardarYa(estado);
    expect(window.localStorage.getItem(CLAVE_ALMACENAMIENTO)).toBe(
      exportar(estado),
    );
  });

  it("ante datos corruptos informa el error y no borra el original", () => {
    const original = '{"version": 99}';
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, original);
    const lectura = leer();
    expect(lectura.estado).toBe("corrupto");
    if (lectura.estado === "corrupto") {
      expect(lectura.crudo).toBe(original);
      expect(lectura.error.donde).toBe("version");
    }
    expect(window.localStorage.getItem(CLAVE_ALMACENAMIENTO)).toBe(original);
  });

  it("ante un texto que no es JSON tampoco borra nada", () => {
    window.localStorage.setItem(CLAVE_ALMACENAMIENTO, "{roto");
    expect(leer().estado).toBe("corrupto");
    expect(window.localStorage.getItem(CLAVE_ALMACENAMIENTO)).toBe("{roto");
  });
});
