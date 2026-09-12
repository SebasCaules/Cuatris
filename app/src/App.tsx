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
import {
  PantallaCargando,
  PantallaError,
  PantallaPlanCorrupto,
} from "./componentes/PantallaEstado";
import type { Codigo, PeriodoId } from "./contrato/tipos";
import type { DatosCargados } from "./datos/useDatos";
import { hoyIso, useDatos } from "./datos/useDatos";
import { usePlanUsuario } from "./estado/contexto";
import { Muestrario } from "./paginas/Muestrario";
import { PaginaInicio } from "./paginas/PaginaInicio";
import { PaginaMateria } from "./paginas/PaginaMateria";
import { CursadaConDatos } from "./paginas/PaginaCursada";
import { PlanDeEstudiosConDatos } from "./paginas/PaginaPlanDeEstudios";
import { ProgresoConDatos } from "./paginas/PaginaProgreso";
import { useRuta } from "./rutas";
import "./App.css";

/** Qué modal de comisiones está abierto; `fijada` es la otra materia del choque (13h). */
interface ModalAbierto {
  periodo: PeriodoId;
  codigo: Codigo;
  fijada?: Codigo;
}

/**
 * El panel «Agregar materia» de 13c, con la consulta que lo abrió.
 *
 * El texto viaja con el panel porque en 13c el campo de la barra superior y el
 * del panel son **la misma búsqueda**: lo que se escribe arriba filtra abajo.
 */
interface PanelAbierto {
  periodo: PeriodoId;
  consulta: string;
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
  const [panel, setPanel] = useState<PanelAbierto | null>(null);
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

  // Agregar una materia es armar la cursada: el panel vive en `#/cursada`, y
  // buscar desde cualquier otra pestaña lleva hasta ahí.
  const abrirPanel = useCallback(
    (periodo: PeriodoId, consulta = "") => {
      setModal(null);
      setPanel({ periodo, consulta });
      if (ruta.vista !== "cursada") {
        ir({ vista: "cursada" });
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

  /*
   * R1: `#/plan` siempre muestra el plan de estudios. Antes, con el plan vacío,
   * la ruta se desviaba al primer ingreso y no había forma de ver el plan hasta
   * marcar algo; ahora el primer ingreso es una pantalla más, en `#/inicio`.
   */
  if (ruta.vista === "inicio") {
    principal = (
      <PaginaInicio plan={datos.plan} alImportar={acciones.importar} />
    );
    lateral = null;
  } else if (ruta.vista === "plan") {
    principal = (
      <PlanDeEstudiosConDatos
        plan={datos.plan}
        abreviaciones={datos.abreviaciones}
      />
    );
  } else if (ruta.vista === "progreso") {
    principal = (
      <ProgresoConDatos plan={datos.plan} planUsuario={planUsuario} />
    );
    // 13i es de ancho completo: repetir el panel de progreso al lado de la
    // página que ya lo cuenta entero sería decir dos veces lo mismo.
    lateral = null;
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
        alPlanificar={() => ir({ vista: "cursada" })}
      />
    );
  } else {
    principal = (
      <CursadaConDatos
        datos={datos}
        panelAbierto={panel !== null}
        alAgregar={abrirPanel}
        alResolver={(periodo, codigoA, codigoB) =>
          abrirModal({ periodo, codigo: codigoA, fijada: codigoB })
        }
      />
    );
  }

  const horariosDelPanel = panel === null ? null : horariosDe(panel.periodo);
  const horariosDelModal = modal === null ? null : horariosDe(modal.periodo);
  const nombreDeMateria =
    modal === null
      ? undefined
      : datos.plan.materias.find((materia) => materia.codigo === modal.codigo)
          ?.nombre;

  /*
   * El panel de 13c es una columna más del cuerpo, con su ancho propio de
   * 330 px: dentro del hueco del progreso (250 px) las filas partían los
   * nombres en tres líneas y el cuatrimestre destino se veía peor, no mejor.
   */
  const panelAgregar =
    panel !== null && ruta.vista === "cursada" ? (
      <PanelAgregar
        periodo={panel.periodo}
        consulta={panel.consulta}
        plan={datos.plan}
        abreviaciones={datos.abreviaciones}
        horarios={horariosDelPanel}
        alCerrar={cerrarPanel}
        alElegirComision={(codigo) => {
          abrirModal({ periodo: panel.periodo, codigo });
        }}
      />
    ) : null;

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
              : {
                  onBuscar: (texto: string) => {
                    abrirPanel(periodoActivo, texto);
                  },
                })}
            onExportar={acciones.exportar}
            onImportar={acciones.importar}
            onBorrarTodo={acciones.borrarTodo}
          />
        }
        principal={principal}
        panel={panelAgregar === null ? lateral : null}
        agregar={panelAgregar}
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
  const { plan: planUsuario, errorGuardado, crudoGuardado, descartarGuardado } =
    usePlanUsuario();
  const { ruta } = useRuta();
  const hoy = useMemo(() => hoyIso(), []);
  const datos = useDatos(planUsuario.plan, hoy);

  if (ruta.vista === "muestrario") {
    return <Muestrario />;
  }
  /*
   * Lo guardado no se pudo leer: hasta que el usuario se lleve la copia, nada
   * de lo que haga se persiste. Cortar acá es lo que evita que trabaje toda la
   * sesión sobre un plan que se pierde al cerrar la pestaña.
   */
  if (errorGuardado !== null) {
    return (
      <PantallaPlanCorrupto
        error={errorGuardado}
        crudo={crudoGuardado}
        alEmpezarDeCero={descartarGuardado}
      />
    );
  }
  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return <Aplicacion datos={datos.datos} />;
}
