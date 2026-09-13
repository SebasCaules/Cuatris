"use client";

// Chips de características derivadas del programa analítico + badge "coming soon".
// Fuente única de verdad para DetailDrawer, FichaReader, ElectivasView y el
// Combinador, así el lenguaje visual queda consistente en toda la app.
// La derivación es heurística (ver lib/planner/programa.ts): se muestra un chip
// SOLO cuando la señal aparece explícita en el texto del programa; nunca se infiere.

import type { ReactNode } from "react";
import { charsOf, hasPrograma } from "@/lib/planner/programa";

/* Íconos por concepto: cada chip lleva su propio glyph para que se distinga de un
   vistazo qué señal es (régimen ≠ asistencia ≠ evaluación), no solo por color. */
const svg = (children: ReactNode) => (
  <svg
    className="prog-chip__ico"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);
const ICON: Record<string, ReactNode> = {
  promo: svg(<path d="M4 12.5l5 5L20 6.5" />),
  final: svg(<path d="M4 20l4-1 10-10-3-3L5 16l-1 4Z" />),
  asist: svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>,
  ),
  eval: svg(
    <>
      <path d="M9 6h9M9 12h9M9 18h9" />
      <path d="M5 6h.01M5 12h.01M5 18h.01" strokeWidth={2.6} />
    </>,
  ),
};

/** Badge para materias sin programa analítico disponible ("próximamente"). */
export function ComingSoonBadge({ short = false }: { short?: boolean }) {
  return (
    <span className="prog-soon" title="El programa analítico todavía no está cargado">
      {short ? "Programa próx." : "Programa próximamente"}
    </span>
  );
}

/** Chips de características (régimen, asistencia, evaluación) de una materia.
 *  - Si no tiene ficha: no renderiza nada (usar <ComingSoonBadge/> aparte).
 *  - `eval` controla si se muestran los chips secundarios (Parcial/TP). */
export function ProgramaChips({
  codigo,
  showEval = true,
}: {
  codigo: string;
  showEval?: boolean;
}) {
  const d = charsOf(codigo);
  if (!hasPrograma(codigo) || !d) return null;

  const chips: { label: string; cls: string; ico: string; title?: string }[] = [];

  if (d.promocionable === true) {
    chips.push({
      label: "Promociona",
      cls: "prog-chip--promo",
      ico: "promo",
      title: "Se aprueba sin examen final (según el programa; sin mesa en la planilla oficial)",
    });
  } else if (d.tieneFinal) {
    chips.push({
      label: "Con final",
      cls: "prog-chip--final",
      ico: "final",
      title: "Rinde examen final (programa y/o mesa en la planilla oficial de finales)",
    });
  }

  if (d.asistenciaObligatoria === true) {
    chips.push({
      label:
        d.asistenciaPct != null ? `Asistencia ${d.asistenciaPct}%` : "Asistencia",
      cls: "prog-chip--asist",
      ico: "asist",
      title:
        d.asistenciaPct != null
          ? `Requiere ${d.asistenciaPct}% de asistencia`
          : "Requiere asistencia / presentismo",
    });
  }

  if (showEval) {
    if (d.tieneParcial)
      chips.push({ label: "Parcial", cls: "prog-chip--eval", ico: "eval" });
    if (d.tieneTP) chips.push({ label: "TP", cls: "prog-chip--eval", ico: "eval" });
  }

  if (!chips.length) return null;

  return (
    <div className="prog-chips">
      {chips.map((c, i) => (
        <span key={i} className={"prog-chip " + c.cls} title={c.title}>
          {ICON[c.ico]}
          {c.label}
        </span>
      ))}
    </div>
  );
}
