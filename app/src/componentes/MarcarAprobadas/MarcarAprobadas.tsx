/**
 * Marcar materias a mano (13a, hueco del mockup).
 *
 * Es el camino garantizado mientras no exista una muestra del formato de la
 * historia académica (gap G-02): la lista del plan con casillas, agrupada por
 * año y cuatrimestre sugerido.
 *
 * Dos decisiones que valen la pena nombrar:
 *
 * - **Marcar una materia no marca sus correlativas.** Una historia real puede
 *   tener huecos (equivalencias, materias de otro plan) y el programa no está
 *   para discutirlos. Cuando la cadena de correlativas no está completa se
 *   ofrece el enlace, y lo aprieta el usuario.
 * - **Las casillas viven acá hasta «Listo».** El reductor sabe marcar aprobada
 *   pero no desmarcar, así que se arma la historia completa y se despacha una
 *   sola vez con `cargarHistoria`. Lo que estaba en `regular` o `cursando` y no
 *   se tocó se conserva tal cual.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useMemo, useState } from "react";

import type {
  Codigo,
  EntradaHistoria,
  Materia,
  Plan,
} from "../../contrato/tipos";
import { usePlanUsuario } from "../../estado/contexto";
import { creditosAprobados, itemsAprobados } from "../../motor";
import { navegar } from "../../rutas";
import { Boton, Campo, Etiqueta } from "../primitivas";
import { agrupar, correlativasSinMarcar, filtrar } from "./grupos";
import "./MarcarAprobadas.css";

type Historia = Record<Codigo, EntradaHistoria>;

function estaAprobada(historia: Historia, codigo: Codigo): boolean {
  return historia[codigo]?.estado === "aprobada";
}

/** Historia con `codigos` en `aprobada`, sin tocar el resto. */
function conAprobadas(historia: Historia, codigos: readonly Codigo[]): Historia {
  const salida: Historia = { ...historia };
  for (const codigo of codigos) {
    salida[codigo] = { estado: "aprobada" };
  }
  return salida;
}

/** Historia sin `codigo`; desmarcar es quitar la entrada, no ponerla en otro estado. */
function sinMateria(historia: Historia, codigo: Codigo): Historia {
  const salida: Historia = { ...historia };
  delete salida[codigo];
  return salida;
}

function Fila({
  materia,
  marcadas,
  plan,
  alAlternar,
  alMarcarCorrelativas,
}: {
  materia: Materia;
  /** Códigos en `aprobada`; se calcula una vez para toda la lista. */
  marcadas: ReadonlySet<Codigo>;
  plan: Plan;
  alAlternar: (codigo: Codigo) => void;
  alMarcarCorrelativas: (codigos: readonly Codigo[]) => void;
}) {
  const marcada = marcadas.has(materia.codigo);
  const faltan = marcada
    ? correlativasSinMarcar(materia.codigo, plan, marcadas)
    : [];

  return (
    <li className="marcar__fila">
      <label className="marcar__casilla">
        <input
          type="checkbox"
          checked={marcada}
          onChange={() => {
            alAlternar(materia.codigo);
          }}
        />
        <Etiqueta>{materia.codigo}</Etiqueta>
        <span className="marcar__nombre">{materia.nombre}</span>
        <span className="marcar__creditos">{materia.creditos} cr</span>
      </label>
      {faltan.length > 0 ? (
        <button
          type="button"
          className="marcar__correlativas"
          onClick={() => {
            alMarcarCorrelativas(faltan);
          }}
        >
          marcar también sus correlativas ({faltan.join(", ")})
        </button>
      ) : null}
    </li>
  );
}

export interface PropsMarcarAprobadas {
  /** Plan de estudios cargado: de él sale la lista entera. */
  plan: Plan;
  /** Adónde ir al apretar «Listo»; por defecto, `#/plan`. */
  alTerminar?: () => void;
}

export function MarcarAprobadas({ plan, alTerminar }: PropsMarcarAprobadas) {
  const { plan: planUsuario, despachar } = usePlanUsuario();
  const [historia, setHistoria] = useState<Historia>(
    () => ({ ...planUsuario.historia }),
  );
  const [busqueda, setBusqueda] = useState("");

  const grupos = useMemo(() => agrupar(plan), [plan]);
  const visibles = useMemo(
    () => filtrar(grupos, busqueda),
    [grupos, busqueda],
  );

  const marcadas = useMemo(
    () =>
      new Set(
        Object.keys(historia).filter((codigo) => estaAprobada(historia, codigo)),
      ),
    [historia],
  );

  const creditos = creditosAprobados(historia, plan);
  const cuantas = itemsAprobados(historia, plan).length;

  const alternar = (codigo: Codigo) => {
    setHistoria((antes) =>
      estaAprobada(antes, codigo)
        ? sinMateria(antes, codigo)
        : conAprobadas(antes, [codigo]),
    );
  };

  const marcarCorrelativas = (codigos: readonly Codigo[]) => {
    setHistoria((antes) => conAprobadas(antes, codigos));
  };

  const listo = () => {
    despachar({ tipo: "cargarHistoria", historia });
    if (alTerminar === undefined) {
      navegar({ vista: "plan" });
    } else {
      alTerminar();
    }
  };

  return (
    <section className="marcar" aria-label="Marcar materias a mano">
      <div className="marcar__buscador">
        <Campo
          tipo="busqueda"
          etiqueta="Buscar materia o código"
          placeholder="Buscar materia o código"
          valor={busqueda}
          onCambio={setBusqueda}
        />
      </div>

      <div className="marcar__lista">
        {visibles.length === 0 ? (
          <p className="marcar__vacio">
            Ninguna materia del plan coincide con «{busqueda}».
          </p>
        ) : (
          visibles.map((grupo) => (
            <div className="marcar__grupo" key={grupo.id}>
              <h3 className="marcar__titulo">{grupo.titulo}</h3>
              <ul className="marcar__materias">
                {grupo.materias.map((materia) => (
                  <Fila
                    key={materia.codigo}
                    materia={materia}
                    marcadas={marcadas}
                    plan={plan}
                    alAlternar={alternar}
                    alMarcarCorrelativas={marcarCorrelativas}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="marcar__pie">
        <p className="marcar__contador" role="status">
          {creditos} créditos · {cuantas}{" "}
          {cuantas === 1 ? "materia" : "materias"}
        </p>
        <Boton variante="primario" onClick={listo}>
          Listo
        </Boton>
      </div>
    </section>
  );
}
