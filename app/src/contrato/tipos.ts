/**
 * Tipos del contrato de datos v1.
 *
 * **Un solo origen de verdad**: las formas salen de `schemas/v1/*.schema.json`
 * por `npm run tipos` (que `typecheck` y `build` corren antes) y aterrizan en
 * `./generado/`. Este archivo solo les pone los nombres que usa la aplicación
 * y agrega lo que no viene de un schema: los alias documentados de los strings
 * con patrón (`Codigo`, `Fecha`, …) y el estado del usuario (`PlanUsuario`),
 * que vive en el navegador y no es parte del contrato de datos.
 *
 * Si el schema cambia, la aplicación no compila hasta adaptarse. Eso es lo que
 * se busca: no hay copia a mano que se pueda olvidar de actualizar.
 */

import type { AbreviacionesDeMaterias } from "./generado/abreviaciones";
import type {
  Bloque as BloqueGenerado,
  Comision as ComisionGenerada,
  Curso as CursoGenerado,
  HorariosDeUnPeriodo,
} from "./generado/horarios";
import type { ArchivoUnico, IndiceDeDatos } from "./generado/index";
import type {
  Ciclo as CicloGenerado,
  Materia as MateriaGenerada,
  Minor as MinorGenerado,
  PlanDeEstudios,
  SiglaMinor,
  Titulo as TituloGenerado,
} from "./generado/planes";
import type { VocabularioControlado } from "./generado/vocabulario";

/* ------------------------------------------------------------------ */
/* Alias de los strings con patrón                                      */
/*                                                                      */
/* Los schemas los expresan con `pattern`, que TypeScript no sabe       */
/* representar: quedan como `string`. Los alias no agregan seguridad,   */
/* documentan qué forma tiene el valor donde aparece.                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* §1 — data/v1/horarios/<periodo>.json                                 */
/* ------------------------------------------------------------------ */

export type Horarios = HorariosDeUnPeriodo;
export type Curso = CursoGenerado;
export type Comision = ComisionGenerada;
export type Bloque = BloqueGenerado;

/** Cuatrimestre al que pertenece el archivo de horarios. */
export type Periodo = Horarios["periodo"];
/** De dónde salieron los datos y cuándo se capturaron. */
export type Fuente = Horarios["fuente"];
/** Capacidad declarada de la comisión; dato estable. */
export type Cupo = NonNullable<Comision["cupo"]>;
/** Inscriptos a una fecha; dato volátil. */
export type Ocupacion = NonNullable<Comision["ocupacion"]>;

export type Cuatrimestre = Periodo["cuatrimestre"];
/** Sin acentos; `domingo` entró con el contrato 1.1.0 (61.27 dicta ahí). */
export type Dia = Bloque["dia"];
export type Modalidad = Bloque["modalidad"];
export type SistemaFuente = Fuente["sistema"];

/* ------------------------------------------------------------------ */
/* §2 — data/v1/planes/S10-Rev23.json                                   */
/* ------------------------------------------------------------------ */

export type Plan = PlanDeEstudios;
export type Materia = MateriaGenerada;
export type Minor = MinorGenerado;
export type Titulo = TituloGenerado;
export type Ciclo = CicloGenerado;
export type TipoTitulo = Titulo["tipo"];
/** Sigla de un minor declarado en `minors[]`, `^[A-Z]{2,4}$`. */
export type Sigla = SiglaMinor;
/** Exigencia global de electivas del plan. */
export type Electivas = Plan["electivas"];

/* ------------------------------------------------------------------ */
/* §3 y §4 — abreviaciones.json y vocabulario.json                      */
/* ------------------------------------------------------------------ */

export type Abreviaciones = AbreviacionesDeMaterias;
export type Vocabulario = VocabularioControlado;
/** Una sede del ITBA; su `id` es lo que va en `bloques[].sede`. */
export type Sede = Vocabulario["sedes"][number];

/* ------------------------------------------------------------------ */
/* §5 — data/index.json                                                 */
/* ------------------------------------------------------------------ */

export type Indice = IndiceDeDatos;
/** Un archivo único del contrato, con su ruta y su hash. */
export type EntradaArchivo = ArchivoUnico;
/** Un plan publicado. */
export type EntradaPlan = Indice["planes"][number];
/** Un período de horarios publicado; publicar no es activar. */
export type EntradaHorarios = Indice["horarios"][number];

/* ------------------------------------------------------------------ */
/* §6 — estado del usuario (no es parte del contrato de datos)          */
/*                                                                      */
/* No sale de ningún schema: vive en el navegador, se versiona aparte   */
/* (`version: 1`) y se migra con código explícito.                      */
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
