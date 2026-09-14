// Layout puro L→R del mapa de correlativas (Sugiyama sin librería de grafos).
// Solo tipos en runtime cero: `import type` nada más — este archivo se puede
// cargar con Node sin resolver "./model" ni ningún otro módulo del planner.
//
// El plan tiene un ESPINAZO de obligatorias (una por cuatrimestre nominal) y un
// bosque de electivas colgando de él. El algoritmo separa ambos mundos:
//
//   1. LAYERING NOMINAL: cada obligatoria con año+cuatri va a la columna
//      `(año-1)*2+(cuatri-1)`. Con solo año (LCA), cada año ocupa tantas
//      columnas como el camino más largo entre sus obligatorias y cada una va
//      a la columna de su profundidad dentro del año (así una cadena de tres
//      materias de 1.º no invade la banda de 2.º). Sin nada, queda "sin
//      nominal" y entra al resto.
//   2. LAYERING DEL RESTO (obligatorias sin nominal + TODAS las electivas):
//      punto fijo — cada nodo toma `max(col(correlativa presente)+1)`, y las
//      electivas además respetan un piso por créditos acumulados del plan
//      nominal (así una electiva que pide 72 créditos no cae en la columna 0
//      aunque no tenga correlativas).
//   3. PASADA DE VALIDEZ: toda arista tiene que ir estrictamente hacia
//      adelante (`col(to) ≥ col(from)+1`); empuja lo que haga falta, punto
//      fijo. Esto puede correr obligatorias del mismo cuatrimestre nominal
//      (LCA: dos materias de 1.º sin cuatri encadenadas) o crear columnas más
//      allá de la última nominal (P: 46.02→46.03 ambas de 5.º·2c).
//   4. ORDEN DENTRO DE CADA COLUMNA: obligatorias primero (heurística de la
//      mediana mirando solo vecinos obligatorios — el espinazo es el mismo
//      con o sin la capa de electivas encendida — y después una pasada de
//      transposición de pares adyacentes que baja los cruces que la mediana
//      deja), después las electivas conectadas (mediana mirando correlativas
//      de cualquier tipo y sucesoras electivas) y por último las electivas
//      aisladas (por sigla).
//   5. COORDENADAS: el orden y la altura del espinazo (banda de obligatorias)
//      se calculan SIEMPRE con el grafo completo, así una obligatoria conserva
//      su columna y su `y` al prender o apagar la capa de electivas (§1.1 del
//      plan). Lo único que cambia con la capa es el ANCHO de las columnas que
//      necesitan sub-columnas de electivas (y con eso la `x` de las columnas
//      siguientes): con la capa apagada todas miden NODE_W y el espinazo queda
//      compacto, sin huecos donde colgarían las electivas.
import type { Edge, Materia, Plan } from "./types";

export interface GraphNode {
  id: string;
  abbr: string;
  ob: boolean;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphColumn {
  index: number;
  x: number;
  cx: number;
  width: number;
  year: number | null;
  top: string | null;
  sub: string | null;
}

export interface GraphBand {
  year: number;
  x: number;
  width: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: Edge[];
  columns: GraphColumn[];
  bands: GraphBand[];
  width: number;
  height: number;
  /** y donde termina la banda del espinazo (riel); las electivas empiezan debajo */
  spineBottom: number;
  /** hay electivas en el lienzo (capa encendida y el plan tiene alguna) */
  hasElectivas: boolean;
}

export interface LayoutOptions {
  electivas: boolean;
}

export const GRAPH_METRICS = {
  NODE_W: 108,
  OB_H: 34,
  EL_H: 28,
  COL_GAP: 60,
  SUB_GAP: 10,
  OB_GAP: 10,
  EL_GAP: 8,
  PAD: 40,
  HEADER_H: 36,
  BAND_GAP: 26,
  MAX_ROWS: 14,
} as const;

const {
  NODE_W,
  OB_H,
  EL_H,
  COL_GAP,
  SUB_GAP,
  OB_GAP,
  EL_GAP,
  PAD,
  HEADER_H,
  BAND_GAP,
  MAX_ROWS,
} = GRAPH_METRICS;

const SWEEPS = 16;
const TRANSPOSE_SWEEPS = 8;
const GUARD = 100;
// Orden de siglas y códigos con locale FIJO: el layout tiene que ser el mismo
// en cualquier navegador (con el locale del sistema, «CH» o «Å» cambian el
// orden y con él el JSON).
const LOCALE = "es";

// ---- helpers puros -----------------------------------------------------

/** Columna nominal de una obligatoria con año y cuatrimestre; null si falta
 *  alguno (los planes con año solo se resuelven aparte, por profundidad). */
function nominalCol(m: Materia): number | null {
  if (m.anio == null || m.cuatri == null) return null;
  return (m.anio - 1) * 2 + (m.cuatri - 1);
}

function median(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Posición normalizada de `id` dentro de `order` (0..1; .5 si hay 1 solo nodo). */
function normPos(id: string, order: string[]): number {
  if (order.length <= 1) return 0.5;
  const i = order.indexOf(id);
  return i / (order.length - 1);
}

function cmpAnioCuatriCodigo(a: Materia, b: Materia): number {
  const ax = a.anio ?? Infinity;
  const bx = b.anio ?? Infinity;
  if (ax !== bx) return ax - bx;
  const ac = a.cuatri ?? Infinity;
  const bc = b.cuatri ?? Infinity;
  if (ac !== bc) return ac - bc;
  return a.codigo.localeCompare(b.codigo, LOCALE, { numeric: true });
}

function cmpAbbr(a: Materia, b: Materia): number {
  return (a.abbr || a.codigo).localeCompare(b.abbr || b.codigo, LOCALE, {
    numeric: true,
  });
}

// ---- función principal ---------------------------------------------------

export function computeGraphLayout(plan: Plan, opts?: LayoutOptions): GraphLayout {
  const electivasOn = opts?.electivas ?? false;
  const obligatorias = plan.obligatorias ?? [];
  const electivas = plan.electivas ?? [];

  const byCodigo = new Map<string, Materia>();
  obligatorias.forEach((m) => byCodigo.set(m.codigo, m));
  electivas.forEach((m) => byCodigo.set(m.codigo, m));
  const obSet = new Set(obligatorias.map((m) => m.codigo));
  const elSet = new Set(electivas.map((m) => m.codigo));

  // ---- aristas internas (grafo COMPLETO, opts-independiente) -------------
  // De Materia.correlativas (c → m), descartando las que apuntan a un código
  // que no existe en el plan (p. ej. E: 31.17 no está en el plan).
  const allEdges: Edge[] = [];
  byCodigo.forEach((m) => {
    (m.correlativas || []).forEach((c) => {
      if (byCodigo.has(c)) allEdges.push({ from: c, to: m.codigo });
    });
  });

  const predAll = new Map<string, string[]>();
  const succAll = new Map<string, string[]>();
  byCodigo.forEach((_m, id) => {
    predAll.set(id, []);
    succAll.set(id, []);
  });
  allEdges.forEach((e) => {
    succAll.get(e.from)!.push(e.to);
    predAll.get(e.to)!.push(e.from);
  });

  // ---- 1. layering nominal de obligatorias --------------------------------
  const nominal = new Map<string, number | null>();
  const hasAnioNominal = obligatorias.some((m) => m.anio != null);
  const hasCuatriNominal = obligatorias.some(
    (m) => m.anio != null && m.cuatri != null,
  );
  // año de cada columna nominal y primera columna de cada año (cabeceras)
  const yearOfCol = new Map<number, number>();
  const firstColOfYear = new Map<number, number>();
  if (hasCuatriNominal) {
    obligatorias.forEach((m) => nominal.set(m.codigo, nominalCol(m)));
  } else if (hasAnioNominal) {
    // Solo año: cada año se parte en tantas columnas como el camino más largo
    // entre sus propias obligatorias; cada una va a la columna de su
    // profundidad dentro del año. Las columnas se acumulan año a año.
    const years = [...new Set(obligatorias.filter((m) => m.anio != null).map((m) => m.anio!))]
      .sort((a, b) => a - b);
    let offset = 0;
    for (const y of years) {
      const members = obligatorias.filter((m) => m.anio === y);
      const inYear = new Set(members.map((m) => m.codigo));
      const depth = new Map<string, number>();
      members.forEach((m) => depth.set(m.codigo, 0));
      let changed = true;
      let guard = 0;
      while (changed && guard++ < GUARD) {
        changed = false;
        members.forEach((m) => {
          let d = 0;
          for (const c of m.correlativas || []) {
            if (inYear.has(c)) d = Math.max(d, (depth.get(c) ?? 0) + 1);
          }
          if (d !== depth.get(m.codigo)) {
            depth.set(m.codigo, d);
            changed = true;
          }
        });
      }
      let span = 1;
      depth.forEach((d) => (span = Math.max(span, d + 1)));
      members.forEach((m) => nominal.set(m.codigo, offset + (depth.get(m.codigo) ?? 0)));
      for (let c = offset; c < offset + span; c++) yearOfCol.set(c, y);
      firstColOfYear.set(y, offset);
      offset += span;
    }
  }
  obligatorias.forEach((m) => {
    if (!nominal.has(m.codigo)) nominal.set(m.codigo, null);
  });
  let maxNominalCol: number | null = null;
  nominal.forEach((n) => {
    if (n != null) maxNominalCol = maxNominalCol == null ? n : Math.max(maxNominalCol, n);
  });
  if (hasCuatriNominal && maxNominalCol != null) {
    for (let c = 0; c <= maxNominalCol; c++) {
      const y = Math.floor(c / 2) + 1;
      yearOfCol.set(c, y);
      if (!firstColOfYear.has(y)) firstColOfYear.set(y, c);
    }
  }

  // acumulado de créditos por columna nominal (solo obligatorias con nominal)
  const credAccum: number[] = [];
  if (maxNominalCol != null) {
    for (let k = 0; k <= maxNominalCol; k++) {
      let acc = 0;
      obligatorias.forEach((m) => {
        const n = nominal.get(m.codigo);
        if (n != null && n <= k) acc += Number(m.creditos) || 0;
      });
      credAccum.push(acc);
    }
  }
  function colCreditos(req: number): number {
    if (maxNominalCol == null) return 0;
    for (let k = 0; k <= maxNominalCol; k++) {
      if (credAccum[k] >= req) return k + 1;
    }
    // Nunca se alcanza el requisito con el acumulado nominal: no se inventa
    // una columna más allá de la última nominal (§2.1.6) — clampeamos a esa.
    return maxNominalCol;
  }

  // ---- 2. layering del resto (punto fijo) ---------------------------------
  const col = new Map<string, number>();
  obligatorias.forEach((m) => {
    const n = nominal.get(m.codigo);
    if (n != null) col.set(m.codigo, n);
  });
  const restoIds: string[] = [];
  obligatorias.forEach((m) => {
    if (nominal.get(m.codigo) == null) restoIds.push(m.codigo);
  });
  electivas.forEach((m) => restoIds.push(m.codigo));
  restoIds.forEach((id) => col.set(id, 0));

  function creditFloor(id: string): number {
    if (!elSet.has(id)) return 0;
    const req = Number(byCodigo.get(id)!.creditosReq) || 0;
    return req > 0 ? colCreditos(req) : 0;
  }

  {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < GUARD) {
      changed = false;
      restoIds.forEach((id) => {
        const preds = (predAll.get(id) || []).filter((p) => col.has(p));
        const predBound = preds.length
          ? Math.max(...preds.map((p) => col.get(p)!)) + 1
          : 0;
        const next = Math.max(predBound, creditFloor(id));
        if (next !== col.get(id)) {
          col.set(id, next);
          changed = true;
        }
      });
    }
  }

  // ---- 3. pasada de validez (global, todas las aristas) -------------------
  {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < GUARD) {
      changed = false;
      allEdges.forEach((e) => {
        const cf = col.get(e.from)!;
        const ct = col.get(e.to)!;
        if (ct < cf + 1) {
          col.set(e.to, cf + 1);
          changed = true;
        }
      });
    }
  }

  let maxCol = 0;
  col.forEach((c) => (maxCol = Math.max(maxCol, c)));

  // ---- 4. orden dentro de cada columna -------------------------------------
  const obColOrder = new Map<number, string[]>();
  const elColOrderConnected = new Map<number, string[]>();
  const elColOrderIsolated = new Map<number, string[]>();
  for (let c = 0; c <= maxCol; c++) {
    obColOrder.set(c, []);
    elColOrderConnected.set(c, []);
    elColOrderIsolated.set(c, []);
  }
  obligatorias
    .slice()
    .sort(cmpAnioCuatriCodigo)
    .forEach((m) => obColOrder.get(col.get(m.codigo)!)!.push(m.codigo));

  const isConnected = (id: string): boolean =>
    (predAll.get(id)?.length ?? 0) > 0 || (succAll.get(id)?.length ?? 0) > 0;
  electivas
    .slice()
    .sort(cmpAbbr)
    .forEach((m) => {
      const c = col.get(m.codigo)!;
      if (isConnected(m.codigo)) elColOrderConnected.get(c)!.push(m.codigo);
      else elColOrderIsolated.get(c)!.push(m.codigo);
    });

  function normalizedPos(id: string): number {
    const c = col.get(id)!;
    if (obSet.has(id)) return normPos(id, obColOrder.get(c) ?? []);
    return normPos(id, elColOrderConnected.get(c) ?? []);
  }

  function runSweeps(
    orderMap: Map<number, string[]>,
    neighborsFn: (id: string, dir: "down" | "up") => string[],
  ): void {
    const downOrder: number[] = [];
    const upOrder: number[] = [];
    for (let c = 1; c <= maxCol; c++) downOrder.push(c);
    for (let c = maxCol - 1; c >= 0; c--) upOrder.push(c);
    for (let it = 0; it < SWEEPS; it++) {
      const down = it % 2 === 0;
      const range = down ? downOrder : upOrder;
      for (const c of range) {
        const list = orderMap.get(c);
        if (!list || list.length < 2) continue;
        const keyed = list.map((id, i) => {
          const neighbors = neighborsFn(id, down ? "down" : "up").filter((n) =>
            col.has(n),
          );
          const key = neighbors.length
            ? median(neighbors.map((n) => normalizedPos(n)))
            : null;
          return { id, i, key };
        });
        // Los nodos sin vecinos (key null) conservan su lugar exacto (índice
        // original); los demás se reordenan por mediana y rellenan los huecos
        // que quedan, en ese orden. Comparar "sin key vs. con key" por índice
        // y "con key vs. con key" por valor no es transitivo en un mismo
        // comparador (un nodo sin key puede terminar entre dos con key en un
        // orden que no respeta ninguna de las dos reglas), así que se arma el
        // resultado por posición en vez de con `sort` directo sobre la mezcla.
        const result: string[] = new Array(list.length);
        keyed
          .filter((o) => o.key == null)
          .forEach((o) => {
            result[o.i] = o.id;
          });
        const movable = keyed
          .filter((o) => o.key != null)
          .sort((a, b) => a.key! - b.key! || a.i - b.i);
        let mi = 0;
        for (let idx = 0; idx < result.length; idx++) {
          if (result[idx] !== undefined) continue;
          result[idx] = movable[mi++].id;
        }
        orderMap.set(c, result);
      }
    }
  }

  // obligatorias: solo miran vecinos obligatorios (independiente de la capa)
  runSweeps(obColOrder, (id, dir) => {
    const raw = dir === "down" ? predAll.get(id) : succAll.get(id);
    return (raw ?? []).filter((n) => obSet.has(n));
  });

  // ---- 4b. transposición del espinazo ---------------------------------------
  // Pares adyacentes de una columna: se intercambian si así bajan los cruces
  // GEOMÉTRICOS entre las aristas obligatoria→obligatoria (segmentos rectos
  // entre columnas, con la y que tendrá cada nodo en la banda centrada). Es la
  // transposición clásica de Sugiyama, pero contando cruces reales: con
  // aristas que saltan varias columnas, mirar solo los vecinos del par
  // engaña (un intercambio puede cruzar aristas de nodos intermedios).
  {
    const obEdges = allEdges.filter((e) => obSet.has(e.from) && obSet.has(e.to));
    const STEP = OB_H + OB_GAP;
    // y relativa al centro de la banda: la columna entera queda centrada
    const yRel = new Map<string, number>();
    const refreshY = (c: number) => {
      const list = obColOrder.get(c)!;
      list.forEach((id, i) => yRel.set(id, (i - (list.length - 1) / 2) * STEP));
    };
    for (let c = 0; c <= maxCol; c++) refreshY(c);
    const segs = obEdges.map((e) => ({ a: e.from, b: e.to, ca: col.get(e.from)!, cb: col.get(e.to)! }));
    const cross = (): number => {
      let n = 0;
      for (let i = 0; i < segs.length; i++) {
        const p = segs[i];
        const px1 = p.ca + 0.4;
        const py1 = yRel.get(p.a)!;
        const px2 = p.cb - 0.4;
        const py2 = yRel.get(p.b)!;
        for (let j = i + 1; j < segs.length; j++) {
          const q = segs[j];
          if (q.a === p.a || q.b === p.b) continue; // comparten extremo: no es cruce
          const qx1 = q.ca + 0.4;
          const qy1 = yRel.get(q.a)!;
          const qx2 = q.cb - 0.4;
          const qy2 = yRel.get(q.b)!;
          if (Math.max(px1, qx1) >= Math.min(px2, qx2)) continue; // sin solape en x
          const d1 = (qx1 - px1) * (py2 - py1) - (px2 - px1) * (qy1 - py1);
          const d2 = (qx2 - px1) * (py2 - py1) - (px2 - px1) * (qy2 - py1);
          const d3 = (px1 - qx1) * (qy2 - qy1) - (qx2 - qx1) * (py1 - qy1);
          const d4 = (px2 - qx1) * (qy2 - qy1) - (qx2 - qx1) * (py2 - qy1);
          if (d1 * d2 < 0 && d3 * d4 < 0) n++;
        }
      }
      return n;
    };
    let best = cross();
    for (let it = 0; it < TRANSPOSE_SWEEPS && best > 0; it++) {
      let improved = false;
      for (let c = 0; c <= maxCol; c++) {
        const list = obColOrder.get(c)!;
        for (let i = 0; i + 1 < list.length; i++) {
          [list[i], list[i + 1]] = [list[i + 1], list[i]];
          refreshY(c);
          const n = cross();
          if (n < best) {
            best = n;
            improved = true;
          } else {
            [list[i], list[i + 1]] = [list[i + 1], list[i]];
            refreshY(c);
          }
        }
      }
      if (!improved) break;
    }
  }

  // electivas: predecesoras de cualquier tipo (ya fijas si son ob), sucesoras
  // solo electivas.
  runSweeps(elColOrderConnected, (id, dir) => {
    if (dir === "down") return predAll.get(id) ?? [];
    return (succAll.get(id) ?? []).filter((n) => elSet.has(n));
  });

  // ---- 5. coordenadas -------------------------------------------------------
  // Banda del espinazo SIEMPRE con el grafo completo: la capa de electivas no
  // cambia la fila (y) ni la columna de una obligatoria; solo el ancho de las
  // columnas con sub-columnas de electivas (y la x de las que siguen).
  let maxOb = 0;
  for (let c = 0; c <= maxCol; c++) maxOb = Math.max(maxOb, obColOrder.get(c)!.length);
  const bandH = maxOb > 0 ? maxOb * (OB_H + OB_GAP) - OB_GAP : 0;
  const top0 = PAD + HEADER_H;
  const spineBottom = top0 + bandH;
  const elStartY = spineBottom + BAND_GAP;

  // Con la capa apagada las columnas terminan en la última obligatoria: una
  // electiva empujada más allá no deja una columna fantasma vacía al final.
  let maxObCol = 0;
  obligatorias.forEach((m) => (maxObCol = Math.max(maxObCol, col.get(m.codigo)!)));
  const outMaxCol = electivasOn ? maxCol : maxObCol;

  const colWidth: number[] = [];
  const colX: number[] = [];
  let maxElRows = 0;
  for (let c = 0; c <= outMaxCol; c++) {
    const nEl = electivasOn
      ? (elColOrderConnected.get(c)?.length ?? 0) + (elColOrderIsolated.get(c)?.length ?? 0)
      : 0;
    const sub = nEl > 0 ? Math.ceil(nEl / MAX_ROWS) : 1;
    const elWidth = sub * (NODE_W + SUB_GAP) - SUB_GAP;
    colWidth.push(Math.max(NODE_W, elWidth));
    if (nEl > 0) maxElRows = Math.max(maxElRows, Math.min(nEl, MAX_ROWS));
    colX.push(c === 0 ? PAD : colX[c - 1] + colWidth[c - 1] + COL_GAP);
  }
  const electivaAreaH = maxElRows > 0 ? maxElRows * (EL_H + EL_GAP) - EL_GAP : 0;

  const nodesFull: GraphNode[] = [];
  for (let c = 0; c <= outMaxCol; c++) {
    const obIds = obColOrder.get(c)!;
    const colObH = obIds.length > 0 ? obIds.length * (OB_H + OB_GAP) - OB_GAP : 0;
    const y0 = top0 + (bandH - colObH) / 2;
    const xOb = colX[c] + (colWidth[c] - NODE_W) / 2;
    obIds.forEach((id, i) => {
      const m = byCodigo.get(id)!;
      nodesFull.push({
        id,
        abbr: m.abbr || id,
        ob: true,
        col: c,
        x: xOb,
        y: y0 + i * (OB_H + OB_GAP),
        w: NODE_W,
        h: OB_H,
      });
    });

    const elIds = [...(elColOrderConnected.get(c) ?? []), ...(elColOrderIsolated.get(c) ?? [])];
    elIds.forEach((id, i) => {
      const m = byCodigo.get(id)!;
      const subIdx = Math.floor(i / MAX_ROWS);
      const rowIdx = i % MAX_ROWS;
      nodesFull.push({
        id,
        abbr: m.abbr || id,
        ob: false,
        col: c,
        x: colX[c] + subIdx * (NODE_W + SUB_GAP),
        y: elStartY + rowIdx * (EL_H + EL_GAP),
        w: NODE_W,
        h: EL_H,
      });
    });
  }

  const width = colX[outMaxCol] + colWidth[outMaxCol] + PAD;
  const height = electivaAreaH > 0 ? elStartY + electivaAreaH + PAD : spineBottom + PAD;

  // ---- columnas (cabeceras) y bandas -----------------------------------------
  // Con cuatrimestre: «1º» + «1c» en cada columna. Solo año: «1º» en la
  // primera columna del año y nada en las demás. Más allá de la última
  // columna nominal (nodos empujados por la pasada de validez): sin cabecera.
  const columns: GraphColumn[] = [];
  for (let c = 0; c <= outMaxCol; c++) {
    const year = yearOfCol.get(c) ?? null;
    let top: string | null = null;
    let sub: string | null = null;
    if (year != null) {
      if (hasCuatriNominal) {
        top = `${year}º`;
        sub = `${(c % 2) + 1}c`;
      } else if (firstColOfYear.get(year) === c) {
        top = `${year}º`;
      }
    }
    columns.push({
      index: c,
      x: colX[c],
      cx: colX[c] + colWidth[c] / 2,
      width: colWidth[c],
      year,
      top,
      sub,
    });
  }

  const bands: GraphBand[] = [];
  {
    const years = [...new Set([...yearOfCol.values()])].sort((a, b) => a - b);
    for (const y of years) {
      const colsForYear: number[] = [];
      yearOfCol.forEach((yy, c) => {
        if (yy === y && c <= outMaxCol) colsForYear.push(c);
      });
      if (!colsForYear.length) continue;
      colsForYear.sort((a, b) => a - b);
      const first = colsForYear[0];
      const last = colsForYear[colsForYear.length - 1];
      bands.push({
        year: y,
        x: colX[first],
        width: colX[last] + colWidth[last] - colX[first],
      });
    }
  }

  // ---- filtrado final según opts.electivas -----------------------------------
  const outNodes = electivasOn ? nodesFull : nodesFull.filter((n) => n.ob);
  const outIds = new Set(outNodes.map((n) => n.id));
  const outEdges = allEdges.filter((e) => outIds.has(e.from) && outIds.has(e.to));
  // hay electivas EN EL LIENZO (capa encendida y el plan tiene alguna): la vista
  // dibuja el riel solo en ese caso.
  const hasElectivas = electivasOn && electivas.length > 0;

  return {
    nodes: outNodes,
    edges: outEdges,
    columns,
    bands,
    width,
    height,
    spineBottom,
    hasElectivas,
  };
}
