"use client";

// El SVG del mapa de correlativas: bandas de año, cabeceras de columna, riel
// de electivas, aristas (Bézier cúbica) y nodos. Componente puramente
// declarativo — sin manejadores de puntero propios en nodos ni aristas (el
// tap/pan/zoom los maneja `useViewport` sobre el `<div class="grafo-viewport">`
// detectando `[data-code]`); acá solo van los manejadores de teclado y foco
// que pide el roving tabindex (PLAN.md §1.2) y el hover que alimenta la
// cadena de énfasis.
//
// El `<g ref={stageRef}>` NO lleva `transform` propio: `useViewport` (U2) lo
// escribe de forma imperativa sobre el atributo DOM en cada pan/zoom, así que
// re-renderizar este componente (p. ej. al cambiar el hover) nunca pisa esa
// transformación.
//
// Los glifos de estado son EXACTAMENTE los de `EstadoControl.tsx` (mismos
// `viewBox`/`path`/trazos): un estado tiene que leerse igual en toda la app,
// esté en la pestaña de aprobadas o en el mapa. Los tres markers de flecha
// (base/up/down) evitan tener que recolorear un único marker por CSS —
// `marker` no hereda `currentColor` del `<path>` que lo referencia.
import { useMemo, type KeyboardEvent, type ReactElement, type RefObject } from "react";
import { GRAPH_METRICS, type GraphLayout, type GraphNode } from "@/lib/planner/layoutGraph";
import type { NodeEstado, NodeStatus } from "@/components/planner/grafo/grafoModel";

const { PAD, COL_GAP, BAND_GAP } = GRAPH_METRICS;

export interface Emphasis {
  mode: "none" | "chain" | "search" | "spot";
  lit: Set<string> | null;
  up: Set<string> | null;
  down: Set<string> | null;
  active: string | null;
}

export interface GrafoStageProps {
  layout: GraphLayout;
  statuses: Map<string, NodeStatus>;
  emphasis: Emphasis;
  hoverId: string | null;
  pinnedId: string | null;
  tabStopId: string | null;
  stageRef: RefObject<SVGGElement | null>;
  nodeRef: (id: string, el: SVGGElement | null) => void;
  onHover: (id: string | null) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string) => void;
  onKeyDown: (e: KeyboardEvent<SVGGElement>, id: string) => void;
  ready: boolean;
}

// Un nodo sin estado en el Map (no debería pasar: `statuses` cubre todas las
// materias del plan) se trata como bloqueado — nunca se deja sin clase de
// estado, que es justo lo que el CSS asume (comentario de cabecera de
// grafo.css: "no hay estado sin clase").
const FALLBACK_STATUS: NodeStatus = { estado: "blocked", faltanCorr: [], faltanCred: 0 };

const ESTADO_LABEL: Record<NodeEstado, string> = {
  final: "final aprobado",
  regular: "cursada, falta el final",
  promo: "promocionada",
  cursando: "cursando",
  avail: "cursable",
  blocked: "faltan requisitos",
};

/** Glifo de estado (derecha del nodo): mismos trazos que EstadoControl.tsx,
 *  para que un estado se lea igual en todo el planner. "avail" no lleva
 *  glifo (tabla del PLAN §1.1). */
function estadoGlyph(estado: NodeEstado, w: number, h: number): ReactElement | null {
  const x = w - 21;
  const y = (h - 12) / 2;
  const common = { x, y, width: 14, height: 12, "aria-hidden": true } as const;
  switch (estado) {
    case "final":
      return (
        <svg
          {...common}
          className="gnode__glyph gnode__glyph--go"
          viewBox="0 0 24 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 8.5L6 12L11.5 4.5" />
          <path d="M9.5 8.5L13 12L18.5 4.5" />
        </svg>
      );
    case "regular":
      return (
        <svg
          {...common}
          className="gnode__glyph gnode__glyph--warn"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5L6.5 12L13 4.5" />
        </svg>
      );
    case "promo":
      return (
        <svg
          {...common}
          className="gnode__glyph gnode__glyph--promo"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      );
    case "cursando":
      return (
        <svg
          {...common}
          className="gnode__glyph gnode__glyph--cursando"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <circle cx="8" cy="8" r="3.4" />
        </svg>
      );
    case "blocked":
      return (
        <svg {...common} className="gnode__glyph gnode__glyph--lock" viewBox="0 0 16 16">
          <rect x={3} y={7} width={10} height={7} rx={1.5} fill="currentColor" />
          <path
            d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );
    case "avail":
    default:
      return null;
  }
}

/** Camino de la arista: Bézier cúbica del medio-derecho de `a` al
 *  medio-izquierdo de `b`, con tangentes horizontales (los puntos de control
 *  quedan en el x medio entre ambos extremos). */
function edgePath(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`;
}

export function GrafoStage({
  layout,
  statuses,
  emphasis,
  hoverId,
  pinnedId,
  tabStopId,
  stageRef,
  nodeRef,
  onHover,
  onFocus,
  onBlur,
  onKeyDown,
  ready,
}: GrafoStageProps): ReactElement {
  // Mapa id → nodo (lookup de las aristas) y caminos base de las aristas:
  // ninguno de los dos depende de `emphasis`/hover, así que memoizarlos sobre
  // `layout` evita recalcular ~190 paths en cada hover (solo cambian las
  // clases/markers, no la geometría).
  const byId = useMemo(() => {
    const m = new Map<string, GraphNode>();
    layout.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [layout]);

  const edgeGeoms = useMemo(() => {
    return layout.edges
      .map((e) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        return { from: e.from, to: e.to, d: edgePath(a, b) };
      })
      .filter((g): g is { from: string; to: string; d: string } => g !== null);
  }, [layout, byId]);

  const railY = layout.spineBottom + BAND_GAP / 2;

  return (
    <svg
      className="grafo-svg"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Mapa de correlativas"
    >
      <defs>
        <marker
          id="grafo-arrow"
          viewBox="0 0 10 10"
          refX={8.5}
          refY={5}
          markerWidth={6.5}
          markerHeight={6.5}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="grafo-arrow" />
        </marker>
        <marker
          id="grafo-arrow-up"
          viewBox="0 0 10 10"
          refX={8.5}
          refY={5}
          markerWidth={6.5}
          markerHeight={6.5}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="grafo-arrow grafo-arrow--up" />
        </marker>
        <marker
          id="grafo-arrow-down"
          viewBox="0 0 10 10"
          refX={8.5}
          refY={5}
          markerWidth={6.5}
          markerHeight={6.5}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" className="grafo-arrow grafo-arrow--down" />
        </marker>
      </defs>
      <g ref={stageRef} className={"grafo-stage" + (ready ? " is-ready" : "")}>
        <g className="grafo-bands" aria-hidden="true">
          {layout.bands.map((b) => (
            <rect
              key={b.year}
              className="grafo-band"
              x={b.x - COL_GAP / 2}
              y={PAD}
              width={b.width + COL_GAP}
              height={layout.height - 2 * PAD}
            />
          ))}
        </g>

        <g className="grafo-cols" aria-hidden="true">
          {layout.columns
            .filter((c) => c.top !== null)
            .map((c) => (
              <g key={c.index}>
                <text className="grafo-col__anio" x={c.cx} y={PAD + 13}>
                  {c.top}
                </text>
                {c.sub !== null ? (
                  <text className="grafo-col__cuatri" x={c.cx} y={PAD + 27}>
                    {c.sub}
                  </text>
                ) : null}
              </g>
            ))}
        </g>

        {layout.hasElectivas ? (
          <line
            className="grafo-rail"
            x1={PAD}
            x2={layout.width - PAD}
            y1={railY}
            y2={railY}
          />
        ) : null}

        <g className="grafo-edges">
          {edgeGeoms.map((g) => {
            let cls = "grafo-edge";
            let marker = "url(#grafo-arrow)";
            if (emphasis.mode === "chain" && emphasis.up && emphasis.down) {
              const activeId = emphasis.active;
              const isUp = emphasis.up.has(g.from) && (emphasis.up.has(g.to) || g.to === activeId);
              const isDown =
                (emphasis.down.has(g.from) || g.from === activeId) && emphasis.down.has(g.to);
              if (isUp) {
                cls += " is-up";
                marker = "url(#grafo-arrow-up)";
              } else if (isDown) {
                cls += " is-down";
                marker = "url(#grafo-arrow-down)";
              } else {
                cls += " is-dim";
              }
            }
            return (
              <path key={`${g.from}>${g.to}`} className={cls} d={g.d} markerEnd={marker} />
            );
          })}
        </g>

        <g className="grafo-nodes">
          {layout.nodes.map((n) => {
            const status = statuses.get(n.id) ?? FALLBACK_STATUS;
            const dim = emphasis.lit !== null && !emphasis.lit.has(n.id);
            const isHover = n.id === hoverId;
            const isPinned = n.id === pinnedId;
            const isMatch =
              (emphasis.mode === "search" || emphasis.mode === "spot") &&
              (emphasis.lit?.has(n.id) ?? false);
            const cls =
              "gnode " +
              (n.ob ? "gnode--ob" : "gnode--el") +
              " st-" +
              status.estado +
              (dim ? " is-dim" : "") +
              (isHover ? " is-hover" : "") +
              (isPinned ? " is-pinned" : "") +
              (isMatch ? " is-match" : "");
            const maxLen = n.ob ? 9 : 10;
            const compress = n.abbr.length > maxLen;
            const ariaLabel = `${n.abbr}, ${n.id}, ${n.ob ? "obligatoria" : "electiva"}, ${ESTADO_LABEL[status.estado]}`;
            return (
              <g
                key={n.id}
                className={cls}
                data-code={n.id}
                transform={`translate(${n.x} ${n.y})`}
                tabIndex={n.id === tabStopId ? 0 : -1}
                role="button"
                aria-label={ariaLabel}
                ref={(el) => nodeRef(n.id, el)}
                onMouseEnter={() => onHover(n.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onFocus(n.id)}
                onBlur={() => onBlur(n.id)}
                onKeyDown={(e) => onKeyDown(e, n.id)}
              >
                <rect className="gnode__rect" width={n.w} height={n.h} />
                <rect
                  className="gnode__ring"
                  x={-3}
                  y={-3}
                  width={n.w + 6}
                  height={n.h + 6}
                />
                <circle className="gnode__dot" cx={11} cy={n.h / 2} r={3} />
                <text
                  className="gnode__abbr"
                  x={n.w / 2 + 1}
                  y={n.h / 2}
                  dominantBaseline="central"
                  {...(compress
                    ? { textLength: n.w - 38, lengthAdjust: "spacingAndGlyphs" as const }
                    : {})}
                >
                  {n.abbr}
                </text>
                {estadoGlyph(status.estado, n.w, n.h)}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
