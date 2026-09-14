// Done-tests de components/planner/grafo/grafoModel.ts (PLAN.md §2.2).
// Node ≥ 23 con type stripping, sin dependencias: lee lib/planner/data.json
// a mano (fs + JSON.parse) y ejercita el módulo puro contra datos reales de
// Informática (plan S, 141 materias). Sale con exit(1) e imprime qué falló.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildAdjacency,
  chainOf,
  statusOf,
  frontierColumn,
  matchQuery,
  neighborOf,
} from "../components/planner/grafo/grafoModel.ts";
import type { Edge, Materia } from "../lib/planner/types.ts";
import type { GraphNode } from "../lib/planner/layoutGraph.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "lib", "planner", "data.json");

interface PlanData {
  obligatorias: Materia[];
  electivas: Materia[];
  edges: Edge[];
  aprobadasDefault: string[];
}
const data = JSON.parse(readFileSync(dataPath, "utf8")) as PlanData;

const obligatorias = data.obligatorias;
const electivas = data.electivas;
const materias: Materia[] = [...obligatorias, ...electivas];
const edges = data.edges;

let failed = false;
function check(desc: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`OK   ${desc}`);
  } else {
    failed = true;
    console.error(`FAIL ${desc}`, detail !== undefined ? detail : "");
  }
}

// ---------------------------------------------------------------------------
// buildAdjacency + chainOf
// ---------------------------------------------------------------------------
const adj = buildAdjacency(edges);

// 72.34 "EDA" (Estructura de Datos y Algoritmos): obligatoria de 2.º año
// (2.º cuatri) de Informática, con correlativas propias (93.59 Discreta,
// 72.33 POO) y muchas sucesoras (~20 materias la requieren directa o
// indirectamente): buena candidata para ejercitar "up" y "down" con más de
// un salto (el BFS tiene que ir más allá de predecesores/sucesores directos).
const CHAIN_ID = "72.34";
const chainMateria = materias.find((m) => m.codigo === CHAIN_ID);
check(
  `${CHAIN_ID} es una obligatoria de 2.º año con correlativas (fixture elegida a mano)`,
  !!chainMateria &&
    chainMateria.tipo === "obligatoria" &&
    chainMateria.anio === 2 &&
    chainMateria.correlativas.length > 0,
  chainMateria,
);

const chain = chainOf(CHAIN_ID, adj);
check(`chainOf(${CHAIN_ID}): up no vacío (tiene ancestros)`, chain.up.size > 0, [...chain.up]);
check(`chainOf(${CHAIN_ID}): down no vacío (tiene descendientes)`, chain.down.size > 0, chain.down.size);
check(
  `chainOf(${CHAIN_ID}): up y down no se solapan`,
  [...chain.up].every((id) => !chain.down.has(id)),
  [...chain.up].filter((id) => chain.down.has(id)),
);
check(`chainOf(${CHAIN_ID}): up no incluye al propio id`, !chain.up.has(CHAIN_ID));
check(`chainOf(${CHAIN_ID}): down no incluye al propio id`, !chain.down.has(CHAIN_ID));
check(
  `chainOf(${CHAIN_ID}): all = up ∪ down ∪ {id}`,
  chain.all.size === chain.up.size + chain.down.size + 1 &&
    [...chain.up, ...chain.down, CHAIN_ID].every((id) => chain.all.has(id)),
  { allSize: chain.all.size, upSize: chain.up.size, downSize: chain.down.size },
);
// Ancestros transitivos a mano: 72.34 requiere 93.59 y 72.33; 93.59 requiere
// 93.58; 72.33 requiere 72.31; 72.31 requiere 93.58 y 72.03. Si `up` los
// incluye a todos, el BFS efectivamente viajó más allá de los predecesores
// directos (que son solo 93.59 y 72.33).
const upEsperado = ["93.59", "72.33", "93.58", "72.31", "72.03"];
check(
  `chainOf(${CHAIN_ID}): up incluye ancestros transitivos, no solo directos`,
  upEsperado.every((id) => chain.up.has(id)),
  { esperado: upEsperado, obtenido: [...chain.up] },
);

// ---------------------------------------------------------------------------
// statusOf vs. isAvailable (reimplementación local e independiente)
// ---------------------------------------------------------------------------
check("el plan S tiene 141 materias (44 obligatorias + 97 electivas)", materias.length === 141, materias.length);

const primerAnio = obligatorias.filter((m) => m.anio === 1).map((m) => m.codigo);
const approved = new Set<string>([...data.aprobadasDefault, ...primerAnio]);
const finalDone = new Set<string>();
const cursando = new Set<string>();

const creditosPorCodigo = new Map<string, number>(materias.map((m) => [m.codigo, Number(m.creditos) || 0]));
function creditosAprobadosLocal(approvedSet: Set<string>): number {
  let s = 0;
  approvedSet.forEach((c) => (s += creditosPorCodigo.get(c) ?? 0));
  return s;
}

// Reimplementación local (independiente de lib/planner/metrics.ts) de la
// regla de isAvailable: aprobada → false; creditosReq > créditos aprobados →
// false; si no, todas las correlativas aprobadas.
function isAvailableLocal(m: Materia, approvedSet: Set<string>, credAprobados: number): boolean {
  if (approvedSet.has(m.codigo)) return false;
  if ((Number(m.creditosReq) || 0) > credAprobados) return false;
  return (m.correlativas || []).every((c) => approvedSet.has(c));
}

const credAprobados = creditosAprobadosLocal(approved);
const statusMismatches: string[] = [];
for (const m of materias) {
  const status = statusOf(m, {
    approved,
    finalDone,
    cursando,
    approvedCredits: credAprobados,
    tieneFinal: () => true, // no afecta avail/blocked: solo distingue regular/promo
  });
  const esAvail = status.estado === "avail";
  const esperadoAvail = isAvailableLocal(m, approved, credAprobados);
  if (esAvail !== esperadoAvail) statusMismatches.push(m.codigo);
}
check(
  `statusOf coincide con isAvailable-equivalente en las ${materias.length} materias ` +
    `(approved = aprobadasDefault ∪ obligatorias de 1.º año)`,
  statusMismatches.length === 0,
  statusMismatches,
);

// ---------------------------------------------------------------------------
// matchQuery
// ---------------------------------------------------------------------------
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const amMatches = matchQuery(materias, "am", norm);
check(
  'matchQuery("am") incluye AMI (93.26) y AMII (93.28)',
  amMatches.has("93.26") && amMatches.has("93.28"),
  [...amMatches],
);
const codigoMatches = matchQuery(materias, "72.34", norm);
check('matchQuery("72.34") matchea por código exacto', codigoMatches.has("72.34"), [...codigoMatches]);
check('matchQuery("noexisteninguna") es vacío', matchQuery(materias, "noexisteninguna", norm).size === 0);
check('matchQuery("") es vacío (consulta vacía)', matchQuery(materias, "", norm).size === 0);
check('matchQuery("   ") (solo espacios) es vacío', matchQuery(materias, "   ", norm).size === 0);

// ---------------------------------------------------------------------------
// frontierColumn + neighborOf
// ---------------------------------------------------------------------------
// GraphNode sintético: `col` por la fórmula nominal (anio,cuatri) →
// (anio-1)*2+(cuatri-1) — regla 2 de layoutGraph.ts §2.1 para obligatorias
// con nominal (todas las de Informática lo tienen). No se llama a
// computeGraphLayout(): frontierColumn/neighborOf solo necesitan
// id/ob/col/y, así U6 queda desacoplado del layout real de U1.
function colNominal(m: Materia): number {
  if (m.anio != null && m.cuatri != null) return (m.anio - 1) * 2 + (m.cuatri - 1);
  if (m.anio != null) return (m.anio - 1) * 2;
  return 0;
}

/** Arma nodos con `y` creciente DENTRO de cada columna (orden por código):
 *  así ArrowUp/ArrowDown tienen un orden conocido para comparar. */
function toGraphNodes(ms: Materia[]): GraphNode[] {
  const porColumna = new Map<number, Materia[]>();
  for (const m of ms) {
    const c = colNominal(m);
    if (!porColumna.has(c)) porColumna.set(c, []);
    porColumna.get(c)!.push(m);
  }
  const nodes: GraphNode[] = [];
  porColumna.forEach((ms2, c) => {
    const ordenadas = [...ms2].sort((a, b) => a.codigo.localeCompare(b.codigo));
    ordenadas.forEach((m, i) => {
      nodes.push({
        id: m.codigo,
        abbr: m.abbr,
        ob: m.tipo === "obligatoria",
        col: c,
        x: c * 200,
        y: i * 40,
        w: 108,
        h: m.tipo === "obligatoria" ? 34 : 28,
      });
    });
  });
  return nodes;
}

const nodes = toGraphNodes(obligatorias);

check("frontierColumn sin nada aprobado = columna de 1º·1c (0)", frontierColumn(nodes, new Set()) === 0);

const approved1Anio = new Set<string>(primerAnio);
check(
  "frontierColumn con todo 1.º año aprobado = 2 (primera obligatoria pendiente cae en 2º·1c)",
  frontierColumn(nodes, approved1Anio) === 2,
  frontierColumn(nodes, approved1Anio),
);

const approvedTodasLasObligatorias = new Set<string>(obligatorias.map((m) => m.codigo));
check(
  "frontierColumn con TODAS las obligatorias aprobadas = 0",
  frontierColumn(nodes, approvedTodasLasObligatorias) === 0,
);

// Columna 2 (2º·1c) de Informática, ordenada por código igual que toGraphNodes:
// 12.09, 72.32, 72.33, 93.35, 93.42.
const col2 = obligatorias
  .filter((m) => colNominal(m) === 2)
  .map((m) => m.codigo)
  .sort((a, b) => a.localeCompare(b));
check("hay ≥ 2 obligatorias en la columna 2 para probar ArrowUp/ArrowDown", col2.length >= 2, col2);

check(
  "neighborOf ArrowDown desde el primero de la columna 2 da el segundo",
  neighborOf(col2[0], "ArrowDown", nodes, adj) === col2[1],
);
check(
  "neighborOf ArrowUp desde el primero de la columna 2 da null (no hay anterior)",
  neighborOf(col2[0], "ArrowUp", nodes, adj) === null,
);
check(
  "neighborOf ArrowUp desde el segundo de la columna 2 da el primero",
  neighborOf(col2[1], "ArrowUp", nodes, adj) === col2[0],
);
check(
  "neighborOf ArrowDown desde el último de la columna 2 da null (no hay siguiente)",
  neighborOf(col2[col2.length - 1], "ArrowDown", nodes, adj) === null,
);

// ArrowRight/ArrowLeft: primera sucesora/predecesora según el orden de la
// lista de adyacencia (buildAdjacency conserva el orden de `edges`).
const succEda = adj.succ.get(CHAIN_ID) ?? [];
const predEda = adj.pred.get(CHAIN_ID) ?? [];
check(
  `${CHAIN_ID} tiene sucesoras y predecesoras para probar ArrowRight/ArrowLeft`,
  succEda.length > 0 && predEda.length > 0,
  { succEda, predEda },
);
check(
  `neighborOf ArrowRight(${CHAIN_ID}) = primera sucesora de la adyacencia`,
  neighborOf(CHAIN_ID, "ArrowRight", nodes, adj) === succEda[0],
);
check(
  `neighborOf ArrowLeft(${CHAIN_ID}) = primera predecesora de la adyacencia`,
  neighborOf(CHAIN_ID, "ArrowLeft", nodes, adj) === predEda[0],
);

// 94.24 "Metodología" está totalmente aislada (ninguna arista la toca, ver
// PLAN.md G-01): sin sucesoras ni predecesoras → ArrowRight/ArrowLeft = null.
check(
  "94.24 (aislada) no tiene aristas propias (fixture para el null de Arrow Right/Left)",
  !adj.succ.has("94.24") && !adj.pred.has("94.24"),
);
check("neighborOf ArrowRight(94.24) = null (sin sucesoras)", neighborOf("94.24", "ArrowRight", nodes, adj) === null);
check("neighborOf ArrowLeft(94.24) = null (sin predecesoras)", neighborOf("94.24", "ArrowLeft", nodes, adj) === null);
check("neighborOf con una key no reconocida da null", neighborOf(CHAIN_ID, "Enter", nodes, adj) === null);

if (failed) {
  console.error("\ntest-grafo-model: FALLÓ (ver FAIL arriba)");
  process.exit(1);
}
console.log("\ntest-grafo-model: OK");
