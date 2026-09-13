// Extrae el "programa analítico" (ficha) de cada electiva desde los PDFs oficiales
// del ITBA ("Programas Analíticos - GRADO") y emite un módulo tipado para el planner.
//
// Modo A (studyvault-data): se corre A MANO y se commitea lib/planner/fichas.ts.
// La extracción depende de `pdftotext` (poppler) y es frágil/cara → no se cablea en CI.
//
// Fuente: site/public/electivas-fichas/<codigo>.pdf  (descargados del Drive del ITBA).
// Salida: site/lib/planner/fichas.ts  (Record<codigo, Ficha>, tracked en git).
// Regenerar con:   node scripts/build-fichas-data.mjs
//
// Los PDFs comparten una plantilla estable: cabecera (Materia/Código/Créditos/…),
// secciones marcadas con "➢ <Título>:" y dos tablas de 2 columnas (Contenidos y
// Bibliografía). Las secciones de prosa salen del texto -layout; el temario (tabla
// "Contenidos") se reconstruye con las coordenadas de -bbox-layout (cada celda es un
// <block>: se emparejan título↔descripción por su yMin en la misma página).

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "public", "electivas-fichas");
const OUT = path.join(process.cwd(), "lib", "planner", "fichas.ts");

// ---- pdftotext helpers -----------------------------------------------------

function pdftotext(file, ...args) {
  try {
    return execFileSync("pdftotext", [...args, file, "-"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        "[build-fichas-data] falta `pdftotext` (poppler). Instalá: brew install poppler",
      );
    }
    throw e;
  }
}

const ZW = /​/g; // zero-width space que aparece tras algunos "➢"
const clean = (s) => s.replace(ZW, "").replace(/ /g, " ");
const isFooter = (line) => /Generado:\s*\d{1,2}\s+\w+\.?\s+\d{4}/i.test(line);
const collapse = (s) => s.replace(/[ \t]+/g, " ").trim();
const decodeXml = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const num = (m) => (m ? Number(m[1]) : null);

// ---- secciones de prosa (desde -layout) ------------------------------------

const SECTIONS = [
  "Carga horaria",
  "Contenidos mínimos",
  "Presentación de la materia",
  "Objetivos de aprendizaje",
  "Contenidos",
  "Estrategias de enseñanza",
  "Actividades",
  "Recursos didácticos",
  "Modalidad de evaluación y aprobación",
  "Bibliografía obligatoria",
  "Bibliografía complementaria",
];

/** Divide el texto -layout en { header, secciones: Map<nombre, líneas[]> }. */
function splitSections(layout) {
  const lines = clean(layout)
    .split("\n")
    .filter((l) => !isFooter(l));
  const headingRe = /^\s*➢\s*(.+?):\s*$/;
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(headingRe);
    if (m) heads.push({ name: m[1].trim(), i });
  });
  const header = lines.slice(0, heads.length ? heads[0].i : 0).join("\n");
  const secs = new Map();
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    secs.set(h.name, lines.slice(h.i + 1, end));
  });
  return { header, secs };
}

/** Une las líneas de una sección en párrafos (separados por línea en blanco). */
function prose(linesArr) {
  if (!linesArr) return "";
  const paras = [];
  let cur = [];
  for (const raw of linesArr) {
    const l = raw.trim();
    if (!l) {
      if (cur.length) paras.push(collapse(cur.join(" ")));
      cur = [];
    } else {
      cur.push(l);
    }
  }
  if (cur.length) paras.push(collapse(cur.join(" ")));
  return paras.filter(Boolean).join("\n\n");
}

/** Tabla "N° | Descripción" → array de descripciones (filas que envuelven se unen). */
function biblio(linesArr) {
  if (!linesArr) return [];
  const out = [];
  for (const raw of linesArr) {
    const l = raw.trim();
    if (!l || /^N°\s+Descripción/i.test(l) || /^\|/.test(raw) === false) {
      // las filas reales empiezan con número; el header "N° Descripción" se descarta
    }
    const m = l.match(/^(\d+)\s{1,}(.+)$/);
    if (m) {
      out.push(collapse(m[2]));
    } else if (out.length && l && !/^N°/i.test(l) && !/^Descripción/i.test(l)) {
      out[out.length - 1] = collapse(out[out.length - 1] + " " + l);
    }
  }
  return out;
}

// ---- temario (tabla "Contenidos") desde -bbox-layout -----------------------

/** Parsea el XHTML de -bbox-layout a una lista de bloques {page, xMin, yMin, text}. */
function parseBlocks(xml) {
  const blocks = [];
  const pageRe = /<page\b[^>]*>([\s\S]*?)<\/page>/g;
  let pm;
  let page = 0;
  while ((pm = pageRe.exec(xml))) {
    page++;
    const body = pm[1];
    const blockRe = /<block\s+xMin="([\d.]+)"\s+yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/block>/g;
    let bm;
    while ((bm = blockRe.exec(body))) {
      const xMin = parseFloat(bm[1]);
      const yMin = parseFloat(bm[2]);
      const words = [];
      const wRe = /<word\b[^>]*>([\s\S]*?)<\/word>/g;
      let wm;
      while ((wm = wRe.exec(bm[3]))) words.push(decodeXml(wm[1]));
      const text = clean(words.join(" ")).replace(/\s+/g, " ").trim();
      if (text) blocks.push({ page, xMin, yMin, text });
    }
  }
  return blocks;
}

const X_SPLIT = 120; // px: < es columna izquierda (título); >= es derecha (descripción)

/** Reconstruye la tabla "Contenidos" (temario) emparejando celdas por yMin. */
function parsePrograma(bboxXml) {
  const blocks = parseBlocks(bboxXml);
  const isHeading = (t) => /^Contenidos:?$/i.test(t.replace(/^➢\s*/, "").trim());
  const startEnd = (t) =>
    /^Estrategias de enseñanza:?$/i.test(t.replace(/^➢\s*/, "").trim());

  // rango de bloques entre el heading "Contenidos:" y "Estrategias de enseñanza:"
  let start = -1;
  let end = blocks.length;
  for (let i = 0; i < blocks.length; i++) {
    const t = blocks[i].text;
    if (start === -1 && /^➢/.test(t) && isHeading(t)) start = i + 1;
    else if (start !== -1 && /^➢/.test(t) && startEnd(t)) {
      end = i;
      break;
    }
  }
  if (start === -1) return [];

  const range = blocks.slice(start, end).filter((b) => {
    const t = b.text;
    if (isFooter(t) || /^\d+$/.test(t)) return false; // footers / nº de página
    if (/^Título$/i.test(t) || /^Descripción$/i.test(t)) return false; // header de la tabla
    return true;
  });

  // agrupar por (página, yMin redondeado) → filas
  const rows = new Map();
  for (const b of range) {
    const key = b.page * 10000 + Math.round(b.yMin);
    if (!rows.has(key)) rows.set(key, { key, left: [], right: [] });
    (b.xMin < X_SPLIT ? rows.get(key).left : rows.get(key).right).push(b.text);
  }
  const ordered = [...rows.values()].sort((a, b) => a.key - b.key);

  const unidades = [];
  for (const r of ordered) {
    const titulo = collapse(r.left.join(" "));
    const desc = collapse(r.right.join(" "));
    if (titulo) {
      unidades.push({ titulo, descripcion: desc });
    } else if (desc && unidades.length) {
      // celda de descripción que sigue en otra página (sin título) → continúa la anterior
      const last = unidades[unidades.length - 1];
      last.descripcion = collapse(last.descripcion + " " + desc);
    }
  }
  return unidades;
}

// ---- parser de una ficha ----------------------------------------------------

function parseFicha(codigo, file) {
  const layout = pdftotext(file, "-layout");
  const { header, secs } = splitSections(layout);
  const h = clean(header);

  const mMateria = h.match(/Materia:\s*([\s\S]*?)\s{2,}Código:\s*([\d.]+)/);
  const mCred = h.match(/Créditos:\s*(\d+)\s{2,}Carga horaria total:\s*(\d+)/);
  const mDepto = h.match(/Departamento:\s*([\s\S]*?)\s{2,}Año:\s*(\d{4})/);
  const mCarrera = h.match(/Carrera de:\s*([\s\S]*?)\s*Fecha última actualización/);
  const mFecha = h.match(/Fecha última actualización:\s*(.+)/);

  const carga = secs.get("Carga horaria")?.join("\n") || "";
  const cargaHoraria = {
    total: mCred ? Number(mCred[2]) : num(carga.match(/(\d+)\s+Horas totales/)),
    teoricas: num(carga.match(/(\d+)\s+hs\.?\s*teóricas/i)),
    practicas: num(carga.match(/(\d+)\s+hs\.?\s*prácticas/i)),
    laboratorio: num(carga.match(/(\d+)\s+hs\.?\s*(?:de\s+)?laboratorio/i)),
    semanales: num(carga.match(/(\d+)\s+Horas semanales/)),
    presencial: num(carga.match(/(\d+)\s+hs\.?\s*presencial/i)),
    distancia: num(carga.match(/(\d+)\s+hs\.?\s*a distancia/i)),
  };

  const bbox = pdftotext(file, "-bbox-layout");

  return {
    codigo,
    materia: mMateria ? collapse(mMateria[1]) : "",
    creditos: mCred ? Number(mCred[1]) : null,
    departamento: mDepto ? collapse(mDepto[1]) : "",
    anio: mDepto ? mDepto[2] : "",
    carrera: mCarrera ? collapse(mCarrera[1]) : "",
    actualizado: mFecha ? collapse(mFecha[1]) : "",
    cargaHoraria,
    contenidosMinimos: prose(secs.get("Contenidos mínimos")),
    presentacion: prose(secs.get("Presentación de la materia")),
    objetivos: prose(secs.get("Objetivos de aprendizaje")),
    programa: parsePrograma(bbox),
    estrategias: prose(secs.get("Estrategias de enseñanza")),
    evaluacion: prose(secs.get("Modalidad de evaluación y aprobación")),
    bibliografiaObligatoria: biblio(secs.get("Bibliografía obligatoria")),
    bibliografiaComplementaria: biblio(secs.get("Bibliografía complementaria")),
    pdf: `/electivas-fichas/${codigo}.pdf`,
  };
}

// ---- main -------------------------------------------------------------------

const pdfs = readdirSync(SRC_DIR)
  .filter((f) => f.endsWith(".pdf"))
  .sort((a, b) => a.localeCompare(b));

if (!pdfs.length) {
  throw new Error(`[build-fichas-data] no hay PDFs en ${SRC_DIR}`);
}

const fichas = {};
for (const f of pdfs) {
  const codigo = f.replace(/\.pdf$/, "");
  fichas[codigo] = parseFicha(codigo, path.join(SRC_DIR, f));
}

// orden estable por código para un diff limpio
const ordered = {};
for (const k of Object.keys(fichas).sort((a, b) => a.localeCompare(b))) {
  ordered[k] = fichas[k];
}

const header = `// AUTO-GENERADO por scripts/build-fichas-data.mjs — NO editar a mano.
// Fuente: public/electivas-fichas/<codigo>.pdf (Programas Analíticos - GRADO, ITBA).
// Regenerar con:
//   node scripts/build-fichas-data.mjs

import type { Ficha } from "./types";

/** Programas analíticos de electivas, indexados por código de materia. */
export const FICHAS: Record<string, Ficha> = `;

writeFileSync(OUT, header + JSON.stringify(ordered, null, 2) + ";\n");

// resumen por stdout
const withProg = Object.values(ordered).filter((f) => f.programa.length).length;
const withBib = Object.values(ordered).filter(
  (f) => f.bibliografiaObligatoria.length,
).length;
console.log(
  `[build-fichas-data] ${pdfs.length} fichas → lib/planner/fichas.ts` +
    ` · ${withProg} con temario · ${withBib} con bibliografía obligatoria`,
);
const sinPres = Object.values(ordered).filter((f) => !f.presentacion).length;
const sinMateria = Object.values(ordered).filter((f) => !f.materia).length;
if (sinPres) console.warn(`  ⚠ ${sinPres} sin "Presentación de la materia"`);
if (sinMateria) console.warn(`  ⚠ ${sinMateria} sin "Materia" en cabecera`);
