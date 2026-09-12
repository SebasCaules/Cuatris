/**
 * Cableado de la SPA: enruta cada hash a su página, comparte los datos cargados
 * una sola vez, y sostiene el estado efímero de la pantalla de trabajo (el panel
 * «Agregar materia» de 13c y el modal «Elegir comisión» de 13d).
 *
 * El estado del usuario vive en `estado/`; acá solo hay estado de interfaz.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { BarraSuperior } from "./componentes/BarraSuperior";
import { Disposicion } from "./componentes/Disposicion";
import { useMenuPlan } from "./componentes/MenuPlan";
import { ModalComisiones } from "./componentes/ModalComisiones";
import { PanelAgregar } from "./componentes/PanelAgregar";
import { PanelProgreso } from "./componentes/PanelProgreso";
import { PantallaCargando, PantallaError } from "./componentes/PantallaEstado";
import type { Codigo, PeriodoId } from "./contrato/tipos";
import type { DatosCargados } from "./datos/useDatos";
import { hoyIso, useDatos } from "./datos/useDatos";
import { usePlanUsuario } from "./estado/contexto";
import { Muestrario } from "./paginas/Muestrario";
import { PaginaInicio } from "./paginas/PaginaInicio";
import { PaginaMateria } from "./paginas/PaginaMateria";
import { PlanConDatos } from "./paginas/PaginaPlan";
import { ProgresoConDatos } from "./paginas/PaginaProgreso";
import { useRuta } from "./rutas";
import "./App.css";

/** Qué modal de comisiones está abierto; `fijada` es la otra materia del choque (13h). */
interface ModalAbierto {
  periodo: PeriodoId;
  codigo: Codigo;
  fijada?: Codigo;
}

/** El plan del usuario todavía no tiene nada: es el primer ingreso (13a). */
function esPrimerIngreso(
  historia: object,
  periodos: Record<string, unknown[]>,
): boolean {
  if (Object.keys(historia).length > 0) {
    return false;
  }
  return Object.values(periodos).every((materias) => materias.length === 0);
}

function nombreDeSedeDe(datos: DatosCargados): (id: string) => string {
  const nombres = new Map(
    datos.vocabulario.sedes.map((sede) => [sede.id, sede.nombre]),
  );
  return (id) => nombres.get(id) ?? id;
}

function Aplicacion({ datos }: { datos: DatosCargados }) {
  const { plan: planUsuario } = usePlanUsuario();
  const { ruta, ir } = useRuta();
  const { acciones, dialogos } = useMenuPlan();
  const [panel, setPanel] = useState<PeriodoId | null>(null);
  const [modal, setModal] = useState<ModalAbierto | null>(null);

  const periodoActivo = datos.periodo?.entrada.periodo ?? null;
  const nombreDeSede = useMemo(() => nombreDeSedeDe(datos), [datos]);
  const abreviaciones = datos.abreviaciones.abreviaciones;

  /** Horarios de un período: solo tenemos cargado el archivo del período activo. */
  const horariosDe = useCallback(
    (periodo: PeriodoId) =>
      datos.horarios !== null && datos.horarios.periodo.id === periodo
        ? datos.horarios
        : null,
    [datos.horarios],
  );

  const abrirPanel = useCallback(
    (periodo: PeriodoId) => {
      setModal(null);
      setPanel(periodo);
      if (ruta.vista !== "plan") {
        ir({ vista: "plan" });
      }
    },
    [ir, ruta.vista],
  );

  const abrirModal = useCallback(
    (abierto: ModalAbierto) => {
      if (horariosDe(abierto.periodo) === null) {
        // Sin horarios publicados no hay comisiones que elegir: el panel ya
        // agrega la materia sin comisión en ese caso.
        return;
      }
      setModal(abierto);
    },
    [horariosDe],
  );

  const cerrarModal = useCallback(() => setModal(null), []);
  const cerrarPanel = useCallback(() => setPanel(null), []);

  const primerIngreso = esPrimerIngreso(
    planUsuario.historia,
    planUsuario.periodos,
  );

  let principal: ReactNode;
  let lateral: ReactNode =
    periodoActivo === null ? (
      <PanelProgreso plan={datos.plan} planUsuario={planUsuario} />
    ) : (
      <PanelProgreso
        plan={datos.plan}
        planUsuario={planUsuario}
        desde={periodoActivo}
      />
    );

  if (ruta.vista === "inicio" || (ruta.vista === "plan" && primerIngreso)) {
    principal = <PaginaInicio plan={datos.plan} />;
    lateral = null;
  } else if (ruta.vista === "progreso") {
    principal = (
      <ProgresoConDatos plan={datos.plan} planUsuario={planUsuario} />
    );
  } else if (ruta.vista === "materia") {
    principal = (
      <PaginaMateria
        datos={{
          plan: datos.plan,
          horarios: datos.horarios,
          vocabulario: datos.vocabulario,
          periodoActivo,
        }}
        alCambiarComision={(codigo, periodo) => abrirModal({ periodo, codigo })}
        alPlanificar={() => ir({ vista: "plan" })}
      />
    );
  } else {
    principal = (
      <PlanConDatos
        datos={datos}
        panelAbierto={panel !== null}
        alAgregar={abrirPanel}
        alResolver={(periodo, codigoA, codigoB) =>
          abrirModal({ periodo, codigo: codigoA, fijada: codigoB })
        }
      />
    );
  }

  const horariosDelPanel = panel === null ? null : horariosDe(panel);
  const horariosDelModal = modal === null ? null : horariosDe(modal.periodo);
  const nombreDeMateria =
    modal === null
      ? undefined
      : datos.plan.materias.find((materia) => materia.codigo === modal.codigo)
          ?.nombre;

  return (
    <>
      <Disposicion
        barra={
          <BarraSuperior
            carrera={datos.plan.carrera}
            plan={datos.plan.plan}
            ruta={ruta}
            ir={ir}
            {...(periodoActivo === null
              ? {}
              : { onBuscar: () => abrirPanel(periodoActivo) })}
            onExportar={acciones.exportar}
            onImportar={acciones.importar}
            onBorrarTodo={acciones.borrarTodo}
          />
        }
        principal={principal}
        panel={
          panel !== null && ruta.vista === "plan" && !primerIngreso ? (
            <PanelAgregar
              periodo={panel}
              plan={datos.plan}
              abreviaciones={datos.abreviaciones}
              horarios={horariosDelPanel}
              alCerrar={cerrarPanel}
              alElegirComision={(codigo) =>
                abrirModal({ periodo: panel, codigo })
              }
            />
          ) : (
            lateral
          )
        }
      />
      {modal !== null && horariosDelModal !== null ? (
        <ModalComisiones
          periodo={modal.periodo}
          codigo={modal.codigo}
          {...(modal.fijada === undefined ? {} : { fijada: modal.fijada })}
          horarios={horariosDelModal}
          abreviaciones={abreviaciones}
          nombreDeSede={nombreDeSede}
          {...(nombreDeMateria === undefined
            ? {}
            : { nombre: nombreDeMateria })}
          alCerrar={cerrarModal}
        />
      ) : null}
      {dialogos}
    </>
  );
}

export function App() {
  const { plan: planUsuario } = usePlanUsuario();
  const { ruta } = useRuta();
  const hoy = useMemo(() => hoyIso(), []);
  const datos = useDatos(planUsuario.plan, hoy);

  if (ruta.vista === "muestrario") {
    return <Muestrario />;
  }
  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return <Aplicacion datos={datos.datos} />;
}
