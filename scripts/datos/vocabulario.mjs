// ============================================================================
// vocabulario.mjs — el vocabulario cerrado de los datos contribuibles
// ----------------------------------------------------------------------------
// Única fuente de los enums que comparten el validador (scripts/datos/) y los
// pipelines de build (scripts/build-*.mjs): si el build traduce un valor, el
// validador lo admite, y al revés. Un valor nuevo del SGA (una sede, una
// modalidad) se agrega acá, en un PR de código.
//
// Las claves son el vocabulario del contrato 1.1.0 de horarios (el que emite el
// scraper de tools/); los valores, las etiquetas que muestra el planner.
// ============================================================================

/** Días del contrato → etiqueta del planner. «domingo» entró en 1.1.0 (61.27 dicta
 *  bloques virtuales asincrónicos en domingo). */
export const DIA = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};

/** Modalidades del contrato → etiqueta del planner (time.ts decide conflictos de
 *  sede con "Virtual"; el filtro del combinador ofrece Presencial / Virtual / Blended). */
export const MODALIDAD = {
  presencial: "Presencial",
  blended: "Blended",
  virtual: "Virtual",
  virtual_sincronica: "Virtual",
  virtual_asincronica: "Asincrónico",
  laboratorio: "Laboratorio",
};

/** Modalidades que ocupan físicamente un aula: las únicas que pueden colisionar. */
export const MODALIDADES_CON_AULA = ["presencial", "blended"];

/** Sedes conocidas del contrato → etiqueta del planner. Una sede que no esté acá
 *  no es error (el SGA abre sedes): el validador avisa y el build la muestra en
 *  mayúsculas hasta que alguien la cure. */
export const SEDE = { sdf: "Distrito Financiero", rectorado: "Rectorado", sdt: "SDT" };

/** Código de materia del contrato de horarios (`93.18`): estricto, como el schema v1. */
export const CODIGO_HORARIOS_RE = /^\d{2}\.\d{2}$/;

/** Código de materia tal como lo leen los pipelines del planner (`10.01` / `93.58`). */
export const CODIGO_RE = /^\d{1,3}\.\d{1,3}$/;

/** Nombre de un archivo de horarios: `<AAAA>-<1|2>C.json`. */
export const ARCHIVO_HORARIOS_RE = /^(\d{4})-([12])C\.json$/;

/** Nombre de una planilla de finales archivada: `finales-<AAAA>-<mes>.csv`. */
export const ARCHIVO_FINALES_RE = /^finales-(\d{4})-([a-z]+)\.csv$/i;

/** Código de carrera del SGA (`S`, `LAES`, `BIO`). */
export const CODIGO_CARRERA_RE = /^[A-Z]{1,6}$/;

/** Nombre de un plan de estudios del SGA (`S10-Rev23`, `LCC 25`, `L09T`). */
export const PLAN_RE = /^[A-Za-z0-9][A-Za-z0-9 .\-]{0,30}$/;

/** Tipos de bloque de un plan del SGA (build-carreras-data.mjs): obligatorias,
 *  electivas por créditos, o elegir una. */
export const TIPOS_DE_BLOQUE = ["todos", "creditos", "uno"];

/** `{ anio, cuatrimestre }` de un id de período `2026-2C`, o null. */
export function parsearPeriodo(id) {
  const m = String(id ?? "").match(/^(\d{4})-([12])C$/);
  return m ? { anio: Number(m[1]), cuatrimestre: Number(m[2]) } : null;
}

/** Id del período que sigue a `2026-2C` (→ `2027-1C`). */
export function periodoSiguiente(id) {
  const p = parsearPeriodo(id);
  if (!p) return null;
  return p.cuatrimestre === 1 ? `${p.anio}-2C` : `${p.anio + 1}-1C`;
}
