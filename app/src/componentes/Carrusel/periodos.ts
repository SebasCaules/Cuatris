/**
 * Nombres de período para la interfaz.
 *
 * El identificador del contrato es `"2026-1C"`; el mockup nunca lo muestra
 * así. Formatear no es inventar datos: el año y el cuatrimestre salen del
 * propio identificador y no se agrega nada.
 */

import type { PeriodoId } from "../../contrato/tipos";

const PERIODO = /^(\d{4})-([12])C$/;

/** El identificador no tiene la forma `^\d{4}-[12]C$` del contrato. */
export class PeriodoInvalido extends Error {
  readonly periodo: string;

  constructor(periodo: string) {
    super(
      `«${periodo}» no es un identificador de período: se esperaba ` +
        "«<año>-1C» o «<año>-2C».",
    );
    this.name = "PeriodoInvalido";
    this.periodo = periodo;
  }
}

/**
 * Se pidió mover el carrusel a un período que no está en su lista.
 *
 * Es un error del que llama —«Planificar en 2.º 2027» sobre un carrusel que no
 * muestra 2027— y no una posibilidad normal: mover a un período inexistente no
 * tiene ninguna interpretación razonable, así que se avisa en vez de quedarse
 * quieto.
 */
export class PeriodoFueraDelCarrusel extends Error {
  readonly periodo: string;
  readonly periodos: readonly string[];

  constructor(periodo: string, periodos: readonly PeriodoId[]) {
    super(
      `«${periodo}» no está entre los períodos del carrusel: ` +
        `${periodos.length === 0 ? "no tiene ninguno" : periodos.join(", ")}.`,
    );
    this.name = "PeriodoFueraDelCarrusel";
    this.periodo = periodo;
    this.periodos = [...periodos];
  }
}

function partes(periodo: PeriodoId): { anio: string; cuatrimestre: string } {
  const coincide = periodo.match(PERIODO);
  if (coincide === null) {
    throw new PeriodoInvalido(periodo);
  }
  const [, anio = "", cuatrimestre = ""] = coincide;
  return { anio, cuatrimestre };
}

/** `"2026-1C"` → `"1.º 2026"`. El texto del chip de período (13b). */
export function etiquetaCorta(periodo: PeriodoId): string {
  const { anio, cuatrimestre } = partes(periodo);
  return `${cuatrimestre}.º ${anio}`;
}

/** `"2026-1C"` → `"1.º cuatrimestre 2026"`. El título de la tarjeta (13b). */
export function etiquetaLarga(periodo: PeriodoId): string {
  const { anio, cuatrimestre } = partes(periodo);
  return `${cuatrimestre}.º cuatrimestre ${anio}`;
}
