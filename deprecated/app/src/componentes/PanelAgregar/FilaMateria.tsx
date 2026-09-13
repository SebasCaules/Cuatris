/**
 * Una fila de resultados de 13c, rediseñada como tarjeta de materia.
 *
 * Jerarquía: el **nombre** grande arriba; debajo, el código en mono chico
 * junto a las insignias (troncal, o hasta cuatro minors) y la marca de estado;
 * en la tercera línea, la oferta del cuatrimestre con la **aula** grande. A la
 * derecha, los créditos y el «+».
 *
 * Estados (DESIGN.md §4, un estado = un color): aprobada → tachada y atenuada
 * en verde; cursando → ámbar; ya en el plan → atenuada; bloqueada → la trama y
 * el motivo. El detalle completo va en tooltips, nunca en `title=`.
 *
 * Al pasar el mouse por una materia que se puede agregar, la página la
 * previsualiza en cada calendario donde entra (`alPrevisualizar`).
 */

import type { Abreviaciones, Codigo, Materia } from "../../contrato/tipos";
import { etiquetaCorta } from "../Carrusel";
import { Boton, Glifo, Insignia, Tooltip } from "../primitivas";
import {
  esTroncal,
  textoDeMotivo,
  textoDeMotivos,
  type EstadoFila,
  type Oferta,
} from "./resultados";

/** Cuántas insignias de minor se dibujan como máximo. */
export const MAXIMO_MINORS = 4;

export interface PropsFilaMateria {
  materia: Materia;
  estado: EstadoFila;
  oferta: Oferta;
  abreviaciones: Abreviaciones;
  /** `sigla → nombre` del minor, para el nombre accesible de la insignia. */
  nombresDeMinors: Map<string, string>;
  /** Se muestra «✓ agregada» durante un segundo después de agregarla. */
  agregada: boolean;
  alAgregar: () => void;
  /** Entrar y salir con el puntero; `null` al salir. */
  alPrevisualizar?: (codigo: Codigo | null) => void;
}

/** El «+» solo aparece cuando agregar la materia tiene sentido. */
function sePuedeAgregar(estado: EstadoFila): boolean {
  return estado.tipo === "disponible";
}

/** Se previsualiza lo que todavía no está en el plan ni aprobado. */
function sePrevisualiza(estado: EstadoFila): boolean {
  return estado.tipo === "disponible" || estado.tipo === "bloqueada";
}

function MarcaDeEstado({
  estado,
  abreviaciones,
}: {
  estado: EstadoFila;
  abreviaciones: Abreviaciones;
}) {
  if (estado.tipo === "bloqueada") {
    const primero = estado.motivos[0];
    return (
      <Tooltip texto={`Bloqueada: ${textoDeMotivos(estado.motivos, abreviaciones)}`}>
        <span className="fila-materia__estado fila-materia__estado--bloqueada">
          <Glifo nombre="bloqueada" />
          {primero === undefined
            ? "bloqueada"
            : textoDeMotivo(primero, abreviaciones)}
        </span>
      </Tooltip>
    );
  }
  if (estado.tipo === "aprobada") {
    return (
      <Tooltip texto="Aprobada con final">
        <span className="fila-materia__estado fila-materia__estado--aprobada">
          <Glifo nombre="aprobada" /> aprobada
        </span>
      </Tooltip>
    );
  }
  if (estado.tipo === "cursando") {
    return (
      <Tooltip texto="La estás cursando o te falta el final">
        <span className="fila-materia__estado fila-materia__estado--cursando">
          <Glifo nombre="cursando" /> cursando
        </span>
      </Tooltip>
    );
  }
  if (estado.tipo === "enElPlan") {
    return (
      <Tooltip texto={`Ya está en tu plan, en ${etiquetaCorta(estado.periodo)}`}>
        <span className="fila-materia__estado fila-materia__estado--en-plan">
          <Glifo nombre="planificada" /> en {etiquetaCorta(estado.periodo)}
        </span>
      </Tooltip>
    );
  }
  return null;
}

function OfertaDelPeriodo({ oferta }: { oferta: Oferta }) {
  if (oferta.comisiones === 0 || oferta.franja === "") {
    return (
      <p className="fila-materia__oferta fila-materia__oferta--sin-horario">
        sin horario publicado
      </p>
    );
  }
  return (
    <p className="fila-materia__oferta">
      {oferta.cupoLleno ? (
        <Tooltip
          texto={
            oferta.cupo === ""
              ? "Todas las comisiones tienen el cupo lleno"
              : `Cupo lleno: ${oferta.cupo}`
          }
        >
          <span className="fila-materia__cupo">
            <Glifo nombre="cupoLleno" />
            {oferta.cupo === "" ? "cupo lleno" : `cupo ${oferta.cupo}`}
          </span>
        </Tooltip>
      ) : null}
      <span className="fila-materia__franja">{oferta.franja}</span>
      {oferta.aulas.map((aula) => (
        <span className="fila-materia__aula" key={aula}>
          {aula}
        </span>
      ))}
    </p>
  );
}

export function FilaMateria({
  materia,
  estado,
  oferta,
  abreviaciones,
  nombresDeMinors,
  agregada,
  alAgregar,
  alPrevisualizar,
}: PropsFilaMateria) {
  const troncal = esTroncal(materia);
  const clases = ["fila-materia", `fila-materia--${estado.tipo}`];
  const previsualizable =
    alPrevisualizar !== undefined && sePrevisualiza(estado);

  return (
    <li
      className={clases.join(" ")}
      onMouseEnter={
        previsualizable
          ? () => {
              alPrevisualizar(materia.codigo);
            }
          : undefined
      }
      onMouseLeave={
        previsualizable
          ? () => {
              alPrevisualizar(null);
            }
          : undefined
      }
    >
      <div className="fila-materia__cuerpo">
        <p className="fila-materia__nombre">{materia.nombre}</p>
        <div className="fila-materia__meta">
          <span className="fila-materia__codigo">{materia.codigo}</span>
          {troncal ? (
            <Tooltip texto="Troncal: obligatoria del plan">
              <Insignia tono="troncal">troncal</Insignia>
            </Tooltip>
          ) : (
            materia.minors.slice(0, MAXIMO_MINORS).map((sigla) => (
              <Tooltip
                key={sigla}
                texto={`Suma al minor ${nombresDeMinors.get(sigla) ?? sigla}`}
              >
                <Insignia
                  tono="minor"
                  color={`var(--minor-${sigla.toLowerCase()})`}
                  titulo={nombresDeMinors.get(sigla) ?? sigla}
                >
                  {sigla}
                </Insignia>
              </Tooltip>
            ))
          )}
          <MarcaDeEstado estado={estado} abreviaciones={abreviaciones} />
        </div>
        <OfertaDelPeriodo oferta={oferta} />
      </div>
      <div className="fila-materia__acciones">
        <span className="fila-materia__creditos">{materia.creditos} cr</span>
        {agregada ? (
          <span className="fila-materia__agregada" role="status">
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
