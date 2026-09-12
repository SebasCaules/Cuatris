/**
 * La tarjeta de un año del plan de estudios (R1).
 *
 * Cabecera: «Año 1» en serif, el ciclo en mono con tracking y, a la derecha, la
 * barra de progreso con la cuenta de materias que ya tienen final. Cuerpo: las
 * dos columnas de cuatrimestre separadas por una línea vertical; bajo 900 px se
 * apilan.
 *
 * La tarjeta no sabe nada del plan del usuario: pregunta el estado de cada
 * materia con `estadoDe` y avisa los cambios. Así la misma tarjeta sirve en el
 * muestrario sin montar ningún estado.
 */

import type { Codigo, Sigla } from "../../contrato/tipos";
import type { EstadoMarca } from "../MarcaMateria";
import { BarraProgreso } from "../primitivas";
import { ColumnaCuatrimestre, type ColumnaDelPlan } from "./ColumnaCuatrimestre";
import "./TarjetaAnio.css";

export interface PropsTarjetaAnio {
  /** «Año 1». */
  titulo: string;
  /** Rótulo del ciclo: «CICLO BÁSICO», o los dos separados por «·». */
  ciclo: string;
  columnas: ColumnaDelPlan[];
  estadoDe: (codigo: Codigo) => EstadoMarca;
  alCambiar: (codigo: Codigo, siguiente: EstadoMarca) => void;
  /** Marcar o desmarcar un grupo entero, en una sola transición. */
  alMarcarVarias: (codigos: Codigo[], estado: EstadoMarca) => void;
  nombreDeMinor?: (sigla: Sigla) => string;
}

export function TarjetaAnio({
  titulo,
  ciclo,
  columnas,
  estadoDe,
  alCambiar,
  alMarcarVarias,
  nombreDeMinor,
}: PropsTarjetaAnio) {
  const codigos = columnas.flatMap((columna) =>
    columna.materias.map((materia) => materia.codigo),
  );
  const conFinal = codigos.filter(
    (codigo) => estadoDe(codigo) === "final",
  ).length;

  return (
    <section className="tarjeta-anio" aria-label={titulo}>
      <header className="tarjeta-anio__cabecera">
        <div className="tarjeta-anio__identidad">
          <h3 className="tarjeta-anio__titulo">{titulo}</h3>
          <p className="tarjeta-anio__ciclo">{ciclo}</p>
        </div>

        {/* Ver `ColumnaCuatrimestre.css`: se ocultan con opacidad, no con
            `display`, para que sigan alcanzándose con Tab. */}
        <div className="tarjeta-anio__acciones">
          <button
            type="button"
            className="tarjeta-anio__accion"
            aria-label={`Marcar ${titulo}`}
            onClick={() => {
              alMarcarVarias(codigos, "final");
            }}
          >
            Marcar año
          </button>
          <button
            type="button"
            className="tarjeta-anio__accion"
            aria-label={`Desmarcar ${titulo}`}
            onClick={() => {
              alMarcarVarias(codigos, "pendiente");
            }}
          >
            Desmarcar
          </button>
        </div>

        <div className="tarjeta-anio__progreso">
          <BarraProgreso
            valor={conFinal}
            maximo={codigos.length}
            etiqueta={`${titulo}: ${conFinal} de ${codigos.length} con final`}
          />
          <p className="tarjeta-anio__cuenta">
            {conFinal}/{codigos.length}
          </p>
        </div>
      </header>

      <div className="tarjeta-anio__cuerpo">
        {columnas.map((columna) => (
          <ColumnaCuatrimestre
            key={columna.id}
            columna={columna}
            estadoDe={estadoDe}
            alCambiar={alCambiar}
            alMarcarVarias={alMarcarVarias}
            {...(nombreDeMinor === undefined ? {} : { nombreDeMinor })}
          />
        ))}
      </div>
    </section>
  );
}
