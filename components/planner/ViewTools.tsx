"use client";

// Controles que antes vivían en el rail izquierdo y ahora van en la cabecera de
// la vista que los consume: búsqueda (Mis materias, Electivas), filtros y
// minors (Electivas) y el restablecer de aprobadas (Mis materias, Electivas).
import { normalizar } from "@/lib/planner/texto";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlanner } from "./state";
import { useModalFocus } from "./useModalFocus";
import { Tooltip } from "./Tooltip";
import { IconCheck, IconRotateCcw } from "./icons";
import { PLAN, AREA_COLOR, credOf, byId } from "@/lib/planner/model";
import { minorOf, minorReqOf } from "@/lib/planner/minors";

/** Búsqueda global por código o nombre, con debounce (~140 ms). */
export function SearchField({ placeholder = "Buscar código o materia" }: { placeholder?: string }) {
  const { state, dispatch } = usePlanner();
  const [value, setValue] = useState(state.search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // si el estado cambia desde afuera (p. ej. limpiar filtros), reflejar el input
  useEffect(() => {
    setValue(state.search);
  }, [state.search]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dispatch({ type: "SET_SEARCH", value: normalizar(v.trim()) });
    }, 140);
  };

  return (
    <div className="field vtools__search">
      <svg
        className="field__ic"
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Filtros de las listas: solo cursables · solo con horario. Chips que se
 *  prenden y apagan (más compactos y legibles que casillas con rótulo). */
export function ElectFilters() {
  const { state, dispatch } = usePlanner();
  // período de los horarios cargados: «2.º cuatrimestre 2026» → chip «2C 2026»
  const periodo = PLAN.periodoLabel || "2.º cuatrimestre 2026";
  const periodoCorto = periodo.replace(/^(\d)\.º cuatrimestre\s+/, "$1C\u00a0");
  const chips: {
    key: "fDisp" | "fHor";
    label: string;
    on: boolean;
    tip: string;
  }[] = [
    {
      key: "fDisp",
      label: "Solo cursables",
      on: state.fDisp,
      tip: "Muestra solo las materias que ya podés cursar (correlativas cubiertas).",
    },
    {
      key: "fHor",
      label: `Con horario ${periodoCorto}`,
      on: state.fHor,
      tip: `Muestra solo las materias con horario publicado para el ${periodo}.`,
    },
  ];
  return (
    <div className="vtools__filters" role="group" aria-label="Filtros">
      {chips.map((c) => (
        <Tooltip key={c.key} width={220} content={c.tip}>
          <button
            type="button"
            className={"vtools__chip" + (c.on ? " is-on" : "")}
            aria-pressed={c.on}
            onClick={() =>
              dispatch({ type: "SET_FILTER", key: c.key, value: !c.on })
            }
          >
            <span className="vtools__chip-ic" aria-hidden="true">
              <IconCheck size={11} strokeWidth={2.4} />
            </span>
            {c.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/** Minors · áreas: filtro «solo» por área (clic aísla, otro clic restaura,
 *  ⌘/Ctrl+clic suma o quita) con el avance de créditos sobre lo que exige el área. */
export function MinorsFilter({ compact = false }: { compact?: boolean } = {}) {
  const { state, dispatch } = usePlanner();
  const { approved, areasOn } = state;

  const minorCred = useMemo(() => {
    const out: Record<string, number> = {};
    PLAN.areas.forEach((a) => {
      let s = 0;
      approved.forEach((c) => {
        const m = byId.get(c);
        if (m && m.tipo === "electiva" && (m.areas || []).includes(a)) s += credOf(c);
      });
      out[a] = s;
    });
    return out;
  }, [approved]);

  const onAreaClick = (e: React.MouseEvent<HTMLButtonElement>, area: string) => {
    if (e.metaKey || e.ctrlKey) {
      dispatch({ type: "TOGGLE_AREA", area });
      return;
    }
    const isSolo = areasOn.size === 1 && areasOn.has(area);
    if (isSolo) {
      PLAN.areas.forEach((a) => {
        if (!areasOn.has(a)) dispatch({ type: "TOGGLE_AREA", area: a });
      });
    } else {
      PLAN.areas.forEach((a) => {
        if (a === area) {
          if (!areasOn.has(a)) dispatch({ type: "TOGGLE_AREA", area: a });
        } else if (areasOn.has(a)) {
          dispatch({ type: "TOGGLE_AREA", area: a });
        }
      });
    }
  };

  return (
    <div
      className={"vtools__minors" + (compact ? " vtools__minors--compact" : "")}
      role="group"
      aria-label="Minors · áreas"
    >
      {PLAN.areas.map((a) => {
        const s = minorCred[a] || 0;
        const req = minorReqOf(a);
        const on = areasOn.has(a);
        return (
          <Tooltip
            key={a}
            width={230}
            content={
              <>
                {compact && <><b>{a}</b> · </>}
                <b>{s}/{req}</b> créditos del área. Clic: ver solo esta área ·
                otro clic: ver todas · ⌘/Ctrl+clic: sumar o quitar
              </>
            }
          >
            <button
              type="button"
              className={"minrow" + (on ? "" : " off")}
              aria-pressed={on}
              aria-label={compact ? `${a}: ${s} de ${req} créditos` : undefined}
              onClick={(e) => onAreaClick(e, a)}
            >
              <span className="minrow__top">
                <span className="swatch" style={{ background: AREA_COLOR[a] }} />
                <span className="minrow__name">
                  {compact ? (minorOf(a)?.initials ?? a) : a}
                </span>
                <b>
                  {s}/{req}
                </b>
              </span>
              <span className="minibar">
                <i
                  style={{
                    width: Math.min(100, (s / req) * 100) + "%",
                    background: AREA_COLOR[a],
                  }}
                />
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

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
 *  foco que el reset del plan. */
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
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn--go btn--sm" onClick={onConfirm}>
              Restablecer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Botón de ícono «Restablecer materias aprobadas» (solo con algo marcado). */
export function ResetApproved() {
  const { state, dispatch } = usePlanner();
  const [open, setOpen] = useState(false);
  if (state.approved.size === 0) return null;
  return (
    <>
      <Tooltip width={200} content="Restablecer materias aprobadas: todas vuelven a pendiente.">
        <button
          type="button"
          className="vtools__reset"
          aria-label="Restablecer materias aprobadas"
          onClick={() => setOpen(true)}
        >
          <IconRotateCcw size={14} />
        </button>
      </Tooltip>
      {open && (
        <ResetApprovedConfirm
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            dispatch({ type: "RESET_APPROVED" });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
