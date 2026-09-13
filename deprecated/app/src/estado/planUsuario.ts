/**
 * `PlanUsuario`: el único documento de estado del usuario (CONTRATO-v1 §6).
 *
 * Vive en el navegador, sin cuenta ni servidor. Este módulo es TypeScript puro
 * —sin React y sin `localStorage`— para poder probarlo entero.
 */

import type {
  Codigo,
  EntradaHistoria,
  EstadoHistoria,
  MateriaPlanificada,
  PeriodoId,
  PlanUsuario,
  Sugerencia,
  Visibles,
} from "../contrato/tipos";

/** Plan de estudios que esta versión de la aplicación sabe planificar. */
export const PLAN_SOPORTADO = "S10-Rev23";
/** Versión de forma del documento guardado. */
export const VERSION_ACTUAL = 1;
/** Cantidad de colores de materia de la paleta (`--materia-0…11`, DESIGN.md §5). */
export const COLORES_DISPONIBLES = 12;

const CODIGO = /^\d{2}\.\d{2}$/;
const PERIODO = /^\d{4}-[12]C$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const COMISION = /^[A-Z0-9]{1,4}$/;
const ESTADOS_HISTORIA: readonly EstadoHistoria[] = [
  "aprobada",
  "regular",
  "cursando",
];

/** El texto guardado o importado no es un `PlanUsuario` que se pueda usar. */
export class PlanUsuarioCorrupto extends Error {
  /** Qué parte del documento falló, en notación de ruta. */
  readonly donde: string;

  constructor(donde: string, motivo: string) {
    super(`El plan guardado no se puede leer (${donde}): ${motivo}`);
    this.name = "PlanUsuarioCorrupto";
    this.donde = donde;
  }
}

/** Documento vacío: es lo que ve alguien que entra por primera vez. */
export function planUsuarioInicial(): PlanUsuario {
  return {
    version: VERSION_ACTUAL,
    plan: PLAN_SOPORTADO,
    historia: {},
    periodos: {},
    colores: {},
    sugerencias: [],
    preferencias: { visibles: 2 },
  };
}

/* ------------------------------------------------------------------ */
/* Validación y migración                                              */
/* ------------------------------------------------------------------ */

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function exigirObjeto(
  valor: unknown,
  donde: string,
): Record<string, unknown> {
  if (!esObjeto(valor)) {
    throw new PlanUsuarioCorrupto(donde, "se esperaba un objeto");
  }
  return valor;
}

function exigirArray(valor: unknown, donde: string): unknown[] {
  if (!Array.isArray(valor)) {
    throw new PlanUsuarioCorrupto(donde, "se esperaba una lista");
  }
  return valor;
}

function exigirTexto(valor: unknown, donde: string, patron?: RegExp): string {
  if (typeof valor !== "string") {
    throw new PlanUsuarioCorrupto(donde, "se esperaba un texto");
  }
  if (patron !== undefined && !patron.test(valor)) {
    throw new PlanUsuarioCorrupto(
      donde,
      `${JSON.stringify(valor)} no cumple ${patron.source}`,
    );
  }
  return valor;
}

function exigirEntero(valor: unknown, donde: string): number {
  if (typeof valor !== "number" || !Number.isInteger(valor)) {
    throw new PlanUsuarioCorrupto(donde, "se esperaba un entero");
  }
  return valor;
}

function validarHistoria(
  crudo: unknown,
): Record<Codigo, EntradaHistoria> {
  const objeto = exigirObjeto(crudo, "historia");
  const salida: Record<Codigo, EntradaHistoria> = {};
  for (const [codigo, entrada] of Object.entries(objeto)) {
    exigirTexto(codigo, "historia (clave)", CODIGO);
    const campos = exigirObjeto(entrada, `historia.${codigo}`);
    const estado = campos["estado"];
    if (
      typeof estado !== "string" ||
      !ESTADOS_HISTORIA.includes(estado as EstadoHistoria)
    ) {
      throw new PlanUsuarioCorrupto(
        `historia.${codigo}.estado`,
        `estado desconocido: ${JSON.stringify(estado)}`,
      );
    }
    salida[codigo] = { estado: estado as EstadoHistoria };
  }
  return salida;
}

function validarPeriodos(
  crudo: unknown,
): Record<PeriodoId, MateriaPlanificada[]> {
  const objeto = exigirObjeto(crudo, "periodos");
  const salida: Record<PeriodoId, MateriaPlanificada[]> = {};
  for (const [periodo, lista] of Object.entries(objeto)) {
    exigirTexto(periodo, "periodos (clave)", PERIODO);
    const elementos = exigirArray(lista, `periodos.${periodo}`);
    salida[periodo] = elementos.map((elemento, indice) => {
      const donde = `periodos.${periodo}[${indice}]`;
      const campos = exigirObjeto(elemento, donde);
      const codigo = exigirTexto(campos["codigo"], `${donde}.codigo`, CODIGO);
      const comision = campos["comision"];
      if (comision === undefined) {
        return { codigo };
      }
      return {
        codigo,
        comision: exigirTexto(comision, `${donde}.comision`, COMISION),
      };
    });
  }
  return salida;
}

function validarColores(crudo: unknown): Record<Codigo, number> {
  const objeto = exigirObjeto(crudo, "colores");
  const salida: Record<Codigo, number> = {};
  for (const [codigo, indice] of Object.entries(objeto)) {
    exigirTexto(codigo, "colores (clave)", CODIGO);
    const valor = exigirEntero(indice, `colores.${codigo}`);
    if (valor < 0 || valor >= COLORES_DISPONIBLES) {
      throw new PlanUsuarioCorrupto(
        `colores.${codigo}`,
        `fuera de 0–${COLORES_DISPONIBLES - 1}: ${valor}`,
      );
    }
    salida[codigo] = valor;
  }
  return salida;
}

function validarSugerencias(crudo: unknown): Sugerencia[] {
  return exigirArray(crudo, "sugerencias").map((elemento, indice) => {
    const donde = `sugerencias[${indice}]`;
    const campos = exigirObjeto(elemento, donde);
    return {
      issue: exigirEntero(campos["issue"], `${donde}.issue`),
      fecha: exigirTexto(campos["fecha"], `${donde}.fecha`, FECHA),
    };
  });
}

function validarPreferencias(crudo: unknown): { visibles: Visibles } {
  const objeto = exigirObjeto(crudo, "preferencias");
  const visibles = exigirEntero(objeto["visibles"], "preferencias.visibles");
  if (visibles !== 1 && visibles !== 2 && visibles !== 3) {
    throw new PlanUsuarioCorrupto(
      "preferencias.visibles",
      `se esperaba 1, 2 o 3: ${visibles}`,
    );
  }
  return { visibles };
}

/**
 * Lleva un documento desconocido a la forma actual de `PlanUsuario`.
 *
 * Valida forma y versión. Si algo no cuadra lanza `PlanUsuarioCorrupto`: quien
 * llama decide qué hacer, pero **nunca se borra el original** (ver
 * `almacenamiento.ts`). Cuando exista una `version: 2` la migración explícita
 * va acá, encadenada desde la 1.
 */
export function migrar(desconocido: unknown): PlanUsuario {
  const objeto = exigirObjeto(desconocido, "raiz");

  const version = objeto["version"];
  if (version !== VERSION_ACTUAL) {
    throw new PlanUsuarioCorrupto(
      "version",
      `no hay migración desde ${JSON.stringify(version)} hacia ` +
        `${VERSION_ACTUAL}`,
    );
  }

  const plan = objeto["plan"];
  if (plan !== PLAN_SOPORTADO) {
    throw new PlanUsuarioCorrupto(
      "plan",
      `esta versión solo planifica ${PLAN_SOPORTADO}, y el documento dice ` +
        `${JSON.stringify(plan)}`,
    );
  }

  return {
    version: VERSION_ACTUAL,
    plan: PLAN_SOPORTADO,
    historia: validarHistoria(objeto["historia"]),
    periodos: validarPeriodos(objeto["periodos"]),
    colores: validarColores(objeto["colores"]),
    sugerencias: validarSugerencias(objeto["sugerencias"]),
    preferencias: validarPreferencias(objeto["preferencias"]),
  };
}

/* ------------------------------------------------------------------ */
/* Exportar e importar                                                 */
/* ------------------------------------------------------------------ */

function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(canonizar);
  }
  if (esObjeto(valor)) {
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(valor).sort()) {
      salida[clave] = canonizar(valor[clave]);
    }
    return salida;
  }
  return valor;
}

/**
 * JSON canónico, con la misma convención que los archivos de datos: claves
 * ordenadas, dos espacios de sangría, sin escapar caracteres no ASCII y con
 * salto de línea final.
 */
export function exportar(plan: PlanUsuario): string {
  return `${JSON.stringify(canonizar(plan), null, 2)}\n`;
}

/** Lee un documento exportado. Lanza `PlanUsuarioCorrupto` si no sirve. */
export function importar(texto: string): PlanUsuario {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto) as unknown;
  } catch (error) {
    throw new PlanUsuarioCorrupto(
      "raiz",
      error instanceof Error ? error.message : "no es JSON válido",
    );
  }
  return migrar(crudo);
}

/* ------------------------------------------------------------------ */
/* Acciones y reductor                                                 */
/* ------------------------------------------------------------------ */

export type AccionPlan =
  | { tipo: "cargarHistoria"; historia: Record<Codigo, EntradaHistoria> }
  /**
   * Estado de una materia en la historia. `null` borra la entrada: «pendiente»
   * no es un estado guardado, es la ausencia de entrada (R1).
   */
  | { tipo: "marcarEstado"; codigo: Codigo; estado: EstadoHistoria | null }
  /** Lo mismo para varias materias, en una sola transición (marcar un año). */
  | {
      tipo: "marcarVarias";
      codigos: readonly Codigo[];
      estado: EstadoHistoria | null;
    }
  /** Alias histórico de `marcarEstado` con `"aprobada"`. */
  | { tipo: "marcarAprobada"; codigo: Codigo }
  | { tipo: "agregarMateria"; periodo: PeriodoId; codigo: Codigo }
  /**
   * Varias materias en varios períodos de una sola vez (la autocolocación de
   * troncales). Una colocación cuyo código ya está en su período se saltea,
   * igual que en `agregarMateria`.
   */
  | { tipo: "agregarVarias"; colocaciones: readonly Colocacion[] }
  | { tipo: "quitarMateria"; periodo: PeriodoId; codigo: Codigo }
  | {
      tipo: "elegirComision";
      periodo: PeriodoId;
      codigo: Codigo;
      comision: string;
    }
  | { tipo: "moverMateria"; desde: PeriodoId; hacia: PeriodoId; codigo: Codigo }
  | { tipo: "asignarColor"; codigo: Codigo }
  | { tipo: "setVisibles"; visibles: Visibles }
  | { tipo: "reemplazar"; plan: PlanUsuario };

/** Una materia puesta en un período; lo que produce la autocolocación. */
export interface Colocacion {
  periodo: PeriodoId;
  codigo: Codigo;
}

/**
 * Color de una materia: el que ya tenga, o el siguiente por orden de agregado.
 * Con más de doce materias la paleta se recicla (0–11, cíclico).
 */
export function colorAsignado(
  colores: Record<Codigo, number>,
  codigo: Codigo,
): number {
  const existente = colores[codigo];
  if (existente !== undefined) {
    return existente;
  }
  return Object.keys(colores).length % COLORES_DISPONIBLES;
}

function conColor(
  colores: Record<Codigo, number>,
  codigo: Codigo,
): Record<Codigo, number> {
  if (colores[codigo] !== undefined) {
    return colores;
  }
  return { ...colores, [codigo]: colorAsignado(colores, codigo) };
}

function sinMateria(
  periodos: Record<PeriodoId, MateriaPlanificada[]>,
  periodo: PeriodoId,
  codigo: Codigo,
): Record<PeriodoId, MateriaPlanificada[]> {
  const lista = periodos[periodo];
  if (lista === undefined) {
    return periodos;
  }
  return {
    ...periodos,
    [periodo]: lista.filter((materia) => materia.codigo !== codigo),
  };
}

/**
 * Los mismos períodos sin `codigo` en ninguno. Si no estaba en ninguna parte
 * devuelve el objeto original, para no forzar re-render de balde.
 */
function sinMateriaEnTodos(
  periodos: Record<PeriodoId, MateriaPlanificada[]>,
  codigo: Codigo,
): Record<PeriodoId, MateriaPlanificada[]> {
  let cambio = false;
  const salida: Record<PeriodoId, MateriaPlanificada[]> = {};
  for (const [periodo, lista] of Object.entries(periodos)) {
    const filtrada = lista.filter((materia) => materia.codigo !== codigo);
    if (filtrada.length !== lista.length) {
      cambio = true;
    }
    salida[periodo] = filtrada;
  }
  return cambio ? salida : periodos;
}

/**
 * Historia y períodos con `codigos` puestos en `nuevo`.
 *
 * Dos reglas que valen para las tres acciones de marcado:
 *
 * - **`null` borra la entrada.** «Pendiente» no se guarda; una materia sin
 *   entrada es una materia pendiente, y así un plan exportado no arrastra
 *   filas que no dicen nada.
 * - **Pasar a `"aprobada"` la saca de todos los períodos planificados**
 *   (N0-19): una materia aprobada no se vuelve a cursar, y dejarla en la
 *   grilla la hacía chocar y sumar créditos contra sí misma. El color no se
 *   libera: identifica a la materia para toda la carrera.
 *
 * `"regular"` y `"cursando"` **no** limpian los períodos: una materia que se
 * está cursando, o a la que le falta el final, sigue ocupando su lugar.
 */
function conEstado(
  estado: PlanUsuario,
  codigos: readonly Codigo[],
  nuevo: EstadoHistoria | null,
): PlanUsuario {
  if (codigos.length === 0) {
    return estado;
  }
  const historia = { ...estado.historia };
  for (const codigo of codigos) {
    if (nuevo === null) {
      delete historia[codigo];
    } else {
      historia[codigo] = { estado: nuevo };
    }
  }
  let periodos = estado.periodos;
  if (nuevo === "aprobada") {
    for (const codigo of codigos) {
      periodos = sinMateriaEnTodos(periodos, codigo);
    }
  }
  return { ...estado, historia, periodos };
}

export function reducir(estado: PlanUsuario, accion: AccionPlan): PlanUsuario {
  switch (accion.tipo) {
    case "cargarHistoria":
      return { ...estado, historia: { ...accion.historia } };

    case "marcarEstado":
      return conEstado(estado, [accion.codigo], accion.estado);

    case "marcarVarias":
      return conEstado(estado, accion.codigos, accion.estado);

    case "marcarAprobada":
      return conEstado(estado, [accion.codigo], "aprobada");

    case "agregarMateria": {
      const lista = estado.periodos[accion.periodo] ?? [];
      if (lista.some((materia) => materia.codigo === accion.codigo)) {
        return estado;
      }
      return {
        ...estado,
        periodos: {
          ...estado.periodos,
          [accion.periodo]: [...lista, { codigo: accion.codigo }],
        },
        colores: conColor(estado.colores, accion.codigo),
      };
    }

    case "agregarVarias": {
      let siguiente = estado;
      for (const colocacion of accion.colocaciones) {
        siguiente = reducir(siguiente, { tipo: "agregarMateria", ...colocacion });
      }
      return siguiente;
    }

    case "quitarMateria":
      return {
        ...estado,
        // El color no se libera: identifica a la materia para toda la carrera.
        periodos: sinMateria(estado.periodos, accion.periodo, accion.codigo),
      };

    case "elegirComision": {
      const lista = estado.periodos[accion.periodo];
      if (lista === undefined) {
        return estado;
      }
      if (!lista.some((materia) => materia.codigo === accion.codigo)) {
        return estado;
      }
      return {
        ...estado,
        periodos: {
          ...estado.periodos,
          [accion.periodo]: lista.map((materia) =>
            materia.codigo === accion.codigo
              ? { codigo: materia.codigo, comision: accion.comision }
              : materia,
          ),
        },
      };
    }

    case "moverMateria": {
      if (accion.desde === accion.hacia) {
        return estado;
      }
      const origen = estado.periodos[accion.desde] ?? [];
      const materia = origen.find((item) => item.codigo === accion.codigo);
      if (materia === undefined) {
        return estado;
      }
      const destino = estado.periodos[accion.hacia] ?? [];
      if (destino.some((item) => item.codigo === accion.codigo)) {
        // Ya estaba en el destino: solo se limpia el origen.
        return {
          ...estado,
          periodos: sinMateria(estado.periodos, accion.desde, accion.codigo),
        };
      }
      return {
        ...estado,
        periodos: {
          ...estado.periodos,
          [accion.desde]: origen.filter(
            (item) => item.codigo !== accion.codigo,
          ),
          // La comisión no viaja: es del período que la publica.
          [accion.hacia]: [...destino, { codigo: accion.codigo }],
        },
      };
    }

    case "asignarColor":
      return { ...estado, colores: conColor(estado.colores, accion.codigo) };

    case "setVisibles":
      return {
        ...estado,
        preferencias: { ...estado.preferencias, visibles: accion.visibles },
      };

    case "reemplazar":
      return accion.plan;
  }
}
