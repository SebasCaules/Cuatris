/**
 * Una fila del plan de estudios (R1): marca, código, nombre y créditos.
 *
 * Es la misma fila para una obligatoria y para una electiva; lo único que
 * cambia es que la electiva puede traer detrás del nombre los chips de sus
 * minors (14b). Así las dos tarjetas —`TarjetaAnio` y `TarjetaElectivas`— se
 * leen como una sola lista y no como dos listas parecidas.
 *
 * El nombre es un enlace a la ficha de la materia: `#/materia/<codigo>`. El
 * código y los créditos no lo son, porque en la captura tampoco lo parecen.
 */

import { MarcaMateria, type EstadoMarca } from "../MarcaMateria";
import type { Materia, Sigla } from "../../contrato/tipos";
import { Chip, Etiqueta } from "../primitivas";
import "./FilaMateriaPlan.css";

export interface PropsFilaMateriaPlan {
  materia: Materia;
  estado: EstadoMarca;
  alCambiar: (codigo: string, siguiente: EstadoMarca) => void;
  /** Nombre de cada minor, para que el chip de la sigla diga qué es. */
  nombreDeMinor?: (sigla: Sigla) => string;
}

export function FilaMateriaPlan({
  materia,
  estado,
  alCambiar,
  nombreDeMinor,
}: PropsFilaMateriaPlan) {
  const minors = materia.minors ?? [];
  return (
    <li className="fila-materia-plan">
      <MarcaMateria
        codigo={materia.codigo}
        nombre={materia.nombre}
        estado={estado}
        alCambiar={(siguiente) => {
          alCambiar(materia.codigo, siguiente);
        }}
      />
      <span className="fila-materia-plan__codigo">
        <Etiqueta>{materia.codigo}</Etiqueta>
      </span>
      <a
        className="fila-materia-plan__nombre"
        href={`#/materia/${materia.codigo}`}
      >
        {materia.nombre}
      </a>
      {minors.length > 0 ? (
        <span className="fila-materia-plan__minors">
          {minors.map((sigla) => (
            <Chip
              key={sigla}
              variante="minor"
              {...(nombreDeMinor === undefined
                ? {}
                : { titulo: nombreDeMinor(sigla) })}
            >
              {sigla}
            </Chip>
          ))}
        </span>
      ) : null}
      {/*
        Los ítems de cero créditos —Inglés I, Inglés II, Práctica Laboral— se
        escriben «0 cr» como cualquier otro: son ítems de los títulos y
        esconderles el número los haría parecer un error de datos.
      */}
      <span className="fila-materia-plan__creditos">{materia.creditos} cr</span>
    </li>
  );
}
