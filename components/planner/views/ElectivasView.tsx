"use client";

import { memo, useMemo, type Dispatch } from "react";
import { usePlanner, type Action } from "@/components/planner/state";
import {
  EstadoControl,
  CheckSingle,
  CheckDouble,
} from "@/components/planner/EstadoControl";
import { estadoOf, tieneFinal } from "@/lib/planner/estado";
import { PLAN, hasHorario, byId } from "@/lib/planner/model";
import { isAsync } from "@/lib/planner/time";
import { isAvailable } from "@/lib/planner/metrics";
import { FICHAS } from "@/lib/planner/fichas";
import { MinorBadge, MinorBadges } from "@/components/planner/MinorBadge";
import { AvailLock } from "@/components/planner/CardSignals";
import { MINORS } from "@/lib/planner/minors";
import type { Materia } from "@/lib/planner/types";
import "../cards.css";

/** Leyenda colapsable (cerrada por defecto): decodifica de una vez las familias
 *  de señales de la card (avance · minor · disponibilidad). Como se lee una sola
 *  vez, va en un <details> discreto y no empuja la grilla. El bloque "Avance"
 *  es consistente con la leyenda de CuatriView (misma codificación del control). */
function CardLegend() {
  return (
    <details className="legend-details">
      <summary>Cómo leer las señales</summary>
      <div className="card-legend" role="note" aria-label="Cómo leer las señales de cada card">
        <div className="cl-group">
          <span className="cl-h">Avance — tocá el círculo</span>
          <span className="cl-items">
            <span className="cl-row">
              <span className="estado-ctl st-pending" aria-hidden="true" /> pendiente
            </span>
            <span className="cl-row">
              <span className="estado-ctl st-regular" aria-hidden="true"><CheckSingle /></span> cursada — falta el final
            </span>
            <span className="cl-row">
              <span className="estado-ctl st-final" aria-hidden="true"><CheckDouble /></span> final aprobado
            </span>
          </span>
        </div>
        <div className="cl-group">
          <span className="cl-h">Minor que completa</span>
          <span className="cl-items">
            {MINORS.map((m) => (
              <MinorBadge key={m.id} minor={m} variant="logo" />
            ))}
          </span>
        </div>
        <div className="cl-group">
          <span className="cl-h">Disponibilidad</span>
          <span className="cl-items">
            <span className="cl-row"><AvailLock ok /> cursable</span>
            <span className="cl-row"><AvailLock ok={false} /> requisitos</span>
          </span>
        </div>
      </div>
    </details>
  );
}

/** Día completo → sigla de 2 letras (espejo del preview del drawer). */
const DAY_AB: Record<string, string> = {
  lunes: "Lu", martes: "Ma", "miércoles": "Mi", miercoles: "Mi",
  jueves: "Ju", viernes: "Vi", "sábado": "Sá", sabado: "Sá", domingo: "Do",
};
const dayAb = (d: string) => DAY_AB[d.trim().toLowerCase()] ?? d.slice(0, 2);
/** Hora compacta: "18:00" → "18"; conserva los minutos no redondos ("18:30"). */
const fmtH = (h: string) => (h.endsWith(":00") ? h.slice(0, h.indexOf(":")) : h);

/** Resumen mono de horario para estampar en la card (CPT-12): franjas de la
 *  única comisión («Lu 18–21 · Ju 18–21»), o «N comisiones» si hay varias —
 *  así el choque de días se ve escaneando la grilla, sin abrir el drawer.
 *  "" cuando la materia no tiene horario publicado (la card muestra el motivo). */
function horarioMeta(code: string): string {
  const coms = byId.get(code)?.horario?.comisiones ?? [];
  if (!coms.length) return "";
  if (coms.length > 1) return `${coms.length} comisiones`;
  const slots = coms[0].slots.filter((s) => !isAsync(s));
  if (!slots.length) return "asincrónico";
  return slots
    .map((s) => `${dayAb(s.dia)} ${fmtH(s.desde)}–${fmtH(s.hasta)}`)
    .join(" · ");
}

interface ElectCardProps {
  m: Materia;
  /** avance real (cursada o final) — pinta la card como "aprobada". */
  appr: boolean;
  /** cursada aprobada que todavía debe el final. */
  debeFinal: boolean;
  /** cursable ya (requisitos cumplidos). */
  avail: boolean;
  /** en el combinador. */
  inCombo: boolean;
  /** tiene horario publicado este cuatrimestre. */
  hor: boolean;
  /** resumen mono del horario para la card (franjas o «N comisiones»); "" si no hay. */
  horMeta: string;
  /** tiene ficha (programa analítico) para abrir. */
  hasFicha: boolean;
  /** aprobada (no entra al plan aunque se combine). */
  isApproved: boolean;
  dispatch: Dispatch<Action>;
}

/** Card de una electiva. Vive a nivel de módulo (no anidada en el render de la
 *  vista) y va memoizada: al filtrar/togglear, React reconcilia en vez de
 *  desmontar y remontar las ~95 cards. Recibe sus datos derivados por props
 *  primitivas —estables salvo cuando cambian de verdad— para que el memo corte
 *  el re-render de las cards que no cambiaron. `dispatch` es estable (useReducer). */
const ElectCard = memo(function ElectCard({
  m,
  appr,
  debeFinal,
  avail,
  inCombo,
  hor,
  horMeta,
  hasFicha,
  isApproved,
  dispatch,
}: ElectCardProps) {
  const horId = "elhor-" + m.codigo;
  return (
    <article
      className={"card t-electiva" + (appr ? " appr" : "")}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button"))
          dispatch({ type: "OPEN_DRAWER", code: m.codigo });
      }}
    >
      <div className="card__top">
        <span className="code">{m.codigo}</span>
        <span className="card__cred">{m.creditos} cr</span>
      </div>
      <h3 className="card__name" title={m.nombre}>{m.nombre}</h3>
      {/* fila de señales — alto reservado (1 renglón) para que todas las
          cards midan igual; sin wrap: badges + candado + "falta final" +
          horario (franjas o motivo "sin horario"), truncado con title. */}
      <div className="card__meta">
        <MinorBadges areas={m.areas} variant="logo" />
        {!appr ? <AvailLock ok={avail} /> : null}
        {debeFinal ? <span className="card__due">falta final</span> : null}
        <span
          className={"card__hor" + (hor ? "" : " card__hor--none")}
          id={horId}
          title={hor ? horMeta : "Sin horario publicado este cuatrimestre"}
        >
          {hor ? horMeta : "sin horario"}
        </span>
      </div>
      {/* acciones en UNA sola fila: estado · combinar · ficha↗ (a la derecha).
          La ficha ya no es un renglón full-width extra — inline y compacta. */}
      <div className="card__acts">
        {/* tri-estado canónico (pendiente → ✓ cursada → ✓✓ final); el span
            sólo centra verticalmente el control frente al botón vecino. */}
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <EstadoControl code={m.codigo} />
        </span>
        {/* combinar = acción que avanza el flujo → énfasis primario (borde de
            acento) cuando está operable. Sin horario NO se deshabilita mudo:
            queda operable-o-explicado (aria-disabled + aria-describedby apunta
            al motivo visible "sin horario" del meta), focusable por teclado. */}
        <button
          className={
            "mini btn-co" + (inCombo ? " on plan" : hor ? "" : " is-off")
          }
          aria-disabled={hor ? undefined : true}
          aria-describedby={hor ? undefined : horId}
          title={
            !hor
              ? "Sin horario publicado este cuatrimestre"
              : inCombo
                ? isApproved
                  ? "En el combinador (ya la aprobaste: no entra al plan) · tocá para quitar"
                  : "En tu plan y en el combinador · tocá para quitar del combinador"
                : "Combinar: arma tu semana y la suma a tu plan"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (hor) dispatch({ type: "TOGGLE_COMBO", code: m.codigo });
          }}
        >
          {inCombo
            ? isApproved
              ? "en combinador ✓"
              : "en tu plan ✓"
            : "combinar"}
        </button>
        {hasFicha ? (
          <button
            className="card__read"
            onClick={(e) => { e.stopPropagation(); dispatch({ type: "OPEN_FICHA", code: m.codigo }); }}
            aria-label={`Leer ficha de ${m.nombre}`}
          >
            ficha ↗
          </button>
        ) : null}
      </div>
    </article>
  );
});

export default function ElectivasView() {
  const { state, dispatch } = usePlanner();
  const { approved, finalDone, combo, areasOn, search, fDisp, fHor } = state;

  const list = useMemo(() => {
    const q = search.toLowerCase();
    const passSearch = (m: Materia) =>
      !q ||
      (m.codigo + " " + m.nombre + " " + m.abbr).toLowerCase().includes(q);
    let l = PLAN.electivas.filter(passSearch).filter((m) => {
      const a = m.areas || [];
      // Sin área asignada: pasan solo cuando no hay filtro de áreas activo —
      // si el usuario aísla un área, «ver solo esa área» tiene que ser real.
      if (!a.length) return areasOn.size === PLAN.areas.length;
      return a.some((x) => areasOn.has(x));
    });
    if (fDisp) l = l.filter((m) => isAvailable(m, approved));
    if (fHor) l = l.filter((m) => hasHorario(m.codigo));
    l = [...l].sort((a, b) => a.codigo.localeCompare(b.codigo));
    return l;
  }, [search, areasOn, fDisp, fHor, approved]);

  // ¿Hay algún filtro activo que limpiar? (incluye áreas apagadas). Solo con
  // esto mostramos el atajo "Limpiar filtros" en el empty state.
  const hasFilters =
    search !== "" || fDisp || fHor || areasOn.size < PLAN.areas.length;
  const clearFilters = () => {
    dispatch({ type: "SET_SEARCH", value: "" });
    dispatch({ type: "SET_FILTER", key: "fDisp", value: false });
    dispatch({ type: "SET_FILTER", key: "fHor", value: false });
    // re-enciende toda área apagada (TOGGLE_AREA alterna, así que solo las que faltan).
    for (const a of PLAN.areas) {
      if (!areasOn.has(a)) dispatch({ type: "TOGGLE_AREA", area: a });
    }
  };

  return (
    <section className="view-panel">
      <div className="panel-head">
        <h2>Materias electivas</h2>
        <p>
          {PLAN.electivas.length} materias. Filtrá por área para orientar un
          minor.
        </p>
      </div>
      <CardLegend />
      <div className="card-grid card-grid--el">
        {list.length === 0 ? (
          <div className="empty">
            Ninguna electiva cumple los filtros.
            {hasFilters && (
              <button type="button" className="empty__clear" onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          list.map((m) => {
            // "aprobada" visual de la card = cualquier avance real (cursada o
            // final); el nivel exacto lo marca el EstadoControl de la fila.
            const estado = estadoOf(m.codigo, approved, finalDone);
            return (
              <ElectCard
                key={m.codigo}
                m={m}
                appr={estado !== "pendiente"}
                debeFinal={estado === "regular" && tieneFinal(m.codigo)}
                avail={isAvailable(m, approved)}
                inCombo={combo.has(m.codigo)}
                hor={hasHorario(m.codigo)}
                horMeta={horarioMeta(m.codigo)}
                hasFicha={!!FICHAS[m.codigo]}
                isApproved={approved.has(m.codigo)}
                dispatch={dispatch}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
