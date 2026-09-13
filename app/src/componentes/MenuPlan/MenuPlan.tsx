/**
 * Copia de seguridad del plan: exportar, importar y borrar todo.
 *
 * Es el hueco «Copia de seguridad del plan» del plan de sprints: «todo queda en
 * este navegador» (13a) exige una salida, y la salida es un JSON que el usuario
 * se lleva.
 *
 * Acá no se dibuja el menú «⋯»: eso ya lo hace `BarraSuperior`, que recibe las
 * tres acciones como callbacks. Este módulo aporta las acciones cableadas al
 * estado y los diálogos que necesitan (confirmación de borrado y el error
 * exacto de una importación fallida). Quien las usa monta `dialogos` una vez,
 * donde sea. El selector de archivo **no** está ahí: lo crea y lo destruye
 * `elegirArchivo`, para no dejar un control nativo montado en la pantalla.
 *
 * Regla dura: **una importación que falla no toca el plan actual.** El
 * documento nuevo reemplaza al viejo recién cuando `importar` lo valida entero.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { hoyIso } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import { importar, planUsuarioInicial } from "../../estado/planUsuario";
import { navegar } from "../../rutas";
import { Boton, Modal, Nota } from "../primitivas";
import {
  borrarGuardado,
  descargarPlan,
  elegirArchivo,
  leerArchivo,
  mensajeDeError,
} from "./acciones";
import "./MenuPlan.css";

/** Las tres acciones del menú «⋯», ya cableadas al estado del usuario. */
export interface AccionesPlan {
  /** Descarga `cuatris-plan-<fecha>.json`. */
  exportar: () => void;
  /** Abre el selector de archivo. */
  importar: () => void;
  /** Pide confirmación antes de limpiar el plan de este navegador. */
  borrarTodo: () => void;
}

export interface MenuPlanCableado {
  acciones: AccionesPlan;
  /** Diálogos de borrado y de error. Hay que montarlos una vez. */
  dialogos: ReactNode;
}

/**
 * Acciones y diálogos de la copia de seguridad.
 *
 * @param fecha Fecha del nombre del archivo exportado; por defecto, hoy.
 */
export function useMenuPlan(fecha?: string): MenuPlanCableado {
  const { plan, despachar } = usePlanUsuario();
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alExportar = useCallback(() => {
    descargarPlan(plan, fecha ?? hoyIso());
  }, [plan, fecha]);

  const alBorrarTodo = useCallback(() => {
    setConfirmandoBorrado(true);
  }, []);

  /*
   * El selector se crea al abrirlo y se destruye al elegir o cancelar (ver
   * `elegirArchivo`): un `<input type="file">` montado siempre era el último
   * control nativo que quedaba en la pantalla. El mismo archivo dos veces
   * seguidas vuelve a disparar `change` porque el elemento es nuevo cada vez.
   */
  const alImportar = useCallback(() => {
    setError(null);
    elegirArchivo()
      .then(async (elegido) => {
        if (elegido === null) {
          return;
        }
        const texto = await leerArchivo(elegido);
        // Si `importar` lanza, el plan actual queda como estaba.
        const importado = importar(texto);
        setError(null);
        despachar({ tipo: "reemplazar", plan: importado });
        navegar({ vista: "plan" });
      })
      .catch((falla: unknown) => {
        setError(mensajeDeError(falla));
      });
  }, [despachar]);

  const acciones = useMemo<AccionesPlan>(
    () => ({
      exportar: alExportar,
      importar: alImportar,
      borrarTodo: alBorrarTodo,
    }),
    [alExportar, alImportar, alBorrarTodo],
  );

  const dialogos = (
    <>
      <Modal
        abierto={confirmandoBorrado}
        titulo="¿Borrar todo?"
        ancho={420}
        onCerrar={() => {
          setConfirmandoBorrado(false);
        }}
      >
        <p className="menu-plan__parrafo">
          Se borra el plan de este navegador. Exportalo antes si querés
          conservarlo.
        </p>
        <div className="menu-plan__botones">
          <Boton
            variante="secundario"
            onClick={() => {
              setConfirmandoBorrado(false);
            }}
          >
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={() => {
              borrarGuardado();
              despachar({ tipo: "reemplazar", plan: planUsuarioInicial() });
              setConfirmandoBorrado(false);
              navegar({ vista: "inicio" });
            }}
          >
            Borrar todo
          </Boton>
        </div>
      </Modal>

      <Modal
        abierto={error !== null}
        titulo="No pude importar ese archivo"
        ancho={480}
        onCerrar={() => {
          setError(null);
        }}
      >
        <p className="menu-plan__parrafo">
          Tu plan quedó como estaba. Este es el motivo exacto:
        </p>
        <Nota variante="caja">
          <span className="menu-plan__motivo">{error}</span>
        </Nota>
        <div className="menu-plan__botones">
          <Boton
            variante="primario"
            onClick={() => {
              setError(null);
            }}
          >
            Entendido
          </Boton>
        </div>
      </Modal>
    </>
  );

  return { acciones, dialogos };
}

export interface PropsMenuPlan {
  /** Recibe las acciones ya cableadas y devuelve lo que se dibuja. */
  children: (acciones: AccionesPlan) => ReactNode;
  /** Fecha del nombre del archivo exportado; por defecto, hoy. */
  fecha?: string;
}

/**
 * Envoltorio del hook para quien prefiera un componente: monta los diálogos y
 * le pasa las acciones a `children`.
 *
 * ```tsx
 * <MenuPlan>
 *   {(acciones) => <BarraSuperior {...acciones} … />}
 * </MenuPlan>
 * ```
 */
export function MenuPlan({ children, fecha }: PropsMenuPlan) {
  const { acciones, dialogos } = useMenuPlan(fecha);
  return (
    <>
      {children(acciones)}
      {dialogos}
    </>
  );
}
