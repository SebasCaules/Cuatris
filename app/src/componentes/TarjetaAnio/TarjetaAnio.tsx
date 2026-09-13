/**
 * La tarjeta de un año del plan de estudios.
 *
 * Cabecera compacta (R2): la casilla del año, «Año 1» en serif, el ciclo en
 * mono con tracking y, a la derecha, la barra de progreso con la cuenta y el
 * chevron. Cuerpo: las dos columnas de cuatrimestre separadas por una línea
 * vertical; bajo 700 px se apilan.
 *
 * **Se pliega sola cuando el año está terminado.** Un año con las nueve
 * materias en final no tiene nada que hacer a la vista: la tarjeta se cierra a
 * su cabecera tras una pausa corta —el tiempo de ver la última marca— y el año
 * sigue contándose en la barra. Si el usuario la vuelve a abrir, queda abierta;
 * solo se cierra sola otra vez si el año vuelve a completarse después de haber
 * perdido alguna marca.
 *
 * El plegado vive en la memoria del componente y **no** en `plan_usuario`: es
 * estado de pantalla, no algo que el usuario quiera exportar ni encontrar
 * igual en otra computadora.
 *
 * La tarjeta no sabe nada del plan del usuario: pregunta el estado de cada
 * materia con `estadoDe` y avisa los cambios. Así la misma tarjeta sirve en el
 * muestrario sin montar ningún estado.
 */

import { useEffect, useId, useRef, useState } from "react";

import type { Codigo, Sigla } from "../../contrato/tipos";
import type { EstadoMarca } from "../MarcaMateria";
import { BarraProgreso, Casilla, Chevron, Tooltip } from "../primitivas";
import { estadoDeCasilla, siguienteDeCasilla } from "./casilla";
import { ColumnaCuatrimestre, type ColumnaDelPlan } from "./ColumnaCuatrimestre";
import "./TarjetaAnio.css";

/**
 * Cuánto espera la tarjeta antes de plegarse sola.
 *
 * No es cero para que se vea la marca que completó el año: plegar en el mismo
 * cuadro haría desaparecer la fila justo cuando el usuario mira si cambió.
 */
export const PAUSA_PLEGADO_MS = 250;

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
  const idCuerpo = useId();
  const codigos = columnas.flatMap((columna) =>
    columna.materias.map((materia) => materia.codigo),
  );
  const estados = codigos.map(estadoDe);
  const conFinal = estados.filter((estado) => estado === "final").length;
  const empezadas = estados.filter(
    (estado) => estado === "cursada" || estado === "cursando",
  ).length;
  const casilla = estadoDeCasilla(estados);
  const completo = codigos.length > 0 && conFinal === codigos.length;

  /* Al abrir la página los años ya terminados aparecen plegados. */
  const [plegado, setPlegado] = useState(completo);
  const completoAntes = useRef(completo);

  useEffect(() => {
    const antes = completoAntes.current;
    completoAntes.current = completo;
    if (completo && !antes) {
      const espera = setTimeout(() => {
        setPlegado(true);
      }, PAUSA_PLEGADO_MS);
      return () => {
        clearTimeout(espera);
      };
    }
    if (!completo && antes) {
      // Se quitó una marca: el año vuelve a tener algo que hacer, y se abre.
      setPlegado(false);
    }
    return undefined;
  }, [completo]);

  /*
   * `inert` saca del foco y del árbol de accesibilidad todo lo plegado. React
   * 18 no lo conoce como prop tipada, así que va como atributo suelto; el
   * navegador lo lee igual.
   */
  const inerte: Record<string, string> = plegado ? { inert: "" } : {};

  return (
    <section className="tarjeta-anio" aria-label={titulo}>
      {/*
        La cabecera entera alterna el plegado, al clic y con Enter. La casilla
        corta el evento (ver `Casilla`): marcar el año no es cerrarlo.

        `aria-expanded` va acá —lo pide el entregable— y también en el chevron.
        No es repetirse por repetirse: la cabecera no lleva `role="button"`
        porque un rol de botón vuelve presentacionales a la casilla y a la
        barra de progreso que viven dentro, así que el estado se anuncia por el
        chevron, que sí es un botón de verdad. El chevron queda fuera de la
        cadena de tabulación (`tabIndex={-1}`) para no dejar dos paradas de Tab
        que hacen lo mismo: la parada es la cabecera; su clic burbuja hasta
        `onClick`, así que Enter, Espacio y el clic hacen exactamente lo mismo.
      */}
      <header
        className="tarjeta-anio__cabecera"
        tabIndex={0}
        aria-expanded={!plegado}
        aria-controls={idCuerpo}
        onClick={() => {
          setPlegado((antes) => !antes);
        }}
        onKeyDown={(evento) => {
          // Solo las teclas que nacen en la cabecera misma: las de la casilla
          // y las del chevron son de ellos.
          if (evento.target !== evento.currentTarget) {
            return;
          }
          if (evento.key === "Enter" || evento.key === " ") {
            evento.preventDefault();
            setPlegado((antes) => !antes);
          }
        }}
      >
        <Tooltip
          texto={
            casilla === true
              ? "Quitar las marcas del año"
              : "Marcar todo el año como aprobado con final"
          }
          lado="abajo"
        >
          <Casilla
            marcada={casilla}
            etiqueta={`Todo ${titulo} aprobado con final`}
            alAccionar={() => {
              alMarcarVarias(codigos, siguienteDeCasilla(casilla));
            }}
          />
        </Tooltip>

        <h3 className="tarjeta-anio__titulo">{titulo}</h3>
        <p className="tarjeta-anio__ciclo">{ciclo}</p>

        <div className="tarjeta-anio__progreso">
          <BarraProgreso
            valor={conFinal}
            parcial={empezadas}
            maximo={codigos.length}
            ancho={96}
            etiqueta={`${titulo}: ${conFinal} de ${codigos.length} con final`}
          />
          <p className="tarjeta-anio__cuenta">
            <span className="tarjeta-anio__cuenta-hechas">{conFinal}</span>/
            {codigos.length}
          </p>
        </div>

        <Tooltip
          texto={plegado ? "Desplegar el año" : "Plegar el año"}
          lado="abajo"
        >
          <button
            type="button"
            className="tarjeta-anio__chevron"
            tabIndex={-1}
            aria-expanded={!plegado}
            aria-controls={idCuerpo}
            aria-label={plegado ? `Desplegar ${titulo}` : `Plegar ${titulo}`}
          >
            <Chevron abierto={!plegado} />
          </button>
        </Tooltip>
      </header>

      <div
        className="tarjeta-anio__plegable"
        data-plegado={plegado ? "si" : "no"}
      >
        <div className="tarjeta-anio__cuerpo" id={idCuerpo} {...inerte}>
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
      </div>
    </section>
  );
}
