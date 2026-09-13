/**
 * La leyenda del plan de estudios: qué quiere decir cada marca.
 *
 * Una sola línea, en mono chico, con **las mismas marcas que las filas** —el
 * mismo componente, en 16 px— y su nombre al lado. No hay instrucciones: la
 * regla del autor es que la interacción se descubra por la forma, así que acá
 * no se explica qué hacer, solo qué se está viendo.
 *
 * A la derecha, el atajo para quien ya tiene la historia académica del SGA: un
 * enlace discreto, no una tarjeta de bienvenida que tape el plan.
 */

import { MarcaMateria, NOMBRE_MARCA, type EstadoMarca } from "../MarcaMateria";
import "./LeyendaPlan.css";

/** Los cuatro estados en el orden cronológico del ciclo. */
const ORDEN: readonly EstadoMarca[] = [
  "pendiente",
  "cursando",
  "cursada",
  "final",
];

export function LeyendaPlan() {
  return (
    <div className="leyenda-plan">
      <ul className="leyenda-plan__marcas" aria-label="Qué quiere decir cada marca">
        {ORDEN.map((estado) => (
          <li className="leyenda-plan__marca" key={estado}>
            <MarcaMateria
              codigo=""
              nombre=""
              estado={estado}
              tamano={16}
            />
            {NOMBRE_MARCA[estado]}
          </li>
        ))}
      </ul>
      <a className="leyenda-plan__enlace" href="#/inicio">
        Pegar historia académica del SGA
      </a>
    </div>
  );
}
