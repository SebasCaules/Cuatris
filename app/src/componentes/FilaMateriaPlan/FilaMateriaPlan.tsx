/**
 * Una fila del plan de estudios: marca, código, nombre y créditos.
 *
 * Es la misma fila para una obligatoria y para una electiva; lo único que
 * cambia es que la electiva puede traer detrás del nombre los chips de sus
 * minors (14b). Así las dos tarjetas —`TarjetaAnio` y `TarjetaElectivas`— se
 * leen como una sola lista y no como dos listas parecidas.
 *
 * Mide 36 px de alto (R2): es la densidad de la referencia, la que deja ver un
 * año entero sin desplazar la página.
 *
 * El nombre es un enlace a la ficha de la materia: `#/materia/<codigo>`. El
 * código y los créditos no lo son, porque en la referencia tampoco lo parecen.
 */

import { MarcaMateria, type EstadoMarca } from "../MarcaMateria";
import type { Materia, Sigla } from "../../contrato/tipos";
import { Chip, Tooltip } from "../primitivas";
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
    <li className={`fila-materia-plan fila-materia-plan--${estado}`}>
      <MarcaMateria
        codigo={materia.codigo}
        nombre={materia.nombre}
        estado={estado}
        alCambiar={(siguiente) => {
          alCambiar(materia.codigo, siguiente);
        }}
      />
      <span className="fila-materia-plan__codigo">{materia.codigo}</span>
      <a
        className="fila-materia-plan__nombre"
        href={`#/materia/${materia.codigo}`}
      >
        {materia.nombre}
      </a>
      {minors.length > 0 ? (
        <span className="fila-materia-plan__minors">
          {minors.map((sigla) =>
            nombreDeMinor === undefined ? (
              <Chip key={sigla} variante="minor">
                {sigla}
              </Chip>
            ) : (
              /* El nombre del minor sale en burbuja propia, nunca en `title=`. */
              <Tooltip key={sigla} texto={nombreDeMinor(sigla)}>
                <Chip variante="minor" titulo={nombreDeMinor(sigla)}>
                  {sigla}
                </Chip>
              </Tooltip>
            ),
          )}
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
