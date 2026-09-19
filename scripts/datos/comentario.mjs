#!/usr/bin/env node
// ============================================================================
// comentario.mjs — el comentario que el bot deja en cada PR de datos
// ----------------------------------------------------------------------------
//   node scripts/datos/comentario.mjs --triage triage.json --validacion validacion.json \
//        --estado success --clase datos-menor --accion mergeado --ejecucion <url> \
//        [--sha <sha> --hasta <ISO>] [--build build.txt]
//
// Imprime markdown. Lo arma el job `decidir` de pr-datos.yml a partir de lo que
// produjo `validar-datos` (nunca de un archivo del PR). El marcador
// `<!-- cuatris:gate -->` identifica el comentario para actualizarlo en vez de
// apilar uno por push; `<!-- cuatris:espera sha=… hasta=… -->` es lo que lee el
// centinela para mergear un `datos-mayor` cuando venció la ventana.
//
// Quien lee esto no es un experto: es alguien con permiso de merge y sin
// contexto, o el propio autor del PR. Por eso va una tabla legible del cambio,
// nunca JSON crudo, y una línea que dice qué pasa ahora.
// ============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { POLITICA } from "./validar.mjs";

export const MARCADOR = "<!-- cuatris:gate -->";
export const MARCADOR_ESPERA = "cuatris:espera";

const ESTADOS = {
  success: "✅ La validación de datos pasó.",
  failure: "❌ La validación de datos **no** pasó.",
  cancelled: "⚠️ La validación se canceló (llegó otro push).",
  skipped: "⚠️ La validación no corrió.",
};

const ACCIONES = {
  mergeado: "Este PR cumplía las condiciones automáticas: **se mergeó solo** y el sitio se está publicando.",
  espera: (hasta) =>
    `Es una carga grande (cuatrimestre, plan o planilla nuevos): queda en espera **${POLITICA.esperaHoras} h** y se mergea solo el ${hasta} si nadie objeta. Un push nuevo reinicia la espera.`,
  humano: "Necesita que lo revise una persona con permiso de merge (ver los motivos).",
  invalido: "Corregí los errores de arriba y volvé a pushear: el gate vuelve a correr solo.",
  conflicto: "El PR tiene conflictos con la rama base: resolvelos y volvé a pushear.",
  borrador: "Es un borrador: cuando lo marques como listo para revisar, el gate decide.",
  base: "Apunta a una rama que no es la principal: se mergea solo, pero no se publica.",
};

const fechaLegible = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
};

function filaDelResumen(ruta, m) {
  const corto = ruta.replace(/^data\/plan\//, "");
  const cambio = m.cambio === "nuevo" ? "nuevo" : "modificado";
  const partes = [];
  if (m.tipo === "horarios") {
    if (m.cambio === "nuevo") partes.push(`${m.cursos ?? "?"} cursos${m.cursosDelAnterior ? ` (el período anterior tenía ${m.cursosDelAnterior})` : ""}`);
    else partes.push(`${m.cursosModificados ?? 0} modificados · ${m.cursosAgregados ?? 0} nuevos · ${m.cursosQuitados ?? 0} quitados, de ${m.cursos ?? "?"} cursos`);
  } else if (m.tipo === "carreras") {
    if (m.cambio === "nuevo") partes.push("plan de una carrera nueva");
    else partes.push(`${m.materiasModificadas ?? 0} modificadas · ${m.materiasAgregadas ?? 0} nuevas · ${m.materiasQuitadas ?? 0} quitadas, de ${m.materias ?? "?"} materias`);
  } else if (m.tipo === "indice") {
    partes.push(`${m.carrerasModificadas ?? 0} carreras modificadas · ${m.carrerasAgregadas ?? 0} nuevas · ${m.carrerasQuitadas ?? 0} quitadas`);
  } else if (m.tipo === "finales") {
    if (m.cambio === "nuevo") partes.push("planilla nueva");
    else partes.push(`${m.filasTocadas ?? 0} filas tocadas de ${m.filas ?? "?"}`);
  } else if (m.tipo === "evidencia") partes.push("HTML del SGA (evidencia; no se publica)");
  else if (m.tipo === "readme") partes.push("texto");
  if (m.motivo) partes.push(m.motivo);
  return `| \`${corto}\` | ${cambio} | \`${m.clase}\` | ${partes.join("; ")} |`;
}

/**
 * Arma el comentario. `opciones`:
 *   triage        objeto de triage.mjs (o null si no corrió)
 *   validacion    { hallazgos, resumen } de validar.mjs --json (o null)
 *   estado        resultado del job validar-datos: success | failure | cancelled | skipped
 *   clase         clase final (la más restrictiva entre triage y rutas de la API)
 *   accion        mergeado | espera | humano | invalido | conflicto | borrador | base
 *   ejecucion     URL de la corrida
 *   sha, hasta    para el marcador de espera
 *   build         texto (recortado) del build de prueba si falló
 */
export function armarComentario(o) {
  const lineas = [MARCADOR, "### Validación automática de datos", ""];
  lineas.push(`- ${ESTADOS[o.estado] ?? `⚠️ resultado \`${o.estado}\``}`);
  lineas.push(`- Clase del PR: \`${o.clase}\``);
  if (o.triage?.datos?.length) lineas.push(`- Archivos de datos: ${o.triage.datos.length}`);
  lineas.push(`- [Detalle de la ejecución](${o.ejecucion})`);
  lineas.push("");
  const accion = o.accion === "espera" ? ACCIONES.espera(fechaLegible(o.hasta)) : ACCIONES[o.accion];
  if (accion) lineas.push(`**Qué pasa ahora.** ${accion}`, "");
  const resumen = o.triage?.resumen ?? {};
  const rutas = Object.keys(resumen).sort();
  if (rutas.length) {
    lineas.push("| Archivo | Cambio | Clase | Detalle |", "|---|---|---|---|");
    for (const r of rutas) lineas.push(filaDelResumen(r, resumen[r]));
    lineas.push("");
  }
  const motivos = o.triage?.motivos ?? [];
  if (motivos.length) {
    lineas.push("**Por qué necesita a una persona:**", "");
    for (const m of motivos.slice(0, 20)) lineas.push(`- ${m}`);
    if (motivos.length > 20) lineas.push(`- … y ${motivos.length - 20} más`);
    lineas.push("");
  }
  // Los errores se muestran todos (un dato de otro archivo también bloquea el deploy); los
  // avisos, solo los de los archivos que el PR toca: los demás ya estaban y no son suyos.
  const hallazgos = o.validacion?.hallazgos ?? [];
  const tocados = new Set((o.triage?.datos ?? []).map((r) => r.replace(/^data\/plan\//, "")));
  if (hallazgos.length) {
    const errores = hallazgos.filter((h) => h.nivel === "error");
    const avisos = hallazgos.filter((h) => h.nivel !== "error" && tocados.has(h.archivo));
    const bloque = (titulo, lista, abierto) => {
      lineas.push(`<details${abierto ? " open" : ""}><summary>${titulo} (${lista.length})</summary>`, "", "```");
      for (const h of lista.slice(0, 60)) lineas.push(`${h.archivo}  [${h.regla}]  ${h.mensaje}`);
      if (lista.length > 60) lineas.push(`… y ${lista.length - 60} más`);
      lineas.push("```", "", "</details>", "");
    };
    if (errores.length) bloque("Errores", errores, true);
    if (avisos.length) bloque("Avisos (no bloquean)", avisos, false);
  }
  if (o.build) {
    lineas.push("<details open><summary>El build de prueba falló</summary>", "", "```", o.build.trim().split("\n").slice(-40).join("\n"), "```", "", "</details>", "");
  }
  lineas.push("<sub>Qué se revisa y cómo correrlo en tu máquina: `CONTRIBUTING.md`.</sub>");
  if (o.accion === "espera" && o.sha && o.hasta) lineas.push(`<!-- ${MARCADOR_ESPERA} sha=${o.sha} hasta=${o.hasta} -->`);
  return lineas.join("\n") + "\n";
}

/** Lee el marcador de espera de un comentario: `{ sha, hasta }` o null. */
export function leerEspera(texto) {
  const m = String(texto ?? "").match(new RegExp(`<!-- ${MARCADOR_ESPERA} sha=([0-9a-f]{40}) hasta=(\\S+) -->`));
  return m ? { sha: m[1], hasta: m[2] } : null;
}

function main(argv) {
  const o = { estado: "skipped", clase: "necesita-humano", accion: "humano", ejecucion: "" };
  const leer = (p) => (p ? JSON.parse(readFileSync(p, "utf8")) : null);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === "--triage") o.triage = leer(v);
    else if (a === "--validacion") o.validacion = leer(v);
    else if (a === "--build") o.build = readFileSync(v, "utf8");
    else if (a.startsWith("--")) o[a.slice(2)] = v;
    else continue;
    i++;
  }
  process.stdout.write(armarComentario(o));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
