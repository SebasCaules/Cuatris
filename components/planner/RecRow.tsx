"use client";

// Fila compartida de materia recomendada/sugerida — fuente única del patrón
// para el Combinador («Sugeridas») y el Plan de cursada («Recomendadas»).
// Anatomía (una sola línea, densa): [dots de minor] nombre … [señales] cr [+].
// El cuerpo abre el drawer de detalle (ahí vive la info completa); el «+»
// ejecuta la acción de agregar de cada vista. Las señales de encaje son chips
// compactos (RecSig) que cada vista compone según su dominio.

import "./rec-row.css";

import { MinorBadge } from "./MinorBadge";
import { minorsOf } from "@/lib/planner/minors";
import { IconPlus } from "./icons";
import type { MateriaM } from "@/lib/planner/types";
import type { ReactNode } from "react";

/** Chip compacto de señal de encaje (tonos alineados a los grupos ok/warn/bad). */
export function RecSig({
  tone,
  title,
  children,
}: {
  tone: "when" | "ok" | "warn" | "bad" | "soft";
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={"recsig recsig--" + tone} title={title}>
      {children}
    </span>
  );
}

export interface RecRowProps {
  m: MateriaM;
  /** señales de encaje propias de la vista (chips RecSig ya compuestos). */
  signals?: ReactNode;
  /** fila atenuada (se pisa / no entra / sin horario) — sigue siendo operable. */
  muted?: boolean;
  /** fila resaltada (vista previa activa en el plan). */
  active?: boolean;
  /** tooltip del cuerpo; default `código · nombre`. */
  title?: string;
  /** aria-label del botón «+». */
  addLabel: string;
  onAdd: () => void;
  /** click en el cuerpo → detalle (drawer). */
  onOpen: () => void;
  /** vista previa (hover/focus) — opcional, la usa el plan. */
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

export function RecRow({
  m,
  signals,
  muted,
  active,
  title,
  addLabel,
  onAdd,
  onOpen,
  onHoverStart,
  onHoverEnd,
}: RecRowProps) {
  const minors = minorsOf(m.areas);
  const troncal = m.tipo === "obligatoria";
  return (
    <li
      className={
        "recrow" + (muted ? " is-muted" : "") + (active ? " is-active" : "")
      }
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      {/* marca de ancho FIJO (los nombres quedan alineados): troncal (dot
          slate sólido, mismo código de color que los grupos ob/el) › dots de
          minor apilados con offset › aro vacío (electiva sin minor). Sin
          aria-hidden en los minors: el dot es el único portador del dato en
          la fila y cada MinorBadge trae su propio aria-label. */}
      <span className="recrow__mark">
        {troncal ? (
          <span
            className="recrow__ob"
            role="img"
            aria-label="Troncal (obligatoria del plan)"
            title="Troncal — obligatoria de tu plan"
          />
        ) : minors.length > 0 ? (
          minors.map((mn) => (
            <MinorBadge key={mn.id} minor={mn} variant="dot" />
          ))
        ) : (
          <span className="recrow__nodot" aria-hidden="true" />
        )}
      </span>
      <button
        type="button"
        className="recrow__main"
        title={title ?? `${m.codigo} · ${m.nombre}`}
        onClick={onOpen}
        onFocus={onHoverStart}
        onBlur={onHoverEnd}
      >
        <span className="recrow__name">{m.nombre}</span>
      </button>
      {signals != null && <span className="recrow__sig">{signals}</span>}
      <span className="recrow__cr">{m.creditos} cr</span>
      <button
        type="button"
        className="recrow__add"
        aria-label={addLabel}
        onClick={onAdd}
      >
        <IconPlus size={11} />
      </button>
    </li>
  );
}
