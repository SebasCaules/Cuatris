/**
 * Una fila de resultados de 13c.
 *
 * Tres columnas: el código en mono con el nombre, la segunda línea con el
 * horario (o la nota punteada) y los chips de minor, y a la derecha los
 * créditos y el «+». El estado se marca con glifo y con el fondo rayado de
 * `tokens.md`, nunca con otro color de texto.
 */

import type { Abreviaciones, Materia } from "../../contrato/tipos";
import { etiquetaCorta } from "../Carrusel";
import { Boton, Chip, Etiqueta, Glifo, Nota } from "../primitivas";
import {
  textoDeMotivo,
  textoDeMotivos,
  type EstadoFila,
  type Oferta,
} from "./resultados";

export interface PropsFilaMateria {
  materia: Materia;
  estado: EstadoFila;
  oferta: Oferta;
  abreviaciones: Abreviaciones;
  /** `sigla → nombre` del minor, para el chip 14b. */
  nombresDeMinors: Map<string, string>;
  /** Se muestra «✓ agregada» durante un segundo después de agregarla. */
  agregada: boolean;
  alAgregar: () => void;
}

/** El «+» solo aparece cuando agregar la materia tiene sentido. */
function sePuedeAgregar(estado: EstadoFila): boolean {
  return estado.tipo === "disponible";
}

function SegundaLinea({
  estado,
  oferta,
  abreviaciones,
}: {
  estado: EstadoFila;
  oferta: Oferta;
  abreviaciones: Abreviaciones;
}) {
  if (estado.tipo === "bloqueada") {
    const primero = estado.motivos[0];
    return (
      <Etiqueta variante="contorno" titulo={textoDeMotivos(estado.motivos, abreviaciones)}>
        <Glifo nombre="bloqueada" />
        {primero === undefined
          ? "bloqueada"
          : ` ${textoDeMotivo(primero, abreviaciones)}`}
      </Etiqueta>
    );
  }

  if (estado.tipo === "aprobada") {
    return (
      <Etiqueta variante="contorno">
        <Glifo nombre="aprobada" /> ya la aprobaste
      </Etiqueta>
    );
  }

  if (estado.tipo === "cursando") {
    return (
      <Etiqueta variante="contorno">
        <Glifo nombre="cursando" /> la estás cursando
      </Etiqueta>
    );
  }

  if (estado.tipo === "enElPlan") {
    return (
      <Etiqueta variante="contorno">
        <Glifo nombre="planificada" /> ya está en {etiquetaCorta(estado.periodo)}
      </Etiqueta>
    );
  }

  // El cupo lleno se muestra aunque la comisión todavía no publique bloques:
  // es un dato de la oferta, no del horario.
  if (oferta.cupoLleno) {
    return (
      <span className="panel-agregar__cupo">
        <Etiqueta variante="contorno">
          <Glifo nombre="cupoLleno" />
          {oferta.cupo === "" ? " cupo lleno" : ` cupo ${oferta.cupo}`}
          {oferta.horario === "" ? "" : ` · ${oferta.horario}`}
        </Etiqueta>
      </span>
    );
  }

  if (oferta.horario === "") {
    return (
      <span className="panel-agregar__sin-horario">
        <Nota>— sin horario publicado</Nota>
      </span>
    );
  }

  return <Etiqueta variante="contorno">{oferta.horario}</Etiqueta>;
}

export function FilaMateria({
  materia,
  estado,
  oferta,
  abreviaciones,
  nombresDeMinors,
  agregada,
  alAgregar,
}: PropsFilaMateria) {
  const bloqueada = estado.tipo === "bloqueada";
  return (
    <li
      className={`panel-agregar__fila${
        bloqueada ? " panel-agregar__fila--bloqueada" : ""
      }`}
    >
      <div className="panel-agregar__datos">
        <p className="panel-agregar__titulo">
          <Etiqueta>{materia.codigo}</Etiqueta>
          <span className="panel-agregar__nombre">{materia.nombre}</span>
        </p>
        {/* `div` y no `p`: la nota punteada de «sin horario publicado» ya es
            un párrafo, y un párrafo dentro de otro no es HTML válido. */}
        <div className="panel-agregar__marcas">
          <SegundaLinea
            estado={estado}
            oferta={oferta}
            abreviaciones={abreviaciones}
          />
          {materia.minors.map((sigla) => (
            <Chip
              key={sigla}
              variante="minor"
              titulo={nombresDeMinors.get(sigla) ?? sigla}
            >
              {sigla}
            </Chip>
          ))}
        </div>
      </div>
      <div className="panel-agregar__acciones">
        <Etiqueta>{materia.creditos} cr</Etiqueta>
        {agregada ? (
          <span className="panel-agregar__agregada" role="status">
            <Glifo nombre="aprobada" etiqueta="Agregada" /> agregada
          </span>
        ) : null}
        {!agregada && sePuedeAgregar(estado) ? (
          <Boton
            variante="primario"
            tamano="chico"
            onClick={alAgregar}
            aria-label={`Agregar ${materia.codigo} ${materia.nombre}`}
          >
            +
          </Boton>
        ) : null}
      </div>
    </li>
  );
}
