// ============================================================================
// build-carreras-data.mjs — carreras de grado y su plan de estudios, desde el SGA
// ----------------------------------------------------------------------------
// Lee las páginas guardadas a mano del SGA (Académica → Carreras) en
// `data/plan/sga-carreras/`:
//   · carreras.html          el listado de carreras (Nivel = Grado)
//   · <CODIGO>-planes.html   «Ver detalles» de una carrera: «Listado de Planes de
//                            estudio» (nombre, versión, activo desde/hasta); opcional
//   · <CODIGO>-plan.html     «Ver detalles» del plan elegido: «Detalle de Planes
//                            de estudio» con sus bloques (ciclos, electivas por
//                            área, orientaciones…), materias y títulos otorgados
// y emite:
//   · data/plan/carreras.json            índice: carreras + cuáles tienen plan
//   · data/plan/carreras/<CODIGO>.json   plan de estudios crudo de cada carrera
//
// Sin dependencias: el HTML de Wicket es regular, así que se recorre en orden
// con expresiones regulares (cabecera de bloque → cabecera de sección → filas).
// Cada bloque lleva `tipo` según su requisito: «todos» (obligatorias), «creditos»
// (electivas: juntar N créditos) o «uno» (elegir una); los nombres de los bloques
// varían por carrera («Ciclo Básico», «PLAN I22», «Electivas Gestión», «Área
// Tecnológica»…) y no se interpretan.
// Las URLs cifradas del SGA no se guardan (caducan con la sesión).
//
// Modo A de studyvault-data: se corre A MANO y lo emitido se commitea.
//   node scripts/build-carreras-data.mjs        (cwd = raíz del repo)
// Para Informática (S) valida además contra data/plan/obligatorias.json y
// electivas.json (la fuente actual del planner) e imprime las diferencias.
// ============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "data", "plan", "sga-carreras");
const OUT_INDEX = path.join(process.cwd(), "data", "plan", "carreras.json");
const OUT_DIR = path.join(process.cwd(), "data", "plan", "carreras");

/** Código de materia "10.01" / "93.58". */
const CODE_RE = /\d{1,3}\.\d{1,3}/g;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unescape = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENTITIES[e]);
/** Texto plano de un fragmento HTML: sin etiquetas, entidades resueltas, espacios colapsados. */
const text = (html) => unescape(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const num = (s) => {
  const t = text(s);
  if (!t) return 0;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const first = (s, re) => s.match(re)?.[1];
const stripScripts = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
const fileDate = (p) => statSync(p).mtime.toISOString().slice(0, 10);

// ---- carreras.html ---------------------------------------------------------

/** Filas del listado: Código · Nombre · Escuela · Nivel · Nivel informativo · Activa · Acciones. */
function parseCarreras(html) {
  const out = [];
  for (const [, row] of stripScripts(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    if (cells.length < 5) continue;
    const [codigo, nombre, escuela, nivel] = cells;
    if (!/^[A-Z]{1,5}$/.test(codigo) || !nombre) continue; // fila de filtros / cabecera
    out.push({ codigo, nombre, escuela, nivel });
  }
  return out;
}

// ---- <CODIGO>-plan.html ----------------------------------------------------

const RE_PLAN_ID = /Plan de estudio:\s*<span>([^<]*)<\/span>/;
// Cabecera de un bloque (ciclo o electivas): dentro del <th> de la tabla externa.
const RE_BLOCK = /<th>\s*<div id="[^"]*">\s*<div class="row">\s*<h4>\s*<span>[^<]*<\/span>\s*<\/h4>\s*<\/div>\s*<div>\s*<span>([^<]+)<\/span>([\s\S]*?)<\/div>/g;
// Cabecera de sección ("Año 1 - Cuatrimestre 1", "Contenido:").
const RE_SECTION = /<h4>\s*<span>([^<]+)<\/span>\s*<\/h4>/g;
// Fila de materia: nombre (link) · créditos · créditos requeridos · correlativas.
const RE_ROW = /<tr>\s*<td>\s*<a[^>]*>\s*<span>([^<]+)<\/span>\s*<\/a>\s*<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;
// Fila de título otorgado: tipo · título · requisitos.
const RE_TITULO = /<tr>\s*<td>\s*<span>([^<]*)<\/span>\s*<\/td>\s*<td>\s*<span>([^<]*)<\/span>\s*<\/td>\s*<td>\s*<span>([^<]*)<\/span>\s*<\/td>\s*<\/tr>/g;

const creditosDe = (s) => {
  const m = first(s, /(\d+)\s*cr[ée]ditos/i);
  return m ? Number(m) : null;
};

/** Tipo de un bloque según su requisito, tal como lo redacta el SGA:
 *  «Aprobar todos los items (suma N créditos)» → todos (obligatorias);
 *  «Juntar N créditos»                         → creditos (electivas: juntar N);
 *  «Aprobar un item / 1 item(s) (suma N)»      → uno (elegir una). */
function tipoDe(requisito) {
  const r = requisito.toLowerCase();
  if (/juntar/.test(r)) return "creditos";
  if (/aprobar\s+(un|1)\s+item/.test(r)) return "uno";
  if (/todos/.test(r)) return "todos";
  return "otro";
}

function parsePlan(html) {
  const doc = stripScripts(html);
  const planId = (first(doc, RE_PLAN_ID) ?? "").trim();
  const cut = doc.search(/T[íi]tulos otorgados/);
  const body = cut >= 0 ? doc.slice(0, cut) : doc;
  const tail = cut >= 0 ? doc.slice(cut) : "";

  // Recorrido en orden: cabeceras de bloque, de sección y filas, por posición.
  const tokens = [];
  for (const m of body.matchAll(RE_BLOCK)) tokens.push({ at: m.index, kind: "block", title: text(m[1]), rest: m[2] });
  for (const m of body.matchAll(RE_SECTION)) {
    const t = text(m[1]);
    if (t) tokens.push({ at: m.index, kind: "section", title: t });
  }
  for (const m of body.matchAll(RE_ROW)) tokens.push({ at: m.index, kind: "row", m });
  tokens.sort((a, b) => a.at - b.at);

  // Un plan es una lista de BLOQUES (ciclos, electivas por área, orientaciones…),
  // cada uno con su requisito y sus secciones («Año N - Cuatrimestre M» o
  // «Contenido:» cuando la lista es plana). Qué es obligatorio y qué electivo lo
  // dice el requisito (tipoDe), no el nombre: cada carrera los titula distinto.
  const bloques = [];
  let block = null;
  let section = null;
  const seen = new Map(); // código → dónde apareció (repetidos abortan)

  for (const tk of tokens) {
    if (tk.kind === "block") {
      const titulo = first(tk.rest, /T[íi]tulo otorgado:\s*<span>([^<]*)<\/span>/);
      const requisito = requisitoDe(tk.rest);
      block = {
        nombre: tk.title,
        tituloOtorgado: titulo ? text(titulo) : null,
        requisito,
        creditos: creditosDe(requisito),
        tipo: tipoDe(requisito),
        secciones: [],
      };
      bloques.push(block);
      section = null;
    } else if (tk.kind === "section") {
      if (!block) throw new Error(`sección «${tk.title}» fuera de todo bloque`);
      const m = tk.title.match(/A[ñn]o\s+(\d+)\s*-\s*Cuatrimestre\s+(\d+)/i);
      section = {
        nombre: m ? tk.title : null, // «Contenido:» = lista plana, sin nombre
        anio: m ? Number(m[1]) : null,
        cuatri: m ? Number(m[2]) : null,
        materias: [],
      };
      block.secciones.push(section);
    } else {
      if (!section) throw new Error(`fila de materia fuera de toda sección: ${text(tk.m[1])}`);
      const cell = text(tk.m[1]);
      const cm = cell.match(/^(\d{1,3}\.\d{1,3})\s*-\s*(.+)$/);
      if (!cm) throw new Error(`fila sin «código - nombre»: ${cell}`);
      const [, codigo, nombre] = cm;
      const where = `${block.nombre}${section.nombre ? " · " + section.nombre : ""}`;
      if (seen.has(codigo)) throw new Error(`código repetido ${codigo}: ${seen.get(codigo)} y ${where}`);
      seen.set(codigo, where);
      section.materias.push({
        codigo,
        nombre: nombre.trim(),
        creditos: num(tk.m[2]),
        creditosReq: num(tk.m[3]),
        correlativas: text(tk.m[4]).match(CODE_RE) ?? [],
      });
    }
  }

  const titulos = [...tail.matchAll(RE_TITULO)].map((m) => ({
    tipo: text(m[1]),
    titulo: text(m[2]),
    requisitos: text(m[3]),
    creditos: creditosDe(text(m[3])),
  }));

  // Un plan recién creado puede estar vacío en el SGA (AER 25 en 2026-09): se
  // registra como tal en vez de abortar, para no frenar a las demás carreras.
  if (!bloques.length && !seen.size && titulos.length)
    return { planId, bloques, titulos, huerfanas: [], total: 0, vacio: true };
  if (!bloques.length) throw new Error("no se encontró ningún bloque (¿es la página «Ver detalles» del plan?)");
  if (!seen.size) throw new Error("no se encontró ninguna materia");
  // Toda correlativa tiene que ser una materia del plan; si no, se avisa.
  const all = materiasDe(bloques);
  const codes = new Set(all.map((m) => m.codigo));
  const huerfanas = all.flatMap((m) => m.correlativas.filter((c) => !codes.has(c)).map((c) => `${m.codigo} → ${c}`));
  return { planId, bloques, titulos, huerfanas, total: all.length, vacio: false };
}

const requisitoDe = (rest) => {
  const r = first(rest, /Requisito:\s*([^<]*)<\/span>/);
  return r ? text(r) : "";
};
const materiasDe = (bloques, filtro = () => true) =>
  bloques.filter(filtro).flatMap((b) => b.secciones.flatMap((s) => s.materias));

// ---- <CODIGO>-planes.html --------------------------------------------------

/** Filas de «Listado de Planes de estudio»: nombre · versión · activo desde · activo hasta. */
function parsePlanes(html) {
  const out = [];
  for (const [, row] of stripScripts(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => text(m[1]));
    if (cells.length < 5 || !cells[0]) continue;
    out.push({ nombre: cells[0], version: cells[1], desde: cells[2], hasta: cells[3] });
  }
  return out;
}

// ---- validación contra la fuente actual de Informática ---------------------

function validarInformatica(plan) {
  const oblPath = path.join(process.cwd(), "data", "plan", "obligatorias.json");
  const elePath = path.join(process.cwd(), "data", "plan", "electivas.json");
  if (!existsSync(oblPath) || !existsSync(elePath)) return;
  const obl = JSON.parse(readFileSync(oblPath, "utf8")).materias;
  const ele = JSON.parse(readFileSync(elePath, "utf8")).materias;
  const actual = new Map([...obl, ...ele].map((m) => [m.codigo, m]));
  const sga = new Map(materiasDe(plan.bloques).map((m) => [m.codigo, m]));

  const soloActual = [...actual.keys()].filter((c) => !sga.has(c));
  const soloSga = [...sga.keys()].filter((c) => !actual.has(c));
  const difs = [];
  for (const [codigo, a] of actual) {
    const s = sga.get(codigo);
    if (!s) continue;
    if ((a.creditos ?? 0) !== s.creditos) difs.push(`${codigo} créditos: actual ${a.creditos} / SGA ${s.creditos}`);
    if ((a.creditos_requeridos ?? 0) !== s.creditosReq)
      difs.push(`${codigo} créd. requeridos: actual ${a.creditos_requeridos} / SGA ${s.creditosReq}`);
    const ca = [...(a.correlativas ?? [])].sort().join(" ");
    const cs = [...s.correlativas].sort().join(" ");
    if (ca !== cs) difs.push(`${codigo} correlativas: actual [${ca}] / SGA [${cs}]`);
  }
  console.log(`[carreras] S vs. fuente actual: ${sga.size} en el SGA, ${actual.size} en el planner`);
  console.log(`  solo en el planner (${soloActual.length}): ${soloActual.join(" ") || "—"}`);
  console.log(`  solo en el SGA (${soloSga.length}): ${soloSga.join(" ") || "—"}`);
  console.log(`  diferencias en materias comunes (${difs.length}):`);
  for (const d of difs) console.log(`    ${d}`);
}

// ---- main ------------------------------------------------------------------

const carrerasHtml = path.join(SRC_DIR, "carreras.html");
if (!existsSync(carrerasHtml)) {
  console.error(`[carreras] falta ${path.relative(process.cwd(), carrerasHtml)}`);
  process.exit(1);
}
const carreras = parseCarreras(readFileSync(carrerasHtml, "utf8"));
if (!carreras.length) throw new Error("carreras.html: no se encontró ninguna carrera");

mkdirSync(OUT_DIR, { recursive: true });
const planes = new Map();
for (const f of readdirSync(SRC_DIR)) {
  const codigo = first(f, /^([A-Z]{1,5})-plan\.html$/);
  if (!codigo) continue;
  const src = path.join(SRC_DIR, f);
  let plan;
  try {
    plan = parsePlan(readFileSync(src, "utf8"));
  } catch (e) {
    throw new Error(`${f}: ${e.message}`);
  }
  const carrera = carreras.find((c) => c.codigo === codigo);
  if (!carrera) throw new Error(`${f}: la carrera ${codigo} no está en carreras.html`);
  const planesSrc = path.join(SRC_DIR, `${codigo}-planes.html`);
  const listaPlanes = existsSync(planesSrc)
    ? parsePlanes(readFileSync(planesSrc, "utf8")).map((p) => ({ ...p, elegido: p.nombre === plan.planId }))
    : [];
  if (listaPlanes.length && !listaPlanes.some((p) => p.elegido))
    console.log(`  aviso: el plan «${plan.planId}» no figura en ${codigo}-planes.html (${listaPlanes.map((p) => p.nombre).join(", ")})`);
  const out = {
    carrera,
    plan: plan.planId,
    planes: listaPlanes,
    vacio: plan.vacio,
    capturado: fileDate(src),
    bloques: plan.bloques,
    titulos: plan.titulos,
  };
  writeFileSync(path.join(OUT_DIR, `${codigo}.json`), JSON.stringify(out, null, 1) + "\n");
  planes.set(codigo, plan);
  const nObl = materiasDe(plan.bloques, (b) => b.tipo === "todos").length;
  const nEle = materiasDe(plan.bloques, (b) => b.tipo !== "todos").length;
  const crEle = plan.bloques.filter((b) => b.tipo === "creditos").reduce((n, b) => n + (b.creditos ?? 0), 0);
  console.log(
    `[carreras] ${codigo} ${carrera.nombre} · plan ${plan.planId || "?"} · ${plan.bloques.length} bloques · ${nObl} obligatorias · ${nEle} electivas (${crEle} cr) · ${plan.titulos.length} títulos`,
  );
  if (plan.vacio) console.log(`  aviso: el plan «${plan.planId}» está vacío en el SGA (sin ciclos ni materias)`);
  if (plan.huerfanas.length) console.log(`  correlativas fuera del plan (${plan.huerfanas.length}): ${plan.huerfanas.join(", ")}`);
  if (codigo === "S") validarInformatica(plan);
}

const index = {
  fuente: { sistema: "sga", nivel: "Grado", capturado: fileDate(carrerasHtml) },
  carreras: carreras.map((c) => ({
    ...c,
    plan: planes.get(c.codigo)?.planId ?? null,
    vacio: planes.get(c.codigo)?.vacio ?? null,
  })),
};
writeFileSync(OUT_INDEX, JSON.stringify(index, null, 1) + "\n");
const sinPlan = carreras.filter((c) => !planes.has(c.codigo)).map((c) => c.codigo);
console.log(`[carreras] ${carreras.length} carreras → data/plan/carreras.json · con plan: ${[...planes.keys()].join(" ") || "—"} · sin plan: ${sinPlan.join(" ") || "—"}`);
