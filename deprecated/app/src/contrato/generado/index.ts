/**
 * Generado por `npm run tipos` desde `schemas/v1/index.schema.json`.
 *
 * NO LO EDITES A MANO: la proxima generacion pisa los cambios. Si hace
 * falta otra forma, se cambia el schema y se vuelve a generar.
 */

/**
 * Que archivos existen, con que hash y desde cuando cada periodo esta activo.
 */
export interface IndiceDeDatos {
  abreviaciones: ArchivoUnico;
  /**
   * Fecha de la ultima actualizacion del indice.
   */
  actualizado: string;
  /**
   * Version del contrato de datos, en SemVer.
   */
  contrato: string;
  /**
   * Periodos de horarios publicados; publicar no es activar.
   *
   * Items: Un periodo publicado, con sus fechas de vigencia y su hash.
   */
  horarios: {
    /**
     * Ruta del archivo, relativa a data/.
     */
    archivo: string;
    /**
     * Primer dia en que el periodo esta activo.
     */
    desde: string;
    /**
     * Hash del contenido canonico del archivo referido.
     */
    hash: string;
    /**
     * Ultimo dia en que el periodo esta activo.
     */
    hasta: string;
    /**
     * Identificador del periodo publicado.
     */
    periodo: string;
    /**
     * Fecha en que se publicaron estos horarios.
     */
    publicado: string;
  }[];
  /**
   * Periodos futuros y el mes en que se esperan; curado a mano, opcional.
   */
  horarios_esperados?: {
    /**
     * Mes esperado de publicacion, en formato YYYY-MM.
     *
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^\d{4}-[12]C$".
     */
    [k: string]: string;
  };
  /**
   * Planes de estudio publicados.
   *
   * Items: Un plan publicado, con su archivo y su hash.
   */
  planes: {
    /**
     * Ruta del archivo, relativa a data/.
     */
    archivo: string;
    /**
     * Hash del contenido canonico del archivo referido.
     */
    hash: string;
    /**
     * Identificador del plan.
     */
    plan: string;
  }[];
  vocabulario: ArchivoUnico;
}
/**
 * Un archivo unico del contrato, con su ruta y su hash.
 */
export interface ArchivoUnico {
  /**
   * Ruta del archivo, relativa a data/.
   */
  archivo: string;
  /**
   * Hash del contenido canonico del archivo referido.
   */
  hash: string;
}
