"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePlanner } from "./state";
import { useModalFocus } from "./useModalFocus";
import { PLAN, AREA_COLOR, credOf, byId } from "@/lib/planner/model";
import { MINOR_REQ } from "@/lib/planner/minors";
import type { ViewKey } from "@/lib/planner/types";

// Triángulo de aviso: mismo trazo que el reset del plan, para que ambas
// confirmaciones destructivas del planner se vean idénticas.
const IconWarnTri = ({ size = 21 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3.6 21 19.2H3L12 3.6Z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </svg>
);

/** Confirmación de "restablecer materias aprobadas": mismo chrome y manejo de
 *  foco que el reset del plan (antes era un window.confirm nativo, inconsistente
 *  con el resto de las confirmaciones del planner). */
function ResetApprovedConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useModalFocus<HTMLDivElement>();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="planner" style={{ padding: 0 }}>
      <div
        className="mnr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-reset-title"
      >
        <div className="mnr-modal__bg" onClick={onCancel} />
        <div className="pv-reset" ref={panelRef}>
          <div className="pv-reset__icon">
            <IconWarnTri />
          </div>
          <h3 id="sb-reset-title">¿Restablecer las materias aprobadas?</h3>
          <p>
            Todas las materias vuelven a pendiente y se recalcula el resto del
            planner. Esta acción no se puede deshacer.
          </p>
          <div className="pv-reset__acts">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={onCancel}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn--go btn--sm"
              onClick={onConfirm}
            >
              Restablecer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Navegación por nombre (sin índices 01→05: el trabajo es iterativo y con
// ramas, no un pipeline secuencial). Se conserva el orden visual de uso.
// "Mis materias" es la puerta de entrada: ahí se marca lo aprobado y el resto
// se recalcula. "Referencias" ya no es hermana de nav — baja al pie del rail
// como acceso secundario (sigue deep-linkeable con ?view=ref).
const FLOW_VIEWS: { view: ViewKey; label: string }[] = [
  { view: "cuatri", label: "Mis materias" },
  { view: "elect", label: "Electivas" },
  { view: "combo", label: "Combinador de horarios" },
  { view: "plan", label: "Plan de cursada" },
  { view: "finales", label: "Combinador de finales" },
];
const REF_VIEWS: { view: ViewKey; label: string }[] = [
  { view: "grafo", label: "Correlativas" },
];

/**
 * Panel de control izquierdo. Port de renderAreas, renderMinorSkeleton, las
 * partes de minors/electivas de updateMetrics y los binds de
 * búsqueda/filtros/reset/vistas de bindUI.
 */
export default function Sidebar() {
  const { state, dispatch } = usePlanner();
  const { approved, areasOn, view, fDisp, fHor, search } = state;

  // Búsqueda con debounce ~140ms y timer local, como el original.
  const [searchInput, setSearchInput] = useState(search);
  const [resetOpen, setResetOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si el estado de búsqueda cambia desde fuera (p. ej. reset), refleja el input.
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const onSearch = (value: string) => {
    setSearchInput(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dispatch({ type: "SET_SEARCH", value: value.trim().toLowerCase() });
    }, 140);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  // Progreso de minors: créditos electivos aprobados por área (sobre 14).
  const minorCred = useMemo(() => {
    const out: Record<string, number> = {};
    // Recorrido fiel a updateMetrics.
    PLAN.areas.forEach((a) => {
      let s = 0;
      approved.forEach((c) => {
        const m = byId.get(c);
        if (m && m.tipo === "electiva" && (m.areas || []).includes(a))
          s += credOf(c);
      });
      out[a] = s;
    });
    return out;
  }, [approved]);

  // Filtro de áreas con interacción «solo»: un clic aísla el área (apaga las
  // otras), un segundo clic sobre la ya-aislada restaura todas — 1 clic en vez
  // de 3 des-selecciones. ⌘/Ctrl+clic mantiene el toggle aditivo (sumar/quitar
  // un área sin tocar el resto). Se despacha con TOGGLE_AREA existente: varios
  // dispatch en un mismo handler los procesa el reducer en orden sobre el
  // estado acumulado (un solo re-render), así que el resultado es determinista.
  const onAreaClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    area: string,
  ) => {
    if (e.metaKey || e.ctrlKey) {
      dispatch({ type: "TOGGLE_AREA", area });
      return;
    }
    const isSolo = areasOn.size === 1 && areasOn.has(area);
    if (isSolo) {
      // restaurar todas: encender las que estén apagadas
      PLAN.areas.forEach((a) => {
        if (!areasOn.has(a)) dispatch({ type: "TOGGLE_AREA", area: a });
      });
    } else {
      // aislar: apagar todas menos `area`, encender `area` si estaba apagada
      PLAN.areas.forEach((a) => {
        if (a === area) {
          if (!areasOn.has(a)) dispatch({ type: "TOGGLE_AREA", area: a });
        } else if (areasOn.has(a)) {
          dispatch({ type: "TOGGLE_AREA", area: a });
        }
      });
    }
  };

  // Sidebar modular: cada vista muestra solo los controles que consume.
  //  · búsqueda → "Mis materias" y "Electivas" (buscar un código para tildar).
  //  · checkboxes de filtro → solo "Electivas" (en "Mis materias" querés VER
  //    todas las obligatorias para marcarlas, no filtrarlas).
  //  · áreas/minors + gauge de electivas → solo "Electivas".
  //  · el resto de las vistas tienen su propia búsqueda interna, así que el
  //    rail queda solo con la navegación.
  const showSearch = view === "cuatri" || view === "elect";
  const showFilters = view === "elect";
  const showElect = view === "elect";

  return (
    <aside className="side" aria-label="Panel de control">
      <div className="side__head">
        <button
          type="button"
          className="side__collapse"
          aria-label="Ocultar el panel de control"
          title="Ocultar panel"
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path
              d="M14.5 6.5 9 12l5.5 5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {showSearch && (
        <div className="field">
          <svg
            className="field__ic"
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            type="text"
            placeholder="Buscar código o materia"
            autoComplete="off"
            value={searchInput}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}

      <nav className="views">
        <span className="views__h">Tu plan</span>
        {FLOW_VIEWS.map((v) => (
          <button
            key={v.view}
            className={"view" + (view === v.view ? " is-active" : "")}
            onClick={() => dispatch({ type: "SET_VIEW", view: v.view })}
          >
            <span className="view__lb">{v.label}</span>
          </button>
        ))}
        <span className="views__h views__h--sep">Consultar</span>
        {REF_VIEWS.map((v) => (
          <button
            key={v.view}
            className={"view" + (view === v.view ? " is-active" : "")}
            onClick={() => dispatch({ type: "SET_VIEW", view: v.view })}
          >
            <span className="view__lb">{v.label}</span>
          </button>
        ))}
      </nav>

      {showFilters && (
        <section className="block">
          <div className="block__h"><span>Filtros</span></div>
          <label className="chk">
            <input
              type="checkbox"
              checked={fDisp}
              onChange={(e) =>
                dispatch({ type: "SET_FILTER", key: "fDisp", value: e.target.checked })
              }
            />
            <span>Solo cursables</span>
          </label>
          <label className="chk">
            <input
              type="checkbox"
              checked={fHor}
              onChange={(e) =>
                dispatch({ type: "SET_FILTER", key: "fHor", value: e.target.checked })
              }
            />
            <span>Solo con horario 2C&nbsp;2026</span>
          </label>
        </section>
      )}

      {showElect && (
        <section className="block">
          <div className="block__h"><span>Minors · áreas</span></div>
          <div className="minors">
          {PLAN.areas.map((a) => {
            const s = minorCred[a] || 0;
            const on = areasOn.has(a);
            return (
              <button
                type="button"
                key={a}
                className={"minrow" + (on ? "" : " off")}
                aria-pressed={on}
                title="Clic: ver solo esta área · clic de nuevo: ver todas · ⌘/Ctrl+clic: sumar o quitar del filtro"
                onClick={(e) => onAreaClick(e, a)}
              >
                <span className="minrow__top">
                  <span className="swatch" style={{ background: AREA_COLOR[a] }} />
                  <span className="minrow__name">{a}</span>
                  <b>{s}/{MINOR_REQ}</b>
                </span>
                <span className="minibar">
                  <i
                    style={{
                      width: Math.min(100, (s / MINOR_REQ) * 100) + "%",
                      background: AREA_COLOR[a],
                    }}
                  />
                </span>
              </button>
            );
          })}
          </div>
        </section>
      )}

      {showSearch && approved.size > 0 && (
        <button className="reset" onClick={() => setResetOpen(true)}>
          Restablecer materias aprobadas
        </button>
      )}

      {resetOpen && (
        <ResetApprovedConfirm
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            dispatch({ type: "RESET_APPROVED" });
            setResetOpen(false);
          }}
        />
      )}

      <button
        type="button"
        className={"side__util" + (view === "ref" ? " is-active" : "")}
        aria-current={view === "ref" ? "page" : undefined}
        onClick={() => dispatch({ type: "SET_VIEW", view: "ref" })}
      >
        Referencias de abreviaturas
      </button>

      <p className="foot">
        Horarios del SGA, 2.<sup>do</sup> cuatrimestre 2026. El progreso se guarda
        en este navegador.
      </p>
    </aside>
  );
}
