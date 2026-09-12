/**
 * Pantalla 13a: primer ingreso, plan vacío.
 *
 * «No hay carrusel vacío de bienvenida: la pantalla pide el único dato que hace
 * funcionar todo lo demás, la historia académica, y aclara que el plan vive en
 * el navegador.» Los dos caminos del mockup —pegar y marcar a mano— son
 * excluyentes: el elegido se dibuja debajo de los botones.
 *
 * El tercer enlace, «Importar un plan guardado», es el otro extremo de la copia
 * de seguridad: si el plan quedó en otra computadora, entra por acá.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useState } from "react";

import type { Plan } from "../../contrato/tipos";
import { MarcarAprobadas } from "../../componentes/MarcarAprobadas";
import { useMenuPlan } from "../../componentes/MenuPlan";
import { PegarHistoria } from "../../componentes/PegarHistoria";
import { Boton } from "../../componentes/primitivas";
import { PantallaCargando, PantallaError } from "../../componentes/PantallaEstado";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import "./PaginaInicio.css";

/** Cuál de los dos caminos está abierto. */
export type Camino = "pegar" | "marcar";

export interface PropsPaginaInicio {
  /**
   * Plan de estudios ya cargado. Sin esto la pantalla lo carga sola, para que
   * se pueda montar como ruta suelta.
   */
  plan?: Plan;
}

function Inicio({ plan }: { plan: Plan }) {
  const [camino, setCamino] = useState<Camino>("pegar");
  const { acciones, dialogos } = useMenuPlan();

  return (
    <section className="inicio" aria-labelledby="inicio-titulo">
      <h2 className="inicio__titulo" id="inicio-titulo">
        Todavía no hay nada en tu plan
      </h2>
      <p className="inicio__bajada">
        Para empezar necesito saber qué aprobaste. Podés pegar tu historia
        académica del sistema del ITBA o ir marcando las materias a mano;
        después agregás las que faltan a cada cuatrimestre.
      </p>

      <div className="inicio__caminos" role="group" aria-label="Cómo empezar">
        <Boton
          variante={camino === "pegar" ? "primario" : "secundario"}
          aria-pressed={camino === "pegar"}
          onClick={() => {
            setCamino("pegar");
          }}
        >
          Pegar historia académica
        </Boton>
        <Boton
          variante={camino === "marcar" ? "primario" : "secundario"}
          aria-pressed={camino === "marcar"}
          onClick={() => {
            setCamino("marcar");
          }}
        >
          Marcar materias a mano
        </Boton>
      </div>

      <div className="inicio__camino">
        {camino === "pegar" ? (
          <PegarHistoria plan={plan} />
        ) : (
          <MarcarAprobadas plan={plan} />
        )}
      </div>

      <p className="inicio__nota">
        Todo queda en este navegador. No hay cuenta ni servidor.
      </p>

      <Boton variante="terciario" onClick={acciones.importar}>
        Importar un plan guardado
      </Boton>

      {dialogos}
    </section>
  );
}

/** Trae el plan de estudios por su cuenta cuando no se lo pasan por props. */
function InicioAutonomo() {
  const { plan: planUsuario } = usePlanUsuario();
  const [hoy] = useState(() => hoyIso());
  const datos = useDatos(planUsuario.plan, hoy);

  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return <Inicio plan={datos.datos.plan} />;
}

export function PaginaInicio({ plan }: PropsPaginaInicio = {}) {
  if (plan === undefined) {
    return <InicioAutonomo />;
  }
  return <Inicio plan={plan} />;
}
