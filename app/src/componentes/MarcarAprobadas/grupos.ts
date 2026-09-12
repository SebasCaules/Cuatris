/**
 * Cómo se agrupa y se filtra el plan en la lista de «marcar a mano», y qué
 * correlativas arrastra una materia.
 *
 * Es el hueco del mockup que el plan de sprints resuelve así: «Lista del plan
 * por año/cuatrimestre con casillas; el cuatrimestre sugerido ordena.» Lógica
 * pura, sin React, para poder probarla sola.
 */

import type { Codigo, Materia, Plan } from "../../contrato/tipos";
import { indiceDeMaterias, normalizar } from "../../motor";

/** Un bloque de la lista: las obligatorias de un cuatrimestre, o las electivas. */
export interface Grupo {
  /** Clave estable, `anio-cuatrimestre` o `electivas`. */
  id: string;
  /** Encabezado visible: «Año 2 · Cuatrimestre 1» o «Electivas». */
  titulo: string;
  materias: Materia[];
}

/** Título del grupo de electivas; no tienen cuatrimestre sugerido. */
export const TITULO_ELECTIVAS = "Electivas";

/**
 * Año y cuatrimestre de un `cuatrimestre_sugerido` del plan, que viene contado
 * de corrido (1 a 10): el 3 es el primer cuatrimestre del segundo año.
 */
export function anioYCuatrimestre(sugerido: number): {
  anio: number;
  cuatrimestre: number;
} {
  return {
    anio: Math.floor((sugerido - 1) / 2) + 1,
    cuatrimestre: ((sugerido - 1) % 2) + 1,
  };
}

function tituloDeGrupo(sugerido: number): string {
  const { anio, cuatrimestre } = anioYCuatrimestre(sugerido);
  return `Año ${anio} · Cuatrimestre ${cuatrimestre}`;
}

/** Orden dentro de un grupo: por código, que es estable y se lee rápido. */
function porCodigo(una: Materia, otra: Materia): number {
  return una.codigo.localeCompare(otra.codigo);
}

/**
 * Agrupa las materias vigentes del plan.
 *
 * Las obligatorias van por `cuatrimestre_sugerido` ascendente; las electivas,
 * todas juntas al final. Una obligatoria sin cuatrimestre sugerido —el contrato
 * lo permite— cae en un grupo propio «Sin cuatrimestre sugerido» antes que las
 * electivas: no se la esconde ni se le inventa un año.
 */
export function agrupar(plan: Plan): Grupo[] {
  const porSugerido = new Map<number, Materia[]>();
  const sinSugerido: Materia[] = [];
  const electivas: Materia[] = [];

  for (const materia of plan.materias) {
    if (!materia.vigente) {
      continue;
    }
    if (materia.ciclo === "electiva") {
      electivas.push(materia);
      continue;
    }
    const sugerido = materia.cuatrimestre_sugerido;
    if (typeof sugerido !== "number") {
      sinSugerido.push(materia);
      continue;
    }
    const lista = porSugerido.get(sugerido) ?? [];
    lista.push(materia);
    porSugerido.set(sugerido, lista);
  }

  const grupos: Grupo[] = [...porSugerido.keys()]
    .sort((una, otra) => una - otra)
    .map((sugerido) => {
      const { anio, cuatrimestre } = anioYCuatrimestre(sugerido);
      return {
        id: `${anio}-${cuatrimestre}`,
        titulo: tituloDeGrupo(sugerido),
        materias: (porSugerido.get(sugerido) ?? []).sort(porCodigo),
      };
    });

  if (sinSugerido.length > 0) {
    grupos.push({
      id: "sin-cuatrimestre",
      titulo: "Sin cuatrimestre sugerido",
      materias: sinSugerido.sort(porCodigo),
    });
  }
  if (electivas.length > 0) {
    grupos.push({
      id: "electivas",
      titulo: TITULO_ELECTIVAS,
      materias: electivas.sort(porCodigo),
    });
  }
  return grupos;
}

/**
 * Deja solo las materias que coinciden con el texto, y descarta los grupos que
 * quedan vacíos. Un texto vacío no filtra nada.
 *
 * Busca por código y por nombre, normalizando los dos lados como el motor, para
 * que «algebra» encuentre «Álgebra».
 */
export function filtrar(grupos: Grupo[], texto: string): Grupo[] {
  const aguja = normalizar(texto);
  if (aguja === "") {
    return grupos;
  }
  return grupos
    .map((grupo) => ({
      ...grupo,
      materias: grupo.materias.filter(
        (materia) =>
          materia.codigo.includes(aguja) ||
          normalizar(materia.nombre).includes(aguja),
      ),
    }))
    .filter((grupo) => grupo.materias.length > 0);
}

/**
 * Correlativas de `codigo` que todavía no están marcadas, en cadena.
 *
 * Se recorre el árbol entero: marcar Programación Imperativa sin marcar Álgebra
 * dejaría un plan que no se sostiene. Nunca se marcan solas —eso lo decide el
 * usuario con el enlace de la fila—: esta función solo dice cuáles son.
 *
 * Devuelve los códigos ordenados y sin repetir; un código que no está en el
 * plan se ignora, porque no se le puede pedir nada.
 */
export function correlativasSinMarcar(
  codigo: Codigo,
  plan: Plan,
  marcadas: ReadonlySet<Codigo>,
): Codigo[] {
  const materias = indiceDeMaterias(plan);
  const salida = new Set<Codigo>();
  // `vistos` es aparte de `salida`: una correlativa ya marcada no entra en la
  // salida pero sí se visita, y sin registrarla un ciclo del plan colgaría.
  const vistos = new Set<Codigo>([codigo]);
  const pendientes = [...(materias.get(codigo)?.correlativas ?? [])];

  while (pendientes.length > 0) {
    const actual = pendientes.pop();
    if (actual === undefined || vistos.has(actual)) {
      continue;
    }
    vistos.add(actual);
    const materia = materias.get(actual);
    if (materia === undefined) {
      continue;
    }
    if (!marcadas.has(actual)) {
      salida.add(actual);
    }
    pendientes.push(...materia.correlativas);
  }

  return [...salida].sort();
}
