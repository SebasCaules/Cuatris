/**
 * Cómo se arma el plan de estudios de R1 a partir del plan publicado.
 *
 * Lógica pura, sin React, para poder probarla sola contra
 * `data/v1/planes/S10-Rev23.json`. Acá no se decide nada de aspecto: se
 * ordenan las materias en años y cuatrimestres, se separan las electivas y se
 * filtra la búsqueda.
 */

import type {
  Abreviaciones,
  Ciclo,
  Codigo,
  EntradaHistoria,
  Materia,
  Plan,
} from "../../contrato/tipos";
import type { ColumnaDelPlan } from "../../componentes/TarjetaAnio";
import { normalizar } from "../../motor";

export type Historia = Record<Codigo, EntradaHistoria>;

/** Un año del plan con sus dos cuatrimestres. */
export interface AnioDelPlan {
  anio: number;
  /** «Año 1». */
  titulo: string;
  /** «CICLO BÁSICO», o los dos ciclos separados por «·» si el año los mezcla. */
  ciclo: string;
  columnas: ColumnaDelPlan[];
}

/** Cómo se rotula cada ciclo del contrato en la cabecera del año. */
export const ROTULO_CICLO: Record<Ciclo, string> = {
  basico: "CICLO BÁSICO",
  profesional: "CICLO PROFESIONAL",
  electiva: "ELECTIVA",
};

/** Orden en que se nombran los ciclos cuando un año mezcla dos. */
const ORDEN_CICLOS: readonly Ciclo[] = ["basico", "profesional", "electiva"];

/**
 * Año y cuatrimestre de un `cuatrimestre_sugerido`, que el plan cuenta de
 * corrido (1 a 10): año = ⌈n/2⌉, y el impar es el 1.º cuatrimestre.
 */
export function anioYCuatrimestre(sugerido: number): {
  anio: number;
  cuatrimestre: 1 | 2;
} {
  return {
    anio: Math.ceil(sugerido / 2),
    cuatrimestre: sugerido % 2 === 1 ? 1 : 2,
  };
}

/**
 * ¿Esta materia se muestra?
 *
 * Una materia que ya no se dicta (`vigente: false`) solo aparece si el usuario
 * la tiene en su historia: esconderla le borraría de la pantalla algo que
 * aprobó, y listarla siempre llenaría el plan de materias que nadie puede
 * cursar.
 */
export function seMuestra(materia: Materia, historia: Historia): boolean {
  return materia.vigente || historia[materia.codigo] !== undefined;
}

function rotuloDeCiclos(materias: readonly Materia[]): string {
  const presentes = new Set(materias.map((materia) => materia.ciclo));
  return ORDEN_CICLOS.filter((ciclo) => presentes.has(ciclo))
    .map((ciclo) => ROTULO_CICLO[ciclo])
    .join(" · ");
}

/**
 * Los años del plan, de 1 en adelante, con sus dos columnas.
 *
 * El orden dentro de cada cuatrimestre es **el del archivo del plan**: es el
 * orden en el que el ITBA los publica y el que el estudiante reconoce; no se
 * reordena por código ni por nombre.
 *
 * Una obligatoria sin `cuatrimestre_sugerido` —el contrato lo permite, aunque
 * hoy no hay ninguna— no se esconde ni se le inventa un año: cae en una tarjeta
 * final propia, con una sola columna.
 */
export function aniosDelPlan(
  plan: Plan,
  historia: Historia,
): { anios: AnioDelPlan[]; sinCuatrimestre: AnioDelPlan | null } {
  const porAnio = new Map<number, Map<1 | 2, Materia[]>>();
  const sueltas: Materia[] = [];

  for (const materia of plan.materias) {
    if (materia.ciclo === "electiva" || !seMuestra(materia, historia)) {
      continue;
    }
    const sugerido = materia.cuatrimestre_sugerido;
    if (typeof sugerido !== "number") {
      sueltas.push(materia);
      continue;
    }
    const { anio, cuatrimestre } = anioYCuatrimestre(sugerido);
    const columnas = porAnio.get(anio) ?? new Map<1 | 2, Materia[]>();
    const lista = columnas.get(cuatrimestre) ?? [];
    lista.push(materia);
    columnas.set(cuatrimestre, lista);
    porAnio.set(anio, columnas);
  }

  const anios = [...porAnio.keys()]
    .sort((uno, otro) => uno - otro)
    .map((anio): AnioDelPlan => {
      const titulo = `Año ${anio}`;
      const columnas = porAnio.get(anio) ?? new Map<1 | 2, Materia[]>();
      const materias = [1, 2].flatMap(
        (cuatrimestre) => columnas.get(cuatrimestre as 1 | 2) ?? [],
      );
      return {
        anio,
        titulo,
        ciclo: rotuloDeCiclos(materias),
        columnas: ([1, 2] as const)
          .filter((cuatrimestre) => columnas.has(cuatrimestre))
          .map((cuatrimestre) => ({
            id: `${anio}-${cuatrimestre}`,
            rotulo: `${cuatrimestre}.º CUATRIMESTRE`,
            nombre: `${cuatrimestre}.º cuatrimestre de ${titulo}`,
            materias: columnas.get(cuatrimestre) ?? [],
          })),
      };
    });

  const sinCuatrimestre: AnioDelPlan | null =
    sueltas.length === 0
      ? null
      : {
          anio: 0,
          titulo: "Sin cuatrimestre sugerido",
          ciclo: rotuloDeCiclos(sueltas),
          columnas: [
            {
              id: "sin-cuatrimestre",
              rotulo: "SIN CUATRIMESTRE SUGERIDO",
              nombre: "las materias sin cuatrimestre sugerido",
              materias: sueltas,
            },
          ],
        };

  return { anios, sinCuatrimestre };
}

/**
 * Las electivas que se muestran, por nombre.
 *
 * Alfabético y no por código: en una lista de más de ochenta materias que no
 * tienen orden sugerido, el nombre es lo único por lo que se las busca.
 */
export function electivasDelPlan(plan: Plan, historia: Historia): Materia[] {
  return plan.materias
    .filter(
      (materia) =>
        materia.ciclo === "electiva" && seMuestra(materia, historia),
    )
    .sort((una, otra) => una.nombre.localeCompare(otra.nombre, "es"));
}

/**
 * Filtra por código, nombre o abreviación, normalizando los dos lados como el
 * motor: así «cripto» encuentra «Criptografía» y «algebra» encuentra «Álgebra».
 * Un texto vacío no filtra nada.
 */
export function filtrarElectivas(
  materias: readonly Materia[],
  texto: string,
  abreviaciones: Abreviaciones,
): Materia[] {
  const aguja = normalizar(texto);
  if (aguja === "") {
    return [...materias];
  }
  return materias.filter((materia) => {
    const abreviacion = abreviaciones.abreviaciones[materia.codigo] ?? "";
    return (
      materia.codigo.includes(aguja) ||
      normalizar(materia.nombre).includes(aguja) ||
      normalizar(abreviacion).includes(aguja)
    );
  });
}
