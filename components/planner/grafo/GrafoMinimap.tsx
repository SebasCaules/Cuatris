"use client";

// Minimapa del mapa de correlativas (PLAN.md §1.2 y §2.5): abajo a la
// izquierda del viewport, es un ATAJO de navegación por puntero — la misma
// navegación existe por teclado (roving tabindex + flechas, U5/U7) y por los
// botones de `GrafoControls` (ver todo / ir a donde estoy), así que acá va
// oculto para lectores de pantalla (`aria-hidden`) en vez de duplicar con
// peor ergonomía el control accesible.
//
// El rectángulo que representa el viewport (`.grafo-minimap__view`) se mueve
// de forma IMPERATIVA (setAttribute, sin estado de React) en cada
// notificación de `viewport.subscribe`: con ~100 nodos en el DAG, un
// setState por cada pan/zoom del lienzo principal dispararía un re-render de
// este componente de más en cada frame de la interacción.
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { GraphLayout } from "@/lib/planner/layoutGraph";
import type { Transform, ViewportApi } from "@/components/planner/grafo/useViewport";

export interface GrafoMinimapProps {
  layout: GraphLayout;
  viewport: ViewportApi;
  /** ids a resaltar (cadena activa / búsqueda); `null` = sin foco, todos los
   *  nodos quedan a la misma opacidad base. */
  lit: Set<string> | null;
}

export function GrafoMinimap({ layout, viewport, lit }: GrafoMinimapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRectRef = useRef<SVGRectElement | null>(null);

  // Geometría de los nodos: se recalcula solo cuando cambia `layout` (prender
  // o apagar la capa de electivas, cambiar de carrera). El resaltado de
  // `lit` se aplica aparte, en el render de más abajo, con solo un cambio de
  // className por nodo — no hace falta rehacer esta lista por eso.
  const nodeRects = useMemo(
    () => layout.nodes.map((n) => ({ id: n.id, ob: n.ob, x: n.x, y: n.y, w: n.w, h: n.h })),
    [layout],
  );

  // Posiciona el rect del viewport a partir de la transformación actual:
  // inversa de `toScreen` acotada al tamaño del propio viewport (vw/vh), en
  // coordenadas de CONTENIDO — el mismo sistema que usan los nodos y el
  // viewBox de este <svg>. Se sincroniza al montar y en cada notificación de
  // `viewport.subscribe`; se limpia la suscripción al desmontar.
  useEffect(() => {
    function syncViewRect(t: Transform) {
      const rect = viewRectRef.current;
      const vp = viewport.viewportRef.current;
      if (!rect || !vp || !t.scale) return;
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      rect.setAttribute("x", String(-t.tx / t.scale));
      rect.setAttribute("y", String(-t.ty / t.scale));
      rect.setAttribute("width", String(vw / t.scale));
      rect.setAttribute("height", String(vh / t.scale));
    }
    syncViewRect(viewport.get());
    return viewport.subscribe(syncViewRect);
  }, [viewport]);

  // Puntero → punto de contenido, deshaciendo el letterboxing de
  // `preserveAspectRatio="xMidYMid meet"`: el <svg> escala por el eje que
  // más ajusta (el mínimo de las dos razones) y centra el sobrante en el
  // otro eje, así que la escala y el offset reales hay que recalcularlos con
  // el tamaño en pantalla del propio <svg> — no alcanza con el viewBox.
  function contentPointFrom(clientX: number, clientY: number): { cx: number; cy: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const scale = Math.min(r.width / layout.width, r.height / layout.height);
    if (!scale) return null;
    const offX = (r.width - layout.width * scale) / 2;
    const offY = (r.height - layout.height * scale) / 2;
    return {
      cx: (clientX - r.left - offX) / scale,
      cy: (clientY - r.top - offY) / scale,
    };
  }

  // Centra el viewport principal en el punto tocado/arrastrado, sin tocar el
  // zoom actual (misma escala de `viewport.get()`).
  function goTo(clientX: number, clientY: number) {
    const p = contentPointFrom(clientX, clientY);
    const vp = viewport.viewportRef.current;
    if (!p || !vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const s = viewport.get().scale;
    viewport.set({ scale: s, tx: vw / 2 - p.cx * s, ty: vh / 2 - p.cy * s });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op: algunos punteros sintéticos no soportan captura */
    }
    e.stopPropagation();
    goTo(e.clientX, e.clientY);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    // Solo mientras dura el arrastre iniciado en este minimapa — sin esto,
    // cualquier pointermove que pase por acá (aun sin botón) movería el
    // viewport principal.
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    goTo(e.clientX, e.clientY);
  }

  function releasePointer(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }

  return (
    <div
      className="grafo-minimap"
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        ref={svgRef}
        className="grafo-minimap__svg"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {nodeRects.map((n) => (
          <rect
            key={n.id}
            className={
              "grafo-minimap__node " +
              (n.ob ? "grafo-minimap__node--ob" : "grafo-minimap__node--el") +
              (lit && lit.has(n.id) ? " is-lit" : "")
            }
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            rx={3}
          />
        ))}
        <rect ref={viewRectRef} className="grafo-minimap__view" x={0} y={0} width={0} height={0} />
      </svg>
    </div>
  );
}
