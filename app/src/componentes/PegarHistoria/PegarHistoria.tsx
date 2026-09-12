/**
 * Pegar la historia académica (13a).
 *
 * **No hay muestra real del formato del SGA** (gap G-02): por eso el parser del
 * motor es tolerante y por eso esta pantalla muestra siempre qué entendió y qué
 * no. Lo que no reconoció vuelve verbatim a la vista, para que el usuario lo
 * marque a mano en vez de perderlo en silencio.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useMemo, useState } from "react";

import type { Plan } from "../../contrato/tipos";
import { usePlanUsuario } from "../../estado/contexto";
import { parsearHistoria } from "../../motor";
import { navegar } from "../../rutas";
import { Boton, Nota } from "../primitivas";
import "./PegarHistoria.css";

/** Rótulo del área de pegado, tal cual el mockup. */
export const MARCADOR = "PEGAR ACÁ · una materia por línea";

/**
 * Las tres líneas de ejemplo del mockup, que van de marcador de posición.
 *
 * Son las del diseño y no se corrigen acá: `93.18 Álgebra Lineal` no pertenece
 * a S10-Rev23 y el parser la devuelve como no reconocida, que es justamente lo
 * que esta pantalla tiene que saber mostrar.
 */
export const EJEMPLO = [
  "93.18  Álgebra Lineal  9  Aprobada",
  "72.37  Base de Datos I  6  Aprobada",
  "72.11  Programación Imperativa  6  Aprobada",
].join("\n");

/** Un código de materia suelto en la línea; el mismo del motor. */
const CODIGO_EN_LINEA = /(?<!\d)\d{2}\.\d{2}(?!\d)/;

function plural(cantidad: number, singular: string, muchos: string): string {
  return cantidad === 1 ? singular : muchos;
}

export interface PropsPegarHistoria {
  /** Plan de estudios cargado; de él salen los códigos que se reconocen. */
  plan: Plan;
  /** Adónde ir cuando la historia queda cargada; por defecto, `#/plan`. */
  alTerminar?: () => void;
}

export function PegarHistoria({ plan, alTerminar }: PropsPegarHistoria) {
  const { despachar } = usePlanUsuario();
  const [texto, setTexto] = useState("");

  const leido = useMemo(() => parsearHistoria(texto, plan), [texto, plan]);

  const hayCodigos = CODIGO_EN_LINEA.test(texto);
  const entradas = Object.values(leido.reconocidas);
  const aprobadas = entradas.filter(
    (entrada) => entrada.estado === "aprobada",
  ).length;
  // «En curso» junta `cursando` y `regular`: las dos son materias empezadas y
  // todavía no aprobadas, y el resumen del mockup tiene una sola casilla.
  const enCurso = entradas.length - aprobadas;
  const sinReconocer = leido.noReconocidas.length;

  const usar = () => {
    despachar({ tipo: "cargarHistoria", historia: leido.reconocidas });
    if (alTerminar === undefined) {
      navegar({ vista: "plan" });
    } else {
      alTerminar();
    }
  };

  return (
    <section className="pegar" aria-label="Pegar historia académica">
      <div className="pegar__caja">
        <label className="pegar__marcador" htmlFor="pegar-historia">
          {MARCADOR}
        </label>
        <textarea
          id="pegar-historia"
          className="pegar__area"
          rows={6}
          spellCheck={false}
          placeholder={EJEMPLO}
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
          }}
        />
      </div>

      {hayCodigos ? (
        <>
          <p className="pegar__resumen" role="status">
            {aprobadas} {plural(aprobadas, "aprobada", "aprobadas")} ·{" "}
            {enCurso} en curso · {sinReconocer}{" "}
            {plural(sinReconocer, "línea", "líneas")} sin reconocer
          </p>

          {sinReconocer > 0 ? (
            <div className="pegar__sobrantes">
              <p className="pegar__ayuda">
                Estas líneas no las entendí. Marcá esas materias a mano:
              </p>
              <ul className="pegar__lista">
                {leido.noReconocidas.map((linea, indice) => (
                  // La línea cruda no es una clave única: puede repetirse.
                  <li className="pegar__linea" key={`${indice}-${linea}`}>
                    {linea}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="pegar__acciones">
            <Boton
              variante="primario"
              onClick={usar}
              disabled={entradas.length === 0}
            >
              Usar esta historia
            </Boton>
          </div>
        </>
      ) : (
        <Nota variante="linea">
          No encontré códigos de materia (por ejemplo 93.18)
        </Nota>
      )}
    </section>
  );
}
