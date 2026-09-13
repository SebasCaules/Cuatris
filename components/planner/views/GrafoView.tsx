"use client";

import "../grafo.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePlanner } from "@/components/planner/state";
import { computeGraphLayout } from "@/lib/planner/layoutGraph";
import { byId } from "@/lib/planner/model";
import { isAvailable } from "@/lib/planner/metrics";
import { IconSearch, IconLock } from "@/components/planner/icons";

/**
 * Mapa de correlativas. Reemplaza vis-network (planner.js renderGraph) por un
 * SVG nativo con layout jerárquico LR (computeGraphLayout) dentro de un viewport
 * con pan y zoom hechos a mano — sin librería de grafos.
 *
 * El DAG (95 materias, 122 aristas) es más grande que cualquier caja fija, así
 * que en vez de recortarse: arrastrar panea, la rueda / los botones +/− hacen
 * zoom, y "Ajustar" encuadra todo. La transformación se aplica imperativamente
 * sobre el grupo <g> (translate+scale) — no se re-layoutea por frame.
 *
 * Static-export safe: todo acceso a window / ResizeObserver ocurre dentro de
 * useEffect (cliente, post-hidratación). El componente ya es isla `"use client"`.
 */

const MIN_SCALE = 0.3; // piso del zoom manual (rueda / botones)
const MAX_SCALE = 2.4;
// Piso de escala del encuadre INICIAL: el grafo entero suele quedar ilegible a
// fit-all, así que la entrada arranca a una escala legible (~0.55) encuadrando el
// 1.er año. El botón "Ajustar" sigue dando el overview completo (sin este piso).
const INITIAL_MIN_SCALE = 0.55;
const FIT_PAD = 40; // padding del fit() en píxeles de pantalla
// El fit() puede bajar por debajo de MIN_SCALE: así SIEMPRE encuadra todo el
// grafo dentro del viewport, aunque el DAG sea más grande que la caja. Es la
// garantía de "cero overflow": el contenido nunca queda más grande que la vista.
const FIT_MIN_SCALE = 0.06;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export default function GrafoView() {
  const { state, dispatch } = usePlanner();
  const approved = state.approved;

  // Layout puro y determinístico → memo sin deps (no depende del estado).
  const layout = useMemo(() => computeGraphLayout(), []);
  const { nodes, edges, columns, width, height, nodeW, nodeH, headerH } =
    layout;

  // Posiciones por id para anclar las aristas a los recuadros.
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => m.set(n.id, { x: n.x, y: n.y }));
    return m;
  }, [nodes]);

  // Conjunto de ids presentes en el grafo (para resaltar sólo lo que existe).
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  // Cursabilidad: ids no aprobados que YA se pueden cursar (correlativas +
  // créditos OK). El resto de los no aprobados quedan "bloqueados". Reusa la
  // misma verdad que las cards (isAvailable / AvailLock) → semántica única.
  const availSet = useMemo(() => {
    const s = new Set<string>();
    nodes.forEach((n) => {
      const m = byId.get(n.id);
      if (m && isAvailable(m, approved)) s.add(n.id);
    });
    return s;
  }, [nodes, approved]);

  // Adyacencias directa (habilita) e inversa (requiere) para la cadena.
  const { adj, radj } = useMemo(() => {
    const a = new Map<string, string[]>();
    const r = new Map<string, string[]>();
    edges.forEach((e) => {
      (a.get(e.from) ?? a.set(e.from, []).get(e.from)!).push(e.to);
      (r.get(e.to) ?? r.set(e.to, []).get(e.to)!).push(e.from);
    });
    return { adj: a, radj: r };
  }, [edges]);

  // Cadena completa de una materia: ella + todos sus prerrequisitos (aguas
  // arriba) + todo lo que habilita (aguas abajo).
  const chainOf = useCallback(
    (id: string) => {
      const set = new Set<string>([id]);
      const up = (x: string) => {
        (radj.get(x) || []).forEach((p) => {
          if (!set.has(p)) {
            set.add(p);
            up(p);
          }
        });
      };
      const down = (x: string) => {
        (adj.get(x) || []).forEach((d) => {
          if (!set.has(d)) {
            set.add(d);
            down(d);
          }
        });
      };
      up(id);
      down(id);
      return set;
    },
    [adj, radj],
  );

  // Aristas como curvas cúbicas Bézier (LR): del medio-derecho del origen al
  // medio-izquierdo del destino, con tangentes horizontales.
  const paths = useMemo(() => {
    const out: { from: string; to: string; d: string; key: string }[] = [];
    edges.forEach((e, i) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) return;
      const x1 = a.x + nodeW;
      const y1 = a.y + nodeH / 2;
      const x2 = b.x;
      const y2 = b.y + nodeH / 2;
      const cx = (x1 + x2) / 2;
      out.push({
        from: e.from,
        to: e.to,
        key: `${e.from}-${e.to}-${i}`,
        d: `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`,
      });
    });
    return out;
  }, [edges, pos, nodeW, nodeH]);

  // Extensión vertical ocupada por los nodos → posiciona las guías de columna y
  // las etiquetas de cuatrimestre sin depender de las constantes internas del layout.
  const bounds = useMemo(() => {
    let top = Infinity;
    let bottom = -Infinity;
    nodes.forEach((n) => {
      if (n.y < top) top = n.y;
      if (n.y + nodeH > bottom) bottom = n.y + nodeH;
    });
    if (!Number.isFinite(top)) {
      top = 0;
      bottom = 0;
    }
    return { top, bottom };
  }, [nodes, nodeH]);

  // Encuadre del 1.er año: borde izquierdo de la columna más a la izquierda +
  // centro vertical de esa columna (los nodos de la 1.ª columna quedan centrados
  // en la banda). Es el ancla del zoom inicial legible.
  const firstColFrame = useMemo(() => {
    let left = Infinity;
    nodes.forEach((n) => {
      if (n.x < left) left = n.x;
    });
    let top = Infinity;
    let bottom = -Infinity;
    nodes.forEach((n) => {
      if (n.x <= left + 1) {
        if (n.y < top) top = n.y;
        if (n.y + nodeH > bottom) bottom = n.y + nodeH;
      }
    });
    if (!Number.isFinite(left)) left = 0;
    if (!Number.isFinite(top)) {
      top = 0;
      bottom = height;
    }
    return { left, cy: (top + bottom) / 2 };
  }, [nodes, nodeH, height]);

  // ---------- refs de DOM + estado de la transformación (imperativo) ----------
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<SVGGElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);

  // scale/tx/ty en un ref → panear/zoomear NO re-renderiza React (sólo muta el
  // atributo transform del grupo). userInteracted evita que un resize re-encuadre
  // luego de que el usuario tomó control.
  const tf = useRef({ scale: 1, tx: 0, ty: 0 });
  const userInteracted = useRef(false);
  // modo del encuadre automático (mount + resize): false = entrada legible al
  // 1.er año; true = overview completo (lo fija el botón "Ajustar").
  const wantFit = useRef(false);
  const [ready, setReady] = useState(false);

  const applyTransform = useCallback(() => {
    const g = stageRef.current;
    if (g) {
      const { tx, ty, scale } = tf.current;
      g.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    }
    const r = readoutRef.current;
    if (r) r.textContent = `${Math.round(tf.current.scale * 100)}%`;
  }, []);

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || !width || !height) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    // ancho/alto disponibles descontando el padding (nunca negativos)
    const availW = Math.max(1, vw - 2 * FIT_PAD);
    const availH = Math.max(1, vh - 2 * FIT_PAD);
    // sin clamp hacia arriba a MIN_SCALE: el fit prioriza CONTENER todo.
    const s = clamp(
      Math.min(availW / width, availH / height),
      FIT_MIN_SCALE,
      MAX_SCALE,
    );
    tf.current.scale = s;
    // centrado exacto → el contenido queda simétrico dentro del viewport.
    tf.current.tx = (vw - width * s) / 2;
    tf.current.ty = (vh - height * s) / 2;
    applyTransform();
  }, [width, height, applyTransform]);

  // zoom anclado a un punto (px,py) en coordenadas del svg (1 unidad = 1px,
  // sin viewBox), manteniendo ese punto fijo en pantalla.
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const t = tf.current;
      const ns = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = ns / t.scale;
      t.tx = px - (px - t.tx) * k;
      t.ty = py - (py - t.ty) * k;
      t.scale = ns;
      applyTransform();
    },
    [applyTransform],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      userInteracted.current = true;
      zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, factor);
    },
    [zoomAt],
  );

  // Encuadre inicial legible: si el grafo entero YA entra a escala legible, lo
  // muestra completo; si no, entra a INITIAL_MIN_SCALE anclado al 1.er año.
  const initialFrame = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || !width || !height) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    const availW = Math.max(1, vw - 2 * FIT_PAD);
    const availH = Math.max(1, vh - 2 * FIT_PAD);
    const fitScale = Math.min(availW / width, availH / height);
    if (fitScale >= INITIAL_MIN_SCALE) {
      // grafo chico: el overview completo ya es legible → mostrarlo entero.
      fit();
      return;
    }
    const s = clamp(INITIAL_MIN_SCALE, FIT_MIN_SCALE, MAX_SCALE);
    const { left, cy } = firstColFrame;
    const contentW = width * s;
    const contentH = height * s;
    tf.current.scale = s;
    // horizontal: si entra completo, centrar; si no, 1.ª columna a la izquierda.
    tf.current.tx = contentW <= vw ? (vw - contentW) / 2 : FIT_PAD - left * s;
    // vertical: centrar sobre la banda de la 1.ª columna sin descubrir márgenes.
    tf.current.ty =
      contentH <= vh
        ? (vh - contentH) / 2
        : clamp(vh / 2 - cy * s, vh - contentH, 0);
    applyTransform();
  }, [width, height, firstColFrame, fit, applyTransform]);

  // Encuadre automático (mount + resize): overview si el usuario pidió "Ajustar",
  // entrada legible en caso contrario.
  const applyAutoFrame = useCallback(() => {
    if (wantFit.current) fit();
    else initialFrame();
  }, [fit, initialFrame]);

  const onFit = useCallback(() => {
    userInteracted.current = false;
    wantFit.current = true; // "Ajustar" = overview explícito, se mantiene al resize
    fit();
  }, [fit]);

  // Encuadre inicial + refit ante resize (sólo si el usuario no tomó control).
  // Todo dentro de useEffect → nunca corre en SSR (static-export safe).
  useEffect(() => {
    // Doble rAF: el primero deja al layout medir el viewport; el segundo encuadra
    // ya con el tamaño final (evita un fit con dimensiones a medio calcular).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      applyAutoFrame();
      raf2 = requestAnimationFrame(() => {
        applyAutoFrame();
        setReady(true);
      });
    });
    let ro: ResizeObserver | null = null;
    const vp = viewportRef.current;
    if (vp && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        if (!userInteracted.current) applyAutoFrame();
      });
      ro.observe(vp);
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
    };
  }, [applyAutoFrame]);

  // Zoom con rueda: listener nativo con {passive:false} para poder
  // preventDefault (React lo adjunta passive y ahí el preventDefault no aplica).
  useEffect(() => {
    const vp = viewportRef.current;
    const svg = svgRef.current;
    if (!vp || !svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const f = Math.pow(1.0016, -e.deltaY);
      userInteracted.current = true;
      zoomAt(e.clientX - r.left, e.clientY - r.top, f);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---------- pan por puntero + detección click/drag ----------
  const drag = useRef({
    down: false,
    moved: false,
    x0: 0,
    y0: 0,
    tx0: 0,
    ty0: 0,
    code: null as string | null,
  });

  const nodeCodeFromTarget = (t: EventTarget | null): string | null => {
    const el = (t as Element | null)?.closest?.("[data-code]");
    return el ? el.getAttribute("data-code") : null;
  };

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const d = drag.current;
    d.down = true;
    d.moved = false;
    d.x0 = e.clientX;
    d.y0 = e.clientY;
    d.tx0 = tf.current.tx;
    d.ty0 = tf.current.ty;
    d.code = nodeCodeFromTarget(e.target);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.down) return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) > 5) {
        d.moved = true;
        userInteracted.current = true;
        viewportRef.current?.classList.add("panning");
      }
      if (d.moved) {
        tf.current.tx = d.tx0 + dx;
        tf.current.ty = d.ty0 + dy;
        applyTransform();
      }
    },
    [applyTransform],
  );

  const endPointer = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d.down) return;
      d.down = false;
      viewportRef.current?.classList.remove("panning");
      // click limpio sobre un nodo → abre el drawer de detalle (mecanismo del
      // planner; no duplicamos panel). Un drag no dispara apertura.
      if (!d.moved && d.code) {
        dispatch({ type: "OPEN_DRAWER", code: d.code });
      }
      d.code = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
    },
    [dispatch],
  );

  // ---------- resaltado de cadena (hover / foco / selección) ----------
  const [hoverId, setHoverId] = useState<string | null>(null);
  const drawerCode = state.drawerCode;
  const selectedId =
    drawerCode && nodeIds.has(drawerCode) ? drawerCode : null;
  const activeId = hoverId ?? selectedId;
  const chain = useMemo(
    () => (activeId && nodeIds.has(activeId) ? chainOf(activeId) : null),
    [activeId, nodeIds, chainOf],
  );

  // ---------- roving tabindex: un solo tab-stop en el grupo de nodos ----------
  // Sin esto, los ~95 nodos son 95 tab-stops (trampa de tabulación). El nodo
  // activo lleva tabindex 0; el resto -1, y las flechas mueven el foco entre
  // vecinos del DAG (izq/der = correlativas) y de la columna (arriba/abajo).
  const [rovingId, setRovingId] = useState<string | null>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());

  // Ids agrupados por columna (x) y ordenados por y → navegación vertical.
  const columnIds = useMemo(() => {
    const byX = new Map<number, string[]>();
    nodes.forEach((n) => {
      const key = Math.round(n.x);
      (byX.get(key) ?? byX.set(key, []).get(key)!).push(n.id);
    });
    byX.forEach((ids) =>
      ids.sort((a, b) => (pos.get(a)?.y ?? 0) - (pos.get(b)?.y ?? 0)),
    );
    return byX;
  }, [nodes, pos]);

  // ---------- búsqueda: código / abbr / nombre → primer match ----------
  const [query, setQuery] = useState("");
  // true cuando el último Enter no encontró ninguna materia → feedback de vacío.
  const [noMatch, setNoMatch] = useState(false);

  // Prioriza prefijo de código o abbr; si no, primer "contiene" (código/abbr/nombre).
  const matchNode = useCallback(
    (raw: string): string | null => {
      const q = raw.trim().toLowerCase();
      if (!q) return null;
      let incl: string | null = null;
      for (const n of nodes) {
        const code = n.id.toLowerCase();
        const abbr = n.abbr.toLowerCase();
        if (code.startsWith(q) || abbr.startsWith(q)) return n.id;
        if (!incl) {
          const name = (byId.get(n.id)?.nombre ?? "").toLowerCase();
          if (code.includes(q) || abbr.includes(q) || name.includes(q))
            incl = n.id;
        }
      }
      return incl;
    },
    [nodes],
  );

  // Centra un nodo en el viewport y lo resalta (misma cadena que el hover).
  const focusNode = useCallback(
    (id: string) => {
      const p = pos.get(id);
      const vp = viewportRef.current;
      if (!p || !vp) return;
      userInteracted.current = true;
      const cx = p.x + nodeW / 2;
      const cy = p.y + nodeH / 2;
      // 1) centrar el nodo a la escala actual…
      tf.current.tx = vp.clientWidth / 2 - cx * tf.current.scale;
      tf.current.ty = vp.clientHeight / 2 - cy * tf.current.scale;
      applyTransform();
      // 2) …y zoom anclado al centro hasta una escala legible (queda centrado).
      const target = Math.max(tf.current.scale, 0.95);
      zoomAt(
        vp.clientWidth / 2,
        vp.clientHeight / 2,
        target / tf.current.scale,
      );
      setHoverId(id);
    },
    [pos, nodeW, nodeH, applyTransform, zoomAt],
  );

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const id = matchNode(query);
      if (id) {
        setNoMatch(false);
        focusNode(id);
      } else if (query.trim()) {
        setNoMatch(true);
      }
    }
  };

  // Vecino según la flecha: izq/der siguen las correlativas (requiere / habilita),
  // arriba/abajo recorren la columna (cuatrimestre). Reusa adj/radj del resaltado.
  const neighborOf = useCallback(
    (from: string, key: string): string | null => {
      if (key === "ArrowRight") return (adj.get(from) ?? [])[0] ?? null;
      if (key === "ArrowLeft") return (radj.get(from) ?? [])[0] ?? null;
      const col = columnIds.get(Math.round(pos.get(from)?.x ?? NaN));
      if (!col) return null;
      const i = col.indexOf(from);
      if (i < 0) return null;
      return col[key === "ArrowDown" ? i + 1 : i - 1] ?? null;
    },
    [adj, radj, columnIds, pos],
  );

  const focusNodeEl = useCallback((id: string) => {
    setRovingId(id);
    nodeRefs.current.get(id)?.focus();
  }, []);

  const onNodeKeyDown = (e: ReactKeyboardEvent<SVGGElement>, code: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      dispatch({ type: "OPEN_DRAWER", code });
      return;
    }
    if (e.key.startsWith("Arrow")) {
      const target = neighborOf(code, e.key);
      if (target) {
        e.preventDefault();
        focusNodeEl(target);
      }
    }
  };

  // Nodo que porta el único tab-stop del grupo (fallback al primero del layout).
  const tabStopId =
    rovingId && nodeIds.has(rovingId) ? rovingId : nodes[0]?.id;

  return (
    <section className="view-panel grafo-view" id="panel-grafo">
      <div className="panel-head">
        <h2>Mapa de correlativas</h2>
        <p>
          Cada columna es un cuatrimestre de la carrera (1º·1c &rarr; 5º·2c): las
          correlativas fluyen de izquierda a derecha.
        </p>
      </div>

      <div className="grafo-toolbar">
        <div className="grafo-legend" aria-label="Referencia de colores">
          <span className="lg">
            <span className="sw ob" /> Obligatoria
          </span>
          <span className="lg">
            <span className="sw el" /> Electiva
          </span>
          <span className="lg">
            <span className="sw ap" /> Aprobada
          </span>
          <span className="lg">
            <span className="sw av" /> Cursable
          </span>
          <span className="lg">
            <span className="sw lk">
              <IconLock size={11} />
            </span>{" "}
            Requisitos pendientes
          </span>
          <span className="lg">
            <span className="lg-arrow" aria-hidden="true">
              &rarr;
            </span>{" "}
            habilita a
          </span>
        </div>
        <div className="grafo-toolbar__end">
          <div className={`grafo-search${noMatch ? " has-error" : ""}`}>
            <IconSearch size={14} aria-hidden="true" />
            <input
              type="text"
              className="grafo-search__input"
              placeholder="Buscar materia…"
              aria-label="Buscar materia por código, sigla o nombre"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (noMatch) setNoMatch(false);
              }}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <div className="grafo-count">
            <b>{nodes.length}</b> materias &middot; <b>{edges.length}</b>{" "}
            correlativas
          </div>
          {noMatch && (
            <p className="grafo-search__msg" role="status">
              Ninguna materia coincide con &ldquo;{query.trim()}&rdquo; — probá
              con la sigla o el código.
            </p>
          )}
        </div>
      </div>

      <div
        ref={viewportRef}
        className="grafo-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <svg
          ref={svgRef}
          className="grafo-svg"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Grafo de correlativas — arrastrá para mover, rueda para zoom"
        >
          <defs>
            <marker
              id="grafo-arrow"
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path className="grafo-arrow" d="M0 0 L10 5 L0 10 z" />
            </marker>
            <marker
              id="grafo-arrow-lit"
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7.4"
              markerHeight="7.4"
              orient="auto-start-reverse"
            >
              <path className="grafo-arrow-lit" d="M0 0 L10 5 L0 10 z" />
            </marker>
          </defs>

          <g ref={stageRef} className={`grafo-stage${ready ? " ready" : ""}`}>
            {/* banda de cuatrimestres: guías verticales + etiquetas año/cuatri.
                Refuerza la lectura "alineado por año/cuatri" de izq. a der. */}
            <g className="grafo-columns" aria-hidden="true">
              {columns.map((c, i) => (
                <g key={`col-${i}`} className="grafo-col">
                  <line
                    className="grafo-col-guide"
                    x1={c.x}
                    x2={c.x}
                    y1={bounds.top - 14}
                    y2={bounds.bottom + 14}
                  />
                  <text
                    className="grafo-col-anio"
                    x={c.x}
                    y={bounds.top - headerH + 13}
                    textAnchor="middle"
                  >
                    {c.top}
                  </text>
                  <text
                    className="grafo-col-cuatri"
                    x={c.x}
                    y={bounds.top - headerH + 26}
                    textAnchor="middle"
                  >
                    {c.sub}
                  </text>
                </g>
              ))}
            </g>

            <g className="grafo-edges">
              {paths.map((p) => {
                const lit = chain ? chain.has(p.from) && chain.has(p.to) : false;
                const dim = chain ? !lit : false;
                return (
                  <path
                    key={p.key}
                    className={`grafo-edge${lit ? " lit" : ""}${dim ? " dim" : ""}`}
                    d={p.d}
                    markerEnd={
                      lit ? "url(#grafo-arrow-lit)" : "url(#grafo-arrow)"
                    }
                  />
                );
              })}
            </g>

            <g className="grafo-nodes">
              {nodes.map((n) => {
                const ap = approved.has(n.id);
                // estado de cursabilidad (sólo para no aprobadas): cursable
                // (borde de acento) vs bloqueada (atenuada + candado).
                const avail = !ap && availSet.has(n.id);
                const blocked = !ap && !avail;
                const dim = chain ? !chain.has(n.id) : false;
                const sel = n.id === selectedId;
                const cls =
                  "grafo-node " +
                  (n.ob ? "ob" : "el") +
                  (ap ? " ap" : "") +
                  (avail ? " avail" : "") +
                  (blocked ? " blk" : "") +
                  (dim ? " dim" : "") +
                  (sel ? " sel" : "");
                return (
                  <g
                    key={n.id}
                    ref={(el) => {
                      if (el) nodeRefs.current.set(n.id, el);
                      else nodeRefs.current.delete(n.id);
                    }}
                    className={cls}
                    data-code={n.id}
                    transform={`translate(${n.x} ${n.y})`}
                    tabIndex={n.id === tabStopId ? 0 : -1}
                    role="button"
                    aria-label={`${n.abbr}, código ${n.id}, ${
                      n.ob ? "obligatoria" : "electiva"
                    }${
                      ap
                        ? ", aprobada"
                        : avail
                          ? ", cursable"
                          : ", requisitos pendientes"
                    }`}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() =>
                      setHoverId((cur) => (cur === n.id ? null : cur))
                    }
                    onFocus={() => {
                      setHoverId(n.id);
                      setRovingId(n.id);
                    }}
                    onBlur={() =>
                      setHoverId((cur) => (cur === n.id ? null : cur))
                    }
                    onKeyDown={(e) => onNodeKeyDown(e, n.id)}
                  >
                    <rect
                      className="gn-rect"
                      width={nodeW}
                      height={nodeH}
                      rx={7}
                      ry={7}
                    />
                    <text
                      className="gn-abbr"
                      x={nodeW / 2}
                      y={nodeH / 2 - 3}
                      textAnchor="middle"
                    >
                      {n.abbr}
                    </text>
                    <text
                      className="gn-code"
                      x={nodeW / 2}
                      y={nodeH / 2 + 12}
                      textAnchor="middle"
                    >
                      {n.id}
                    </text>
                    {ap && (
                      <g className="gn-badge">
                        <circle cx={nodeW - 12} cy={12} r={8} />
                        <path
                          d={`M ${nodeW - 15.2} 12 L ${nodeW - 13} 14.4 L ${
                            nodeW - 8.6
                          } 9`}
                        />
                      </g>
                    )}
                    {blocked && (
                      <g className="gn-lock" aria-hidden="true">
                        <rect
                          x={nodeW - 15.5}
                          y={10.5}
                          width={9}
                          height={6.5}
                          rx={1.5}
                        />
                        <path
                          d={`M ${nodeW - 13.2} 10.5 V 8.6 a 2.2 2.2 0 0 1 4.4 0 V 10.5`}
                        />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        <div className="grafo-hint" aria-hidden="true">
          <span className="grafo-hint__row">
            arrastrá para mover &middot; rueda para zoom
          </span>
          <span className="grafo-hint__row">
            Pasá el mouse por una materia para ver su cadena de correlativas.
          </span>
        </div>

        <div className="grafo-controls">
          <div className="grafo-zoom" ref={readoutRef} aria-hidden="true">
            100%
          </div>
          <button
            type="button"
            className="grafo-btn"
            onClick={() => zoomCenter(1.25)}
            aria-label="Acercar"
            title="Acercar"
          >
            +
          </button>
          <button
            type="button"
            className="grafo-btn"
            onClick={() => zoomCenter(0.8)}
            aria-label="Alejar"
            title="Alejar"
          >
            &minus;
          </button>
          <button
            type="button"
            className="grafo-btn fit"
            onClick={onFit}
            aria-label="Ajustar a la vista"
            title="Ajustar a la vista"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
            Ajustar
          </button>
        </div>
      </div>
    </section>
  );
}
