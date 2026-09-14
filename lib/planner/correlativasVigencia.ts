// Correlativas con transición: cambios de plan anunciados con un año de
// margen. La correlativa ya figura en los datos (`Materia.correlativas`) y
// rige para todo lo que se planifica hacia adelante, pero durante el año de
// transición la carrera aprueba excepciones: se puede cursar la materia sin
// haber cursado la correlativa y rendir su final sin haberla aprobado.
//
// Lo usan el combinador de finales (un final de 2026 no exige la correlativa
// nueva) y el detalle de la materia (aviso). El plan de cursada no la
// necesita: planifica desde el cuatrimestre siguiente, ya dentro de la
// vigencia plena.

export interface CorrelativaEnTransicion {
  /** código de la correlativa nueva */
  correlativa: string;
  /** primer año en que rige sin excepciones */
  rigeDesde: number;
  /** motivo, para el aviso del detalle */
  nota: string;
}

/**
 * Por materia, las correlativas que todavía tienen excepciones vigentes.
 *
 * 93.75 → 72.25 / 72.27 (2026-09): a pedido de los PRM de Simulación de
 * Sistemas y Sistemas de Inteligencia Artificial, Métodos Numéricos Avanzados
 * pasa a ser correlativa de ambas. La carrera pidió a Experiencia Estudiantil
 * (con copia a Secretaría Académica) que durante todo 2026 se aprueben las
 * excepciones para inscribirse al final sin haber aprobado (ni cursado) 93.75
 * y para matricularse sin haberla cursado; en 2027 dejan de otorgarse.
 */
export const CORRELATIVAS_EN_TRANSICION: Record<string, CorrelativaEnTransicion[]> = {
  "72.25": [
    {
      correlativa: "93.75",
      rigeDesde: 2027,
      nota: "Correlativa nueva desde 2027: durante 2026 la carrera aprueba excepciones para cursarla y rendir su final sin tener 93.75.",
    },
  ],
  "72.27": [
    {
      correlativa: "93.75",
      rigeDesde: 2027,
      nota: "Correlativa nueva desde 2027: durante 2026 la carrera aprueba excepciones para cursarla y rendir su final sin tener 93.75.",
    },
  ],
};

/** Transiciones de una materia (vacío si no tiene). */
export function transicionesDe(code: string): CorrelativaEnTransicion[] {
  return CORRELATIVAS_EN_TRANSICION[code] ?? [];
}

/** ¿`correlativa` todavía no rige para `code` en `anio` (hay excepción)? */
export function correlativaExceptuada(code: string, correlativa: string, anio: number): boolean {
  return transicionesDe(code).some((t) => t.correlativa === correlativa && anio < t.rigeDesde);
}
