// ============================================================================
// reporte.mjs — hallazgos del validador: forma, niveles y salida
// ----------------------------------------------------------------------------
// Dos niveles, los del contrato viejo (deprecated/tools/cuatris/validar/reporte.py):
//   · ERROR: rompe al planificador o describe algo imposible. Bloquea el PR.
//   · AVISO: raro pero real; rechazarlo produciría falsos positivos (amenaza A10
//     del plan: los falsos positivos son lo que hace que alguien apague el gate).
// ============================================================================

export const ERROR = "error";
export const AVISO = "aviso";

/** Un hallazgo: nivel, regla (kebab-case, estable: los tests la citan), archivo y mensaje. */
export function hallazgo(nivel, regla, archivo, mensaje) {
  return { nivel, regla, archivo, mensaje };
}

export const error = (regla, archivo, mensaje) => hallazgo(ERROR, regla, archivo, mensaje);
export const aviso = (regla, archivo, mensaje) => hallazgo(AVISO, regla, archivo, mensaje);

export const hayErrores = (hallazgos) => hallazgos.some((h) => h.nivel === ERROR);

/** Recorta un fragmento para que el mensaje siga entrando en una línea. */
export function recorte(texto, largo = 60) {
  const plano = texto.length <= largo ? texto : texto.slice(0, largo) + "…";
  return plano.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/** Una línea por hallazgo, legible en un log de CI y en el comentario del bot. */
export function formatear(h) {
  const nivel = h.nivel === ERROR ? "ERROR" : "aviso";
  return `${nivel.padEnd(5)}  ${h.archivo}  [${h.regla}]  ${h.mensaje}`;
}

/** Resumen de cierre: cuántos errores y avisos. */
export function resumen(hallazgos) {
  const errores = hallazgos.filter((h) => h.nivel === ERROR).length;
  const avisos = hallazgos.length - errores;
  return `${errores} error(es), ${avisos} aviso(s)`;
}
