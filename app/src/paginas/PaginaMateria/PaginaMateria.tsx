/**
 * Pantalla de una materia: `#/materia/<codigo>`.
 *
 * Envuelve la ficha 13e —y, si la materia está bloqueada para el período, el
 * bloque 13f— con el enlace de vuelta al plan. El código sale de la ruta; el
 * plan del usuario, del contexto.
 *
 * Los datos cargados se pueden pasar por `datos` (es lo que hace el cascarón,
 * que ya los tiene) o dejar que la página los pida por su cuenta. Las dos
 * formas existen para no obligar a `App.tsx` a una forma concreta: el
 * orquestador conecta la que prefiera.
 */

import { useMemo } from "react";

import { FichaMateria } from "../../componentes/FichaMateria";
import { MotivosBloqueo } from "../../componentes/MotivosBloqueo";
import {
  PantallaCargando,
  PantallaError,
} from "../../componentes/PantallaEstado";
import { Nota } from "../../componentes/primitivas";
import type {
  Codigo,
  Horarios,
  PeriodoId,
  Plan,
  Vocabulario,
} from "../../contrato/tipos";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import {
  estadoMateria,
  indiceDeMaterias,
  primerPeriodoDelPlan,
  primerPeriodoPlanificado,
} from "../../motor";
import { rutaAHash, useRuta } from "../../rutas";
import "./PaginaMateria.css";

/**
 * Lo que la pantalla necesita de los datos cargados. Es un subconjunto de
 * `DatosCargados`, así que pasarle el objeto entero también sirve.
 */
export interface DatosDeMateria {
  plan: Plan;
  horarios?: Horarios | null;
  vocabulario?: Vocabulario;
  /** Período activo del índice; `null` si no hay ninguno publicado. */
  periodoActivo?: PeriodoId | null;
}

export interface PropsPaginaMateria {
  /** Datos ya cargados; sin esto la página los pide sola. */
  datos?: DatosDeMateria;
  /** Abre `ModalComisiones` (U3.4). */
  alCambiarComision?: (codigo: Codigo, periodo: PeriodoId) => void;
  /** Se llama al planificar la materia en el período donde se destraba. */
  alPlanificar?: (periodo: PeriodoId) => void;
}

export function PaginaMateria({
  datos,
  alCambiarComision,
  alPlanificar,
}: PropsPaginaMateria) {
  const { ruta } = useRuta();
  const codigo = ruta.vista === "materia" ? ruta.codigo : null;

  return (
    <div className="pagina-materia">
      <a className="pagina-materia__volver" href={rutaAHash({ vista: "plan" })}>
        ← Plan
      </a>
      {codigo === null ? (
        <Nota variante="caja">
          La dirección no trae ningún código de materia.
        </Nota>
      ) : datos === undefined ? (
        <ConDatosPropios
          codigo={codigo}
          {...(alCambiarComision === undefined ? {} : { alCambiarComision })}
          {...(alPlanificar === undefined ? {} : { alPlanificar })}
        />
      ) : (
        <Contenido
          codigo={codigo}
          datos={datos}
          {...(alCambiarComision === undefined ? {} : { alCambiarComision })}
          {...(alPlanificar === undefined ? {} : { alPlanificar })}
        />
      )}
    </div>
  );
}

interface PropsContenido {
  codigo: Codigo;
  datos: DatosDeMateria;
  alCambiarComision?: (codigo: Codigo, periodo: PeriodoId) => void;
  alPlanificar?: (periodo: PeriodoId) => void;
}

/** La misma pantalla, pero cargando los datos por su cuenta. */
function ConDatosPropios({
  codigo,
  alCambiarComision,
  alPlanificar,
}: Omit<PropsContenido, "datos">) {
  const { plan: planUsuario } = usePlanUsuario();
  const hoy = useMemo(() => hoyIso(), []);
  const estado = useDatos(planUsuario.plan, hoy);

  if (estado.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (estado.fase === "error") {
    return <PantallaError error={estado.error} />;
  }
  const datos: DatosDeMateria = {
    plan: estado.datos.plan,
    horarios: estado.datos.horarios,
    vocabulario: estado.datos.vocabulario,
    periodoActivo: estado.datos.periodo?.entrada.periodo ?? null,
  };
  return (
    <Contenido
      codigo={codigo}
      datos={datos}
      {...(alCambiarComision === undefined ? {} : { alCambiarComision })}
      {...(alPlanificar === undefined ? {} : { alPlanificar })}
    />
  );
}

function Contenido({
  codigo,
  datos,
  alCambiarComision,
  alPlanificar,
}: PropsContenido) {
  const { plan: planUsuario } = usePlanUsuario();
  const { plan, horarios = null, vocabulario, periodoActivo = null } = datos;

  const nombreDeSede = useMemo(() => {
    const nombres = new Map(
      (vocabulario?.sedes ?? []).map((sede) => [sede.id, sede.nombre]),
    );
    return (id: string) => nombres.get(id) ?? id;
  }, [vocabulario]);

  if (indiceDeMaterias(plan).get(codigo) === undefined) {
    return (
      <Nota variante="caja">
        {codigo} no está en el plan {plan.plan}.
      </Nota>
    );
  }

  /* El período de referencia: donde está planificada, si no el activo del
     índice, si no el primero que tenga el plan del usuario. */
  const periodo =
    primerPeriodoPlanificado(planUsuario).get(codigo) ??
    periodoActivo ??
    primerPeriodoDelPlan(planUsuario);

  const bloqueada =
    periodo !== null &&
    estadoMateria(codigo, periodo, planUsuario, plan) === "bloqueada";

  return (
    <>
      {bloqueada && periodo !== null ? (
        <MotivosBloqueo
          codigo={codigo}
          periodo={periodo}
          plan={plan}
          {...(alPlanificar === undefined ? {} : { alPlanificar })}
        />
      ) : null}
      <FichaMateria
        codigo={codigo}
        plan={plan}
        horarios={horarios}
        nombreDeSede={nombreDeSede}
        {...(periodo === null ? {} : { periodo })}
        {...(alCambiarComision === undefined ? {} : { alCambiarComision })}
      />
    </>
  );
}
