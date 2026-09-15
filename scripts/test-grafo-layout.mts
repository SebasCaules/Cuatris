// Done-tests de lib/planner/layoutGraph.ts (PLAN.md §2.1).
// Node ≥ 23 con type stripping, sin dependencias: lee lib/planner/data.json y
// lib/planner/carreras/*.json a mano (fs + JSON.parse) — las 16 carreras — y
// ejercita computeGraphLayout con la capa de electivas encendida y apagada.
// Sale con exit(1) e imprime qué falló; siempre imprime una tabla por plan.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeGraphLayout, GRAPH_METRICS } from "../lib/planner/layoutGraph.ts";
import type { GraphLayout, GraphNode } from "../lib/planner/layoutGraph.ts";
import type { Edge, Materia, Plan } from "../lib/planner/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const plannerDir = join(__dirname, "..", "lib", "planner");

interface PlanFixture {
  codigo: string;
  plan: Plan;
}

function loadPlan(codigo: string, file: string): PlanFixture {
  const raw = JSON.parse(readFileSync(file, "utf8")) as Plan;
  return { codigo, plan: raw };
}

const fixtures: PlanFixture[] = [loadPlan("S", join(plannerDir, "data.json"))];
const carrerasDir = join(plannerDir, "carreras");
readdirSync(carrerasDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .forEach((f) => {
    const codigo = f.replace(/\.json$/, "");
    fixtures.push(loadPlan(codigo, join(carrerasDir, f)));
  });

let failed = false;
function check(desc: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`OK   ${desc}`);
  } else {
    failed = true;
    console.error(`FAIL ${desc}`, detail !== undefined ? detail : "");
  }
}

function allMaterias(plan: Plan): Materia[] {
  return [...(plan.obligatorias ?? []), ...(plan.electivas ?? [])];
}

function nominalColOf(m: Materia): number | null {
  if (m.anio == null) return null;
  if (m.cuatri == null) return (m.anio - 1) * 2;
  return (m.anio - 1) * 2 + (m.cuatri - 1);
}

/** Cruces aproximados: solo cuenta inversiones entre columnas ADYACENTES,
 *  sobre aristas obligatoria→obligatoria (diagnóstico, no criterio de pase). */
function approxCrossings(layout: GraphLayout): number {
  const colOf = new Map<string, number>();
  const orderInCol = new Map<string, number>();
  const byCol = new Map<number, GraphNode[]>();
  layout.nodes.forEach((n) => {
    if (!n.ob) return;
    colOf.set(n.id, n.col);
    if (!byCol.has(n.col)) byCol.set(n.col, []);
    byCol.get(n.col)!.push(n);
  });
  byCol.forEach((list) => {
    list
      .slice()
      .sort((a, b) => a.y - b.y)
      .forEach((n, i) => orderInCol.set(n.id, i));
  });
  let crossings = 0;
  const maxCol = Math.max(0, ...[...colOf.values()]);
  for (let c = 0; c < maxCol; c++) {
    const pairs = layout.edges
      .filter((e) => colOf.get(e.from) === c && colOf.get(e.to) === c + 1)
      .map((e) => [orderInCol.get(e.from)!, orderInCol.get(e.to)!] as const);
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [a1, b1] = pairs[i];
        const [a2, b2] = pairs[j];
        if ((a1 - a2) * (b1 - b2) < 0) crossings++;
      }
    }
  }
  return crossings;
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  const EPS = 0.01;
  return (
    a.x + EPS < b.x + b.w &&
    b.x + EPS < a.x + a.w &&
    a.y + EPS < b.y + b.h &&
    b.y + EPS < a.y + a.h
  );
}

const rows: string[] = [];

for (const { codigo, plan } of fixtures) {
  const materias = allMaterias(plan);
  const byCodigo = new Map(materias.map((m) => [m.codigo, m]));
  const nOb = plan.obligatorias?.length ?? 0;
  const nEl = plan.electivas?.length ?? 0;

  const layoutOff = computeGraphLayout(plan, { electivas: false });
  const layoutOn = computeGraphLayout(plan, { electivas: true });

  for (const [tag, layout] of [
    ["off", layoutOff],
    ["on", layoutOn],
  ] as const) {
    const expectedNodes = tag === "on" ? nOb + nEl : nOb;

    // (a) un nodo por materia
    check(
      `${codigo} [${tag}] un nodo por materia (${layout.nodes.length} === ${expectedNodes})`,
      layout.nodes.length === expectedNodes,
      layout.nodes.length,
    );

    // (b) toda arista col(to) > col(from)
    const colOf = new Map(layout.nodes.map((n) => [n.id, n.col]));
    const badEdges = layout.edges.filter(
      (e) => !(colOf.get(e.to)! > colOf.get(e.from)!),
    );
    check(
      `${codigo} [${tag}] toda arista va estrictamente hacia adelante`,
      badEdges.length === 0,
      badEdges.slice(0, 5),
    );

    // (c) sin solapamiento; ningún nodo por encima de PAD+HEADER_H
    const top0 = GRAPH_METRICS.PAD + GRAPH_METRICS.HEADER_H;
    const aboveHeader = layout.nodes.filter((n) => n.y < top0 - 0.01);
    check(
      `${codigo} [${tag}] ningún nodo por encima de PAD+HEADER_H`,
      aboveHeader.length === 0,
      aboveHeader.slice(0, 3),
    );
    let overlap: [GraphNode, GraphNode] | null = null;
    outer: for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        if (rectsOverlap(layout.nodes[i], layout.nodes[j])) {
          overlap = [layout.nodes[i], layout.nodes[j]];
          break outer;
        }
      }
    }
    check(`${codigo} [${tag}] cero solapamientos de rectángulos`, !overlap, overlap);

    // (f) determinismo
    const again = computeGraphLayout(plan, { electivas: tag === "on" });
    check(
      `${codigo} [${tag}] determinista (misma entrada → mismo JSON)`,
      JSON.stringify(layout) === JSON.stringify(again),
    );

    // ancho/alto finitos
    check(
      `${codigo} [${tag}] width/height finitos`,
      Number.isFinite(layout.width) && Number.isFinite(layout.height),
      { width: layout.width, height: layout.height },
    );
  }

  // (d) obligatorias: misma columna y misma y con la capa encendida y apagada
  // (la x puede correrse: con la capa encendida las columnas con sub-columnas
  // de electivas se ensanchan y corren a las siguientes)
  const obOff = new Map(layoutOff.nodes.map((n) => [n.id, n]));
  const obOn = new Map(layoutOn.nodes.filter((n) => n.ob).map((n) => [n.id, n]));
  let obMismatch: string | null = null;
  for (const [id, nOffNode] of obOff) {
    const nOnNode = obOn.get(id);
    if (!nOnNode || nOnNode.col !== nOffNode.col || nOnNode.y !== nOffNode.y) {
      obMismatch = id;
      break;
    }
  }
  check(
    `${codigo} obligatorias: misma columna e y con la capa encendida y apagada`,
    obMismatch === null,
    obMismatch,
  );
  // con la capa apagada ninguna columna se ensancha: el espinazo queda compacto
  check(
    `${codigo} [off] todas las columnas miden NODE_W`,
    layoutOff.columns.every((c) => c.width === GRAPH_METRICS.NODE_W),
    layoutOff.columns.map((c) => c.width),
  );
  // …y ninguna columna queda vacía (una electiva empujada más allá de la
  // última obligatoria no deja una columna fantasma al final)
  for (const tag of ["off", "on"] as const) {
    const lay = tag === "off" ? layoutOff : layoutOn;
    const vacias = lay.columns.filter((c) => !lay.nodes.some((n) => n.col === c.index)).map((c) => c.index);
    check(`${codigo} [${tag}] ninguna columna sin nodos`, vacias.length === 0, vacias);
    // planes con año pero sin cuatrimestre (LCA): cada obligatoria cae en una
    // columna de SU año (el año se parte en tantas columnas como haga falta).
    // Con cuatrimestre, la pasada de validez puede correr una materia al
    // cuatrimestre siguiente (LCC 94.66 ← 11.67, ambas de 2º·2c): se acepta.
    if (plan.obligatorias.every((m) => m.cuatri == null)) {
      const malAnio = lay.nodes
        .filter((n) => n.ob)
        .map((n) => ({ n, m: plan.obligatorias.find((m) => m.codigo === n.id)! }))
        .filter(({ n, m }) => m.anio != null && lay.columns[n.col].year !== m.anio)
        .map(({ n }) => n.id);
      check(`${codigo} [${tag}] ninguna obligatoria bajo la cabecera de otro año`, malAnio.length === 0, malAnio);
    }
    // las cabeceras no se repiten: un rótulo por cuatrimestre (o por año)
    const tops = lay.columns.map((c) => (c.top ?? "") + (c.sub ?? "")).filter(Boolean);
    check(`${codigo} [${tag}] cabeceras sin repetir`, new Set(tops).size === tops.length, tops);
  }

  // (g) ninguna columna de electivas con más de MAX_ROWS filas
  const subColCount = new Map<string, number>();
  layoutOn.nodes
    .filter((n) => !n.ob)
    .forEach((n) => {
      const key = `${n.col}:${n.x}`;
      subColCount.set(key, (subColCount.get(key) ?? 0) + 1);
    });
  const overflow = [...subColCount.entries()].filter(
    ([, n]) => n > GRAPH_METRICS.MAX_ROWS,
  );
  check(
    `${codigo} ninguna sub-columna de electivas supera MAX_ROWS`,
    overflow.length === 0,
    overflow,
  );

  // ---- casos puntuales conocidos ------------------------------------------
  if (codigo === "S") {
    function colOfLayout(l: GraphLayout, id: string): number | undefined {
      return l.nodes.find((n) => n.id === id)?.col;
    }
    const bad = (plan.obligatorias ?? []).filter((m) => {
      const nom = nominalColOf(m);
      return nom != null && colOfLayout(layoutOn, m.codigo) !== nom;
    });
    check(
      "S: columna de cada obligatoria = su cuatrimestre nominal",
      bad.length === 0,
      bad.map((m) => m.codigo),
    );
    const sinCorrNiCred = (plan.electivas ?? []).filter(
      (m) => (m.correlativas ?? []).length === 0 && (Number(m.creditosReq) || 0) === 0,
    );
    const malUbicadas = sinCorrNiCred.filter(
      (m) => colOfLayout(layoutOn, m.codigo) !== 0,
    );
    check(
      "S: electivas sin correlativas ni créditos van a la columna 0",
      sinCorrNiCred.length > 0 && malUbicadas.length === 0,
      { total: sinCorrNiCred.length, mal: malUbicadas.map((m) => m.codigo) },
    );
  }

  if (codigo === "LCA") {
    check(
      "LCA: al menos 2 columnas",
      layoutOn.columns.length >= 2,
      layoutOn.columns.length,
    );
    check(
      "LCA: sub === null en todas las columnas (sin cuatri nominal)",
      layoutOn.columns.every((c) => c.sub === null),
      layoutOn.columns.map((c) => c.sub),
    );
  }

  if (codigo === "P") {
    const n02 = layoutOn.nodes.find((n) => n.id === "46.02");
    const n03 = layoutOn.nodes.find((n) => n.id === "46.03");
    check(
      "P: 46.02→46.03 la pasada de validez empuja a 46.03 una columna más allá",
      !!n02 && !!n03 && n03.col === n02.col + 1,
      { n02: n02?.col, n03: n03?.col },
    );
    if (n03) {
      const colInfo = layoutOn.columns[n03.col];
      check(
        "P: la columna de 46.03 no tiene cabecera (más allá de la última nominal)",
        !!colInfo && colInfo.top === null && colInfo.sub === null,
        colInfo,
      );
    }
  }

  if (codigo === "E") {
    const touchesMissing = layoutOn.edges.some(
      (e) => e.from === "31.17" || e.to === "31.17",
    );
    check(
      "E: la correlativa a un código ausente del plan (31.17) se descarta",
      !touchesMissing && !byCodigo.has("31.17"),
    );
  }

  if (codigo === "B" || codigo === "LCC") {
    check(
      `${codigo}: sin electivas en el plan → hasElectivas false aunque opts.electivas sea true`,
      layoutOn.hasElectivas === false,
      layoutOn.hasElectivas,
    );
    check(
      `${codigo}: sin nodos de electiva aunque la capa esté encendida`,
      layoutOn.nodes.every((n) => n.ob),
    );
  }

  if (codigo === "I") {
    const aisladasConCredito = (plan.electivas ?? []).filter(
      (m) => (m.correlativas ?? []).length === 0 && Number(m.creditosReq) > 0,
    );
    check(
      "I: hay electivas aisladas que exigen créditos (no todas caen en la columna 0)",
      aisladasConCredito.length > 0 &&
        aisladasConCredito.some((m) => {
          const n = layoutOn.nodes.find((x) => x.id === m.codigo);
          return !!n && n.col > 0;
        }),
    );
    const bySubcol = new Map<string, number>();
    layoutOn.nodes
      .filter((n) => !n.ob)
      .forEach((n) => {
        const key = `${n.col}:${n.x}`;
        bySubcol.set(key, (bySubcol.get(key) ?? 0) + 1);
      });
    check(
      "I: al menos una columna de electivas necesita varias sub-columnas de 14",
      [...bySubcol.values()].some((n) => n === GRAPH_METRICS.MAX_ROWS),
    );
  }

  // ---- (h) tabla de diagnóstico --------------------------------------------
  const crossingsOn = approxCrossings(layoutOn);
  rows.push(
    `${codigo.padEnd(6)} cols=${String(layoutOn.columns.length).padStart(3)} ` +
      `${Math.round(layoutOn.width)}x${Math.round(layoutOn.height)}`.padEnd(16) +
      ` nodos(off/on)=${layoutOff.nodes.length}/${layoutOn.nodes.length}` +
      ` aristas(off/on)=${layoutOff.edges.length}/${layoutOn.edges.length}` +
      ` cruces~=${crossingsOn}`,
  );
}

console.log("\n---- tabla por plan (capa de electivas encendida salvo donde se indica) ----");
rows.forEach((r) => console.log(r));

if (failed) {
  console.error("\nFALLÓ test-grafo-layout");
  process.exit(1);
} else {
  console.log("\nOK: test-grafo-layout");
}
