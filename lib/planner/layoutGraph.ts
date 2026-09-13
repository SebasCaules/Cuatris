// Layout jerárquico L→R del grafo de correlativas (DAG de 122 aristas, 95 nodos).
// Puro y determinístico → se renderiza como SVG en GrafoView (sin librería de grafos).
//
// El plan tiene una forma muy particular: un ESPINAZO de ~35 obligatorias
// encadenadas + ~60 electivas que son HOJAS (casi todas sumidero) colgando de
// una o dos obligatorias. La ronda 1 usaba longest-path puro y las hojas se
// desparramaban en columnas gigantes (una de 23 nodos) con 132 cruces → "chiquero".
//
// Este layout lo emprolija en tres pasos clásicos de Sugiyama, todos deterministas:
//   1. LAYERING por CUATRIMESTRE (año/cuatri) para las obligatorias — las 10
//      columnas se leen como la cursada real (1º·1c … 5º·2c). Todas las aristas
//      obligatoria→obligatoria van estrictamente hacia adelante en ese orden, así
//      que es un layering L→R válido. Cada electiva se ubica un cuatri DESPUÉS de
//      su última correlativa (así la arista es corta y hacia adelante).
//   2. REDUCCIÓN DE CRUCES por la heurística de la mediana (barridas alternadas
//      arriba/abajo). Baja los cruces de ~132 a ~10.
//   3. ASIGNACIÓN DE COORDENADAS (vertical) por centrado rígido de cada columna
//      sobre el baricentro de sus vecinas: separación pareja garantizada, cero
//      solapamientos y sin la divergencia del ajuste por-nodo.
import { byId, PLAN } from "./model";
import type { Edge } from "./types";

export interface GraphNode {
  id: string;
  abbr: string;
  ob: boolean; // obligatoria → borde pizarra; electiva → borde latón
  x: number;
  y: number;
}

/** Cabecera de columna = un cuatrimestre de la carrera (para la banda superior). */
export interface GraphColumn {
  x: number; // centro horizontal de la columna
  top: string; // año, p. ej. "1º"
  sub: string; // cuatrimestre, p. ej. "1c"
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: Edge[];
  columns: GraphColumn[];
  width: number;
  height: number;
  nodeW: number;
  nodeH: number;
  headerH: number; // alto reservado arriba para las etiquetas de cuatrimestre
}

const NODE_W = 96; // ancho: entra el abbr + el código debajo
const NODE_H = 40; // alto: dos líneas (abbr + código)
const LEVEL_SEP = 150; // separación horizontal entre cuatrimestres (L→R)
const NODE_GAP = 14; // separación vertical entre nodos de una columna
const PAD = 40; // margen del lienzo intrínseco (fit() agrega su propio padding)
const HEADER_H = 34; // banda superior con las etiquetas de cuatrimestre
const STEP = NODE_H + NODE_GAP;

const ORDER_SWEEPS = 16;

/** Índice de cuatrimestre 0..9 de una obligatoria (año 1-5, cuatri 1-2). */
function semesterIndex(id: string): number | null {
  const m = byId.get(id);
  if (!m || m.anio == null || m.cuatri == null) return null;
  return (m.anio - 1) * 2 + (m.cuatri - 1);
}

function median(vals: number[]): number {
  if (!vals.length) return -1;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeGraphLayout(): GraphLayout {
  const edges = PLAN.edges.filter((e) => byId.has(e.from) && byId.has(e.to));

  const ids = new Set<string>();
  edges.forEach((e) => {
    ids.add(e.from);
    ids.add(e.to);
  });

  // adyacencias directa (habilita) e inversa (requiere)
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  ids.forEach((id) => {
    succ.set(id, []);
    pred.set(id, []);
  });
  edges.forEach((e) => {
    succ.get(e.from)!.push(e.to);
    pred.get(e.to)!.push(e.from);
  });

  // ---- 1. LAYERING ----------------------------------------------------------
  // Obligatorias → columna = su cuatrimestre. Electivas → un cuatri después de
  // su última correlativa (punto fijo por iteración, cubre electiva→electiva).
  const col = new Map<string, number>();
  ids.forEach((id) => {
    const s = semesterIndex(id);
    col.set(id, s ?? 0); // obligatoria sin año (no debería pasar) o electiva → provisional 0
  });
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    ids.forEach((id) => {
      if (byId.get(id)!.tipo !== "electiva") return;
      let mx = -1;
      for (const p of pred.get(id)!) mx = Math.max(mx, col.get(p) ?? -1);
      const next = mx >= 0 ? mx + 1 : 0;
      if (next !== col.get(id)) {
        col.set(id, next);
        changed = true;
      }
    });
  }
  const maxCol = Math.max(0, ...[...ids].map((id) => col.get(id)!));

  // agrupar por columna; orden inicial: obligatorias arriba, luego por abbr
  const cols: string[][] = [];
  for (let c = 0; c <= maxCol; c++) cols.push([]);
  ids.forEach((id) => cols[col.get(id)!].push(id));
  const abbrOf = (id: string) => byId.get(id)?.abbr || id;
  const tipoRank = (id: string) =>
    byId.get(id)!.tipo === "obligatoria" ? 0 : 1;
  cols.forEach((c) =>
    c.sort(
      (a, b) => tipoRank(a) - tipoRank(b) || abbrOf(a).localeCompare(abbrOf(b)),
    ),
  );

  // ---- 2. REDUCCIÓN DE CRUCES (heurística de la mediana) --------------------
  const indexIn = (c: number) => {
    const m = new Map<string, number>();
    cols[c].forEach((id, i) => m.set(id, i));
    return m;
  };
  for (let it = 0; it < ORDER_SWEEPS; it++) {
    const down = it % 2 === 0; // usa la columna previa (down) o la siguiente (up)
    const range = down
      ? [...Array(maxCol + 1).keys()].slice(1)
      : [...Array(maxCol + 1).keys()].reverse().slice(1);
    for (const c of range) {
      const adjC = down ? c - 1 : c + 1;
      const pos = indexIn(adjC);
      const rel = down ? pred : succ;
      const key = new Map<string, number>();
      cols[c].forEach((id) => {
        const nb = rel
          .get(id)!
          .filter((p) => col.get(p) === adjC)
          .map((p) => pos.get(p)!);
        key.set(id, median(nb));
      });
      // los nodos sin vecino (mediana -1) quedan anclados: el comparador los
      // trata como "iguales" y el sort estable preserva su lugar.
      cols[c] = cols[c]
        .map((id, i) => ({ id, i }))
        .sort((a, b) => {
          const ka = key.get(a.id)!;
          const kb = key.get(b.id)!;
          if (ka < 0 || kb < 0) return a.i - b.i;
          return ka - kb || a.i - b.i;
        })
        .map((o) => o.id);
    }
  }

  // ---- 3. COORDENADAS VERTICALES (centrado de columnas) ---------------------
  // Separación intra-columna fija (STEP) → cero solapamientos y altura acotada
  // (= la columna más alta). Cada columna se CENTRA sobre una línea media común:
  // el espinazo de obligatorias (columnas cortas) queda al centro, legible, y las
  // electivas hoja se abren como abanico por encima/por debajo de su correlativa.
  // Probamos el ajuste por baricentro (alinear cada columna con la masa vecina)
  // pero en este DAG hoja-pesado la ganancia de "rectitud" es marginal y hace
  // divergir la altura → no vale la pena. El orden ya deja sólo ~10 cruces.
  const colH = (c: number) => Math.max(0, cols[c].length * STEP - NODE_GAP);
  const maxColH = Math.max(0, ...cols.map((_, c) => colH(c)));
  const top0 = PAD + HEADER_H;

  const nodes: GraphNode[] = [];
  cols.forEach((c, ci) => {
    const y0 = top0 + (maxColH - colH(ci)) / 2; // centrar la columna en la banda
    c.forEach((id, i) => {
      const m = byId.get(id);
      nodes.push({
        id,
        abbr: m?.abbr || id,
        ob: m?.tipo === "obligatoria",
        x: PAD + ci * LEVEL_SEP,
        y: y0 + i * STEP,
      });
    });
  });

  // etiquetas de cuatrimestre por columna
  const columns: GraphColumn[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const anio = Math.floor(c / 2) + 1;
    const cuatri = (c % 2) + 1;
    columns.push({
      x: PAD + c * LEVEL_SEP + NODE_W / 2,
      top: `${anio}º`,
      sub: `${cuatri}c`,
    });
  }

  let maxY = 0;
  nodes.forEach((n) => (maxY = Math.max(maxY, n.y + NODE_H)));
  const width = PAD * 2 + maxCol * LEVEL_SEP + NODE_W;
  const height = maxY + PAD;

  return {
    nodes,
    edges,
    columns,
    width,
    height,
    nodeW: NODE_W,
    nodeH: NODE_H,
    headerH: HEADER_H,
  };
}
