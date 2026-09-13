"use client";

import { useMemo, useState } from "react";
import { PLAN } from "@/lib/planner/model";
import type { Materia } from "@/lib/planner/types";

export default function RefView() {
  const [query, setQuery] = useState("");

  const all = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...PLAN.obligatorias, ...PLAN.electivas]
      .filter((m) =>
        (m.codigo + " " + m.nombre + " " + m.abbr).toLowerCase().includes(q),
      )
      .sort((a, b) => a.abbr.localeCompare(b.abbr));
  }, [query]);

  return (
    <section className="view-panel">
      <div className="panel-head">
        <h2>Referencias de materias</h2>
        <p>
          Abreviaturas usadas en las grillas. Buscá por abreviatura, código o
          nombre.
        </p>
      </div>
      <div className="ref-search">
        <input
          type="text"
          placeholder="Filtrar referencias…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {all.length === 0 ? (
        <div className="empty" role="status">
          Ninguna materia coincide con &ldquo;{query.trim()}&rdquo; — probá con la
          abreviatura, el código o el nombre.
          <button
            type="button"
            className="empty__clear"
            onClick={() => setQuery("")}
          >
            Limpiar filtro
          </button>
        </div>
      ) : (
      <div className="ref-table">
        <div className="ref-row head">
          <span>Abreviatura</span>
          <span>Código</span>
          <span>Materia</span>
          <span>Créditos</span>
          <span>Área / Tipo</span>
        </div>
        {all.map((m: Materia) => (
          <div className="ref-row" key={m.codigo}>
            <span className="rab">{m.abbr}</span>
            <span className="rc">{m.codigo}</span>
            <span className="rn">{m.nombre}</span>
            <span className="rcr">{m.creditos} cr</span>
            <span className="rar">
              {m.tipo === "obligatoria"
                ? "Obligatoria"
                : (m.areas || []).join(", ") || "Electiva"}
            </span>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
