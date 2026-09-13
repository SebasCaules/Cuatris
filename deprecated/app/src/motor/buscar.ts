/**
 * Búsqueda de materias por código, nombre, abreviación y docente (13c).
 *
 * El texto se normaliza a minúsculas y sin acentos de los dos lados, para que
 * «algebra» encuentre «Álgebra» y «peña» encuentre «Peña». Los docentes salen
 * de los horarios del período, que es el único lugar donde el SGA los publica
 * (hallazgo 6): sin horarios, la búsqueda por docente no existe.
 */

import type {
  Abreviaciones,
  Codigo,
  Horarios,
  Plan,
} from "../contrato/tipos";

/**
 * Relevancia: cuanto más chico, más arriba. El orden es el del plan de
 * sprints: código exacto > prefijo > abreviación > nombre > docente.
 */
export const RELEVANCIA = {
  codigoExacto: 0,
  prefijo: 1,
  abreviacion: 2,
  nombre: 3,
  docente: 4,
} as const;

/** Minúsculas, sin acentos, sin espacios de más. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** `código → docentes` de todas las comisiones del período. */
export function docentesPorMateria(
  horarios: Horarios,
): Map<Codigo, Set<string>> {
  const salida = new Map<Codigo, Set<string>>();
  for (const curso of horarios.cursos) {
    const docentes = salida.get(curso.codigo) ?? new Set<string>();
    for (const comision of curso.comisiones) {
      for (const docente of comision.docentes) {
        docentes.add(docente);
      }
    }
    salida.set(curso.codigo, docentes);
  }
  return salida;
}

/**
 * Códigos que coinciden con `texto`, ordenados por relevancia y, a igual
 * relevancia, por código.
 *
 * Devuelve todas las materias del plan, vigentes o no: filtrar por vigencia,
 * por ciclo o por oferta es trabajo de los filtros de 13c, no de la búsqueda.
 * Un texto vacío no busca nada.
 */
export function buscar(
  texto: string,
  plan: Plan,
  abreviaciones: Abreviaciones,
  horarios?: Horarios,
): Codigo[] {
  const aguja = normalizar(texto);
  if (aguja === "") {
    return [];
  }
  const docentes = horarios === undefined ? null : docentesPorMateria(horarios);

  const encontrados: { codigo: Codigo; relevancia: number }[] = [];
  for (const materia of plan.materias) {
    const codigo = materia.codigo;
    const nombre = normalizar(materia.nombre);
    const abreviacion = normalizar(abreviaciones.abreviaciones[codigo] ?? "");

    let relevancia: number | null = null;
    if (codigo === aguja) {
      relevancia = RELEVANCIA.codigoExacto;
    } else if (codigo.startsWith(aguja) || nombre.startsWith(aguja)) {
      relevancia = RELEVANCIA.prefijo;
    } else if (abreviacion !== "" && abreviacion.includes(aguja)) {
      relevancia = RELEVANCIA.abreviacion;
    } else if (nombre.includes(aguja)) {
      relevancia = RELEVANCIA.nombre;
    } else if (
      docentes !== null &&
      [...(docentes.get(codigo) ?? [])].some((docente) =>
        normalizar(docente).includes(aguja),
      )
    ) {
      relevancia = RELEVANCIA.docente;
    }

    if (relevancia !== null) {
      encontrados.push({ codigo, relevancia });
    }
  }

  return encontrados
    .sort((uno, otro) => {
      if (uno.relevancia !== otro.relevancia) {
        return uno.relevancia - otro.relevancia;
      }
      return uno.codigo < otro.codigo ? -1 : uno.codigo > otro.codigo ? 1 : 0;
    })
    .map((encontrado) => encontrado.codigo);
}
