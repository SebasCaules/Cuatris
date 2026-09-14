"use client";

// Navegación entre vistas, para la barra superior del sitio (reemplaza al rail
// izquierdo). PlannerApp la entrega al chrome del sitio vía la prop `chrome`;
// va junto a la marca y comparte fila con las herramientas (`NavTools`).
import { usePlanner } from "./state";
import { Tooltip } from "./Tooltip";
import { IconDownload } from "./icons";
import CarreraSwitch from "./CarreraSwitch";
import type { ViewKey } from "@/lib/planner/types";

// Etiquetas descriptivas (pedido del autor): dicen qué se hace en cada vista,
// no solo el tema. "Referencias" no es hermana: va en las tools.
export const NAV_VIEWS: { view: ViewKey; label: string; tip?: string }[] = [
  { view: "cuatri", label: "Materias y electivas", tip: "Marcá lo aprobado y lo que cursás; obligatorias por año y electivas por minor" },
  { view: "plan", label: "Plan de cursada", tip: "Cuatrimestre a cuatrimestre hasta recibirte" },
  { view: "combo", label: "Combinador de horarios", tip: "Armá el cuatrimestre eligiendo comisiones sin choques" },
  { view: "finales", label: "Combinador de finales", tip: "Fechas de finales sin superposiciones" },
  { view: "grafo", label: "Mapa de correlativas", tip: "Qué destraba cada materia" },
];

export function ViewNav() {
  const { state, dispatch } = usePlanner();
  return (
    <nav className="vnav" aria-label="Vistas del planificador">
      {NAV_VIEWS.map((v) => {
        const btn = (
          <button
            key={v.view}
            type="button"
            className={"vnav__tab" + (state.view === v.view ? " is-active" : "")}
            aria-current={state.view === v.view ? "page" : undefined}
            onClick={() => dispatch({ type: "SET_VIEW", view: v.view })}
          >
            {v.label}
          </button>
        );
        return v.tip ? (
          <Tooltip key={v.view} content={v.tip} width={230} placement="bottom">
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </nav>
  );
}

/** Accesos secundarios de la barra: carrera activa, referencias de
 *  abreviaturas y el modal de guardar/cargar progreso (lo abre PlannerApp). */
export function NavTools({ onProgreso }: { onProgreso: () => void }) {
  const { state, dispatch } = usePlanner();
  return (
    <div className="vnav__tools">
      <CarreraSwitch />
      <button
        type="button"
        className={"vnav__util" + (state.view === "ref" ? " is-active" : "")}
        aria-current={state.view === "ref" ? "page" : undefined}
        onClick={() => dispatch({ type: "SET_VIEW", view: "ref" })}
      >
        Referencias
      </button>
      <Tooltip content="Guardar o cargar tu progreso (.json)" width={200} placement="bottom">
        <button
          type="button"
          className="vnav__icon"
          aria-label="Guardar o cargar progreso"
          onClick={onProgreso}
        >
          <IconDownload size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
