/**
 * Generado por `npm run tipos` desde `schemas/v1/abreviaciones.schema.json`.
 *
 * NO LO EDITES A MANO: la proxima generacion pisa los cambios. Si hace
 * falta otra forma, se cambia el schema y se vuelve a generar.
 */

/**
 * Nombre corto curado a mano con el que se conoce cada materia.
 */
export interface AbreviacionesDeMaterias {
  /**
   * Mapa de codigo de materia a su abreviacion; las abreviaciones son unicas.
   */
  abreviaciones: {
    /**
     * Abreviacion de la materia, de 1 a 24 caracteres.
     *
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^\d{2}\.\d{2}$".
     */
    [k: string]: string;
  };
  /**
   * Version del contrato de datos, en SemVer.
   */
  contrato: string;
}
