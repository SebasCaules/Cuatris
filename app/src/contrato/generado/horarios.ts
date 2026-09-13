/**
 * Generado por `npm run tipos` desde `schemas/v1/horarios.schema.json`.
 *
 * NO LO EDITES A MANO: la proxima generacion pisa los cambios. Si hace
 * falta otra forma, se cambia el schema y se vuelve a generar.
 */

/**
 * Oferta de cursos, comisiones y bloques horarios de un cuatrimestre.
 */
export interface HorariosDeUnPeriodo {
  /**
   * Version del contrato de datos, en SemVer.
   */
  contrato: string;
  /**
   * Cursos ofrecidos en el periodo, uno por codigo de materia.
   */
  cursos: Curso[];
  /**
   * De donde salieron los datos y cuando se capturaron.
   */
  fuente: {
    /**
     * Fecha en que se capturaron los datos.
     */
    capturado: string;
    /**
     * Sistema de origen: el SGA o una carga manual.
     */
    sistema: "sga" | "manual";
  };
  /**
   * Cuatrimestre al que pertenece todo el archivo.
   */
  periodo: {
    /**
     * Anio calendario del periodo.
     */
    anio: number;
    /**
     * Primer o segundo cuatrimestre.
     */
    cuatrimestre: "1C" | "2C";
    /**
     * Primer dia de clases del periodo.
     */
    desde: string;
    /**
     * Ultimo dia de clases del periodo.
     */
    hasta: string;
    /**
     * Identificador del periodo, con la forma «<anio>-<cuatrimestre>».
     */
    id: string;
  };
}
/**
 * Un curso: una materia dictada en este periodo.
 */
export interface Curso {
  /**
   * Codigo de materia del ITBA, siempre string (por ejemplo «93.18»).
   */
  codigo: string;
  /**
   * Comisiones del curso; vacio si todavia no se publicaron.
   */
  comisiones: Comision[];
  /**
   * Departamento que dicta la materia; opcional.
   */
  departamento?: string;
  /**
   * Primer dia de dictado del curso; puede ser un periodo corto.
   */
  desde: string;
  /**
   * Codigos que se dictan junto con este curso y comparten aula legitimamente.
   *
   * Items: Codigo de materia del ITBA, siempre string (por ejemplo «93.18»).
   */
  dictado_conjunto: string[];
  /**
   * Ultimo dia de dictado del curso.
   */
  hasta: string;
  /**
   * Nombre de la materia tal como lo muestra el SGA.
   */
  nombre: string;
}
/**
 * Una comision del curso, con sus docentes y sus bloques horarios.
 */
export interface Comision {
  /**
   * Bloques horarios de la comision; vacio si no hay horario publicado.
   */
  bloques: Bloque[];
  /**
   * Capacidad declarada de la comision; dato estable, opcional.
   */
  cupo?: {
    /**
     * Cantidad maxima de inscriptos.
     */
    capacidad: number;
  };
  /**
   * Docentes de la comision, como los lista el SGA; puede estar vacio.
   *
   * Items: Nombre del docente, en la forma «Apellido, Nombre».
   */
  docentes: string[];
  /**
   * Identificador opaco de la comision; no se exige orden ni contiguidad.
   */
  id: string;
  /**
   * Inscriptos a una fecha; dato volatil y opcional, separado del cupo.
   */
  ocupacion?: {
    /**
     * Fecha a la que corresponde la ocupacion.
     */
    al: string;
    /**
     * Cantidad de inscriptos al momento de la captura.
     */
    inscriptos: number;
  };
}
/**
 * Un bloque horario: dia, franja, sede, modalidad y aulas.
 */
export interface Bloque {
  /**
   * Aulas del bloque; nunca es enum y admite dos aulas simultaneas.
   *
   * Items: Codigo de aula tal como lo publica el SGA.
   */
  aulas: string[];
  /**
   * Hora de inicio del bloque.
   */
  desde: string;
  /**
   * Dia de la semana, sin acentos; «domingo» entro en el contrato 1.1.0 (61.27 dicta bloques virtuales asincronicos en domingo).
   */
  dia:
    | "lunes"
    | "martes"
    | "miercoles"
    | "jueves"
    | "viernes"
    | "sabado"
    | "domingo";
  /**
   * Hora de fin del bloque.
   */
  hasta: string;
  /**
   * Modalidad del bloque; puede variar entre bloques de una misma comision. «virtual» es virtual sin especificar si es sincronica, tal como lo publica el SGA.
   */
  modalidad:
    | "presencial"
    | "virtual_sincronica"
    | "virtual_asincronica"
    | "virtual"
    | "blended";
  /**
   * Identificador de sede de vocabulario.json; null solo si no es presencial.
   */
  sede: string | null;
}
