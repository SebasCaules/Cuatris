// ============================================================================
// forma.mjs — C1: los controles baratos sobre cualquier JSON de datos
// ----------------------------------------------------------------------------
// Corren antes de mirar qué tipo de archivo es: tamaño, BOM y CRLF, anidamiento,
// claves duplicadas (JSON.parse se queda con la última y no avisa: `{"cupo":48,
// "cupo":0}` es lo que el humano lee de una manera y el parser de otra), forma
// canónica, claves que contaminan el prototipo, caracteres de control e
// invisibles (Trojan Source), fechas que no existen en el calendario y datos
// personales. Port de deprecated/tools/cuatris/{canon.py,validar/triage.py}.
//
// La forma canónica es la única válida en el repositorio: claves ordenadas,
// indentación de 2, LF, salto de línea final, UTF-8 sin BOM, acentos sin
// escapar. No es cosmética: hace legibles los diffs para quien revisa sin
// contexto e impide maquillar la magnitud de un cambio con reordenamientos.
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";

import { error, recorte } from "./reporte.mjs";

/** Anidamiento máximo admitido dentro de un JSON. */
export const PROFUNDIDAD_MAXIMA = 12;

/** Claves que contaminan el prototipo al deserializar en el navegador. */
export const CLAVES_PROHIBIDAS = ["__proto__", "constructor", "prototype"];

/** Rangos de caracteres invisibles y de override bidireccional. */
const INVISIBLES = [
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Datos personales que no pueden quedar en un repositorio público e inmutable. */
const PRIVACIDAD = [
  ["privacidad-correo", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}/, "parece una dirección de correo"],
  [
    "privacidad-telefono",
    /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{4}(?!\d)/,
    "parece un número de teléfono",
  ],
  ["privacidad-legajo", /legajo\W{0,12}\d{5,6}(?!\d)/i, "parece un número de legajo"],
];

// ---- forma canónica ---------------------------------------------------------

/** Copia con las claves de todos los objetos ordenadas (arrays en su orden).
 *  `Object.fromEntries` y no `out[k] = …`: con una clave «__proto__» la asignación
 *  cambiaría el prototipo en vez de crear la propiedad, y el archivo parecería
 *  canónico sin serlo. */
export function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((k) => [k, ordenar(valor[k])]),
    );
  }
  return valor;
}

/** La forma canónica del objeto, con salto de línea final. */
export function serializar(valor) {
  return JSON.stringify(ordenar(valor), null, 2) + "\n";
}

// ---- lectura sin parsear -----------------------------------------------------

/** Anidamiento máximo del JSON contando corchetes fuera de los strings (raíz = 0).
 *  Se mide sobre el texto porque hay que decidir antes de parsear: un documento
 *  de miles de niveles tumba al parser recursivo. */
export function profundidadDelTexto(texto) {
  let maxima = 0;
  let nivel = 0;
  let enCadena = false;
  let escapado = false;
  for (const c of texto) {
    if (enCadena) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') {
      enCadena = true;
      if (nivel > maxima) maxima = nivel;
    } else if (c === "[" || c === "{") {
      if (nivel > maxima) maxima = nivel;
      nivel += 1;
    } else if (c === "]" || c === "}") {
      nivel = Math.max(nivel - 1, 0);
    } else if (!" \t\n\r,:".includes(c)) {
      if (nivel > maxima) maxima = nivel;
    }
  }
  return maxima;
}

/** Primera clave repetida dentro de un mismo objeto (`{ clave, ruta }`), o null.
 *  Recorre el texto como un tokenizador: strings (con escapes), llaves, corchetes
 *  y comas; el resto se ignora. Un texto que no es JSON válido puede dar
 *  cualquier cosa, pero eso ya lo informa JSON.parse. */
export function claveDuplicada(texto) {
  const pila = [];
  const n = texto.length;
  let i = 0;
  while (i < n) {
    const c = texto[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && texto[j] !== '"') j += texto[j] === "\\" ? 2 : 1;
      const crudo = texto.slice(i, j + 1);
      i = j + 1;
      const tope = pila[pila.length - 1];
      if (tope && tope.tipo === "obj" && tope.esperaClave) {
        let clave;
        try {
          clave = JSON.parse(crudo);
        } catch {
          clave = crudo;
        }
        if (tope.claves.has(clave)) return { clave, ruta: tope.ruta || "(raíz)" };
        tope.claves.add(clave);
        tope.esperaClave = false;
        tope.ultima = clave;
      }
      continue;
    }
    if (c === "{" || c === "[") {
      const padre = pila[pila.length - 1];
      let ruta = "";
      if (padre) {
        ruta = padre.tipo === "obj" ? (padre.ruta ? `${padre.ruta}.${padre.ultima}` : padre.ultima) : `${padre.ruta}[${padre.indice}]`;
      }
      pila.push(c === "{" ? { tipo: "obj", claves: new Set(), esperaClave: true, ruta, ultima: "" } : { tipo: "arr", ruta, indice: 0 });
    } else if (c === "}" || c === "]") {
      pila.pop();
    } else if (c === ",") {
      const tope = pila[pila.length - 1];
      if (tope) {
        if (tope.tipo === "obj") tope.esperaClave = true;
        else tope.indice += 1;
      }
    }
    i += 1;
  }
  return null;
}

// ---- controles ----------------------------------------------------------------

/** Tamaño, BOM y finales de línea. */
export function revisarBytes(crudo, archivo, tamanoMaximo) {
  const hallazgos = [];
  if (crudo.length > tamanoMaximo) {
    hallazgos.push(error("tamano", archivo, `el archivo pesa ${crudo.length} bytes y el máximo es ${tamanoMaximo}`));
  }
  if (crudo.length >= 3 && crudo[0] === 0xef && crudo[1] === 0xbb && crudo[2] === 0xbf) {
    hallazgos.push(error("bom", archivo, "el archivo empieza con BOM; debe ser UTF-8 sin BOM"));
  }
  if (crudo.includes(0x0d)) {
    hallazgos.push(error("crlf", archivo, "el archivo tiene retornos de carro (CR); los finales de línea deben ser LF"));
  }
  return hallazgos;
}

/** Parsea el texto y lo compara con su forma canónica. Devuelve `{ hallazgos, datos }`;
 *  `datos` es null si el archivo no se pudo leer como JSON. */
export function revisarTexto(texto, archivo) {
  const nivel = profundidadDelTexto(texto);
  if (nivel > PROFUNDIDAD_MAXIMA) {
    return { hallazgos: [error("profundidad", archivo, `el anidamiento llega a ${nivel} y el máximo es ${PROFUNDIDAD_MAXIMA}`)], datos: null };
  }
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    return { hallazgos: [error("json-invalido", archivo, `JSON inválido: ${e.message}`)], datos: null };
  }
  const repetida = claveDuplicada(texto);
  if (repetida) {
    return { hallazgos: [error("clave-duplicada", archivo, `clave duplicada «${repetida.clave}» en ${repetida.ruta}`)], datos: null };
  }
  const hallazgos = [];
  if (texto !== serializar(datos)) {
    hallazgos.push(error("no-canonico", archivo, "el archivo no está en forma canónica; corre `npm run datos:fmt` sobre él"));
  }
  return { hallazgos, datos };
}

function* cadenas(datos) {
  const pila = [[datos, ""]];
  while (pila.length) {
    const [valor, ruta] = pila.pop();
    if (Array.isArray(valor)) {
      valor.forEach((hijo, i) => pila.push([hijo, `${ruta}[${i}]`]));
    } else if (valor && typeof valor === "object") {
      for (const [clave, hijo] of Object.entries(valor)) {
        const hijoRuta = ruta ? `${ruta}.${clave}` : clave;
        yield [hijoRuta, "clave", clave];
        pila.push([hijo, hijoRuta]);
      }
    } else if (typeof valor === "string") {
      yield [ruta || "(raíz)", "valor", valor];
    }
  }
}

function invisible(texto) {
  for (const c of texto) {
    const p = c.codePointAt(0);
    if (INVISIBLES.some(([desde, hasta]) => p >= desde && p <= hasta)) return `U+${p.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return null;
}

function control(texto) {
  for (const c of texto) {
    const p = c.codePointAt(0);
    if (p < 0x20 || p === 0x7f) return `U+${p.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return null;
}

/** `YYYY-MM-DD` con la forma del contrato que además existe en el calendario. */
export function existeLaFecha(texto) {
  const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(y, mo - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === mo - 1 && fecha.getUTCDate() === d;
}

/** Un string cualquiera (clave, valor o celda): caracteres de control, invisibles
 *  y datos personales. Agrega los hallazgos a `hallazgos`. */
export function revisarCadena(texto, ruta, archivo, hallazgos) {
  const ctl = control(texto);
  if (ctl) hallazgos.push(error("caracter-de-control", archivo, `carácter de control ${ctl} en ${ruta}: «${recorte(texto)}»`));
  const inv = invisible(texto);
  if (inv) hallazgos.push(error("bidi-override", archivo, `carácter invisible o de override bidireccional ${inv} en ${ruta}`));
  for (const [regla, patron, motivo] of PRIVACIDAD) {
    const m = texto.match(patron);
    if (m) hallazgos.push(error(regla, archivo, `dato personal en ${ruta}: «${recorte(m[0])}» ${motivo}`));
  }
}

/** Controles sobre el objeto ya parseado: claves prohibidas, caracteres, fechas y privacidad. */
export function revisarDatos(datos, archivo) {
  const hallazgos = [];
  for (const [ruta, clase, texto] of cadenas(datos)) {
    if (clase === "clave" && CLAVES_PROHIBIDAS.includes(texto)) {
      hallazgos.push(error("clave-prohibida", archivo, `clave prohibida «${texto}» en ${ruta}: contamina el prototipo del objeto`));
    }
    revisarCadena(texto, ruta, archivo, hallazgos);
    if (FECHA_RE.test(texto) && !existeLaFecha(texto)) {
      hallazgos.push(error("fecha-invalida", archivo, `«${texto}» en ${ruta} tiene la forma de una fecha pero ese día no existe`));
    }
  }
  return hallazgos;
}

/** Lee y revisa un JSON de datos de punta a punta (C1). Devuelve `{ hallazgos, datos }`. */
export function cargarJson(ruta, archivo, tamanoMaximo) {
  let crudo;
  try {
    crudo = readFileSync(ruta);
  } catch (e) {
    return { hallazgos: [error("no-se-pudo-abrir", archivo, e.message)], datos: null };
  }
  const hallazgos = revisarBytes(crudo, archivo, tamanoMaximo);
  if (hallazgos.length) return { hallazgos, datos: null };
  const { hallazgos: deTexto, datos } = revisarTexto(crudo.toString("utf8"), archivo);
  hallazgos.push(...deTexto);
  if (datos === null) return { hallazgos, datos: null };
  hallazgos.push(...revisarDatos(datos, archivo));
  return { hallazgos, datos };
}

/** Reescribe el archivo en forma canónica (la única escritura de este módulo).
 *  Devuelve true si cambió algo. */
export function canonizar(ruta) {
  const texto = readFileSync(ruta, "utf8");
  const canonico = serializar(JSON.parse(texto));
  if (texto === canonico) return false;
  writeFileSync(ruta, canonico, "utf8");
  return true;
}
