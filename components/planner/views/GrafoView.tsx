"use client";

import "../grafo.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { usePlanner } from "@/components/planner/state";
import { Tooltip } from "@/components/planner/Tooltip";
import { IconCheck } from "@/components/planner/icons";
import { PLAN, byId } from "@/lib/planner/model";
import { approvedCredits } from "@/lib/planner/metrics";
import { tieneFinal } from "@/lib/planner/estado";
import { normalizar } from "@/lib/planner/texto";
import { loadGrafoElectivas, saveGrafoElectivas } from "@/lib/planner/persist";
import {
  computeGraphLayout,
  GRAPH_METRICS,
  type GraphNode,
} from "@/lib/planner/layoutGraph";
import {
  buildAdjacency,
  chainOf,
  frontierColumn,
  matchQuery,
  neighborOf,
  statusOf,
  type NodeStatus,
} from "@/components/planner/grafo/grafoModel";
import {
  fitTransform,
  useViewport,
  VIEWPORT_LIMITS,
  type ContentRect,
  type ViewportApi,
} from "@/components/planner/grafo/useViewport";
import { GrafoStage, type Emphasis } from "@/components/planner/grafo/GrafoStage";
import { GrafoCard } from "@/components/planner/grafo/GrafoCard";
import { GrafoControls } from "@/components/planner/grafo/GrafoControls";
import { GrafoMinimap } from "@/components/planner/grafo/GrafoMinimap";

/**
 * Mapa de correlativas (v2). Cero texto que describa: la semántica va en la
 * forma, la posición y el color de los nodos (los mismos glifos y colores de
 * estado que EstadoControl), y al posarse en cada cosa —tooltip en los controles,
 * tarjeta en las materias—. Esta vista solo ORQUESTA: el layout es puro
 * (lib/planner/layoutGraph), el modelo derivado también (grafo/grafoModel), el
 * pan/zoom vive en el hook grafo/useViewport y el SVG en grafo/GrafoStage.
 *
 * Énfasis (excluyentes, en orden): cadena de la materia activa (hover ?? fijada)
 * › coincidencias de la búsqueda › foco «Cursables» › nada.
 */

// escala mínima a la que el mapa se considera legible para el encuadre inicial
const LEGIBLE_SCALE = 0.72;
// demora del hover antes de mostrar la tarjeta (la cadena se resalta al instante)
const CARD_DELAY = 180;

export default function GrafoView() {
  const { state, dispatch } = usePlanner();
  const { approved, finalDone, cursando } = state;

  // ---- preferencias de pantalla (hidratadas en el cliente) ----
  const [electivasOn, setElectivasOn] = useState(false);
  useEffect(() => {
    setElectivasOn(loadGrafoElectivas());
  }, []);
  const toggleElectivas = useCallback(() => {
    const next = !electivasOn;
    saveGrafoElectivas(next);
    setElectivasOn(next);
  }, [electivasOn]);
  const [spot, setSpot] = useState(false);

  const hasElectivas = PLAN.electivas.length > 0;

  // ---- layout puro + modelo ----
  const layout = useMemo(
    () => computeGraphLayout(PLAN, { electivas: electivasOn && hasElectivas }),
    [electivasOn, hasElectivas],
  );
  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    layout.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [layout]);
  const adj = useMemo(() => buildAdjacency(layout.edges), [layout]);
  // adyacencia del plan ENTERO (con la capa de electivas apagada la tarjeta
  // sigue diciendo todo lo que una materia habilita)
  const fullAdj = useMemo(() => {
    const edges: { from: string; to: string }[] = [];
    for (const m of [...PLAN.obligatorias, ...PLAN.electivas]) {
      for (const c of m.correlativas || []) if (byId.has(c)) edges.push({ from: c, to: m.codigo });
    }
    return buildAdjacency(edges);
  }, []);

  const statuses = useMemo(() => {
    const ctx = {
      approved,
      finalDone,
      cursando,
      approvedCredits: approvedCredits(approved),
      tieneFinal,
    };
    const out = new Map<string, NodeStatus>();
    layout.nodes.forEach((n) => {
      const m = byId.get(n.id);
      if (m) out.set(n.id, statusOf(m, ctx));
    });
    return out;
  }, [layout, approved, finalDone, cursando]);

  // ---- interacción ----
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [rovingId, setRovingId] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null); // hover con demora
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hover → cadena al instante, tarjeta tras CARD_DELAY
  useEffect(() => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    if (!hoverId) {
      setCardId(null);
      return;
    }
    cardTimer.current = setTimeout(() => setCardId(hoverId), CARD_DELAY);
    return () => {
      if (cardTimer.current) clearTimeout(cardTimer.current);
    };
  }, [hoverId]);

  // si la capa cambia y el nodo fijado desaparece, se suelta
  useEffect(() => {
    if (pinnedId && !nodeById.has(pinnedId)) setPinnedId(null);
  }, [pinnedId, nodeById]);

  const activeId = hoverId ?? pinnedId;
  const chain = useMemo(
    () => (activeId && nodeById.has(activeId) ? chainOf(activeId, adj) : null),
    [activeId, nodeById, adj],
  );

  // ---- búsqueda ----
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 100);
    return () => clearTimeout(t);
  }, [query]);
  const materias = useMemo(() => [...PLAN.obligatorias, ...PLAN.electivas], []);
  const matchesAll = useMemo(() => matchQuery(materias, q, normalizar), [materias, q]);
  const matches = useMemo(() => {
    const s = new Set<string>();
    matchesAll.forEach((id) => {
      if (nodeById.has(id)) s.add(id);
    });
    return s;
  }, [matchesAll, nodeById]);
  // solo coinciden electivas y la capa está apagada → se enciende sola
  useEffect(() => {
    if (q && matchesAll.size && !matches.size && !electivasOn && hasElectivas) {
      saveGrafoElectivas(true);
      setElectivasOn(true);
    }
  }, [q, matchesAll, matches, electivasOn, hasElectivas]);
  const noMatch = q.length > 0 && matchesAll.size === 0;

  const availIds = useMemo(() => {
    const s = new Set<string>();
    statuses.forEach((st, id) => {
      if (st.estado === "avail") s.add(id);
    });
    return s;
  }, [statuses]);

  const emphasis: Emphasis = useMemo(() => {
    if (chain && activeId)
      return { mode: "chain", lit: chain.all, up: chain.up, down: chain.down, active: activeId };
    if (q) return { mode: "search", lit: matches, up: null, down: null, active: null };
    if (spot) return { mode: "spot", lit: availIds, up: null, down: null, active: null };
    return { mode: "none", lit: null, up: null, down: null, active: null };
  }, [chain, activeId, q, matches, spot, availIds]);

  // ---- viewport (pan / zoom / encuadres) ----
  // Frontera = primer cuatrimestre con obligatorias pendientes: ahí «está» el
  // estudiante. El encuadre la deja con la columna anterior (ya cursada) al
  // borde izquierdo, de referencia, y la banda del espinazo centrada.
  const frontier = useMemo(() => frontierColumn(layout.nodes, approved), [layout, approved]);
  const frontierRef = useRef(frontier);
  frontierRef.current = frontier;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Rect (en coordenadas de contenido) que, centrado en el viewport a la escala
  // dada, deja `leftX` justo en el borde izquierdo (vw/scale de ancho a partir
  // de ahí). Vertical: si todo el alto entra, la banda del espinazo queda al
  // medio; si no (capa de electivas encendida), el lienzo se apoya arriba, con
  // las cabeceras de año visibles y las electivas colgando hacia abajo.
  const frameFor = useCallback((vw: number, vh: number, scale: number): ContentRect => {
    const lay = layoutRef.current;
    const f = Math.min(frontierRef.current, lay.columns.length - 1);
    const prev = f > 0 ? lay.columns[f - 1] : null;
    const leftX = prev ? prev.x - GRAPH_METRICS.COL_GAP / 2 : 0;
    const top = GRAPH_METRICS.PAD + GRAPH_METRICS.HEADER_H;
    if (lay.height * scale <= vh) {
      return { x: leftX, y: top, w: vw / scale, h: Math.max(1, lay.spineBottom - top) };
    }
    const topY = GRAPH_METRICS.PAD / 2;
    return { x: leftX, y: topY, w: vw / scale, h: vh / scale };
  }, []);

  const initialFrame = useCallback(
    (api: ViewportApi) => {
      const vp = api.viewportRef.current;
      if (!vp) return;
      const lay = layoutRef.current;
      const fit = fitTransform(
        lay.width,
        lay.height,
        vp.clientWidth,
        vp.clientHeight,
        VIEWPORT_LIMITS.FIT_PAD,
        VIEWPORT_LIMITS.FIT_MIN_SCALE,
        VIEWPORT_LIMITS.MAX_SCALE,
      );
      // todo entra legible → entero; si no, escala legible sobre la frontera
      if (fit.scale >= LEGIBLE_SCALE) api.fitAll();
      else
        api.frame(frameFor(vp.clientWidth, vp.clientHeight, LEGIBLE_SCALE), {
          scale: LEGIBLE_SCALE,
        });
    },
    [frameFor],
  );

  const onTap = useCallback((target: Element) => {
    const el = target.closest("[data-code]");
    if (el) {
      const code = el.getAttribute("data-code");
      if (code) setPinnedId((p) => (p === code ? null : code));
      return;
    }
    if (target.closest(".grafo-card")) return;
    setPinnedId(null);
  }, []);
  const onDoubleTap = useCallback(
    (target: Element) => {
      const code = target.closest("[data-code]")?.getAttribute("data-code");
      if (code) dispatch({ type: "OPEN_DRAWER", code });
    },
    [dispatch],
  );

  const viewport = useViewport({
    width: layout.width,
    height: layout.height,
    initialFrame,
    onTap,
    onDoubleTap,
  });

  const locate = useCallback(() => {
    const vp = viewport.viewportRef.current;
    if (!vp) return;
    const scale = Math.max(viewport.get().scale, 0.9);
    viewport.frame(frameFor(vp.clientWidth, vp.clientHeight, scale), { scale });
  }, [viewport, frameFor]);

  const focusNode = useCallback(
    (id: string) => {
      const n = nodeById.get(id);
      if (!n) return;
      viewport.centerOn(n.x + n.w / 2, n.y + n.h / 2, 0.95);
      setPinnedId(id);
    },
    [nodeById, viewport],
  );

  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const nodeRef = useCallback((id: string, el: SVGGElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  // El foco por TECLADO tiene que verse: si el nodo enfocado quedó fuera del
  // viewport (o cortado por un borde), se centra a la escala actual. El foco
  // que deja un clic no cuenta (:focus-visible): el mapa no salta al tocarlo.
  const revealNode = useCallback(
    (id: string) => {
      const n = nodeById.get(id);
      const vp = viewport.viewportRef.current;
      const el = nodeRefs.current.get(id);
      if (!n || !vp || !el || !el.matches(":focus-visible")) return;
      const { scale } = viewport.get();
      const p = viewport.toScreen(n.x, n.y);
      const margin = 12;
      const fuera =
        p.x < margin ||
        p.y < margin ||
        p.x + n.w * scale > vp.clientWidth - margin ||
        p.y + n.h * scale > vp.clientHeight - margin;
      if (fuera) viewport.centerOn(n.x + n.w / 2, n.y + n.h / 2);
    },
    [nodeById, viewport],
  );

  // ---- teclado ----
  const onNodeKeyDown = (e: ReactKeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPinnedId((p) => (p === id ? null : id));
      return;
    }
    if (e.key.startsWith("Arrow")) {
      const target = neighborOf(id, e.key, layout.nodes, adj);
      if (target) {
        e.preventDefault();
        setRovingId(target);
        nodeRefs.current.get(target)?.focus();
      }
    }
  };
  const onSectionKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT") {
      if (query) {
        setQuery("");
        e.stopPropagation();
      }
      return;
    }
    if (pinnedId) {
      setPinnedId(null);
      e.stopPropagation();
    }
  };
  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const first = layout.nodes.find((n) => matches.has(n.id));
    if (first) focusNode(first.id);
  };

  const tabStopId = rovingId && nodeById.has(rovingId) ? rovingId : (layout.nodes[0]?.id ?? null);

  // ---- tarjeta: la del hover (de paso, sin capturar el puntero) o la fijada ----
  // Posarse sobre otro nodo mientras hay uno fijado muestra la tarjeta de paso
  // de ese otro; al salir vuelve la fijada.
  const showId = cardId && cardId !== pinnedId ? cardId : pinnedId;
  const cardPinned = showId !== null && showId === pinnedId;
  const cardNode = showId ? nodeById.get(showId) : undefined;
  const cardStatus = showId ? statuses.get(showId) : undefined;

  return (
    <section className="view-panel grafo-view" id="panel-grafo" onKeyDown={onSectionKeyDown}>
      <div className="panel-head panel-head--tools">
        <div className="vtools">
          <div className={"field vtools__search grafo-search" + (noMatch ? " is-nomatch" : "")}>
            <svg className="field__ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              type="search"
              placeholder="Buscar materia"
              aria-label="Buscar materia por código, sigla o nombre"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          <div className="vtools__filters" role="group" aria-label="Capas y foco">
            {hasElectivas && (
              <Tooltip width={230} content={electivasOn ? "Ocultar las electivas: queda el espinazo de obligatorias." : "Mostrar las electivas colgando de sus correlativas."}>
                <button type="button" className={"vtools__chip" + (electivasOn ? " is-on" : "")} aria-pressed={electivasOn} onClick={toggleElectivas}>
                  <span className="vtools__chip-ic" aria-hidden="true"><IconCheck size={11} strokeWidth={2.4} /></span>
                  Electivas
                </button>
              </Tooltip>
            )}
            <Tooltip width={230} content="Resalta lo que ya podés cursar: correlativas y créditos cubiertos.">
              <button type="button" className={"vtools__chip" + (spot ? " is-on" : "")} aria-pressed={spot} onClick={() => setSpot((s) => !s)}>
                <span className="vtools__chip-ic" aria-hidden="true"><IconCheck size={11} strokeWidth={2.4} /></span>
                Cursables
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      <div ref={viewport.viewportRef} className="grafo-viewport" {...viewport.handlers}>
        <GrafoStage
          layout={layout}
          statuses={statuses}
          emphasis={emphasis}
          hoverId={hoverId}
          pinnedId={pinnedId}
          tabStopId={tabStopId}
          stageRef={viewport.stageRef}
          nodeRef={nodeRef}
          onHover={setHoverId}
          onFocus={(id) => {
            setHoverId(id);
            setRovingId(id);
            revealNode(id);
          }}
          onBlur={(id) => setHoverId((cur) => (cur === id ? null : cur))}
          onKeyDown={onNodeKeyDown}
          ready={viewport.ready}
        />
        {cardNode && cardStatus && showId && (
          <GrafoCard
            key={showId}
            id={showId}
            pinned={cardPinned}
            anchor={{ x: cardNode.x, y: cardNode.y, w: cardNode.w, h: cardNode.h }}
            viewport={viewport}
            status={cardStatus}
            requiere={byId.get(showId)?.correlativas ?? []}
            habilita={fullAdj.succ.get(showId) ?? []}
            approved={approved}
            onDetalle={() => dispatch({ type: "OPEN_DRAWER", code: showId })}
            onClose={() => setPinnedId(null)}
          />
        )}
        <GrafoMinimap layout={layout} viewport={viewport} lit={emphasis.lit} />
        <GrafoControls
          onZoomIn={() => viewport.zoomBy(1.25)}
          onZoomOut={() => viewport.zoomBy(0.8)}
          onFit={viewport.fitAll}
          onLocate={locate}
        />
      </div>
    </section>
  );
}
