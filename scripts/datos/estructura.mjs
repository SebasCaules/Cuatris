// ============================================================================
// estructura.mjs — C2: la forma de un objeto (campos, tipos, enums, patrones)
// ----------------------------------------------------------------------------
// Reemplaza al JSON Schema del contrato viejo (deprecated/schemas/v1/) con un
// verificador mínimo escrito a mano: cada regla se lee en el módulo que la
// usa, sin motor de schemas ni dependencias. `additionalProperties: false` en
// todo, con la clase de error propia del contrato: «campo desconocido X — si es
// real, hay que actualizar el validador en un PR aparte». Es un falso positivo
// aceptado a conciencia: aceptar campos desconocidos es un canal de contrabando
// hacia el render.
// ============================================================================

import { error } from "./reporte.mjs";

const TIPOS = {
  string: (v) => typeof v === "string",
  integer: (v) => Number.isInteger(v),
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  null: (v) => v === null,
};

const nombreDeTipo = (t) => (Array.isArray(t) ? t.join(" | ") : t);

/**
 * Revisa que `obj` tenga exactamente los campos declarados en `esquema`:
 *   { requeridos: { campo: tipo }, opcionales: { campo: tipo } }
 * donde `tipo` es un nombre de TIPOS o una lista de nombres. Informa
 * `campo-faltante`, `campo-desconocido` y `tipo-incorrecto`. Devuelve true si
 * la forma es válida (los campos presentes tienen el tipo declarado), para que
 * el llamador decida si sigue mirando adentro.
 */
export function revisarCampos(obj, ruta, archivo, esquema, hallazgos) {
  if (!TIPOS.object(obj)) {
    hallazgos.push(error("tipo-incorrecto", archivo, `${ruta}: se esperaba un objeto`));
    return false;
  }
  let ok = true;
  const requeridos = esquema.requeridos ?? {};
  const opcionales = esquema.opcionales ?? {};
  for (const campo of Object.keys(requeridos)) {
    if (!(campo in obj)) {
      hallazgos.push(error("campo-faltante", archivo, `${ruta}: falta el campo «${campo}»`));
      ok = false;
    }
  }
  for (const [campo, valor] of Object.entries(obj)) {
    const tipo = requeridos[campo] ?? opcionales[campo];
    if (tipo === undefined) {
      hallazgos.push(
        error(
          "campo-desconocido",
          archivo,
          `${ruta}: campo desconocido «${campo}»; si es real, hay que actualizar el validador en un PR aparte`,
        ),
      );
      continue;
    }
    if (!esDeTipo(valor, tipo)) {
      hallazgos.push(error("tipo-incorrecto", archivo, `${ruta}.${campo}: se esperaba ${nombreDeTipo(tipo)}`));
      ok = false;
    }
  }
  return ok;
}

export function esDeTipo(valor, tipo) {
  const lista = Array.isArray(tipo) ? tipo : [tipo];
  return lista.some((t) => TIPOS[t](valor));
}

/** El string cumple el patrón; si no, `valor-invalido`. Devuelve true/false. */
export function revisarPatron(valor, patron, ruta, archivo, hallazgos, descripcion) {
  if (typeof valor !== "string" || !patron.test(valor)) {
    hallazgos.push(error("valor-invalido", archivo, `${ruta}: «${String(valor)}» no es ${descripcion}`));
    return false;
  }
  return true;
}

/** El valor está en la lista; si no, `valor-invalido`. Devuelve true/false. */
export function revisarEnum(valor, lista, ruta, archivo, hallazgos, descripcion) {
  if (!lista.includes(valor)) {
    hallazgos.push(error("valor-invalido", archivo, `${ruta}: «${String(valor)}» no es ${descripcion} (${lista.join(", ")})`));
    return false;
  }
  return true;
}

/** Todos los elementos son strings no vacíos; si no, `valor-invalido`. */
export function revisarStrings(lista, ruta, archivo, hallazgos, descripcion) {
  let ok = true;
  lista.forEach((v, i) => {
    if (typeof v !== "string" || v.length === 0) {
      hallazgos.push(error("valor-invalido", archivo, `${ruta}[${i}]: se esperaba ${descripcion}`));
      ok = false;
    }
  });
  return ok;
}
