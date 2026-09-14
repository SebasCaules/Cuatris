"use client";

// Tarjeta de una materia del mapa de correlativas: se muestra en hover (solo
// lectura, no captura el puntero) o fijada (agrega el control de estado y las
// acciones). Vive DENTRO de .grafo-viewport, posicionada de forma absoluta
// junto al nodo que representa — nunca por portal, así queda recortada por el
// mismo contenedor que el SVG (PLAN.md §2.4).
//
// La posición se recalcula al montar y en cada notificación de
// viewport.subscribe (pan/zoom), mutando `style.left/top` DIRECTO sobre el
// nodo del DOM (vía ref) para no disparar un render de React en cada frame de
// una animación de zoom — el mismo criterio que usa useViewport (U2). Lo
// único que vive en estado de React es `lado` (para elegir la clase de la
// tarjeta), y solo se toca cuando efectivamente cambia.
import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type {
  ContentRect,
  ViewportApi,
} from "@/components/planner/grafo/useViewport";
import type {
  NodeEstado,
  NodeStatus,
} from "@/components/planner/grafo/grafoModel";
import { byId } from "@/lib/planner/model";
import { Tooltip } from "@/components/planner/Tooltip";
import {
  CheckDouble,
  CheckFilled,
  CheckSingle,
  DotCursando,
  EstadoControl,
} from "@/components/planner/EstadoControl";
import { IconCheck, IconClose, IconLock } from "@/components/planner/icons";

export interface GrafoCardProps {
  id: string;
  pinned: boolean;
  /** rect del nodo en coordenadas de CONTENIDO (no de pantalla). */
  anchor: ContentRect;
  /** toScreen + subscribe: para seguir el pan/zoom sin re-renderizar. */
  viewport: ViewportApi;
  status: NodeStatus;
  /** correlativas directas (lo que esta materia requiere). */
  requiere: string[];
  /** sucesoras directas (lo que esta materia destraba). */
  habilita: string[];
  approved: Set<string>;
  /** → OPEN_DRAWER (lo despacha la vista). */
  onDetalle: () => void;
  /** soltar (× de la tarjeta fijada; clic en vacío/Esc los maneja la vista). */
  onClose: () => void;
}

/** Lado donde terminó quedando la tarjeta respecto del nodo: decide la clase
 *  modificadora (`--left`/`--below`). "right" es la preferencia por default y
 *  no suma clase. "Arriba" reusa "below" — misma clase; la única diferencia
 *  es el signo del desplazamiento vertical (PLAN.md §2.4: "misma clase
 *  --below"). */
type Lado = "right" | "left" | "below";

type ChipVariant = "ok" | "missing" | "neutral";

const GAP = 10;
const EDGE = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Texto de la fila de estado (PLAN.md §1.2): una frase corta, con las
 *  siglas de lo que falta cuando está bloqueada. */
function statusText(status: NodeStatus): string {
  if (status.estado === "final") return "Final aprobado";
  if (status.estado === "regular") return "Cursada · falta el final";
  if (status.estado === "promo") return "Promocionada";
  if (status.estado === "cursando") return "Cursando";
  if (status.estado === "avail") return "Cursable";
  if (status.faltanCorr.length) {
    const siglas = status.faltanCorr.map((c) => byId.get(c)?.abbr ?? c).join(" · ");
    const cred = status.faltanCred > 0 ? ` y ${status.faltanCred} créditos` : "";
    return `Faltan: ${siglas}${cred}`;
  }
  return `Faltan ${status.faltanCred} créditos`;
}

/** Glifo de estado: mismos trazos que EstadoControl (un estado se lee igual
 *  en toda la app); el color lo hereda de `.grafo-card__status.is-*` vía
 *  `currentColor`, así que ninguno de estos íconos necesita una clase propia
 *  acá. "avail" no lleva glifo (tabla del PLAN §1.1). */
function statusGlyph(estado: NodeEstado): ReactElement | null {
  if (estado === "final") return <CheckDouble />;
  if (estado === "regular") return <CheckSingle />;
  if (estado === "promo") return <CheckFilled />;
  if (estado === "cursando") return <DotCursando />;
  if (estado === "blocked") return <IconLock />;
  return null;
}

/** Un chip de correlativa (fila «Requiere»/«Habilita»). Sin la tarjeta
 *  fijada no lleva Tooltip (la de hover no captura el puntero: envolverlo
 *  igual no serviría de nada). `tabIndex=-1` en la versión fijada solo para
 *  calificar como "disparador enfocable" del Tooltip sin sumar un tab-stop
 *  nuevo (mismo criterio que los chips de minor en PlanView). */
function renderChip(code: string, variant: ChipVariant, pinned: boolean): ReactElement {
  const m = byId.get(code);
  const sigla = m?.abbr ?? code;
  const cls =
    "grafo-chip" +
    (variant === "ok" ? " is-ok" : variant === "missing" ? " is-missing" : "");
  if (!pinned) {
    return (
      <span key={code} className={cls}>
        {sigla}
        {variant === "ok" && <IconCheck size={9} strokeWidth={2.6} />}
      </span>
    );
  }
  return (
    <Tooltip key={code} width={220} content={<><b>{code}</b> · {m?.nombre ?? code}</>}>
      <span className={cls} tabIndex={-1}>
        {sigla}
        {variant === "ok" && <IconCheck size={9} strokeWidth={2.6} />}
      </span>
    </Tooltip>
  );
}

export function GrafoCard({
  id,
  pinned,
  anchor,
  viewport,
  status,
  requiere,
  habilita,
  approved,
  onDetalle,
  onClose,
}: GrafoCardProps): ReactElement {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const ladoRef = useRef<Lado>("right");
  const [lado, setLado] = useState<Lado>("right");

  // Posición: se recalcula al montar y en cada pan/zoom (subscribe), y
  // también cuando cambia algo que puede correr el nodo o el tamaño de la
  // tarjeta (fijar agrega la fila de acciones; el estado o las correlativas
  // pueden cambiar el alto de las filas). Escribir el propio left/top NO pasa
  // por React — se muta `cardRef.current.style` a mano, así un pan/zoom
  // nunca dispara un render de este componente. Solo `lado` (para la clase
  // --left/--below) es estado de React, y solo se toca cuando cambia.
  useLayoutEffect(() => {
    function position() {
      const card = cardRef.current;
      const vp = viewport.viewportRef.current;
      if (!card || !vp) return;
      const { scale } = viewport.get();
      const p = viewport.toScreen(anchor.x, anchor.y);
      const nodeW = anchor.w * scale;
      const nodeH = anchor.h * scale;
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const cardW = card.offsetWidth;
      const cardH = card.offsetHeight;
      const centerX = p.x + nodeW / 2;
      const centerY = p.y + nodeH / 2;

      // Preferencia: DERECHA del nodo.
      let next: Lado = "right";
      let left = p.x + nodeW + GAP;
      let top = clamp(centerY - cardH / 2, EDGE, vh - cardH - EDGE);

      if (left + cardW > vw - EDGE) {
        // No entra a la derecha: IZQUIERDA.
        next = "left";
        left = p.x - GAP - cardW;
        if (left < EDGE) {
          // Tampoco a la izquierda: DEBAJO (o ARRIBA si se pasa del fondo).
          next = "below";
          left = clamp(centerX - cardW / 2, EDGE, vw - cardW - EDGE);
          top = p.y + nodeH + GAP;
          if (top + cardH > vh - EDGE) {
            top = p.y - GAP - cardH;
          }
        }
      }

      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      if (ladoRef.current !== next) {
        ladoRef.current = next;
        setLado(next);
      }
    }

    position();
    return viewport.subscribe(position);
  }, [
    id,
    pinned,
    anchor.x,
    anchor.y,
    anchor.w,
    anchor.h,
    requiere,
    habilita,
    status,
    approved,
    viewport,
  ]);

  const m = byId.get(id);
  const abbr = m?.abbr ?? id;
  const nombre = m?.nombre ?? id;
  const creditos = m?.creditos ?? 0;

  return (
    <div
      ref={cardRef}
      className={
        "grafo-card" +
        (pinned ? " is-pinned" : "") +
        (lado === "left"
          ? " grafo-card--left"
          : lado === "below"
            ? " grafo-card--below"
            : "")
      }
      role={pinned ? "group" : undefined}
      aria-label={abbr}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="grafo-card__head">
        <span className="grafo-card__abbr">{abbr}</span>
        <span className="grafo-card__code">{id}</span>
        <span className="grafo-card__cr">{creditos} cr</span>
      </div>
      <p className="grafo-card__name">{nombre}</p>
      <div className={"grafo-card__status is-" + status.estado}>
        {statusGlyph(status.estado)}
        <span>{statusText(status)}</span>
      </div>

      {requiere.length > 0 && (
        <div className="grafo-card__row">
          <span className="grafo-card__lbl">Requiere</span>
          <div className="grafo-card__chips">
            {requiere.map((c) => renderChip(c, approved.has(c) ? "ok" : "missing", pinned))}
          </div>
        </div>
      )}

      {habilita.length > 0 && (
        <div className="grafo-card__row">
          <span className="grafo-card__lbl">Habilita</span>
          <div className="grafo-card__chips">
            {habilita.slice(0, 10).map((c) => renderChip(c, "neutral", pinned))}
            {habilita.length > 10 && (
              <span key="__more" className="grafo-chip">
                +{habilita.length - 10}
              </span>
            )}
          </div>
        </div>
      )}

      {pinned && (
        <div className="grafo-card__acts">
          <span className="grafo-card__estado">
            <EstadoControl code={id} />
          </span>
          <button type="button" className="grafo-card__detail" onClick={onDetalle}>
            Ver detalle
          </button>
          <Tooltip width={150} content="Soltar · Esc">
            <button
              type="button"
              className="grafo-card__close"
              aria-label="Soltar"
              onClick={onClose}
            >
              <IconClose size={13} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
