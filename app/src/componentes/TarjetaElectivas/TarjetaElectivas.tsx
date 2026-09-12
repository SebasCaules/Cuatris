/**
 * La tarjeta de electivas del plan de estudios (R1).
 *
 * Va al final, después de los cinco años, y tiene la misma forma que una
 * `TarjetaAnio`: cabecera con el progreso a la derecha y filas iguales. Lo que
 * cambia es qué se mide —créditos contra los 27 que exige el plan, no materias
 * contra el total, porque las electivas no se cuentan por cabeza— y que trae un
 * buscador: son más de ochenta y sin filtro no se encuentra ninguna.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useId } from "react";

import type {
  Abreviaciones,
  Codigo,
  Materia,
  Sigla,
} from "../../contrato/tipos";
import { FilaMateriaPlan } from "../FilaMateriaPlan";
import type { EstadoMarca } from "../MarcaMateria";
import { BarraProgreso, Campo } from "../primitivas";
import "./TarjetaElectivas.css";

export interface PropsTarjetaElectivas {
  /** Las electivas que se muestran, ya ordenadas. */
  materias: Materia[];
  /** Créditos de electivas ya aprobadas. */
  creditosAprobados: number;
  /** Los que exige el plan (27 en S10-Rev23). */
  creditosRequeridos: number;
  abreviaciones: Abreviaciones;
  estadoDe: (codigo: Codigo) => EstadoMarca;
  alCambiar: (codigo: Codigo, siguiente: EstadoMarca) => void;
  nombreDeMinor?: (sigla: Sigla) => string;
  /** Filtra la lista; la tarjeta guarda el texto y quien la usa filtra. */
  alBuscar: (texto: string) => void;
  /** Texto actual de la búsqueda, para poder decir qué no encontró. */
  busqueda: string;
}

export function TarjetaElectivas({
  materias,
  creditosAprobados,
  creditosRequeridos,
  estadoDe,
  alCambiar,
  nombreDeMinor,
  alBuscar,
  busqueda,
}: PropsTarjetaElectivas) {
  const idLista = useId();

  return (
    <section className="tarjeta-electivas" aria-label="Electivas">
      <header className="tarjeta-electivas__cabecera">
        <div className="tarjeta-electivas__identidad">
          <h3 className="tarjeta-electivas__titulo">Electivas</h3>
          <p className="tarjeta-electivas__rotulo">
            {creditosRequeridos} CR REQUERIDOS
          </p>
        </div>
        <div className="tarjeta-electivas__progreso">
          <BarraProgreso
            valor={creditosAprobados}
            maximo={creditosRequeridos}
            etiqueta={`Electivas: ${creditosAprobados} de ${creditosRequeridos} créditos`}
          />
          <p className="tarjeta-electivas__cuenta">
            {creditosAprobados}/{creditosRequeridos} cr
          </p>
        </div>
      </header>

      <div className="tarjeta-electivas__buscador">
        <Campo
          tipo="busqueda"
          etiqueta="Buscar electiva por nombre, código o abreviación"
          placeholder="Buscar electiva por nombre, código o abreviación"
          valor={busqueda}
          onCambio={alBuscar}
          aria-controls={idLista}
        />
      </div>

      {materias.length === 0 ? (
        <p className="tarjeta-electivas__vacio" id={idLista}>
          Ninguna electiva coincide con «{busqueda}».
        </p>
      ) : (
        <ul className="tarjeta-electivas__materias" id={idLista}>
          {materias.map((materia) => (
            <FilaMateriaPlan
              key={materia.codigo}
              materia={materia}
              estado={estadoDe(materia.codigo)}
              alCambiar={alCambiar}
              {...(nombreDeMinor === undefined ? {} : { nombreDeMinor })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
