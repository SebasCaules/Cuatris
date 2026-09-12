/**
 * Barra superior de la pantalla 13b: identidad de la carrera, pestañas
 * Plan/Progreso, búsqueda y «Sugerir corrección».
 *
 * En esta ola la búsqueda y el botón son inertes: 13c y 13j llegan después.
 * Los textos siguen el mockup tal cual (están en voseo a propósito).
 */

import type { Ruta } from "../rutas";
import "./BarraSuperior.css";

export interface PropsBarraSuperior {
  carrera: string;
  plan: string;
  ruta: Ruta;
  ir: (destino: Ruta) => void;
}

export function BarraSuperior({ carrera, plan, ruta, ir }: PropsBarraSuperior) {
  return (
    <header className="barra-superior">
      <div className="barra-superior__identidad">
        <h1 className="barra-superior__carrera">{carrera}</h1>
        <p className="barra-superior__plan">plan {plan} · ITBA</p>
      </div>

      <nav className="barra-superior__pestanas" aria-label="Secciones">
        <button
          type="button"
          className="barra-superior__pestana"
          aria-current={ruta.vista === "plan" ? "page" : undefined}
          onClick={() => {
            ir({ vista: "plan" });
          }}
        >
          Plan
        </button>
        <button
          type="button"
          className="barra-superior__pestana"
          aria-current={ruta.vista === "progreso" ? "page" : undefined}
          onClick={() => {
            ir({ vista: "progreso" });
          }}
        >
          Progreso
        </button>
      </nav>

      <div className="barra-superior__acciones">
        <input
          className="barra-superior__busqueda"
          type="search"
          placeholder="Buscar materia, código o docente"
          aria-label="Buscar materia, código o docente"
          disabled
        />
        <button type="button" className="barra-superior__sugerir" disabled>
          Sugerir corrección
        </button>
      </div>
    </header>
  );
}
