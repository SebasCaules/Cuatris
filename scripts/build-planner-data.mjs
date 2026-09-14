// ============================================================================
// build-planner-data.mjs — los datos del planner, una carrera por archivo
// ----------------------------------------------------------------------------
// Corre en prebuild/predev/typecheck y genera (todo fuera de git):
//   · lib/planner/data.json               Informática (S): el plan curado que
//                                         mantiene StudyVaults (data/plan/data.js),
//                                         con los horarios de acá.
//   · lib/planner/carreras/<CODIGO>.json  las demás carreras, desde el plan de
//                                         estudios bajado del SGA
//                                         (data/plan/carreras/<CODIGO>.json, que
//                                         emite build-carreras-data.mjs).
//   · lib/planner/carreras/index.ts       registro de carreras + import()
//                                         diferido de cada JSON (una carrera por
//                                         chunk: no viajan las 17 juntas).
//
// Horarios: para TODAS las carreras salen de data/plan/horarios/<periodo>.json
// (contrato 1.1.0 del scraper del proyecto anterior: catálogo entero del SGA),
// convertidos al formato del planner y recortados a las materias de cada plan.
// Reemplazan a los de data.js también para Informática (más cobertura y sin
// los errores de parseo del scraper viejo: docentes pegados, cupo «Ilimitado»,
// segunda aula perdida).
//
// Todas las carreras comparten la misma forma `Plan` (lib/planner/types.ts):
// la app no distingue de dónde salió cada una.
// ============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = process.cwd();
const SRC_DATA_JS = path.join(ROOT, "data", "plan", "data.js");
const SRC_CARRERAS = path.join(ROOT, "data", "plan", "carreras.json");
const SRC_CARRERAS_DIR = path.join(ROOT, "data", "plan", "carreras");
const SRC_HORARIOS_DIR = path.join(ROOT, "data", "plan", "horarios");
const DEST_DIR = path.join(ROOT, "lib", "planner");
const DEST_DEFAULT = path.join(DEST_DIR, "data.json");
const DEST_CARRERAS = path.join(DEST_DIR, "carreras");

/** Carrera que carga el sitio por defecto (la del plan curado de StudyVaults). */
const DEFAULT_CARRERA = "S";
const HOY = new Date().toISOString().slice(0, 10);

// ---- plan curado de Informática (data.js → window.PLAN) --------------------

function leerPlanCurado() {
  const code = readFileSync(SRC_DATA_JS, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox); // setea window.PLAN
  const PLAN = sandbox.window.PLAN;
  if (!PLAN || !Array.isArray(PLAN.obligatorias)) {
    throw new Error("[build-planner-data] window.PLAN inválido en " + SRC_DATA_JS);
  }
  // Build divulgable: el planner se publica SIN materias pre-aprobadas, para que
  // cada compañero arranque limpio y persista su propio progreso en localStorage.
  PLAN.aprobadasDefault = [];
  return PLAN;
}

// ---- horarios: contrato 1.1.0 → formato del planner -------------------------

const DIA = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
  domingo: "Domingo",
};
// Vocabulario del planner (time.ts decide conflictos de sede con "Virtual";
// el filtro del combinador ofrece Presencial / Virtual / Blended).
const MODALIDAD = {
  presencial: "Presencial",
  blended: "Blended",
  virtual: "Virtual",
  virtual_sincronica: "Virtual",
  virtual_asincronica: "Asincrónico",
  laboratorio: "Laboratorio",
};
const SEDE = { sdf: "Distrito Financiero", rectorado: "Rectorado", sdt: "SDT" };
const CUATRI_LABEL = { "1C": "Primer Cuat.", "2C": "Segundo Cuat." };
const PERIODO_LABEL = { "1C": "1.º cuatrimestre", "2C": "2.º cuatrimestre" };

const ddmmyyyy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

function convertirSlot(b) {
  const modalidad = MODALIDAD[b.modalidad] ?? (b.modalidad ? cap(b.modalidad) : "");
  const sede = b.sede ? (SEDE[b.sede] ?? b.sede.toUpperCase()) : "";
  const sala = (b.aulas ?? []).join(" · ");
  const partes = [sala ? "Aula " + sala : "", sede, modalidad].filter(Boolean);
  return {
    dia: DIA[b.dia] ?? cap(b.dia),
    desde: b.desde,
    hasta: b.hasta,
    aula: partes.join(" · "),
    sala,
    sede,
    modalidad,
    async: b.modalidad === "virtual_asincronica",
  };
}

function convertirComision(c) {
  const cap = c.cupo?.capacidad;
  const insc = c.ocupacion?.inscriptos;
  const cupo =
    cap != null && insc != null ? `${insc} / ${cap}` : insc != null ? `${insc} inscriptos` : "";
  return {
    comision: c.id,
    slots: (c.bloques ?? []).map(convertirSlot),
    profesores: (c.docentes ?? []).join(" · "),
    cupo,
  };
}

/** Lee el período más nuevo de data/plan/horarios/ y devuelve
 *  { horarios: Record<codigo, Horario>, periodoLabel }. */
function leerHorarios() {
  if (!existsSync(SRC_HORARIOS_DIR)) return { horarios: {}, periodoLabel: "" };
  const archivos = readdirSync(SRC_HORARIOS_DIR)
    .filter((f) => /^\d{4}-[12]C\.json$/.test(f))
    .sort();
  if (!archivos.length) return { horarios: {}, periodoLabel: "" };
  const src = path.join(SRC_HORARIOS_DIR, archivos[archivos.length - 1]);
  const doc = JSON.parse(readFileSync(src, "utf8"));
  if (!doc.contrato?.startsWith("1.") || !Array.isArray(doc.cursos)) {
    throw new Error(`[build-planner-data] ${src}: no es un archivo de horarios del contrato 1.x`);
  }
  const p = doc.periodo;
  const horarios = {};
  for (const c of doc.cursos) {
    horarios[c.codigo] = {
      periodo: CUATRI_LABEL[p.cuatrimestre] ?? p.cuatrimestre,
      anio: String(p.anio),
      comienzo: ddmmyyyy(c.desde),
      fin: ddmmyyyy(c.hasta),
      depto: c.departamento ?? "",
      comisiones: (c.comisiones ?? []).map(convertirComision),
      ...(c.dictado_conjunto?.length ? { conjunto: c.dictado_conjunto } : {}),
    };
  }
  const periodoLabel = `${PERIODO_LABEL[p.cuatrimestre] ?? p.cuatrimestre} ${p.anio}`;
  console.log(`[build-planner-data] horarios ${p.id}: ${doc.cursos.length} cursos (${path.basename(src)})`);
  return { horarios, periodoLabel };
}

// ---- abreviaturas -----------------------------------------------------------

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const STOP = new Set(["de", "la", "el", "y", "en", "a", "para", "los", "las", "del", "e", "al", "con", "un", "una"]);
const ROMAN = new Set(["i", "ii", "iii", "iv"]);

/** Port de auto_abbr (data/plan/build-data.py): iniciales de las palabras
 *  significativas, números romanos enteros. */
function autoAbbr(nombre) {
  const words = nombre.split(/[\s\-:()]+/).filter(Boolean);
  let sig = words.filter((w) => !STOP.has(w.toLowerCase()));
  if (!sig.length) sig = words;
  let ab = sig
    .slice(0, 5)
    .map((w) => (ROMAN.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase()))
    .join("");
  if (ab.length < 2) ab = cap(sig[0].slice(0, 5));
  return ab;
}

// ---- plan de estudios del SGA → Plan del planner ---------------------------

// Regímenes sin cursada por cuatrimestre: no se planifican. Las anuales (lo
// que el plan marca «(Anual)»; en Informática, 72.45 Proyecto Final) sí: como
// dos cuatrimestres consecutivos con los créditos en mitades. Un «Proyecto
// Final» sin esa marca no se asume anual (Química lo parte en I y II).
const NO_PLANIFICABLE_RE = /pr[aá]ctica (laboral|profesional)/i;
const ANUAL_RE = /\(anual\)/i;
// Requisitos sin cursada (Inglés I/II, 0 cr): no se planifican como materia;
// el plan los muestra como «tener aprobado» en el cuatrimestre que les toca.
const REQUISITO_RE = /^ingl[eé]s\b/i;
const requisitosDe = (obligatorias) =>
  obligatorias.filter((m) => REQUISITO_RE.test(m.nombre)).map((m) => m.codigo);

/** Colores para las áreas de electivas que no tienen uno curado (AREA_COLOR
 *  en model.ts cubre las de Informática). */
function armarPlan(sga, abbrs, horariosAll, periodoLabel) {
  const bloques = sga.bloques ?? [];
  const obligBloques = bloques.filter((b) => b.tipo === "todos");
  const elecBloques = bloques.filter((b) => b.tipo !== "todos");
  const conMaterias = elecBloques.filter((b) => b.secciones.some((s) => s.materias.length));
  // Áreas = bloques de electivas con materias, cuando hay más de uno (Industrial
  // tiene siete «Bloque … Electivas»; Informática usa los minors del Excel).
  const areas = conMaterias.length > 1 ? conMaterias.map((b) => b.nombre) : [];
  const areaReq = {};
  for (const b of conMaterias) if (b.creditos != null) areaReq[b.nombre] = b.creditos;

  const abbrOf = (codigo, nombre) => abbrs.get(codigo) ?? autoAbbr(nombre);
  const obligatorias = [];
  for (const b of obligBloques) {
    const anioBloque = b.nombre.match(/A[ñn]o\s+(\d+)/i);
    for (const s of b.secciones) {
      const anio = s.anio ?? (anioBloque ? Number(anioBloque[1]) : null);
      const cuatri = s.cuatri ?? null;
      for (const m of s.materias) {
        obligatorias.push({
          codigo: m.codigo,
          nombre: m.nombre,
          abbr: abbrOf(m.codigo, m.nombre),
          creditos: m.creditos || 0,
          creditosReq: m.creditosReq || 0,
          correlativas: m.correlativas,
          ciclo: b.nombre,
          seccion: s.nombre ?? "",
          anio,
          cuatri,
          parity: cuatri === 1 || cuatri === 2 ? cuatri : null,
          tipo: "obligatoria",
        });
      }
    }
  }
  const electivas = [];
  for (const b of elecBloques) {
    for (const s of b.secciones) {
      for (const m of s.materias) {
        electivas.push({
          codigo: m.codigo,
          nombre: m.nombre,
          abbr: abbrOf(m.codigo, m.nombre),
          creditos: m.creditos || 0,
          creditosReq: m.creditosReq || 0,
          correlativas: m.correlativas,
          areas: areas.length ? [b.nombre] : [],
          parity: null,
          tipo: "electiva",
        });
      }
    }
  }
  const edges = [];
  const seen = new Set();
  for (const m of [...obligatorias, ...electivas]) {
    for (const c of m.correlativas) {
      const k = c + ">" + m.codigo;
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({ from: c, to: m.codigo });
      }
    }
  }
  const creditosElectivasReq = elecBloques
    .filter((b) => b.tipo === "creditos")
    .reduce((n, b) => n + (b.creditos ?? 0), 0);
  const intermedio = (sga.titulos ?? []).find((t) => /intermedio/i.test(t.tipo));
  const principal = (sga.titulos ?? []).find((t) => /principal/i.test(t.tipo));
  return {
    carrera: { codigo: sga.carrera.codigo, nombre: sga.carrera.nombre },
    planId: sga.plan,
    periodoLabel,
    areas,
    areaReq,
    obligatorias,
    electivas,
    horarios: recortarHorarios(horariosAll, [...obligatorias, ...electivas]),
    edges,
    aprobadasDefault: [],
    creditosElectivasReq,
    tituloAnalista: intermedio?.creditos ?? null,
    tituloFinal: principal ? { nombre: principal.titulo, creditos: principal.creditos } : null,
    noPlanificables: [
      ...obligatorias.filter((m) => NO_PLANIFICABLE_RE.test(m.nombre)).map((m) => m.codigo),
      ...requisitosDe(obligatorias),
    ],
    requisitos: requisitosDe(obligatorias),
    anuales: obligatorias
      .filter((m) => ANUAL_RE.test(m.nombre) && !NO_PLANIFICABLE_RE.test(m.nombre) && m.creditos > 0)
      .map((m) => m.codigo),
    generado: HOY,
  };
}

function recortarHorarios(horariosAll, materias) {
  const out = {};
  for (const m of materias) if (horariosAll[m.codigo]) out[m.codigo] = horariosAll[m.codigo];
  return out;
}

// ---- main ------------------------------------------------------------------

const { horarios: horariosAll, periodoLabel } = leerHorarios();

// Informática: el plan curado, con campos nuevos y los horarios de acá.
const curado = leerPlanCurado();
const abbrs = new Map([...curado.obligatorias, ...curado.electivas].map((m) => [m.codigo, m.abbr]));
const indice = existsSync(SRC_CARRERAS) ? JSON.parse(readFileSync(SRC_CARRERAS, "utf8")) : { carreras: [] };
const infoS = indice.carreras.find((c) => c.codigo === DEFAULT_CARRERA);
const planS = {
  carrera: { codigo: DEFAULT_CARRERA, nombre: infoS?.nombre ?? "Ingeniería en Informática" },
  planId: infoS?.plan ?? "S10-Rev23",
  periodoLabel,
  ...curado,
  areaReq: {},
  minorReq: 14,
  horarios: Object.keys(horariosAll).length
    ? recortarHorarios(horariosAll, [...curado.obligatorias, ...curado.electivas])
    : curado.horarios,
  tituloFinal: { nombre: "Ingeniero/a en Informática", creditos: 243 },
  // 72.98 Práctica Laboral: régimen especial (0 cr, sin cursada). Inglés I/II:
  // requisitos sin cursada, señalados en su cuatrimestre. 72.45 Proyecto Final
  // es ANUAL: 12 cr en dos cuatrimestres consecutivos.
  noPlanificables: ["72.98", ...requisitosDe(curado.obligatorias)],
  requisitos: requisitosDe(curado.obligatorias),
  anuales: ["72.45"],
};
mkdirSync(DEST_DIR, { recursive: true });
writeFileSync(DEST_DEFAULT, JSON.stringify(planS));
console.log(
  `[build-planner-data] S ${planS.carrera.nombre}: ${planS.obligatorias.length} obligatorias · ${planS.electivas.length} electivas · ${Object.keys(planS.horarios).length} con horario · ${planS.edges.length} edges → lib/planner/data.json`,
);

// Las demás carreras, desde el plan del SGA.
mkdirSync(DEST_CARRERAS, { recursive: true });
const registro = [];
for (const c of indice.carreras) {
  if (c.codigo === DEFAULT_CARRERA) {
    registro.push({ codigo: c.codigo, nombre: c.nombre, plan: planS.planId, disponible: true });
    continue;
  }
  const src = path.join(SRC_CARRERAS_DIR, `${c.codigo}.json`);
  if (!c.plan || c.vacio || !existsSync(src)) {
    registro.push({ codigo: c.codigo, nombre: c.nombre, plan: c.plan ?? null, disponible: false });
    continue;
  }
  const sga = JSON.parse(readFileSync(src, "utf8"));
  const plan = armarPlan(sga, abbrs, horariosAll, periodoLabel);
  if (!plan.obligatorias.length && !plan.electivas.length) {
    registro.push({ codigo: c.codigo, nombre: c.nombre, plan: c.plan, disponible: false });
    continue;
  }
  writeFileSync(path.join(DEST_CARRERAS, `${c.codigo}.json`), JSON.stringify(plan));
  registro.push({ codigo: c.codigo, nombre: c.nombre, plan: plan.planId, disponible: true });
  console.log(
    `[build-planner-data] ${c.codigo} ${c.nombre}: ${plan.obligatorias.length} obligatorias · ${plan.electivas.length} electivas (${plan.areas.length} áreas) · ${Object.keys(plan.horarios).length} con horario`,
  );
}

// Registro + loaders diferidos. Las carreras sin plan disponible (Intercambio,
// un plan vacío en el SGA) quedan listadas para que el selector las muestre
// deshabilitadas, sin loader.
const loaders = registro
  .filter((c) => c.disponible && c.codigo !== DEFAULT_CARRERA)
  .map(
    (c) =>
      `  ${JSON.stringify(c.codigo)}: () =>\n    import("./${c.codigo}.json").then((m) => ({ default: m.default as unknown as Plan })),`,
  )
  .join("\n");
writeFileSync(
  path.join(DEST_CARRERAS, "index.ts"),
  `// Generado por scripts/build-planner-data.mjs — no editar a mano.
// Registro de carreras de grado del ITBA y carga diferida del plan de cada una
// (un JSON por carrera). La carrera por defecto (${DEFAULT_CARRERA}) viaja en el bundle
// como lib/planner/data.json y no necesita loader.
import type { Plan } from "../types";

export interface CarreraInfo {
  codigo: string;
  nombre: string;
  /** id del plan de estudios cargado (p. ej. "S10-Rev23"); null si no hay. */
  plan: string | null;
  /** false: sin plan utilizable (Intercambio, plan vacío en el SGA). */
  disponible: boolean;
}

export const DEFAULT_CARRERA = ${JSON.stringify(DEFAULT_CARRERA)};

export const CARRERAS: readonly CarreraInfo[] = ${JSON.stringify(registro, null, 2)};

export const LOADERS: Record<string, () => Promise<{ default: Plan }>> = {
${loaders}
};
`,
);
console.log(
  `[build-planner-data] ${registro.filter((c) => c.disponible).length}/${registro.length} carreras disponibles → lib/planner/carreras/`,
);
