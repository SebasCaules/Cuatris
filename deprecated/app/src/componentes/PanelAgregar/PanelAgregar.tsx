/**
 * `PanelAgregar` — pantalla 13c: buscar y agregar una materia al cuatrimestre.
 *
 * Es un `PanelLateral` y no un modal a propósito: mientras se busca, el
 * carrusel sigue a la vista y se ve dónde va a caer la materia.
 *
 * El panel no carga datos ni sabe de rutas. El plan de estudios, las
 * abreviaciones y los horarios del período le llegan por `props` —los tiene
 * quien ya los cargó con `useDatos`— y el plan del usuario lo lee del contexto,
 * que es el único estado que se escribe desde acá.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  Abreviaciones,
  Codigo,
  Horarios,
  PeriodoId,
  Plan,
} from "../../contrato/tipos";
import { usePlanUsuario } from "../../estado/contexto";
import { etiquetaCorta } from "../Carrusel";
import { Campo, Chip, PanelLateral } from "../primitivas";
import { FilaMateria } from "./FilaMateria";
import {
  FILTROS,
  FILTROS_INICIALES,
  filasDeResultados,
  leyendaDeMinors,
  nombresDeMinors,
  ofertaDeFila,
  type Filtro,
  type Filtros,
} from "./resultados";
import "./PanelAgregar.css";

/** Cuánto se ve el «✓ agregada» de la fila (13c, punto 3 de la unidad). */
export const MS_AVISO_AGREGADA = 1000;

/** Ancho del panel en 13c. */
const ANCHO = 330;

export interface PropsPanelAgregar {
  /** Cuatrimestre al que se agrega; da el título «Agregar a 1.º 2026». */
  periodo: PeriodoId;
  /**
   * Consulta con la que se abre el panel. En 13c el campo de la barra superior
   * y el del panel son la misma búsqueda: lo que se escribió arriba llega acá
   * en vez de perderse.
   */
  consulta?: string;
  plan: Plan;
  abreviaciones: Abreviaciones;
  /** Horarios del período; `null` si todavía no se publicaron. */
  horarios?: Horarios | null;
  /** Con `false` el panel no se dibuja; por defecto está abierto. */
  abierto?: boolean;
  alCerrar: () => void;
  /** La materia tiene comisiones: la elección la hace el modal de 13d. */
  alElegirComision: (codigo: Codigo) => void;
  /** Solo para los tests: acorta o alarga el «✓ agregada». */
  msAvisoAgregada?: number;
  /**
   * Materia bajo el puntero, para previsualizarla en los calendarios; `null`
   * al salir de la fila o al cerrar el panel.
   */
  alPrevisualizar?: (codigo: Codigo | null) => void;
}

export function PanelAgregar({
  periodo,
  consulta = "",
  plan,
  abreviaciones,
  horarios = null,
  abierto = true,
  alCerrar,
  alElegirComision,
  msAvisoAgregada = MS_AVISO_AGREGADA,
  alPrevisualizar,
}: PropsPanelAgregar) {
  const { plan: planUsuario, despachar } = usePlanUsuario();
  const [texto, setTexto] = useState(consulta);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [agregada, setAgregada] = useState<Codigo | null>(null);
  const cajaBusqueda = useRef<HTMLDivElement>(null);
  // Si el panel se abrió con una consulta, se abrió tipeando en la barra de
  // arriba: el foco tiene que quedarse ahí.
  const [enfocarAlAbrir] = useState(consulta === "");

  // La búsqueda de la barra superior sigue escribiendo mientras el panel está
  // abierto: cada tecla de arriba es la consulta de acá.
  useEffect(() => {
    setTexto(consulta);
  }, [consulta]);

  // El campo se lleva el foco al abrirse. Va después del enganche de foco de
  // `PanelLateral` —que enfoca el ✕, su primer enfocable— porque el efecto del
  // hijo corre antes que el del padre. Si el panel se abrió tipeando arriba, el
  // foco se queda arriba: robárselo partiría la consulta en dos campos.
  useEffect(() => {
    if (!abierto || !enfocarAlAbrir) {
      return;
    }
    cajaBusqueda.current?.querySelector("input")?.focus();
  }, [abierto, enfocarAlAbrir]);

  // Al desmontarse el panel no puede quedar una previsualización colgada.
  useEffect(
    () => () => {
      alPrevisualizar?.(null);
    },
    [alPrevisualizar],
  );

  useEffect(() => {
    if (agregada === null) {
      return;
    }
    const reloj = setTimeout(() => {
      setAgregada(null);
    }, msAvisoAgregada);
    return () => {
      clearTimeout(reloj);
    };
  }, [agregada, msAvisoAgregada]);

  const filas = useMemo(
    () =>
      filasDeResultados({
        texto,
        filtros,
        periodo,
        plan,
        abreviaciones,
        planUsuario,
        horarios,
      }),
    [texto, filtros, periodo, plan, abreviaciones, planUsuario, horarios],
  );

  const minors = useMemo(() => nombresDeMinors(plan), [plan]);
  const leyenda = useMemo(() => leyendaDeMinors(plan), [plan]);

  const alternarFiltro = (id: Filtro) => {
    setFiltros((anteriores) => ({ ...anteriores, [id]: !anteriores[id] }));
  };

  const agregar = (codigo: Codigo, tieneComisiones: boolean) => {
    if (tieneComisiones) {
      // Elegir comisión es el modal de 13d: acá solo se avisa.
      alElegirComision(codigo);
      return;
    }
    // `agregarMateria` ya asigna el color de la materia (`estado/planUsuario`);
    // despachar además `asignarColor` sería repetir la misma regla en dos lados.
    despachar({ tipo: "agregarMateria", periodo, codigo });
    setAgregada(codigo);
    // Ya está puesta: la previsualización dejaría un fantasma encima.
    alPrevisualizar?.(null);
  };

  return (
    <PanelLateral
      abierto={abierto}
      titulo={`Agregar a ${etiquetaCorta(periodo)}`}
      ancho={ANCHO}
      enfocarAlAbrir={enfocarAlAbrir}
      onCerrar={alCerrar}
    >
      <div className="panel-agregar">
        <div className="panel-agregar__busqueda" ref={cajaBusqueda}>
          <Campo
            tipo="busqueda"
            etiqueta="Buscar materia"
            placeholder="Código, nombre o docente"
            valor={texto}
            onCambio={setTexto}
          />
        </div>

        {/* Dos toggles independientes: cada uno prende o apaga su mitad de la
            lista. Con los dos prendidos se ve todo. */}
        <div className="panel-agregar__filtros" role="group" aria-label="Filtros">
          {FILTROS.map((filtro) => (
            <Chip
              key={filtro.id}
              variante={filtros[filtro.id] ? "seleccionado" : "relleno"}
              onClick={() => {
                alternarFiltro(filtro.id);
              }}
            >
              {filtro.texto}
            </Chip>
          ))}
        </div>

        {filas.length === 0 ? (
          <p className="panel-agregar__vacio">
            {texto.trim() === ""
              ? "Ninguna materia pasa estos filtros."
              : `Nada con «${texto}». Probá con el código, el nombre o el docente.`}
          </p>
        ) : (
          <ul className="panel-agregar__lista">
            {filas.map((fila) => {
              const oferta = ofertaDeFila(
                fila.materia.codigo,
                periodo,
                planUsuario,
                horarios,
              );
              return (
                <FilaMateria
                  key={fila.materia.codigo}
                  materia={fila.materia}
                  estado={fila.estado}
                  oferta={oferta}
                  abreviaciones={abreviaciones}
                  nombresDeMinors={minors}
                  agregada={agregada === fila.materia.codigo}
                  alAgregar={() => {
                    agregar(fila.materia.codigo, oferta.comisiones > 0);
                  }}
                  {...(alPrevisualizar === undefined ? {} : { alPrevisualizar })}
                />
              );
            })}
          </ul>
        )}

        <p className="panel-agregar__leyenda">
          Las siglas marcan a qué minor suma la electiva: {leyenda}
        </p>
      </div>
    </PanelLateral>
  );
}
