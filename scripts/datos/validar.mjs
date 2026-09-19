#!/usr/bin/env node
// ============================================================================
// validar.mjs — el validador de los datos contribuibles de data/plan/
// ----------------------------------------------------------------------------
// Lo corren el gate de los PR (.github/workflows/pr-datos.yml, sobre la copia
// en cuarentena), el deploy (antes de construir), el centinela (sobre main) y
// quien va a abrir un PR (`npm run datos:validar`). Sin dependencias.
//
//   node scripts/datos/validar.mjs                      todo data/plan
//   node scripts/datos/validar.mjs --dir otra/carpeta   otro árbol con la misma forma
//   node scripts/datos/validar.mjs data/plan/horarios/2027-1C.json   solo ese archivo
//   node scripts/datos/validar.mjs --json salida.json   además, los hallazgos en JSON
//   node scripts/datos/validar.mjs --fmt                reescribe los JSON en forma canónica
//
// Salida: una línea por hallazgo y un resumen. Código de salida: 0 sin errores
// (los avisos no bloquean), 1 con errores, 2 si no se pudo leer algo.
//
// Qué archivos son datos contribuibles (la misma lista que el allowlist del
// triage, scripts/datos/triage.mjs):
//   data/plan/horarios/<AAAA>-<n>C.json    horarios del SGA, contrato 1.1.0
//   data/plan/carreras.json                índice de carreras
//   data/plan/carreras/<CODIGO>.json       plan de estudios de cada carrera
//   data/plan/finales-<AAAA>-<mes>.csv     planilla oficial de finales
// ============================================================================

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { codigosDeLosPlanes, revisarCoherenciaDeCarreras, revisarIndiceDeCarreras, revisarPlanDeCarrera } from "./carreras.mjs";
import { revisarFinales } from "./finales.mjs";
import { canonizar, cargarJson } from "./forma.mjs";
import { revisarHorarios } from "./horarios.mjs";
import { error, formatear, hayErrores, resumen } from "./reporte.mjs";
import { ARCHIVO_FINALES_RE, ARCHIVO_HORARIOS_RE } from "./vocabulario.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const POLITICA = JSON.parse(readFileSync(path.join(AQUI, "politica.json"), "utf8"));

/**
 * Clasifica una ruta relativa a data/plan (con barras `/`) en un tipo de dato
 * contribuible, o null si no es uno. Es la misma tabla que usa el triage.
 */
export function tipoDeArchivo(relativa) {
  const partes = relativa.split("/");
  if (partes.length === 2 && partes[0] === "horarios" && ARCHIVO_HORARIOS_RE.test(partes[1])) return "horarios";
  if (partes.length === 2 && partes[0] === "horarios" && partes[1] === "README.md") return "readme";
  if (partes.length === 1 && partes[0] === "carreras.json") return "indice";
  if (partes.length === 2 && partes[0] === "carreras" && /^[A-Z]{1,6}\.json$/.test(partes[1])) return "carreras";
  if (partes.length === 2 && partes[0] === "sga-carreras" && /^[A-Za-z0-9_-]{1,40}\.html$/.test(partes[1])) return "evidencia";
  if (partes.length === 1 && ARCHIVO_FINALES_RE.test(partes[0])) return "finales";
  return null;
}

/** Lista los datos contribuibles que hay en un directorio, como rutas relativas. */
export function listarDatos(dir) {
  const out = [];
  const agregar = (sub) => {
    const carpeta = sub ? path.join(dir, sub) : dir;
    if (!existsSync(carpeta)) return;
    for (const nombre of readdirSync(carpeta).sort()) {
      const relativa = sub ? `${sub}/${nombre}` : nombre;
      const tipo = tipoDeArchivo(relativa);
      if (tipo && tipo !== "evidencia" && tipo !== "readme" && statSync(path.join(dir, relativa)).isFile()) out.push(relativa);
    }
  };
  agregar("");
  agregar("horarios");
  agregar("carreras");
  return out;
}

/**
 * Valida un conjunto de archivos (rutas relativas a `dir`). Si `relativas` es
 * null, valida todos los datos del directorio. Devuelve `{ hallazgos, archivos }`.
 * Las reglas cruzadas (índice ↔ planes, códigos de horarios contra los planes)
 * cargan los planes del directorio aunque no estén en la lista: el contexto es
 * siempre el árbol completo, que es lo que se publica.
 */
export function validar(dir, relativas = null) {
  const hallazgos = [];
  const archivos = relativas ?? listarDatos(dir);
  const planes = new Map();
  let indice = null;

  // Contexto: todos los planes del directorio (validados solo si están en la lista).
  for (const relativa of listarDatos(dir)) {
    const tipo = tipoDeArchivo(relativa);
    if (tipo !== "carreras" && tipo !== "indice") continue;
    const { datos } = cargarJson(path.join(dir, relativa), relativa, POLITICA.tamanos[tipo]);
    if (!datos) continue;
    if (tipo === "indice") indice = datos;
    else if (datos.carrera && typeof datos.carrera.codigo === "string") planes.set(datos.carrera.codigo, datos);
  }
  const codigosDePlanes = planes.size ? codigosDeLosPlanes(planes) : null;

  for (const relativa of archivos) {
    const tipo = tipoDeArchivo(relativa);
    const ruta = path.join(dir, relativa);
    const nombreDeArchivo = path.basename(relativa);
    if (!tipo) {
      hallazgos.push(error("no-es-un-dato", relativa, "no es un archivo de datos contribuible (ver la cabecera de scripts/datos/validar.mjs)"));
      continue;
    }
    if (tipo === "evidencia" || tipo === "readme") {
      // Nunca se abren: solo el tamaño, que también mira el triage.
      const tam = existsSync(ruta) ? statSync(ruta).size : -1;
      if (tam < 0) hallazgos.push(error("no-se-pudo-abrir", relativa, "no existe"));
      else if (tam > POLITICA.tamanos[tipo]) hallazgos.push(error("tamano", relativa, `el archivo pesa ${tam} bytes y el máximo es ${POLITICA.tamanos[tipo]}`));
      continue;
    }
    if (tipo === "finales") {
      let crudo;
      try {
        crudo = readFileSync(ruta);
      } catch (e) {
        hallazgos.push(error("no-se-pudo-abrir", relativa, e.message));
        continue;
      }
      hallazgos.push(...revisarFinales(crudo, nombreDeArchivo, relativa, POLITICA.tamanos.finales));
      continue;
    }
    const { hallazgos: c1, datos } = cargarJson(ruta, relativa, POLITICA.tamanos[tipo]);
    hallazgos.push(...c1);
    if (datos === null || hayErrores(c1)) continue;
    if (tipo === "horarios") hallazgos.push(...revisarHorarios(datos, relativa, { nombreDeArchivo, codigosDePlanes }));
    else if (tipo === "indice") hallazgos.push(...revisarIndiceDeCarreras(datos, relativa));
    else if (tipo === "carreras") hallazgos.push(...revisarPlanDeCarrera(datos, relativa, { nombreDeArchivo }));
  }

  // Coherencia índice ↔ planes: siempre que el índice exista y se haya pedido
  // el índice o algún plan (o todo el directorio).
  const tocaCarreras = archivos.some((r) => ["indice", "carreras"].includes(tipoDeArchivo(r)));
  if (indice && tocaCarreras && Array.isArray(indice.carreras)) {
    hallazgos.push(...revisarCoherenciaDeCarreras(indice, planes, "carreras.json"));
  }
  return { hallazgos, archivos };
}

// ---- CLI -------------------------------------------------------------------------

function main(argv) {
  let dir = path.join(process.cwd(), "data", "plan");
  let salidaJson = null;
  let fmt = false;
  const explicitos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") dir = path.resolve(argv[++i]);
    else if (a === "--json") salidaJson = argv[++i];
    else if (a === "--fmt") fmt = true;
    else if (a.startsWith("--")) {
      console.error(`opción desconocida: ${a}`);
      return 2;
    } else explicitos.push(path.resolve(a));
  }
  if (!existsSync(dir)) {
    console.error(`no existe el directorio de datos: ${dir}`);
    return 2;
  }
  // Un archivo explícito se expresa relativo al directorio de datos.
  const relativas = explicitos.length
    ? explicitos.map((abs) => path.relative(dir, abs).split(path.sep).join("/"))
    : null;
  if (relativas && relativas.some((r) => r.startsWith(".."))) {
    console.error(`todos los archivos tienen que estar dentro de ${dir}`);
    return 2;
  }

  if (fmt) {
    let cambiados = 0;
    for (const relativa of relativas ?? listarDatos(dir)) {
      if (!relativa.endsWith(".json")) continue;
      if (canonizar(path.join(dir, relativa))) {
        cambiados++;
        console.log(`canonizado  ${relativa}`);
      }
    }
    console.log(`${cambiados} archivo(s) reescritos en forma canónica`);
    return 0;
  }

  const { hallazgos, archivos } = validar(dir, relativas);
  for (const h of hallazgos) console.log(formatear(h));
  console.log(`${archivos.length} archivo(s) validados: ${resumen(hallazgos)}`);
  if (salidaJson) {
    writeFileSync(salidaJson, JSON.stringify({ archivos, hallazgos, resumen: resumen(hallazgos) }, null, 2) + "\n");
  }
  if (hallazgos.some((h) => h.regla === "no-se-pudo-abrir")) return 2;
  return hayErrores(hallazgos) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
