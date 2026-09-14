"use client";

// Navegación entre vistas, para la barra superior del sitio (reemplaza al rail
// izquierdo). PlannerApp la entrega al chrome del sitio vía la prop `chrome`;
// va junto a la marca y comparte fila con las herramientas (`NavTools`).
import { usePlanner } from "./state";
import { Tooltip } from "./Tooltip";
import { IconDownload } from "./icons";
import CarreraSwitch from "./CarreraSwitch";
import { useCarrera } from "./carreraContext";
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

/** Accesos secundarios de la barra: carrera activa, referencias de
 *  abreviaturas y el modal de guardar/cargar progreso (lo abre PlannerApp). */
export function NavTools({ onProgreso }: { onProgreso: () => void }) {
  const { state, dispatch } = usePlanner();
  const { perfil, perfiles } = useCarrera();
  // con más de un perfil, el botón dice cuál está activo
  const nombrePerfil = perfiles.length > 1 ? perfiles.find((p) => p.id === perfil)?.nombre : null;
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
      <Tooltip
        content={
          <>
            <b>Perfiles y progreso</b>
            <br />
            Guardá esta configuración con un nombre, creá una de cero o llevala en un .json
            {nombrePerfil ? ` · perfil activo: ${nombrePerfil}` : ""}
          </>
        }
        width={230}
        placement="bottom"
      >
        <button
          type="button"
          className={"vnav__icon" + (nombrePerfil ? " vnav__icon--label" : "")}
          aria-label={nombrePerfil ? `Perfiles y progreso (perfil ${nombrePerfil})` : "Perfiles y progreso"}
          onClick={onProgreso}
        >
          <IconDownload size={16} />
          {nombrePerfil && <span className="vnav__icon-txt">{nombrePerfil}</span>}
        </button>
      </Tooltip>
    </div>
  );
}
