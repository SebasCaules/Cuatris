/**
 * Una de las dos columnas de un año: el cuatrimestre y sus materias.
 *
 * La cabecera es una línea en mono («1.º CUATRIMESTRE» y «5/5» a la derecha)
 * con la casilla del cuatrimestre a la izquierda. **No hay botones «Marcar» ni
 * «Desmarcar»** (R2): marcar el cuatrimestre entero se descubre por la forma y
 * la posición de la casilla, no por un texto que hay que leer.
 */

import type { Codigo, Materia, Sigla } from "../../contrato/tipos";
import { FilaMateriaPlan } from "../FilaMateriaPlan";
import type { EstadoMarca } from "../MarcaMateria";
import { Casilla, Tooltip } from "../primitivas";
import { estadoDeCasilla, siguienteDeCasilla } from "./casilla";
import "./ColumnaCuatrimestre.css";

export interface ColumnaDelPlan {
  /** Clave estable dentro del año. */
  id: string;
  /** Rótulo visible en mono: «1.º CUATRIMESTRE». */
  rotulo: string;
  /** Cómo se nombra en la casilla: «1.º cuatrimestre de Año 1». */
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
  const estados = codigos.map(estadoDe);
  const conFinal = estados.filter((estado) => estado === "final").length;
  const casilla = estadoDeCasilla(estados);

  return (
    <div
      className="columna-cuatrimestre"
      role="group"
      aria-label={columna.nombre}
    >
      <div className="columna-cuatrimestre__cabecera">
        <Tooltip
          texto={
            casilla === true
              ? "Quitar las marcas del cuatrimestre"
              : "Marcar todo el cuatrimestre como aprobado con final"
          }
          lado="abajo"
        >
          <Casilla
            marcada={casilla}
            etiqueta={`Todo el ${columna.nombre} aprobado con final`}
            alAccionar={() => {
              alMarcarVarias(codigos, siguienteDeCasilla(casilla));
            }}
          />
        </Tooltip>
        <p className="columna-cuatrimestre__rotulo">{columna.rotulo}</p>
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
