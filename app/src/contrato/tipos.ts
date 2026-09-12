/**
 * Tipos del contrato de datos v1.
 *
 * Escritos a mano a partir de `entregables/sprint-1/CONTRATO-v1.md` (§1–§6).
 * PROVISIONAL: en la Ola 2 estos tipos se generan desde `schemas/v1/*.json`
 * con `json-schema-to-typescript` y este archivo pasa a ser el resultado
 * generado. Hasta entonces, cualquier cambio del contrato se copia acá a mano.
 */

/** Código de materia, `^\d{2}\.\d{2}$` (por ejemplo `"93.18"`). */
export type Codigo = string;
/** Identificador de período, `^\d{4}-[12]C$` (por ejemplo `"2026-2C"`). */
export type PeriodoId = string;
/** Fecha `YYYY-MM-DD`, sin hora. */
export type Fecha = string;
/** Hora `HH:MM` de 24 h. */
export type Hora = string;
/** `sha256:` + hex del contenido canónico del archivo. */
export type Hash = string;

export type Cuatrimestre = "1C" | "2C";

/** Sin acentos; `domingo` no existe en el contrato. */
export type Dia =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado";

export type Modalidad =
  | "presencial"
  | "virtual_sincronica"
  | "virtual_asincronica"
  | "blended";

export type Ciclo = "basico" | "profesional" | "electiva";

export type TipoTitulo = "intermedio" | "principal";

export type SistemaFuente = "sga" | "manual";

/* ------------------------------------------------------------------ */
/* §1 — data/v1/horarios/<periodo>.json                                 */
/* ------------------------------------------------------------------ */

export interface Bloque {
  dia: Dia;
  desde: Hora;
  hasta: Hora;
  /** Id de `vocabulario.json`; `null` solo si la modalidad no es presencial. */
  sede: string | null;
  modalidad: Modalidad;
  /** Requerido, puede ser `[]`; dos aulas simultáneas es válido. Nunca enum. */
  aulas: string[];
}

/** Estable. */
export interface Cupo {
  capacidad: number;
}

/** Volátil. */
export interface Ocupacion {
  inscriptos: number;
  al: Fecha;
}

export interface Comision {
  /** `^[A-Z0-9]{1,4}$`; opaco, único por curso. Sin orden garantizado. */
  id: string;
  cupo?: Cupo;
  ocupacion?: Ocupacion;
  /** Requerido, puede ser `[]`. */
  docentes: string[];
  bloques: Bloque[];
}

export interface Curso {
  codigo: Codigo;
  nombre: string;
  /** Tal como lo muestra el SGA. */
  departamento?: string;
  desde: Fecha;
  hasta: Fecha;
  /** Requerido, puede ser `[]`. */
  dictado_conjunto: Codigo[];
  comisiones: Comision[];
}

export interface Periodo {
  id: PeriodoId;
  anio: number;
  cuatrimestre: Cuatrimestre;
  desde: Fecha;
  hasta: Fecha;
}

export interface Fuente {
  sistema: SistemaFuente;
  capturado: Fecha;
}

export interface Horarios {
  contrato: string;
  periodo: Periodo;
  fuente: Fuente;
  cursos: Curso[];
}

/* ------------------------------------------------------------------ */
/* §2 — data/v1/planes/S10-Rev23.json                                   */
/* ------------------------------------------------------------------ */

export interface Titulo {
  id: string;
  nombre: string;
  tipo: TipoTitulo;
  creditos: number;
  /** El título exige todos los ítems de esos ciclos aprobados. */
  requiere_ciclos?: Ciclo[];
  /** Créditos de electivas aprobadas. */
  requiere_electivas?: number;
}

export interface Electivas {
  creditos_requeridos: number;
}

export interface Minor {
  sigla: string;
  nombre: string;
  creditos_minimos: number;
}

export interface Materia {
  codigo: Codigo;
  nombre: string;
  creditos: number;
  ciclo: Ciclo;
  /** 1–10 para obligatorias, `null` para electivas. */
  cuatrimestre_sugerido: number | null;
  /** Créditos aprobados necesarios para cursarla. */
  creditos_requeridos: number;
  correlativas: Codigo[];
  /** Siglas de `minors[]`; vacío para obligatorias. */
  minors: string[];
  vigente: boolean;
}

export interface Plan {
  contrato: string;
  plan: string;
  carrera: string;
  titulos: Titulo[];
  electivas: Electivas;
  minors: Minor[];
  materias: Materia[];
}

/* ------------------------------------------------------------------ */
/* §3 y §4 — abreviaciones.json y vocabulario.json                      */
/* ------------------------------------------------------------------ */

export interface Abreviaciones {
  contrato: string;
  /** Código → abreviación de 1 a 24 caracteres, únicas. */
  abreviaciones: Record<Codigo, string>;
}

export interface Sede {
  /** `^[a-z0-9_]+$`; es lo que va en `bloques[].sede`. */
  id: string;
  nombre: string;
}

export interface Vocabulario {
  contrato: string;
  sedes: Sede[];
}

/* ------------------------------------------------------------------ */
/* §5 — data/index.json                                                 */
/* ------------------------------------------------------------------ */

export interface EntradaArchivo {
  archivo: string;
  hash: Hash;
}

export interface EntradaPlan extends EntradaArchivo {
  plan: string;
}

export interface EntradaHorarios extends EntradaArchivo {
  periodo: PeriodoId;
  publicado: Fecha;
  desde: Fecha;
  hasta: Fecha;
}

export interface Indice {
  contrato: string;
  actualizado: Fecha;
  planes: EntradaPlan[];
  abreviaciones: EntradaArchivo;
  vocabulario: EntradaArchivo;
  horarios: EntradaHorarios[];
  /** `periodo → "YYYY-MM"`, curado a mano. */
  horarios_esperados?: Record<PeriodoId, string>;
}

/* ------------------------------------------------------------------ */
/* §6 — estado del usuario (no es parte del contrato de datos)          */
/* ------------------------------------------------------------------ */

export type EstadoHistoria = "aprobada" | "regular" | "cursando";

export interface EntradaHistoria {
  estado: EstadoHistoria;
}

export interface MateriaPlanificada {
  codigo: Codigo;
  comision?: string;
}

export interface Sugerencia {
  issue: number;
  fecha: Fecha;
}

/** Cuántas tarjetas de cuatrimestre se ven a la vez en el carrusel. */
export type Visibles = 1 | 2 | 3;

export interface Preferencias {
  visibles: Visibles;
}

export interface PlanUsuario {
  version: 1;
  plan: "S10-Rev23";
  historia: Record<Codigo, EntradaHistoria>;
  periodos: Record<PeriodoId, MateriaPlanificada[]>;
  /** Índice 0–9 en la paleta, por orden de agregado. */
  colores: Record<Codigo, number>;
  sugerencias: Sugerencia[];
  preferencias: Preferencias;
}
