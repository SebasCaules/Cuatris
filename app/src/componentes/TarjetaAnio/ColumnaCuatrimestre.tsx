/**
 * Una de las dos columnas de un año: el cuatrimestre y sus materias (R1).
 *
 * El rótulo va en mono con tracking («1.º CUATRIMESTRE») y a la derecha la
 * cuenta de las que tienen final, también en mono. Las dos acciones —marcar el
 * cuatrimestre entero, desmarcarlo— solo se ven al pasar el mouse o al entrar
 * con el teclado, pero **siempre están en el DOM y en la cadena de tabulación**:
 * esconderlas con `display: none` las volvería inalcanzables sin mouse.
 */

import type { Codigo, Materia, Sigla } from "../../contrato/tipos";
import { FilaMateriaPlan } from "../FilaMateriaPlan";
import type { EstadoMarca } from "../MarcaMateria";
import "./ColumnaCuatrimestre.css";

export interface ColumnaDelPlan {
  /** Clave estable dentro del año. */
  id: string;
  /** Rótulo visible en mono: «1.º CUATRIMESTRE». */
  rotulo: string;
  /** Cómo se nombra en las acciones: «1.º cuatrimestre de Año 1». */
  nombre: string;
  materias: Materia[];
}

export interface PropsColumnaCuatrimestre {
  columna: ColumnaDelPlan;
  estadoDe: (codigo: Codigo) => EstadoMarca;
  alCambiar: (codigo: Codigo, siguiente: EstadoMarca) => void;
  alMarcarVarias: (codigos: Codigo[], estado: EstadoMarca) => void;
  nombreDeMinor?: (sigla: Sigla) => string;
}

export function ColumnaCuatrimestre({
  columna,
  estadoDe,
  alCambiar,
  alMarcarVarias,
  nombreDeMinor,
}: PropsColumnaCuatrimestre) {
  const codigos = columna.materias.map((materia) => materia.codigo);
  const conFinal = codigos.filter(
    (codigo) => estadoDe(codigo) === "final",
  ).length;

  return (
    <div
      className="columna-cuatrimestre"
      role="group"
      aria-label={columna.nombre}
    >
      <div className="columna-cuatrimestre__cabecera">
        <p className="columna-cuatrimestre__rotulo">{columna.rotulo}</p>
        <div className="columna-cuatrimestre__acciones">
          <button
            type="button"
            className="columna-cuatrimestre__accion"
            aria-label={`Marcar ${columna.nombre}`}
            onClick={() => {
              alMarcarVarias(codigos, "final");
            }}
          >
            Marcar cuatrimestre
          </button>
          <button
            type="button"
            className="columna-cuatrimestre__accion"
            aria-label={`Desmarcar ${columna.nombre}`}
            onClick={() => {
              alMarcarVarias(codigos, "pendiente");
            }}
          >
            Desmarcar
          </button>
        </div>
        <p className="columna-cuatrimestre__cuenta">
          {conFinal}/{columna.materias.length}
        </p>
      </div>
      <ul className="columna-cuatrimestre__materias">
        {columna.materias.map((materia) => (
          <FilaMateriaPlan
            key={materia.codigo}
            materia={materia}
            estado={estadoDe(materia.codigo)}
            alCambiar={alCambiar}
            {...(nombreDeMinor === undefined ? {} : { nombreDeMinor })}
          />
        ))}
      </ul>
    </div>
  );
}
