/**
 * El año 1 del plan, para el muestrario y para las pruebas de la tarjeta.
 *
 * **Nada de esto está inventado**: las nueve materias son las de
 * `data/v1/planes/S10-Rev23.json` con `cuatrimestre_sugerido` 1 y 2, en el
 * orden del archivo. `ejemplo.test.ts` las compara contra el plan real, así
 * que si el plan cambia rompe acá y no envejece en silencio.
 *
 * Está transcrito en vez de importado por la misma razón que
 * `GrillaSemanal/ejemplo.ts`: el muestrario se sirve con Vite y un `import`
 * del plan metería los datos en el bundle de la aplicación, que los baja por
 * red en tiempo de ejecución.
 */

import type { Materia } from "../../contrato/tipos";
import type { ColumnaDelPlan } from "./ColumnaCuatrimestre";

function basica(
  codigo: string,
  nombre: string,
  creditos: number,
  correlativas: string[],
  cuatrimestre_sugerido: number,
): Materia {
  return {
    codigo,
    nombre,
    creditos,
    ciclo: "basico",
    correlativas,
    creditos_requeridos: 0,
    cuatrimestre_sugerido,
    minors: [],
    vigente: true,
  };
}

/** Las cinco del 1.º cuatrimestre del año 1. */
export const PRIMER_CUATRIMESTRE: Materia[] = [
  basica("31.08", "Sistemas de Representación", 3, [], 1),
  basica("72.03", "Introducción a la Informática", 3, [], 1),
  basica("93.26", "Análisis Matemático I", 6, [], 1),
  basica("93.58", "Álgebra", 9, [], 1),
  basica("94.24", "Metodología del Aprendizaje", 3, [], 1),
];

/** Las cuatro del 2.º cuatrimestre del año 1. */
export const SEGUNDO_CUATRIMESTRE: Materia[] = [
  basica("72.31", "Programación Imperativa", 9, ["93.58", "72.03"], 2),
  basica("93.28", "Análisis Matemático II", 6, ["93.58", "93.26"], 2),
  basica("93.41", "Física I", 6, ["93.26"], 2),
  basica("93.59", "Matemática Discreta", 6, ["93.58"], 2),
];

/** Las dos columnas del año 1, listas para `TarjetaAnio`. */
export const COLUMNAS_ANIO_1: ColumnaDelPlan[] = [
  {
    id: "1-1",
    rotulo: "1.º CUATRIMESTRE",
    nombre: "1.º cuatrimestre de Año 1",
    materias: PRIMER_CUATRIMESTRE,
  },
  {
    id: "1-2",
    rotulo: "2.º CUATRIMESTRE",
    nombre: "2.º cuatrimestre de Año 1",
    materias: SEGUNDO_CUATRIMESTRE,
  },
];
