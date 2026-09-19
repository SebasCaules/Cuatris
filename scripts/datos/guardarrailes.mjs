#!/usr/bin/env node
// ============================================================================
// guardarrailes.mjs — controles sobre los workflows de .github/
// ----------------------------------------------------------------------------
//   node scripts/datos/guardarrailes.mjs [.github]     código de salida 0/1
//
// Un puñado de reglas de treinta líneas que vigilan que el gate siga siendo el
// gate (port acotado de deprecated/tools/cuatris/validar/guardarrailes.py):
//
//   permissions-explicitas  todo workflow declara `permissions:` arriba de todo.
//   interpolacion-en-run    ningún `run:` contiene `${{ … }}`: lo que viene del
//                           evento entra por `env:` y se usa entre comillas.
//   accion-sin-fijar        toda acción de terceros va fijada a un SHA de 40 hex.
//   secreto-ajeno           el único secreto admitido es GITHUB_TOKEN.
//   checkout-del-pr         en un workflow de pull_request_target nadie hace
//                           checkout del head del PR (ni actions/checkout con
//                           `ref:` del PR, ni `gh pr checkout`, ni `git checkout`
//                           o `git switch`): los bytes del PR se traen con
//                           `git fetch` y se extraen con `git archive`.
//
// Recorre .github entero y no solo .github/workflows: un action.yml local corre
// con los permisos del job que lo invoca. No parsea YAML: mira líneas, que para
// nuestros propios workflows alcanza y no agrega dependencias.
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA_RE = /^[0-9a-f]{40}$/;

function* archivosYaml(dir) {
  for (const nombre of readdirSync(dir).sort()) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* archivosYaml(ruta);
    else if (/\.ya?ml$/.test(nombre)) yield ruta;
  }
}

const indentacion = (linea) => linea.match(/^\s*/)[0].length;

/** Bloques `run:` de un workflow: `{ linea, texto }` (inline o block scalar). */
export function bloquesRun(lineas) {
  const out = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!m) continue;
    const base = indentacion(lineas[i]);
    if (/^[|>][-+]?\s*(#.*)?$/.test(m[2])) {
      const partes = [];
      let j = i + 1;
      while (j < lineas.length && (lineas[j].trim() === "" || indentacion(lineas[j]) > base)) partes.push(lineas[j++]);
      out.push({ linea: i + 1, texto: partes.join("\n") });
    } else {
      out.push({ linea: i + 1, texto: m[2] });
    }
  }
  return out;
}

/** Revisa un archivo YAML de .github. Devuelve `[{ regla, archivo, linea, mensaje }]`. */
export function revisarWorkflow(ruta, texto) {
  const archivo = ruta;
  const lineas = texto.split("\n");
  const h = [];
  const esWorkflow = /(^|\/)workflows\//.test(ruta.split(path.sep).join("/"));
  if (esWorkflow && !lineas.some((l) => /^permissions:/.test(l))) {
    h.push({ regla: "permissions-explicitas", archivo, linea: 1, mensaje: "el workflow no declara `permissions:` en la raíz" });
  }
  for (const { linea, texto: run } of bloquesRun(lineas)) {
    if (run.includes("${{")) h.push({ regla: "interpolacion-en-run", archivo, linea, mensaje: "un `run:` interpola `${{ … }}`; los datos del evento entran por `env:`" });
  }
  lineas.forEach((l, i) => {
    const uses = l.match(/^\s*(?:-\s+)?uses:\s*["']?([^"'\s#]+)/);
    if (uses && !uses[1].startsWith("./") && !uses[1].startsWith("docker://")) {
      const ref = uses[1].split("@")[1] ?? "";
      if (!SHA_RE.test(ref)) h.push({ regla: "accion-sin-fijar", archivo, linea: i + 1, mensaje: `«${uses[1]}» no está fijada a un SHA de 40 hex` });
    }
    for (const s of l.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) {
      if (s[1] !== "GITHUB_TOKEN") h.push({ regla: "secreto-ajeno", archivo, linea: i + 1, mensaje: `usa el secreto «${s[1]}»; el único admitido es GITHUB_TOKEN` });
    }
  });
  const jobs = lineas.findIndex((l) => /^jobs:/.test(l));
  const cabecera = lineas.slice(0, jobs < 0 ? lineas.length : jobs).join("\n");
  if (/pull_request_target/.test(cabecera)) {
    lineas.forEach((l, i) => {
      const ref = l.match(/^\s*ref:\s*(.+)$/);
      if (ref && /head|pull_request\.|merge/.test(ref[1])) {
        h.push({ regla: "checkout-del-pr", archivo, linea: i + 1, mensaje: `\`ref: ${ref[1].trim()}\` apunta al PR en un workflow de pull_request_target` });
      }
    });
    for (const { linea, texto: run } of bloquesRun(lineas)) {
      if (/\bgh\s+pr\s+checkout\b|\bgit\s+(checkout|switch)\b/.test(run)) {
        h.push({ regla: "checkout-del-pr", archivo, linea, mensaje: "un `run:` hace checkout en un workflow de pull_request_target; los bytes del PR se traen con `git fetch` y `git archive`" });
      }
    }
  }
  return h;
}

export function revisarDirectorio(dir) {
  const h = [];
  for (const ruta of archivosYaml(dir)) h.push(...revisarWorkflow(path.relative(process.cwd(), ruta), readFileSync(ruta, "utf8")));
  return h;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? ".github");
  const h = revisarDirectorio(dir);
  for (const x of h) console.log(`ERROR  ${x.archivo}:${x.linea}  [${x.regla}]  ${x.mensaje}`);
  console.log(`${h.length} problema(s) en los workflows de ${path.relative(process.cwd(), dir) || "."}`);
  process.exit(h.length ? 1 : 0);
}
