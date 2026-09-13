"use client";

// Modal: créditos de minors acumulados cuatrimestre a cuatrimestre. Recorre el
// plan en orden y va sumando, por área, los créditos de las electivas que caen
// en cada cuatrimestre (arrancando desde lo ya aprobado). Un minor se completa
// con 14 créditos electivos del área.
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/components/planner/useModalFocus";
import { PLAN, AREA_COLOR, byId, credOf } from "@/lib/planner/model";
import { cuatriAt, cuatriLabel, cuatriName } from "@/lib/planner/optimize";
import { IconClose, IconCheck } from "@/components/planner/icons";
import type { PlacedMateria, PlanStart } from "@/lib/planner/types";

const MINOR_REQ = 14;

// etiquetas cortas para los encabezados de columna
const AREA_SHORT: Record<string, string> = {
  "Ciencia de Datos": "Datos",
  "Imágenes y Realidad Virtual": "Imág./RV",
  "Inteligencia Artificial": "IA",
  "Arquitectura de Software": "Arq. SW",
};

// créditos electivos por área de un conjunto de materias ubicadas (una electiva
// cuenta para todas sus áreas, igual que el progreso de minors del sidebar).
function elecByArea(it: PlacedMateria[], areas: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  areas.forEach((a) => (out[a] = 0));
  it.forEach((x) => {
    if (x.m.tipo !== "electiva") return;
    const cr = x.m.creditos || 0;
    (x.m.areas || []).forEach((a) => {
      if (a in out) out[a] += cr;
    });
  });
  return out;
}

export default function MinorsModal({
  used,
  start,
  approved,
  onClose,
}: {
  used: { it: PlacedMateria[]; i: number }[];
  start: PlanStart;
  approved: Set<string>;
  onClose: () => void;
}) {
  const areas = PLAN.areas;

  // foco accesible del modal: foco inicial en el panel + trap de Tab + restore
  const panelRef = useModalFocus<HTMLDivElement>();

  // cierre con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { rows, finals } = useMemo(() => {
    // base: electivas ya aprobadas, por área
    const acc: Record<string, number> = {};
    areas.forEach((a) => (acc[a] = 0));
    approved.forEach((c) => {
      const m = byId.get(c);
      if (m && m.tipo === "electiva")
        (m.areas || []).forEach((a) => {
          if (a in acc) acc[a] += credOf(c);
        });
    });

    type Row = {
      key: string;
      label: string;
      tag: string | null;
      base: boolean;
      cells: { area: string; total: number; delta: number }[];
    };

    const rows: Row[] = [];
    rows.push({
      key: "base",
      label: "Ya aprobado",
      tag: "hoy",
      base: true,
      cells: areas.map((a) => ({ area: a, total: acc[a], delta: acc[a] })),
    });

    used.forEach(({ it, i }) => {
      const add = elecByArea(it, areas);
      const cu = cuatriAt(start, i);
      const cells = areas.map((a) => {
        acc[a] += add[a];
        return { area: a, total: acc[a], delta: add[a] };
      });
      rows.push({
        key: "c" + i,
        label: cuatriName(cu),
        tag: cuatriLabel(cu),
        base: false,
        cells,
      });
    });

    const finals = areas.map((a) => ({ area: a, total: acc[a] }));
    return { rows, finals };
  }, [used, start, approved, areas]);

  const completed = finals.filter((f) => f.total >= MINOR_REQ);

  // Portal a <body>: el modal es position:fixed y .view-panel tiene un transform
  // (animación de entrada) que crearía un containing block y lo descentraría.
  // El wrapper .planner reexpone las variables de tema fuera del árbol del planner.
  const modal = (
    <div className="mnr-modal" role="dialog" aria-modal="true" aria-label="Créditos de minors por cuatrimestre">
      <div className="mnr-modal__bg" onClick={onClose} />
      {/* tabIndex=-1: fallback de foco inicial para useModalFocus */}
      <div className="mnr-modal__panel" ref={panelRef} tabIndex={-1}>
        <button className="mnr-close" onClick={onClose} aria-label="Cerrar">
          <IconClose size={15} />
        </button>
        <header className="mnr-head">
          <span className="mnr-kick">Minors</span>
          <h3>Créditos de minors por cuatrimestre</h3>
          <p>
            Créditos electivos acumulados en cada área a medida que avanza el plan.
            Un minor se completa con <b>{MINOR_REQ}</b> créditos del área.
          </p>
        </header>

        <div className="mnr-tablewrap">
          <table className="mnr-table">
            <thead>
              <tr>
                <th className="mnr-th-cu">Cuatrimestre</th>
                {areas.map((a) => (
                  <th key={a} className="mnr-th-area">
                    <span
                      className="mnr-swatch"
                      style={{ background: AREA_COLOR[a] }}
                    />
                    {AREA_SHORT[a] || a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.base ? "is-base" : ""}>
                  <td className="mnr-cu">
                    <span className="mnr-cu__name">{r.label}</span>
                    {r.tag && <span className="mnr-cu__tag">{r.tag}</span>}
                  </td>
                  {r.cells.map((c) => {
                    const done = c.total >= MINOR_REQ;
                    const empty = c.total === 0;
                    return (
                      <td
                        key={c.area}
                        className={
                          "mnr-cell" +
                          (done ? " is-done" : "") +
                          (empty ? " is-empty" : "")
                        }
                      >
                        <span className="mnr-cell__n">{c.total}</span>
                        {done && (
                          <span className="mnr-cell__chk">
                            <IconCheck size={11} />
                          </span>
                        )}
                        {!r.base && c.delta > 0 && !done && (
                          <span className="mnr-cell__d">+{c.delta}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="mnr-foot">
          {completed.length > 0 ? (
            <span className="mnr-foot__ok">
              Completás {completed.length}{" "}
              {completed.length === 1 ? "minor" : "minors"}:{" "}
              {completed.map((c) => AREA_SHORT[c.area] || c.area).join(" · ")}
            </span>
          ) : (
            <span className="mnr-foot__none">
              Con este plan ningún área llega a {MINOR_REQ} créditos. Agregá
              electivas del área para completar un minor.
            </span>
          )}
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="planner" style={{ padding: 0 }}>
      {modal}
    </div>,
    document.body,
  );
}
