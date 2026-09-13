/**
 * Generado por `npm run tipos` desde `schemas/v1/planes.schema.json`.
 *
 * NO LO EDITES A MANO: la proxima generacion pisa los cambios. Si hace
 * falta otra forma, se cambia el schema y se vuelve a generar.
 */

/**
 * Ciclo al que pertenece la materia.
 */
export type Ciclo = "basico" | "profesional" | "electiva";
/**
 * Sigla de un minor declarado en minors[].
 */
export type SiglaMinor = string;

/**
 * Materias, correlativas, titulos y minors de un plan de estudios.
 */
export interface PlanDeEstudios {
  /**
   * Nombre de la carrera a la que pertenece el plan.
   */
  carrera: string;
  /**
   * Version del contrato de datos, en SemVer.
   */
  contrato: string;
  /**
   * Exigencia global de electivas del plan.
   */
  electivas: {
    /**
     * Creditos de materias electivas que hay que aprobar.
     */
    creditos_requeridos: number;
  };
  /**
   * Materias del plan, obligatorias y electivas.
   */
  materias: Materia[];
  /**
   * Minors disponibles; no se llaman «orientaciones».
   */
  minors: Minor[];
  /**
   * Identificador del plan, por ejemplo «S10-Rev23».
   */
  plan: string;
  /**
   * Titulos que otorga el plan, del intermedio al principal.
   */
  titulos: Titulo[];
}
/**
 * Una materia del plan, con sus correlativas y su ciclo.
 */
export interface Materia {
  ciclo: Ciclo;
  /**
   * Codigo de materia del ITBA, siempre string (por ejemplo «93.18»).
   */
  codigo: string;
  /**
   * Codigos que hay que tener antes; todos existen en materias[].
   *
   * Items: Codigo de materia del ITBA, siempre string (por ejemplo «93.18»).
   */
  correlativas: string[];
  /**
   * Creditos que otorga; cero es valido y sigue siendo un item del titulo.
   */
  creditos: number;
  /**
   * Creditos aprobados necesarios para poder cursarla.
   */
  creditos_requeridos: number;
  /**
   * Cuatrimestre sugerido 1-10 para las obligatorias; null para las electivas.
   */
  cuatrimestre_sugerido: number | null;
  /**
   * Siglas de los minors a los que suma la electiva; vacio en las obligatorias.
   */
  minors: SiglaMinor[];
  /**
   * Nombre de la materia segun el listado del SGA.
   */
  nombre: string;
  /**
   * Si la materia sigue vigente en el plan o solo existe en el SGA.
   */
  vigente: boolean;
}
/**
 * Un minor: un conjunto de electivas con un minimo de creditos.
 */
export interface Minor {
  /**
   * Creditos minimos del minor para que se considere cumplido.
   */
  creditos_minimos: number;
  /**
   * Nombre completo del minor.
   */
  nombre: string;
  sigla: SiglaMinor;
}
/**
 * Un titulo del plan, con su exigencia de creditos e items.
 */
export interface Titulo {
  /**
   * Creditos aprobados que exige el titulo.
   */
  creditos: number;
  /**
   * Identificador interno del titulo.
   */
  id: string;
  /**
   * Nombre del titulo tal como lo publica el SGA.
   */
  nombre: string;
  /**
   * Ciclos cuyos items hay que aprobar por completo; opcional.
   */
  requiere_ciclos?: Ciclo[];
  /**
   * Creditos de electivas aprobadas que exige el titulo; opcional.
   */
  requiere_electivas?: number;
  /**
   * Si el titulo es intermedio o el principal de la carrera.
   */
  tipo: "intermedio" | "principal";
}
