"use client";

// Buscador de materias compartido por los dos combinadores (horarios y
// finales): caja de búsqueda (código/nombre/abreviatura, sin tildes) + dos
// columnas — Obligatorias sub-agrupadas por (año, cuatrimestre) y Electivas
// por nombre — + grupo atenuado de coincidencias no agregables («búsqueda
// honesta») + sin resultados. La lógica de filtrado y agrupado sale de
// CombinadorView (fuente única).
import "@/components/planner/combinador.css";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { normalizar } from "@/lib/planner/texto";
import type { MateriaM } from "@/lib/planner/types";

/** Etiqueta del año de cursada (para sub-agrupar las obligatorias en el
 *  picker). Ordinales en español: 1.er / 3.er año; 2.º / 4.º / 5.º año. */
export const anioLabel = (a: number): string =>
  `${a === 1 || a === 3 ? `${a}.er` : `${a}.º`} año`;

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Default estable de `fantasmas` (un `[]` inline sería un array nuevo por render). */
const SIN_FANTASMAS: MateriaM[] = [];

export interface MateriaPickerProps {
  /** materias agregables (el componente las separa por `m.tipo`). */
  candidatos: MateriaM[];
  /** materias que matchean la búsqueda pero no se pueden agregar (grupo atenuado). */
  fantasmas?: MateriaM[];
  /** nota de esas filas y título del grupo. */
  fantasmaNota?: string;
  added: (code: string) => boolean;
  onToggle: (code: string) => void;
  /** chip a la derecha del nombre (p. ej. «✓ aprobada»). */
  tag?: (m: MateriaM) => ReactNode;
  /** meta a la derecha de la fila; default: créditos (+ comisiones si hay >1). */
  meta?: (m: MateriaM) => ReactNode;
  /** línea .cmb9-hiddenhint bajo el buscador: «{text} · <button>{action}</button>». */
  hint?: { text: string; action: string; onAction: () => void } | null;
  /** title= de la fila (comportamiento histórico; opcional). */
  rowTitle?: (m: MateriaM, added: boolean) => string;
  placeholder?: string;
}

const defaultMeta = (m: MateriaM): ReactNode => {
  const coms = m.horario?.comisiones.length || 0;
  return (
    <>
      {m.creditos} cr{coms > 1 ? ` · ${coms} com` : ""}
    </>
  );
};

export default function MateriaPicker({
  candidatos,
  fantasmas = SIN_FANTASMAS,
  fantasmaNota = "sin horario cargado",
  added,
  onToggle,
  tag,
  meta = defaultMeta,
  hint = null,
  rowTitle,
  placeholder = "Buscá una materia (código o nombre)…",
}: MateriaPickerProps) {
  const [q, setQ] = useState("");
  const needle = normalizar(q.trim());
  const matches = useCallback(
    (m: MateriaM) =>
      !needle || normalizar(`${m.codigo} ${m.nombre} ${m.abbr}`).includes(needle),
    [needle],
  );

  const obligatorias = useMemo(
    () =>
      candidatos
        .filter((m) => m.tipo === "obligatoria" && matches(m))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [candidatos, matches],
  );

  const electivas = useMemo(
    () =>
      candidatos
        .filter((m) => m.tipo === "electiva" && matches(m))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [candidatos, matches],
  );

  const fantasmasFiltrados = useMemo(
    () => fantasmas.filter(matches).sort((a, b) => a.codigo.localeCompare(b.codigo)),
    [fantasmas, matches],
  );

  // Obligatorias sub-agrupadas por (año, cuatrimestre): un sub-grupo por combo
  // año-cuatri, ordenados 1.º año→5.º y, dentro, 1.º cuatri→2.º. Las materias
  // sin año o sin cuatri caen a «Otras» al final.
  const obsGroups = useMemo(() => {
    const groups = new Map<string, { anio: number; cuatri: number; mats: MateriaM[] }>();
    const otras: MateriaM[] = [];
    for (const m of obligatorias) {
      if (m.anio == null || m.cuatri == null) {
        otras.push(m);
        continue;
      }
      const key = `${m.anio}-${m.cuatri}`;
      const g = groups.get(key);
      if (g) g.mats.push(m);
      else groups.set(key, { anio: m.anio, cuatri: m.cuatri, mats: [m] });
    }
    return {
      ordered: [...groups.values()].sort((a, b) => a.anio - b.anio || a.cuatri - b.cuatri),
      otras,
    };
  }, [obligatorias]);

  const noResults =
    obligatorias.length === 0 && electivas.length === 0 && fantasmasFiltrados.length === 0;

  // ---------- sub-render: fila del buscador ----------
  const row = (m: MateriaM) => {
    const isAdded = added(m.codigo);
    return (
      <button
        type="button"
        key={m.codigo}
        className={"cmb-row" + (isAdded ? " is-added" : "")}
        onClick={() => onToggle(m.codigo)}
        title={rowTitle?.(m, isAdded)}
      >
        <span className="cmb-row__plus" aria-hidden="true">
          {isAdded ? "✓" : "+"}
        </span>
        <span className="cmb-row__code">{m.codigo}</span>
        <span className="cmb-row__name">{m.nombre}</span>
        {tag?.(m)}
        <span className="cmb-row__meta">{meta(m)}</span>
      </button>
    );
  };

  return (
    <div className="cmbx-picker">
      <div className="cmb-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {q && (
          <button
            type="button"
            className="cmb-search__clear"
            aria-label="Limpiar búsqueda"
            onClick={() => setQ("")}
          >
            ×
          </button>
        )}
      </div>
      {hint && (
        <p className="cmb9-hiddenhint">
          {hint.text} ·{" "}
          <button type="button" className="cmb9-hiddenhint__btn" onClick={hint.onAction}>
            {hint.action}
          </button>
        </p>
      )}
      <div className="cmb-list cmb9-picklist">
        {/* Dos columnas en desktop: Obligatorias (por año·cuatri) | Electivas. */}
        <div className="cmb9-pickcols">
          {obligatorias.length > 0 && (
            <div className="cmb-group cmb9-pickcol">
              <div className="cmb-grouph">
                <span className="dot dot--ob" /> Obligatorias
                <i>{obligatorias.length}</i>
              </div>
              {obsGroups.ordered.map((g) => (
                <div className="cmb9-subgroup" key={`${g.anio}-${g.cuatri}`}>
                  <div className="cmb9-subh">
                    <b>{anioLabel(g.anio)}</b>
                    <span className="cmb9-subh__cu">· {g.cuatri}.º cuatri</span>
                    <i>{g.mats.length}</i>
                  </div>
                  {g.mats.map(row)}
                </div>
              ))}
              {obsGroups.otras.length > 0 && (
                <div className="cmb9-subgroup">
                  <div className="cmb9-subh">
                    Otras<i>{obsGroups.otras.length}</i>
                  </div>
                  {obsGroups.otras.map(row)}
                </div>
              )}
            </div>
          )}
          {electivas.length > 0 && (
            <div className="cmb-group cmb9-pickcol">
              <div className="cmb-grouph">
                <span className="dot dot--el" /> Electivas
                <i>{electivas.length}</i>
              </div>
              {electivas.map(row)}
            </div>
          )}
        </div>
        {/* Búsqueda honesta: materias del plan que matchean pero no son
            agregables — atenuadas y sin acción, a lo ancho bajo las columnas. */}
        {fantasmasFiltrados.length > 0 && (
          <div className="cmb-group cmb9-pickghost">
            <div className="cmb-grouph">
              <span className="dot dot--ghost" /> {cap(fantasmaNota)}
              <i>{fantasmasFiltrados.length}</i>
            </div>
            {fantasmasFiltrados.map((m) => (
              <div
                className="cmb9-ghost"
                key={m.codigo}
                title={`${m.codigo} · ${m.nombre} — ${fantasmaNota}`}
              >
                <span className="cmb-row__code">{m.codigo}</span>
                <span className="cmb9-ghost__name">{m.nombre}</span>
                <span className="cmb9-ghost__note">{fantasmaNota}</span>
              </div>
            ))}
          </div>
        )}
        {noResults && (
          <div className="cmb-noresults">
            No hay materias con “{q}”.
            <span
              style={{
                display: "block",
                marginTop: 6,
                fontSize: "12px",
                color: "var(--faint)",
              }}
            >
              Probá con el código (p. ej. 72.03) o revisá la ortografía.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
