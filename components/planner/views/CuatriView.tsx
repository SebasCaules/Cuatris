"use client";

// Plan por cuatrimestre — timeline por año (rework HCI 2026-07).
// Un año = una carta partida en sus dos cuatrimestres; cada materia es una
// fila tipo checklist: [EstadoControl] código nombre … señal · créditos.
// Interacción por forma, no por texto: una casilla en la cabecera del año y de
// cada cuatrimestre marca todo el grupo como terminado (final aprobado, o
// promocionada si no rinde); el control de la fila cicla el estado; cada cosa
// explica qué hace con el Tooltip del planner. Un año completo se pliega solo.
import { normalizar } from "@/lib/planner/texto";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlanner } from "@/components/planner/state";
import { PLAN, hasHorario } from "@/lib/planner/model";
import { isAvailable } from "@/lib/planner/metrics";
import { EstadoControl, estadoOf, tieneFinal } from "@/components/planner/EstadoControl";
import { AvailLock } from "@/components/planner/CardSignals";
import { Tooltip } from "@/components/planner/Tooltip";
import { SearchField, ElectFilters, ResetApproved } from "@/components/planner/ViewTools";
import { ElectivasSection } from "./ElectivasView";
import type { Estado } from "@/lib/planner/estado";
import type { Materia } from "@/lib/planner/types";
import "../cards.css";
import "../materias.css";

const CUATRI_LABEL: Record<string, string> = { "1": "1.º cuatrimestre", "2": "2.º cuatrimestre" };

type SemGroup = { cuatri: number; ms: Materia[] };
type YearGroup = { anio: number; ciclos: string[]; sems: SemGroup[] };

/** Buckets de avance de un conjunto de materias:
 *  done = final aprobado o promocionada (terminal) · mid = cursada, debe final ·
 *  doing = cursando ahora. */
function bucketsOf(
  ms: Materia[],
  approved: Set<string>,
  finalDone: Set<string>,
  cursando: Set<string>,
) {
  let done = 0;
  let mid = 0;
  let doing = 0;
  ms.forEach((m) => {
    const e = estadoOf(m.codigo, approved, finalDone, cursando);
    if (e === "pendiente") return;
    if (e === "cursando") doing++;
    else if (e === "final" || !tieneFinal(m.codigo)) done++;
    else mid++;
  });
  return { done, mid, doing, avance: done + mid, complete: ms.length > 0 && done === ms.length };
}

/** Estado terminal de una materia: final si rinde, cursada (promo) si no. */
const terminalDe = (code: string): Estado => (tieneFinal(code) ? "final" : "regular");

/** Casilla propia (sin <input>) que marca/desmarca un grupo entero.
 *  checked = todo terminado · mixed = algo avanzado · vacía = nada. */
function GroupCheck({
  ms,
  label,
  onSet,
}: {
  ms: Materia[];
  label: string;
  onSet: (estado: "terminal" | "pendiente") => void;
}) {
  const { state } = usePlanner();
  const b = bucketsOf(ms, state.approved, state.finalDone, state.cursando);
  const checked: boolean | "mixed" = b.complete ? true : b.avance + b.doing > 0 ? "mixed" : false;
  const tip = b.complete
    ? `Quitar las marcas de ${label}`
    : `Marcar ${label} como terminado (final aprobado)`;
  return (
    <Tooltip content={tip} width={190}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={tip}
        className={
          "cq-check" +
          (checked === true ? " is-on" : checked === "mixed" ? " is-mixed" : "")
        }
        onClick={(e) => {
          e.stopPropagation();
          onSet(b.complete ? "pendiente" : "terminal");
        }}
      >
        {checked === true ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8.5L6.5 12L13 4.5" />
          </svg>
        ) : checked === "mixed" ? (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M4 8h8" />
          </svg>
        ) : null}
      </button>
    </Tooltip>
  );
}

export default function CuatriView() {
  const { state, dispatch } = usePlanner();
  const { approved, finalDone, cursando, search, fDisp, fHor } = state;

  // ¿Hay algún filtro activo que valga la pena ofrecer limpiar en el empty state?
  const hasFilters = search !== "" || fDisp || fHor;
  const clearFilters = () => {
    dispatch({ type: "SET_SEARCH", value: "" });
    dispatch({ type: "SET_FILTER", key: "fDisp", value: false });
    dispatch({ type: "SET_FILTER", key: "fHor", value: false });
  };

  const years = useMemo<YearGroup[]>(() => {
    const q = normalizar(search);
    const passSearch = (m: Materia) =>
      !q || normalizar(`${m.codigo} ${m.nombre} ${m.abbr}`).includes(q);

    let list = PLAN.obligatorias.filter(passSearch);
    if (fDisp)
      list = list.filter((m) => isAvailable(m, approved) || approved.has(m.codigo));
    if (fHor) list = list.filter((m) => hasHorario(m.codigo));

    const byYear = new Map<number, Materia[]>();
    list.forEach((m) => {
      const anio = m.anio ?? 0;
      const arr = byYear.get(anio) ?? [];
      arr.push(m);
      byYear.set(anio, arr);
    });

    return [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([anio, ms]) => {
        const sems: SemGroup[] = [1, 2]
          .map((c) => ({
            cuatri: c,
            ms: ms
              .filter((m) => m.cuatri === c)
              .sort((a, b) => a.codigo.localeCompare(b.codigo)),
          }))
          .filter((s) => s.ms.length > 0);
        const ciclos = [
          ...new Set(ms.map((m) => m.ciclo).filter((c): c is string => !!c)),
        ];
        return { anio, ciclos, sems };
      });
  }, [approved, search, fDisp, fHor]);

  // Marca un grupo entero: terminal (final aprobado, o promocionada si no rinde)
  // o pendiente. Un dispatch por materia: el reducer los acumula en un render.
  const setGroup = (ms: Materia[], estado: "terminal" | "pendiente") => {
    ms.forEach((m) =>
      dispatch({
        type: "SET_ESTADO",
        code: m.codigo,
        estado: estado === "terminal" ? terminalDe(m.codigo) : "pendiente",
      }),
    );
  };

  // Plegado por año. Al abrir la página, los años completos ya vienen plegados;
  // cuando un año pasa a completo (por casilla o materia a materia) se pliega
  // solo tras una pausa breve, para que se vea el último cambio. Quien lo
  // despliega a mano lo mantiene abierto hasta que vuelva a completarse.
  const completeByYear = useMemo(() => {
    const out = new Map<number, boolean>();
    years.forEach((y) =>
      out.set(
        y.anio,
        bucketsOf(y.sems.flatMap((s) => s.ms), approved, finalDone, cursando).complete,
      ),
    );
    return out;
  }, [years, approved, finalDone, cursando]);
  const [collapsed, setCollapsed] = useState<Set<number>>(
    () => new Set([...completeByYear].filter(([, c]) => c).map(([a]) => a)),
  );
  const prevComplete = useRef(completeByYear);
  // Años que acaban de completarse y esperan su plegado. Vive en un ref (no en
  // el closure del timeout) para que dos años completados en menos de 260 ms
  // —dos casillas seguidas— se plieguen los dos: el cleanup del effect solo
  // cancela el timer, nunca lo pendiente.
  const pendientes = useRef<Set<number>>(new Set());
  useEffect(() => {
    const prev = prevComplete.current;
    prevComplete.current = completeByYear;
    const reabiertos: number[] = [];
    completeByYear.forEach((c, anio) => {
      if (c && !prev.get(anio)) pendientes.current.add(anio);
      if (!c && prev.get(anio)) {
        reabiertos.push(anio);
        pendientes.current.delete(anio);
      }
    });
    // un año que deja de estar completo (se quitó una marca) se despliega al instante
    if (reabiertos.length)
      setCollapsed((s) => {
        const n = new Set(s);
        reabiertos.forEach((a) => n.delete(a));
        return n;
      });
    if (pendientes.current.size === 0) return;
    const id = setTimeout(() => {
      const listos = [...pendientes.current];
      pendientes.current.clear();
      setCollapsed((s) => new Set([...s, ...listos]));
    }, 260);
    return () => clearTimeout(id);
  }, [completeByYear]);
  const toggleYear = (anio: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(anio)) n.delete(anio);
      else n.add(anio);
      return n;
    });

  return (
    <section className="view-panel">
      {/* Una sola vista para todas las materias: los años de obligatorias
          arriba y las electivas debajo. La búsqueda y los filtros de la
          cabecera valen para las dos listas. */}
      <div className="panel-head panel-head--tools">
        <div className="vtools">
          <SearchField />
          <ElectFilters />
          <ResetApproved />
        </div>
      </div>
      {years.length === 0 ? (
        <div className="empty">
          No hay obligatorias que cumplan los filtros.
          {hasFilters && (
            <button type="button" className="empty__clear" onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="cq-years">
          {years.map((y, yi) => {
            const all = y.sems.flatMap((s) => s.ms);
            const { done, mid, doing, avance } = bucketsOf(all, approved, finalDone, cursando);
            const pctDone = (done / all.length) * 100;
            const pctMid = (mid / all.length) * 100;
            const pctDoing = (doing / all.length) * 100;
            const isCollapsed = collapsed.has(y.anio);
            const bodyId = `cq-year-${y.anio}`;
            return (
              <section
                className={"cq-year" + (isCollapsed ? " is-collapsed" : "")}
                key={y.anio}
                style={{ "--yi": yi } as React.CSSProperties}
              >
                {/* toda la cabecera pliega/despliega (salvo la casilla); el botón
                    del chevron es el control accesible por teclado */}
                <header className="cq-year__h" onClick={() => toggleYear(y.anio)}>
                  <GroupCheck
                    ms={all}
                    label={`todo el año ${y.anio}`}
                    onSet={(e) => setGroup(all, e)}
                  />
                  <h3 className="cq-year__t">Año {y.anio}</h3>
                  <span className="cq-year__ciclo">{y.ciclos.join(" · ")}</span>
                    <Tooltip
                      width={210}
                      content={
                        <>
                          <b>{done}</b> con final · <b>{mid}</b> cursadas, falta final ·{" "}
                          <b>{doing}</b> cursando · <b>{all.length - avance - doing}</b> pendientes
                        </>
                      }
                    >
                      <span className="cq-year__prog" tabIndex={-1}>
                        <span className="cq-year__bar" aria-hidden="true">
                          <i className="seg-done" style={{ width: `${pctDone}%` }} />
                          <i className="seg-mid" style={{ width: `${pctMid}%` }} />
                          <i className="seg-doing" style={{ width: `${pctDoing}%` }} />
                        </span>
                        <span className="cq-year__n">
                          <b>{avance}</b>/{all.length}
                        </span>
                      </span>
                    </Tooltip>
                  <Tooltip content={isCollapsed ? "Desplegar el año" : "Plegar el año"} width={140}>
                    <button
                      type="button"
                      className="cq-year__toggle"
                      aria-expanded={!isCollapsed}
                      aria-controls={bodyId}
                      aria-label={isCollapsed ? `Desplegar el año ${y.anio}` : `Plegar el año ${y.anio}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleYear(y.anio);
                      }}
                    >
                      <svg
                        className="cq-year__chev"
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  </Tooltip>
                </header>
                {/* Plegado animado: el envoltorio es una grilla cuyo único
                    track va de 1fr a 0fr (alto real → 0, sin medir nada); el
                    interior recorta y se desvanece. `inert` saca del tab-order
                    lo plegado. */}
                <div
                  id={bodyId}
                  className={"cq-year__body" + (isCollapsed ? " is-closed" : "")}
                  inert={isCollapsed}
                >
                <div className="cq-year__inner">
                <div
                  className={
                    "cq-year__cols" + (y.sems.length === 1 ? " cq-year__cols--solo" : "")
                  }
                >
                  {y.sems.map((s) => {
                    const b = bucketsOf(s.ms, approved, finalDone, cursando);
                    const semLabel =
                      CUATRI_LABEL[String(s.cuatri)] ?? `${s.cuatri}.º cuatrimestre`;
                    return (
                      <div className="cq-sem" key={s.cuatri}>
                        <h4 className="cq-sem__h">
                          <GroupCheck
                            ms={s.ms}
                            label={`el ${semLabel} del año ${y.anio}`}
                            onSet={(e) => setGroup(s.ms, e)}
                          />
                          {semLabel}
                          <span className="cq-sem__n">
                            {b.avance}/{s.ms.length}
                          </span>
                        </h4>
                        <ul
                          className="cq-list"
                          aria-label={`Año ${y.anio}, ${s.cuatri}.º cuatrimestre`}
                        >
                          {s.ms.map((m, ri) => (
                            <QRow key={m.codigo} m={m} orden={ri} />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
                </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <ElectivasSection />
    </section>
  );
}

function QRow({ m, orden = 0 }: { m: Materia; orden?: number }) {
  const { state, dispatch } = usePlanner();
  const estado = estadoOf(m.codigo, state.approved, state.finalDone, state.cursando);
  const has2 = tieneFinal(m.codigo);
  const pend = estado === "pendiente";
  const avail = isAvailable(m, state.approved);
  const done = estado === "final" || (estado === "regular" && !has2);
  const debeFinal = estado === "regular" && has2;

  return (
    <li
      className={
        "qrow" +
        (done ? " is-done" : "") +
        (estado === "cursando" ? " is-cursando" : "") +
        (pend && !avail ? " is-locked" : "")
      }
      style={{ "--ri": orden } as React.CSSProperties}
    >
      <EstadoControl code={m.codigo} stopPropagation={false} />
      <Tooltip content={`${m.codigo} · ${m.nombre} — ver detalle`} width={220}>
        <button
          type="button"
          className="qrow__open"
          onClick={() => dispatch({ type: "OPEN_DRAWER", code: m.codigo })}
        >
          <span className="qrow__code" aria-hidden="true">{m.codigo}</span>
          <span className="qrow__name">{m.nombre}</span>
        </button>
      </Tooltip>
      {debeFinal && <span className="qrow__due">falta final</span>}
      {pend && <AvailLock ok={avail} />}
      <span className="qrow__cr">{m.creditos} cr</span>
    </li>
  );
}
