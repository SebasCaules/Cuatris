/**
 * «Materia bloqueada para este cuatrimestre» (13f).
 *
 * Explica el bloqueo renglón por renglón y termina con la salida: en qué
 * cuatrimestre se destraba y el botón que lo planifica ahí.
 *
 * Los motivos salen tal cual de `motivosBloqueo`; las correlativas que **sí**
 * están cumplidas se listan también (el mockup las muestra con ✓) y se deducen
 * por descarte, no con una regla propia. El período de destrabe lo da
 * `seDestrabaEn` mirando desde el mismo período que se está explicando.
 */

import type { Codigo, PeriodoId, Plan } from "../../contrato/tipos";
import { usePlanUsuario } from "../../estado/contexto";
import {
  creditosAlEmpezar,
  indiceDeMaterias,
  motivosBloqueo,
  primerPeriodoPlanificado,
  seDestrabaEn,
  type MotivoBloqueo,
} from "../../motor";
import { navegar } from "../../rutas";
import { etiquetaCorta } from "../Carrusel";
import { textoCreditos } from "../FichaMateria";
import { Boton, Etiqueta, Glifo } from "../primitivas";
import type { NombreGlifo } from "../primitivas";
import "./MotivosBloqueo.css";

/** Una fila de «POR QUÉ»: glifo, qué exige y cómo está hoy. */
interface Fila {
  clave: string;
  glifo: NombreGlifo;
  que: string;
  como: string;
}

export interface PropsMotivosBloqueo {
  codigo: Codigo;
  /** El cuatrimestre para el que está bloqueada. */
  periodo: PeriodoId;
  plan: Plan;
  /**
   * Se llama con el período de destrabe después de planificarla ahí, para que
   * el carrusel se mueva. Sin esto, solo se navega a `#/plan`.
   */
  alPlanificar?: (periodo: PeriodoId) => void;
}

export function MotivosBloqueo({
  codigo,
  periodo,
  plan,
  alPlanificar,
}: PropsMotivosBloqueo) {
  const { plan: planUsuario, despachar } = usePlanUsuario();

  const materias = indiceDeMaterias(plan);
  const materia = materias.get(codigo);
  if (materia === undefined) {
    return null;
  }

  const motivos = motivosBloqueo(codigo, periodo, planUsuario, plan);
  if (motivos.length === 0) {
    return null;
  }

  const planificadas = primerPeriodoPlanificado(planUsuario);
  const conMotivo = new Set(
    motivos.flatMap((motivo) =>
      motivo.tipo === "correlativa" ? [motivo.codigo] : [],
    ),
  );

  function nombreDe(otro: Codigo): string {
    return materias.get(otro)?.nombre ?? "";
  }

  /* El orden es el de 13f —créditos, correlativas que faltan, correlativas
     cumplidas—, no el de `motivosBloqueo`, que devuelve las correlativas
     primero. */
  const filas: Fila[] = [];
  for (const motivo of motivos) {
    if (motivo.tipo !== "creditos") {
      continue;
    }
    filas.push({
      clave: "creditos",
      glifo: "bloqueada",
      que: `Requiere ${String(motivo.requeridos)} créditos aprobados`,
      como: `tenés ${String(motivo.tienes)} al empezar`,
    });
  }
  for (const motivo of motivos) {
    if (motivo.tipo !== "correlativa") {
      continue;
    }
    filas.push({
      clave: `correlativa-${motivo.codigo}`,
      glifo: "bloqueada",
      que: `Correlativa ${motivo.codigo} ${nombreDe(motivo.codigo)}`.trim(),
      como:
        motivo.estado === "planificada_en" && motivo.periodo !== undefined
          ? `la cursás en ${etiquetaCorta(motivo.periodo)}`
          : "todavía no la aprobaste",
    });
  }
  for (const correlativa of materia.correlativas) {
    if (conMotivo.has(correlativa)) {
      continue;
    }
    const cuando = planificadas.get(correlativa);
    filas.push({
      clave: `correlativa-${correlativa}`,
      glifo: "aprobada",
      que: `Correlativa ${correlativa} ${nombreDe(correlativa)}`.trim(),
      como:
        planUsuario.historia[correlativa]?.estado === "aprobada" ||
        cuando === undefined
          ? "aprobada"
          : `la cursás en ${etiquetaCorta(cuando)}`,
    });
  }

  const destrabe = seDestrabaEn(codigo, planUsuario, plan, periodo);
  const enElPeriodo = (planUsuario.periodos[periodo] ?? []).some(
    (planificada) => planificada.codigo === codigo,
  );

  return (
    <section
      className="bloqueo"
      aria-label={`${codigo} bloqueada para ${etiquetaCorta(periodo)}`}
    >
      <h2 className="bloqueo__titulo">
        Materia bloqueada para este cuatrimestre
      </h2>

      <div className="bloqueo__materia">
        <div className="bloqueo__linea">
          <span className="bloqueo__nombre">
            {codigo} · {materia.nombre}
          </span>
          <Etiqueta>{materia.creditos} cr</Etiqueta>
        </div>
        <p className="bloqueo__estado">
          <Glifo nombre="bloqueada" />
          <span>Bloqueada para {etiquetaCorta(periodo)}</span>
        </p>
      </div>

      <div className="bloqueo__porque">
        <p className="bloqueo__rotulo">POR QUÉ</p>
        <ul className="bloqueo__filas">
          {filas.map((fila) => (
            <li className="bloqueo__fila" key={fila.clave}>
              <span className="bloqueo__glifo">
                <Glifo nombre={fila.glifo} />
              </span>
              <span className="bloqueo__que">{fila.que}</span>
              <span className="bloqueo__como">{fila.como}</span>
            </li>
          ))}
        </ul>

        {destrabe === null ? (
          <p className="bloqueo__sin-salida">
            No se destraba con lo planificado hasta ahora.
          </p>
        ) : (
          <div className="bloqueo__salida">
            <p className="bloqueo__salida-titulo">
              Se destraba en {etiquetaCorta(destrabe)}
            </p>
            <p className="bloqueo__salida-detalle">
              {textoDeSalida(
                motivos,
                creditosAlEmpezar(destrabe, planUsuario, plan),
              )}
            </p>
            <Boton
              variante="primario"
              onClick={() => {
                if (enElPeriodo) {
                  despachar({ tipo: "quitarMateria", periodo, codigo });
                }
                despachar({
                  tipo: "agregarMateria",
                  periodo: destrabe,
                  codigo,
                });
                alPlanificar?.(destrabe);
                navegar({ vista: "plan" });
              }}
            >
              Planificar en {etiquetaCorta(destrabe)}
            </Boton>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * «Con lo que ya está en el plan llegás a 205 créditos y 72.41 queda aprobada.»
 *
 * Se arma solo con los motivos que había: si no faltaban créditos, no se habla
 * de créditos; si no faltaban correlativas, no se las nombra.
 */
export function textoDeSalida(
  motivos: readonly MotivoBloqueo[],
  creditosAlDestrabe: number,
): string {
  const partes: string[] = [];
  if (motivos.some((motivo) => motivo.tipo === "creditos")) {
    partes.push(`llegás a ${textoCreditos(creditosAlDestrabe)}`);
  }
  const correlativas = motivos.flatMap((motivo) =>
    motivo.tipo === "correlativa" ? [motivo.codigo] : [],
  );
  if (correlativas.length === 1) {
    partes.push(`${correlativas[0] ?? ""} queda aprobada`);
  } else if (correlativas.length > 1) {
    partes.push(`${correlativas.join(", ")} quedan aprobadas`);
  }
  if (partes.length === 0) {
    return "Con lo que ya está en el plan deja de estar bloqueada.";
  }
  return `Con lo que ya está en el plan ${partes.join(" y ")}.`;
}
