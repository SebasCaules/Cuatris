/**
 * Generado por `npm run tipos` desde `schemas/v1/vocabulario.schema.json`.
 *
 * NO LO EDITES A MANO: la proxima generacion pisa los cambios. Si hace
 * falta otra forma, se cambia el schema y se vuelve a generar.
 */

/**
 * Listas cerradas editables del contrato; hoy, las sedes del ITBA.
 */
export interface VocabularioControlado {
  /**
   * Version del contrato de datos, en SemVer.
   */
  contrato: string;
  /**
   * Sedes validas; su id es lo que va en bloques[].sede.
   *
   * Items: Una sede del ITBA.
   */
  sedes: {
    /**
     * Identificador en minusculas que usan los bloques horarios.
     */
    id: string;
    /**
     * Nombre de la sede tal como lo muestra el SGA, sin expandir siglas.
     */
    nombre: string;
  }[];
}
