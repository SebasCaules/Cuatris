"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlanner } from "./state";
import { DotCursando } from "./EstadoControl";
import { Tooltip } from "./Tooltip";
import { PLAN, byId } from "@/lib/planner/model";
import {
  approvedCredits,
  electiveCredits,
  availableCount,
} from "@/lib/planner/metrics";

/** Barra superior con la tira inline de métricas (port de updateMetrics) y el
 *  botón "Compartir" icon-only (la URL ya refleja vista/filtros/drawer → deep-link). */
export default function Topbar() {
  const { state } = usePlanner();
  const { approved, cursando } = state;
  // créditos electivos requeridos por el plan de estudios (misma fuente que
  // PlanView) y totales de la carrera para leer «cómo queda» cada stat:
  // créditos de todas las obligatorias más los electivos exigidos; cantidad de
  // obligatorias; materias. Se leen en el render: cambian con la carrera.
  const ELEC_REQ = PLAN.creditosElectivasReq ?? 27;
  const CRED_TOTAL =
    PLAN.obligatorias.reduce((s, m) => s + (m.creditos || 0), 0) + ELEC_REQ;
  const OBLIG_TOTAL = PLAN.obligatorias.length;
  const MAT_TOTAL = PLAN.obligatorias.length + PLAN.electivas.length;
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

  // Las mismas cuatro cifras contando lo que se está cursando como si ya
  // estuviera aprobado: es a dónde llega el progreso al cerrar el cuatrimestre.
  // Van al lado de cada stat, en el azul de «cursando», solo cuando difieren.
  const proj = useMemo(() => {
    if (cursando.size === 0) return null;
    const con = new Set([...approved, ...cursando]);
    return {
      creditos: approvedCredits(con),
      elec: Math.min(electiveCredits(con), ELEC_REQ),
      disp: availableCount(con),
      restan: PLAN.obligatorias.filter((m) => !con.has(m.codigo)).length,
    };
  }, [approved, cursando]);
  // Pastilla al lado del stat: el punto de «cursando» (el mismo glifo que
  // marca esas materias en la lista) y cómo queda la cifra sobre su total al
  // aprobar lo que se cursa («● 165/231»). El Tooltip del planner dice qué
  // materias son y qué cambia; la pastilla es enfocable para leerlo con teclado.
  const nCur = cursando.size;
  const cursandoTxt = `${nCur} ${nCur === 1 ? "materia" : "materias"} que cursás`;
  const cursandoLista = useMemo(
    () =>
      [...cursando]
        .map((c) => byId.get(c))
        .filter((m): m is NonNullable<typeof m> => !!m)
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [cursando],
  );
  const Cur = ({
    v,
    base,
    total,
    tip,
  }: {
    v: number;
    base: number;
    total: number;
    tip: string;
  }) => {
    if (!proj || v === base) return null;
    return (
      <Tooltip
        width={250}
        content={
          <>
            <b>Cursando {cursandoLista.map((m) => m.abbr).join(" · ")}</b>
            <br />
            {tip}
          </>
        }
      >
        <span className="statline__cur" tabIndex={0} aria-label={`${cursandoTxt}: ${tip}`}>
          <DotCursando />
          {v}
          <i className="statline__cur-of">/{total}</i>
        </span>
      </Tooltip>
    );
  };

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
          <b className="statline__num" key={statCreditos}>{statCreditos}</b> cr aprobados
          <Cur
            v={proj?.creditos ?? statCreditos}
            base={statCreditos}
            total={CRED_TOTAL}
            tip={`Al aprobarlas llegás a ${proj?.creditos ?? statCreditos} de los ${CRED_TOTAL} créditos de la carrera (hoy tenés ${statCreditos}).`}
          />
        </span>
        <span className="statline__sep" aria-hidden="true" />
        <span className="statline__it statline__it--elec">
          <b className="statline__num" key={statElec}>{statElec}</b>
          <i className="statline__of">/{ELEC_REQ}</i> electivos
          <Cur
            v={proj?.elec ?? statElec}
            base={statElec}
            total={ELEC_REQ}
            tip={`Al aprobarlas sumás ${proj?.elec ?? statElec} de los ${ELEC_REQ} créditos electivos que pide el plan (hoy ${statElec}).`}
          />
        </span>
        <span className="statline__sep" aria-hidden="true" />
        <span className="statline__it">
          <b className="statline__num" key={statDisp}>{statDisp}</b> cursables
          <Cur
            v={proj?.disp ?? statDisp}
            base={statDisp}
            total={MAT_TOTAL - approved.size - nCur}
            tip={`Al aprobarlas vas a poder cursar ${proj?.disp ?? statDisp} de las ${MAT_TOTAL - approved.size - nCur} materias que te quedan (hoy ${statDisp}): sus correlativas quedan cubiertas.`}
          />
        </span>
        <span className="statline__sep" aria-hidden="true" />
        <span className="statline__it">
          <b className="statline__num" key={statRestan}>{statRestan}</b> oblig. restantes
          <Cur
            v={proj?.restan ?? statRestan}
            base={statRestan}
            total={OBLIG_TOTAL}
            tip={`Al aprobarlas te quedan ${proj?.restan ?? statRestan} de las ${OBLIG_TOTAL} obligatorias de la carrera (hoy ${statRestan}).`}
          />
        </span>
      </div>
      )}
      <Tooltip content={copied ? "Link copiado" : "Copiar el link de esta vista (reproduce filtros y lo abierto)"} width={200}>
      <button
        type="button"
        className={`share-btn${copied ? " is-copied" : ""}`}
        onClick={handleShare}
        aria-label="Copiar link de esta vista"
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
      </Tooltip>
    </header>
  );
}
