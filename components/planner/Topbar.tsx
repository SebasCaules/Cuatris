"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlanner } from "./state";
import { PLAN } from "@/lib/planner/model";
import {
  approvedCredits,
  electiveCredits,
  availableCount,
} from "@/lib/planner/metrics";

// créditos electivos requeridos por el plan de estudios (misma fuente que PlanView)
const ELEC_REQ = PLAN.creditosElectivasReq ?? 27;

/** Barra superior con la tira inline de métricas (port de updateMetrics) y el
 *  botón "Compartir" icon-only (la URL ya refleja vista/filtros/drawer → deep-link). */
export default function Topbar() {
  const { state } = usePlanner();
  const { approved } = state;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const statCreditos = useMemo(() => approvedCredits(approved), [approved]);
  const statElec = useMemo(
    () => Math.min(electiveCredits(approved), ELEC_REQ),
    [approved]
  );
  const statDisp = useMemo(() => availableCount(approved), [approved]);
  const statRestan = useMemo(
    () => PLAN.obligatorias.filter((m) => !approved.has(m.codigo)).length,
    [approved]
  );

  const handleShare = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined")
      return;
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        /* clipboard bloqueado (permisos/HTTP) — sin feedback, sin romper nada */
      });
  };

  return (
    <header className="topbar">
      {/* Sin materias marcadas la tira sería un muro de ceros que no informa
          nada: se muestra recién cuando hay progreso (el banner de primer uso
          ocupa ese lugar mientras tanto). El div vacío conserva el layout
          space-between. */}
      {approved.size === 0 ? (
        <div aria-hidden="true" />
      ) : (
      <div className="statline">
        <span className="statline__it">
          <b>{statCreditos}</b> cr aprobados
        </span>
        <span className="statline__sep" aria-hidden="true" />
        <span className="statline__it statline__it--elec">
          <b>{statElec}</b>
          <i className="statline__of">/{ELEC_REQ}</i> electivos
        </span>
        <span className="statline__sep" aria-hidden="true" />
        <span className="statline__it">
          <b>{statDisp}</b> cursables
        </span>
        <span className="statline__sep" aria-hidden="true" />
        <span className="statline__it">
          <b>{statRestan}</b> oblig. restantes
        </span>
      </div>
      )}
      <button
        type="button"
        className={`share-btn${copied ? " is-copied" : ""}`}
        onClick={handleShare}
        aria-label="Copiar link de esta vista"
        title="Copiar link de esta vista"
      >
        {copied ? (
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>
        )}
        <span className="sr-only" aria-live="polite">
          {copied ? "¡Link copiado!" : ""}
        </span>
      </button>
    </header>
  );
}
