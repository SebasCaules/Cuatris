/**
 * Columna derecha de 13b: títulos, electivas y minors.
 *
 * Es lectura pura. Todos los números salen del motor (`progresoTitulos`,
 * `electivas`, `minors`) y ninguno se recalcula acá: el panel solo elige la
 * forma de mostrarlos.
 *
 * Todo se mide igual: lo **aprobado más lo planificado**, que es la lectura de
 * 13b —«184/192» con 147 aprobados— y la que hace que la línea de cierre
 * («Faltan 59 créditos») cierre con las barras que tiene encima. Lo aprobado y
 * lo planificado se dibujan con dos tonos, como en la barra de electivas, para
 * que se vea qué parte ya está y qué parte todavía hay que cursar. El ✓ de un
 * título alcanzado, en cambio, sigue siendo cosa de lo aprobado: es lo que
 * quiere decir «obtenible ya».
 *
 * Una diferencia deliberada con el mockup, que usó valores de relleno: dice
 * «ORIENTACIÓN … / 18» y el plan real los llama **minors**, con un mínimo de
 * **14 créditos** (hallazgo 1 de `05-plan-sprints.md`).
 */

import type { PeriodoId, Plan, PlanUsuario } from "../../contrato/tipos";
import {
  compararPeriodos,
  electivas as calcularElectivas,
  indiceDeMaterias,
  itemsAprobados,
  minors as calcularMinors,
  primerPeriodoDelPlan,
  primerPeriodoPlanificado,
  progresoTitulos,
  siguientePeriodo,
  type ProgresoTitulo,
} from "../../motor";
import "./PanelProgreso.css";

/** Créditos que representa cada segmento de la barra de electivas (13b). */
export const CREDITOS_POR_SEGMENTO = 3;

export interface PropsPanelProgreso {
  plan: Plan;
  planUsuario: PlanUsuario;
  /**
   * Cuatrimestre desde el que se cuenta «con la carga actual, K cuatrimestres».
   * Por defecto, el primero que el usuario tiene abierto.
   */
  desde?: PeriodoId;
}

/**
 * Cuántos cuatrimestres hay que cursar, contando desde `desde` (que es el que
 * se está por cursar y no cuenta), hasta terminar `hasta` inclusive.
 *
 * `2026-1C` → `2028-1C` son 4: el mismo número que muestra 13b.
 */
export function cuatrimestresHasta(desde: PeriodoId, hasta: PeriodoId): number {
  if (compararPeriodos(hasta, desde) <= 0) {
    return 0;
  }
  let cuenta = 0;
  let actual = desde;
  while (compararPeriodos(actual, hasta) < 0) {
    actual = siguientePeriodo(actual);
    cuenta += 1;
  }
  return cuenta;
}

/** «Con la carga actual, 4 cuatrimestres.» o el aviso de que no alcanza. */
export function colaDeCarga(
  estimado: PeriodoId | null,
  desde: PeriodoId | null,
): string {
  if (estimado === null || desde === null) {
    return "Todavía no alcanza con lo planificado.";
  }
  const cuantos = cuatrimestresHasta(desde, estimado);
  const palabra = cuantos === 1 ? "cuatrimestre" : "cuatrimestres";
  return `Con la carga actual, ${String(cuantos)} ${palabra}.`;
}

function porcentaje(parte: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (parte / total) * 100));
}

/**
 * Créditos de lo que el usuario planificó y todavía no aprobó.
 *
 * Sale del motor (`primerPeriodoPlanificado` cuenta una materia una sola vez,
 * en el primer cuatrimestre en el que aparece) y es lo que separa el «147» de
 * lo aprobado del «184» que muestra 13b. Una materia que no está en el plan de
 * estudios —93.18 en el corpus— no suma créditos.
 */
export function creditosPlanificados(
  planUsuario: PlanUsuario,
  plan: Plan,
): number {
  const materias = indiceDeMaterias(plan);
  const aprobadas = new Set(itemsAprobados(planUsuario.historia, plan));
  let total = 0;
  for (const codigo of primerPeriodoPlanificado(planUsuario).keys()) {
    if (aprobadas.has(codigo)) {
      continue;
    }
    total += materias.get(codigo)?.creditos ?? 0;
  }
  return total;
}

function Titulo({
  titulo,
  planificados,
}: {
  titulo: ProgresoTitulo;
  planificados: number;
}) {
  const contados = titulo.creditos + planificados;
  const aprobado = titulo.alcanzado
    ? 100
    : porcentaje(titulo.creditos, titulo.requeridos);
  const conPlanificado = titulo.alcanzado
    ? 100
    : porcentaje(contados, titulo.requeridos);
  return (
    <div className="panel-progreso__titulo">
      <div className="panel-progreso__fila">
        <span className="panel-progreso__nombre">{titulo.nombre}</span>
        <span
          className={`panel-progreso__cifra${
            titulo.alcanzado ? " panel-progreso__cifra--listo" : ""
          }`}
        >
          {titulo.alcanzado
            ? `✓ ${String(titulo.requeridos)}`
            : `${String(contados)}/${String(titulo.requeridos)}`}
        </span>
      </div>
      <div className="panel-progreso__barra">
        {/* Primero lo planificado, tenue y más largo; encima lo aprobado. */}
        <div
          className="panel-progreso__barra-relleno panel-progreso__barra-relleno--planificado"
          style={{ width: `${String(conPlanificado)}%` }}
        />
        <div
          className={`panel-progreso__barra-relleno${
            titulo.alcanzado ? " panel-progreso__barra-relleno--listo" : ""
          }`}
          style={{ width: `${String(aprobado)}%` }}
        />
      </div>
      {titulo.alcanzado ? (
        <p className="panel-progreso__pie">obtenible ya</p>
      ) : null}
    </div>
  );
}

export function PanelProgreso({
  plan,
  planUsuario,
  desde,
}: PropsPanelProgreso) {
  const titulos = progresoTitulos(planUsuario, plan);
  const planificados = creditosPlanificados(planUsuario, plan);
  const electivas = calcularElectivas(planUsuario, plan);
  const todosLosMinors = calcularMinors(planUsuario, plan);
  const referencia = desde ?? primerPeriodoDelPlan(planUsuario);

  // El título principal es el que el plan marca como tal; si el plan no marca
  // ninguno, el último de la lista, que es el más exigente.
  const idPrincipal =
    plan.titulos.find((titulo) => titulo.tipo === "principal")?.id ??
    plan.titulos[plan.titulos.length - 1]?.id;
  const principal =
    titulos.find((titulo) => titulo.id === idPrincipal) ??
    titulos[titulos.length - 1];

  const segmentos = Math.ceil(electivas.requeridos / CREDITOS_POR_SEGMENTO);
  const aprobados = Math.floor(electivas.aprobados / CREDITOS_POR_SEGMENTO);
  const conPlanificados = Math.floor(
    (electivas.aprobados + electivas.planificados) / CREDITOS_POR_SEGMENTO,
  );

  // Solo los minors en los que el usuario ya avanzó; si no avanzó en ninguno,
  // se muestran los cuatro, que es la situación de quien recién empieza.
  const conCreditos = todosLosMinors.filter(
    (minor) => minor.creditos + minor.planificados > 0,
  );
  const visibles = conCreditos.length > 0 ? conCreditos : todosLosMinors;

  const faltanCreditos =
    principal === undefined
      ? 0
      : Math.max(0, principal.requeridos - principal.creditos - planificados);
  const faltanElectivas = Math.max(
    0,
    electivas.requeridos - electivas.aprobados - electivas.planificados,
  );

  return (
    <section className="panel-progreso" aria-label="Progreso">
      <h2 className="panel-progreso__encabezado">Progreso</h2>

      {titulos.map((titulo) => (
        <Titulo key={titulo.id} titulo={titulo} planificados={planificados} />
      ))}

      <hr className="panel-progreso__separador" />

      <h3 className="panel-progreso__subtitulo">
        Electivas · {electivas.aprobados + electivas.planificados} de{" "}
        {electivas.requeridos} cr
      </h3>
      <div
        className="panel-progreso__segmentos"
        role="img"
        aria-label={
          `Electivas: ${String(electivas.aprobados)} créditos aprobados y ` +
          `${String(electivas.planificados)} planificados de ` +
          `${String(electivas.requeridos)}`
        }
      >
        {Array.from({ length: segmentos }, (_valor, indice) => {
          const estado =
            indice < aprobados
              ? "aprobado"
              : indice < conPlanificados
                ? "planificado"
                : "vacio";
          return (
            <span
              className={`panel-progreso__segmento panel-progreso__segmento--${estado}`}
              key={indice}
            />
          );
        })}
      </div>

      <h3 className="panel-progreso__subtitulo panel-progreso__subtitulo--mono">
        MINORS
      </h3>
      <ul className="panel-progreso__minors">
        {visibles.map((minor) => (
          <li className="panel-progreso__minor" key={minor.sigla}>
            <span className="panel-progreso__minor-nombre">{minor.nombre}</span>
            <span className="panel-progreso__cifra">
              {minor.creditos + minor.planificados} / {minor.minimos} cr
            </span>
          </li>
        ))}
      </ul>

      <hr className="panel-progreso__separador" />

      <p className="panel-progreso__resumen">
        {principal !== undefined && principal.alcanzado ? (
          "✓ Ya alcanzaste el título principal con lo que tenés aprobado."
        ) : (
          <>
            Faltan <strong>{faltanCreditos} créditos</strong> y {faltanElectivas}{" "}
            de electivas para el título principal.{" "}
            {colaDeCarga(principal?.estimado ?? null, referencia)}
          </>
        )}
      </p>
    </section>
  );
}
