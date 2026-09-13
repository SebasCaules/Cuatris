"use client";

// Señales compartidas de las cards/filas de materias (Electivas + Cuatri).
// Fuente única: cada señal tiene su silueta propia (candado = disponibilidad,
// ícono en cuadro = régimen) y se explica con el Tooltip del planner al pasar
// el mouse.
import { Tooltip } from "@/components/planner/Tooltip";

/** Disponibilidad como candado — silueta propia, distinta del minor y el régimen:
 *  abierto/verde = cursable (cumplís correlativas), cerrado/ámbar = requisitos. */
export function AvailLock({ ok }: { ok: boolean }) {
  return (
    <Tooltip
      width={200}
      content={ok ? "Cursable — cumplís las correlativas" : "Requisitos pendientes: te faltan correlativas"}
    >
    <span
      className={"avail-lock " + (ok ? "avail-lock--go" : "avail-lock--wait")}
      role="img"
      aria-label={ok ? "Cursable" : "Requisitos pendientes"}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.4" y="7.1" width="9.2" height="6.3" rx="1.5" strokeWidth={1.5} />
        {ok ? (
          <path d="M5.6 7.1V5.2a2.4 2.4 0 0 1 4.6-.9" strokeWidth={1.5} />
        ) : (
          <path d="M5.6 7.1V5.2a2.4 2.4 0 0 1 4.8 0V7.1" strokeWidth={1.5} />
        )}
        <circle cx="8" cy="10.1" r=".95" fill="currentColor" stroke="none" />
      </svg>
    </span>
    </Tooltip>
  );
}

/** Ícono de régimen (uno solo): promociona (tilde teal) o con final (lápiz). */
export function RegimeIcon({ kind }: { kind: "promo" | "final" }) {
  const promo = kind === "promo";
  return (
    <span
      className={"regime-icon " + (promo ? "regime-icon--promo" : "regime-icon--final")}
      role="img"
      aria-label={promo ? "Promociona" : "Con final"}
      title={promo ? "Promociona (sin examen final)" : "Con examen final"}
    >
      {promo ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20l4-1 10-10-3-3L5 16l-1 4Z" />
        </svg>
      )}
    </span>
  );
}
