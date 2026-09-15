// Modelo puro del mapa de correlativas: adyacencia, cadenas (aguas arriba /
// aguas abajo), estado visual de cada nodo, columna de frontera, búsqueda y
// navegación por teclado. Solo tipos como dependencia (cero imports en
// runtime): así el módulo se puede testear con Node sin resolver nada
// (scripts/test-grafo-model.mts) y sin acoplarse al resto del planner.
import type { Edge, Materia } from "@/lib/planner/types";
import type { GraphNode } from "@/lib/planner/layoutGraph";

/** Listas de adyacencia del grafo de correlativas. Cada `Edge` va
 *  `correlativa → materia` (`Materia.correlativas`), así que `succ(c)` son las
 *  materias que requieren `c` directamente (lo que `c` habilita) y `pred(m)`
 *  son las correlativas directas de `m` (lo que `m` requiere). */
export interface GraphAdjacency {
  succ: Map<string, string[]>;
  pred: Map<string, string[]>;
}

export function buildAdjacency(edges: Edge[]): GraphAdjacency {
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  for (const e of edges) {
    if (!succ.has(e.from)) succ.set(e.from, []);
    succ.get(e.from)!.push(e.to);
    if (!pred.has(e.to)) pred.set(e.to, []);
    pred.get(e.to)!.push(e.from);
  }
  return { succ, pred };
}

/** Recorrido iterativo (BFS por niveles, sin recursión) de todos los nodos
 *  alcanzables desde `start` siguiendo `rel`, sin incluir a `start` mismo.
 *  Seguro ante ciclos (no debería haberlos: es un DAG de correlativas). */
function reachable(start: string, rel: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  let head = 0;
  for (const n of rel.get(start) ?? []) {
    if (n !== start && !seen.has(n)) {
      seen.add(n);
      queue.push(n);
    }
  }
  while (head < queue.length) {
    const cur = queue[head++];
    for (const n of rel.get(cur) ?? []) {
      if (n !== start && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** up = todo lo que necesita (ancestros), down = todo lo que destraba
 *  (descendientes); all = up ∪ down ∪ {id}. */
export interface Chain {
  up: Set<string>;
  down: Set<string>;
  all: Set<string>;
}

export function chainOf(id: string, adj: GraphAdjacency): Chain {
  const up = reachable(id, adj.pred);
  const down = reachable(id, adj.succ);
  return { up, down, all: new Set<string>([...up, ...down, id]) };
}

export type NodeEstado =
  | "final"
  | "regular"
  | "promo"
  | "cursando"
  | "avail"
  | "blocked";

export interface NodeStatus {
  estado: NodeEstado;
  faltanCorr: string[];
  faltanCred: number;
}

export interface StatusCtx {
  approved: Set<string>;
  finalDone: Set<string>;
  cursando: Set<string>;
  approvedCredits: number;
  tieneFinal: (code: string) => boolean;
}

/** Estado visual de un nodo: misma verdad que `metrics.isAvailable` +
 *  `estado.estadoOf`, con la promoción separada de "regular" (cursada, falta
 *  final) según `tieneFinal` — igual que `EstadoControl`. `faltanCorr` /
 *  `faltanCred` solo se completan cuando el resultado es "avail" o "blocked";
 *  en los demás estados no aplican y van vacíos. */
export function statusOf(m: Materia, ctx: StatusCtx): NodeStatus {
  if (ctx.finalDone.has(m.codigo)) {
    return { estado: "final", faltanCorr: [], faltanCred: 0 };
  }
  if (ctx.approved.has(m.codigo)) {
    return {
      estado: ctx.tieneFinal(m.codigo) ? "regular" : "promo",
      faltanCorr: [],
      faltanCred: 0,
    };
  }
  if (ctx.cursando.has(m.codigo)) {
    return { estado: "cursando", faltanCorr: [], faltanCred: 0 };
  }
  const faltanCorr = (m.correlativas || []).filter((c) => !ctx.approved.has(c));
  const faltanCred = Math.max(
    0,
    (Number(m.creditosReq) || 0) - ctx.approvedCredits,
  );
  const estado: NodeEstado =
    faltanCorr.length === 0 && faltanCred === 0 ? "avail" : "blocked";
  return { estado, faltanCorr, faltanCred };
}

/** Primera columna con alguna obligatoria no aprobada; 0 si no hay (todas las
 *  obligatorias de `nodes` están aprobadas, o no hay ninguna). */
export function frontierColumn(nodes: GraphNode[], approved: Set<string>): number {
  let min: number | null = null;
  for (const n of nodes) {
    if (!n.ob || approved.has(n.id)) continue;
    if (min === null || n.col < min) min = n.col;
  }
  return min ?? 0;
}

/** ids cuyo código, sigla o nombre normalizados (con `norm`) contienen la
 *  consulta normalizada; vacío si la consulta está vacía. La consulta se
 *  recorta antes de normalizar: una búsqueda en blanco (o solo espacios) no
 *  debe "matchear" todo por incluir la cadena vacía. */
export function matchQuery(
  materias: Materia[],
  query: string,
  norm: (s: string) => string,
): Set<string> {
  const out = new Set<string>();
  const q = norm(query.trim());
  if (!q) return out;
  for (const m of materias) {
    if (
      norm(m.codigo).includes(q) ||
      norm(m.abbr).includes(q) ||
      norm(m.nombre).includes(q)
    ) {
      out.add(m.codigo);
    }
  }
  return out;
}

/** Vecino para navegación por teclado (roving tabindex): ArrowRight = primera
 *  sucesora (orden de la lista de adyacencia), ArrowLeft = primera
 *  predecesora, ArrowUp/ArrowDown = nodo anterior/siguiente de la misma
 *  columna (`GraphNode.col`): primero las obligatorias (la banda de arriba),
 *  después las electivas sub-columna por sub-columna (por `x` y luego `y`):
 *  bajar desde la última obligatoria llega a la cima de la primera
 *  sub-columna y nunca salta a la de al lado. `null` si no hay vecino. */
export function neighborOf(
  id: string,
  key: string,
  nodes: GraphNode[],
  adj: GraphAdjacency,
): string | null {
  if (key === "ArrowRight") return adj.succ.get(id)?.[0] ?? null;
  if (key === "ArrowLeft") return adj.pred.get(id)?.[0] ?? null;
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;

  const cur = nodes.find((n) => n.id === id);
  if (!cur) return null;
  const columna = nodes
    .filter((n) => n.col === cur.col)
    .sort((a, b) => (a.ob === b.ob ? 0 : a.ob ? -1 : 1) || a.x - b.x || a.y - b.y);
  const idx = columna.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  const next = idx + (key === "ArrowUp" ? -1 : 1);
  return next >= 0 && next < columna.length ? columna[next].id : null;
}
