/**
 * Carga de los archivos de datos versionados.
 *
 * Todo cuelga de `import.meta.env.BASE_URL + "data/"` para que la aplicación
 * funcione igual en `/` (desarrollo) que en `/Cuatris/` (GitHub Pages). El
 * índice manda: dice qué archivos existen y con qué hash, y ese hash viaja como
 * `?v=<hash>` para invalidar la caché del navegador.
 */

import type {
  Abreviaciones,
  EntradaHorarios,
  Fecha,
  Horarios,
  Indice,
  PeriodoId,
  Plan,
  Vocabulario,
} from "../contrato/tipos";

/** Major del contrato que esta versión de la aplicación sabe leer. */
export const MAJOR_SOPORTADO = 1;

/** Los datos publicados son de un major que esta aplicación no entiende. */
export class ContratoIncompatible extends Error {
  readonly archivo: string;
  readonly contrato: string;

  constructor(archivo: string, contrato: string) {
    super(
      `Los datos son más nuevos que la aplicación: ${archivo} declara ` +
        `contrato ${contrato} y esta versión solo lee ${MAJOR_SOPORTADO}.x.x.`,
    );
    this.name = "ContratoIncompatible";
    this.archivo = archivo;
    this.contrato = contrato;
  }
}

/** No se pudo traer o interpretar un archivo de datos. */
export class DatosNoDisponibles extends Error {
  readonly archivo: string;

  constructor(archivo: string, motivo: string) {
    super(`No se pudieron cargar los datos de ${archivo}: ${motivo}`);
    this.name = "DatosNoDisponibles";
    this.archivo = archivo;
  }
}

/** El índice no lista lo que se pidió. */
export class NoEstaEnElIndice extends Error {
  constructor(que: string) {
    super(`El índice de datos no lista ${que}.`);
    this.name = "NoEstaEnElIndice";
  }
}

/** Raíz de los datos: `<base del sitio>data/`. */
export function baseDatos(): string {
  return `${import.meta.env.BASE_URL}data/`;
}

function urlDe(archivo: string, hash?: string): string {
  const version = hash === undefined ? "" : `?v=${encodeURIComponent(hash)}`;
  return `${baseDatos()}${archivo}${version}`;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Comprueba el campo `contrato`. Un major distinto del soportado lanza
 * `ContratoIncompatible`; una forma que ni siquiera declara `contrato` lanza
 * `DatosNoDisponibles` en vez de devolver un objeto a medias.
 */
function verificarContrato(archivo: string, cuerpo: unknown): void {
  if (!esObjeto(cuerpo)) {
    throw new DatosNoDisponibles(archivo, "el contenido no es un objeto JSON");
  }
  const contrato = cuerpo["contrato"];
  if (typeof contrato !== "string") {
    throw new DatosNoDisponibles(archivo, "falta el campo «contrato»");
  }
  const partes = contrato.split(".");
  const major = /^\d+$/.test(partes[0] ?? "") ? Number(partes[0]) : Number.NaN;
  if (partes.length !== 3 || !Number.isInteger(major)) {
    throw new DatosNoDisponibles(
      archivo,
      `el campo «contrato» no es SemVer: ${JSON.stringify(contrato)}`,
    );
  }
  if (major !== MAJOR_SOPORTADO) {
    throw new ContratoIncompatible(archivo, contrato);
  }
}

async function traerJson(archivo: string, hash?: string): Promise<unknown> {
  let respuesta: Response;
  try {
    respuesta = await fetch(urlDe(archivo, hash), { credentials: "omit" });
  } catch (error) {
    throw new DatosNoDisponibles(
      archivo,
      error instanceof Error ? error.message : "la red falló",
    );
  }
  if (!respuesta.ok) {
    throw new DatosNoDisponibles(
      archivo,
      `el servidor respondió ${respuesta.status}`,
    );
  }
  try {
    return (await respuesta.json()) as unknown;
  } catch {
    throw new DatosNoDisponibles(archivo, "el contenido no es JSON válido");
  }
}

async function cargarArchivo<T>(archivo: string, hash?: string): Promise<T> {
  const cuerpo = await traerJson(archivo, hash);
  verificarContrato(archivo, cuerpo);
  return cuerpo as T;
}

/** Trae `data/index.json`. Es el único archivo que se pide sin `?v=`. */
export async function cargarIndice(): Promise<Indice> {
  return cargarArchivo<Indice>("index.json");
}

/**
 * Trae el plan de estudios `id`.
 *
 * `indice` es opcional solo para que la firma sea cómoda desde la interfaz; si
 * no se pasa, se vuelve a pedir el índice.
 */
export async function cargarPlan(id: string, indice?: Indice): Promise<Plan> {
  const usado = indice ?? (await cargarIndice());
  const entrada = usado.planes.find((candidato) => candidato.plan === id);
  if (entrada === undefined) {
    throw new NoEstaEnElIndice(`el plan ${id}`);
  }
  return cargarArchivo<Plan>(entrada.archivo, entrada.hash);
}

/** Trae los horarios del período `periodo`. */
export async function cargarHorarios(
  periodo: PeriodoId,
  indice?: Indice,
): Promise<Horarios> {
  const usado = indice ?? (await cargarIndice());
  const entrada = usado.horarios.find(
    (candidato) => candidato.periodo === periodo,
  );
  if (entrada === undefined) {
    throw new NoEstaEnElIndice(`horarios del período ${periodo}`);
  }
  return cargarArchivo<Horarios>(entrada.archivo, entrada.hash);
}

/** Trae la tabla de abreviaciones. */
export async function cargarAbreviaciones(
  indice?: Indice,
): Promise<Abreviaciones> {
  const usado = indice ?? (await cargarIndice());
  return cargarArchivo<Abreviaciones>(
    usado.abreviaciones.archivo,
    usado.abreviaciones.hash,
  );
}

/** Trae el vocabulario (sedes). */
export async function cargarVocabulario(
  indice?: Indice,
): Promise<Vocabulario> {
  const usado = indice ?? (await cargarIndice());
  return cargarArchivo<Vocabulario>(
    usado.vocabulario.archivo,
    usado.vocabulario.hash,
  );
}

/** Cómo se relaciona el período devuelto con la fecha de hoy. */
export type EstadoPeriodo = "activo" | "vista_previa";

export interface PeriodoElegido {
  entrada: EntradaHorarios;
  estado: EstadoPeriodo;
}

/**
 * Elige qué período mostrar, según CONTRATO-v1 §5:
 *
 * - **activo**: `desde ≤ hoy ≤ hasta`.
 * - **vista previa**: no hay activo y hay alguno con `desde > hoy`; se muestra
 *   el más próximo.
 * - `null`: no hay ninguno activo ni futuro (solo períodos ya terminados, o el
 *   índice no publica horarios).
 *
 * Las fechas son `YYYY-MM-DD`, así que se comparan como strings.
 */
export function periodoActivo(indice: Indice, hoy: Fecha): PeriodoElegido | null {
  const activo = indice.horarios.find(
    (entrada) => entrada.desde <= hoy && hoy <= entrada.hasta,
  );
  if (activo !== undefined) {
    return { entrada: activo, estado: "activo" };
  }
  const futuros = indice.horarios
    .filter((entrada) => entrada.desde > hoy)
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  const proximo = futuros[0];
  if (proximo === undefined) {
    return null;
  }
  return { entrada: proximo, estado: "vista_previa" };
}
