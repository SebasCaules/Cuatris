"use client";

// Navegación entre vistas, para la barra superior del sitio (reemplaza al rail
// izquierdo). PlannerApp la entrega al chrome del sitio vía la prop `chrome`;
// va junto a la marca. (La carrera y las referencias viven en el menú de
// perfil, en la esquina derecha.)
import { usePlanner } from "./state";
import { Tooltip } from "./Tooltip";
import { NAV_VIEWS } from "@/lib/planner/navViews";

// Las etiquetas y tooltips de las vistas viven en lib/planner/navViews.ts
// (módulo de datos puro): la portada dibuja las mismas pestañas como links.
export { NAV_VIEWS };

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
