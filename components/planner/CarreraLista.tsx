"use client";

// Lista de carreras de grado del ITBA para elegir la activa, en línea dentro
// del menú de perfiles (cada perfil guarda su carrera). Las que no tienen plan
// cargado en el SGA se ven pero no se eligen (tooltip con el motivo).
import { CARRERAS } from "@/lib/planner/carreras";
import { Tooltip } from "./Tooltip";

export default function CarreraLista({
  codigo,
  onElegir,
}: {
  /** carrera activa (null si todavía no se eligió) */
  codigo: string | null;
  onElegir: (codigo: string) => void;
}) {
  return (
    <div className="clist" role="listbox" aria-label="Carreras">
      {CARRERAS.map((c) => {
        const item = (
          <button
            key={c.codigo}
            type="button"
            role="option"
            aria-selected={c.codigo === codigo}
            className={"carrera__item" + (c.codigo === codigo ? " is-active" : "")}
            disabled={!c.disponible}
            onClick={() => onElegir(c.codigo)}
          >
            <span className="carrera__item-code">{c.codigo}</span>
            <span className="carrera__item-name">{c.nombre}</span>
            <span className="carrera__item-plan">{c.plan ?? "—"}</span>
          </button>
        );
        return c.disponible ? (
          item
        ) : (
          <Tooltip
            key={c.codigo}
            content={c.plan ? "El SGA no tiene cargadas las materias de este plan" : "Sin plan de estudios"}
            width={200}
            placement="bottom"
          >
            {item}
          </Tooltip>
        );
      })}
    </div>
  );
}
