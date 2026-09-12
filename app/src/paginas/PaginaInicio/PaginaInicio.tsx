/**
 * Pantalla 13a: primer ingreso, plan vacío.
 *
 * «No hay carrusel vacío de bienvenida: la pantalla pide el único dato que hace
 * funcionar todo lo demás, la historia académica, y aclara que el plan vive en
 * el navegador.»
 *
 * R1 le sacó el segundo camino de adentro: marcar a mano ya no es una lista
 * aparte, es la pestaña «Plan». Acá queda el botón que lleva hasta ahí. Y la
 * pantalla dejó de ser obligatoria: `#/plan` ya no desvía a nadie, así que
 * quien prefiera marcar puede no pasar nunca por acá.
 *
 * El tercer enlace, «Importar un plan guardado», es el otro extremo de la copia
 * de seguridad: si el plan quedó en otra computadora, entra por acá.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useRef, useState } from "react";

import type { Plan } from "../../contrato/tipos";
import { useMenuPlan } from "../../componentes/MenuPlan";
import { PegarHistoria } from "../../componentes/PegarHistoria";
import { Boton } from "../../componentes/primitivas";
import { PantallaCargando, PantallaError } from "../../componentes/PantallaEstado";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import { navegar } from "../../rutas";
import "./PaginaInicio.css";

export interface PropsPaginaInicio {
  /**
   * Plan de estudios ya cargado. Sin esto la pantalla lo carga sola, para que
   * se pueda montar como ruta suelta.
   */
  plan?: Plan;
  /**
   * Acción «importar» de quien ya montó `useMenuPlan` (la `App`). Sin esto la
   * pantalla arma la suya, que es lo que necesita la ruta suelta.
   *
   * Con la propia se montaría un segundo selector de archivo invisible y el
   * primer ingreso tendría dos controles idénticos en la cadena de tabulación.
   */
  alImportar?: () => void;
}

function Inicio({ plan, alImportar }: PropsPaginaInicio & { plan: Plan }) {
  const propio = useMenuPlan();
  const importar = alImportar ?? propio.acciones.importar;
  const caja = useRef<HTMLDivElement>(null);

  /*
   * El botón primario no abre ni cierra nada: el campo de pegado ya está
   * abajo, a la vista. Lo que hace es llevar el foco hasta él, que es lo único
   * honesto que puede hacer un botón cuyo destino ya está en pantalla.
   */
  const irAPegar = () => {
    caja.current?.querySelector("textarea")?.focus();
  };

  return (
    <section className="inicio" aria-labelledby="inicio-titulo">
      <h2 className="inicio__titulo" id="inicio-titulo">
        Todavía no hay nada en tu plan
      </h2>
      <p className="inicio__bajada">
        Para empezar necesito saber qué aprobaste. Podés pegar tu historia
        académica del sistema del ITBA o marcarlo vos mismo en el plan de
        estudios; después agregás las que faltan a cada cuatrimestre.
      </p>

      <div className="inicio__caminos" role="group" aria-label="Cómo empezar">
        <Boton variante="primario" onClick={irAPegar}>
          Pegar historia académica
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => {
            navegar({ vista: "plan" });
          }}
        >
          Marcar en el plan
        </Boton>
      </div>

      <div className="inicio__camino" ref={caja}>
        <PegarHistoria plan={plan} />
      </div>

      <p className="inicio__nota">
        Todo queda en este navegador. No hay cuenta ni servidor.
      </p>

      <Boton variante="terciario" onClick={importar}>
        Importar un plan guardado
      </Boton>

      {alImportar === undefined ? propio.dialogos : null}
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

export function PaginaInicio({ plan, alImportar }: PropsPaginaInicio = {}) {
  if (plan === undefined) {
    return <InicioAutonomo />;
  }
  return (
    <Inicio plan={plan} {...(alImportar === undefined ? {} : { alImportar })} />
  );
}
