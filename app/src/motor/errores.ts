/**
 * Errores del motor de dominio.
 *
 * El motor falla ruidosamente: si le piden razonar sobre una materia que el
 * plan no conoce o sobre un período con una forma que no es la del contrato,
 * lanza en vez de devolver un resultado a medias que la interfaz dibujaría
 * como si fuera cierto.
 */

import type { Codigo } from "../contrato/tipos";

/** Se pidió razonar sobre un código que no está en el plan de estudios. */
export class MateriaDesconocida extends Error {
  readonly codigo: Codigo;

  constructor(codigo: Codigo) {
    super(`El plan de estudios no tiene la materia ${codigo}.`);
    this.name = "MateriaDesconocida";
    this.codigo = codigo;
  }
}

/** Un identificador de período que no cumple `^\d{4}-[12]C$`. */
export class PeriodoInvalido extends Error {
  readonly periodo: string;

  constructor(periodo: string) {
    super(
      `«${periodo}» no es un período: se esperaba <año>-1C o <año>-2C, ` +
        `por ejemplo 2026-2C.`,
    );
    this.name = "PeriodoInvalido";
    this.periodo = periodo;
  }
}

/**
 * Se pidió una simulación que arranca «en el período actual» y no hay ninguno:
 * el plan del usuario está vacío y quien llama tampoco indicó desde dónde.
 */
export class SinPeriodoDeReferencia extends Error {
  constructor(que: string) {
    super(
      `No se puede calcular ${que}: el plan no tiene ningún período y no se ` +
        `indicó desde cuál empezar.`,
    );
    this.name = "SinPeriodoDeReferencia";
  }
}
