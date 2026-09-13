/**
 * Banner de progreso: una fila compacta sobre el carrusel (rediseño de la
 * columna derecha de 13b). Créditos hacia el título principal, electivas,
 * progreso por minor y egreso estimado.
 *
 * Es lectura pura. Todos los números salen del motor (`progresoTitulos`,
 * `electivas`, `minors`) y ninguno se recalcula acá: el banner solo elige la
 * forma de mostrarlos. Informa sin competir con los calendarios: una sola
 * fila, tipografía chica, barras de 4 px.
 *
 * Todo se mide igual: lo **aprobado más lo planificado**, que es la lectura de
 * 13b —«184/192» con 147 aprobados— y la que hace que el egreso estimado
 * cierre con las barras que tiene al lado. Lo aprobado y lo planificado se
 * dibujan con dos tonos, para que se vea qué parte ya está y qué parte
 * todavía hay que cursar. El ✓ de un título alcanzado, en cambio, sigue siendo
 * cosa de lo aprobado: es lo que quiere decir «obtenible ya».
 *
 * Una diferencia deliberada con el mockup, que usó valores de relleno: dice
 * «ORIENTACIÓN … / 18» y el plan real los llama **minors**, con un mínimo de
 * **14 créditos** (hallazgo 1 de `05-plan-sprints.md`).
 */

import type { CSSProperties } from "react";

import type { Codigo, PeriodoId, Plan, PlanUsuario } from "../../contrato/tipos";
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
import { etiquetaCorta } from "../Carrusel";
import { Tooltip } from "../primitivas";
import "./PanelProgreso.css";

/** Créditos que representa cada segmento de la barra de electivas (13b). */
export const CREDITOS_POR_SEGMENTO = 3;

/** Cuántos códigos se nombran antes de cortar con «y N más». */
export const ITEMS_NOMBRADOS = 3;

/**
 * «94.52», «94.51 y 94.52», «12.09, 93.26, 93.58 y 25 más».
 *
 * La lista se corta porque quien recién empieza tiene 44 ítems pendientes y
 * enumerarlos todos no dice nada; los primeros sí, porque están ordenados por
 * código y el primero suele ser el que traba.
 */
export function listarItems(
  items: readonly Codigo[],
  nombrados = ITEMS_NOMBRADOS,
): string {
  const primeros = items.slice(0, nombrados);
  const resto = items.length - primeros.length;
  const lista =
    primeros.length <= 1
      ? (primeros[0] ?? "")
      : `${primeros.slice(0, -1).join(", ")} y ${String(primeros[primeros.length - 1])}`;
  if (resto === 0) {
    return lista;
  }
  return `${primeros.join(", ")} y ${String(resto)} más`;
}

/** «1 materia», «3 materias». */
function contarItems(cuantos: number): string {
  return `${String(cuantos)} ${cuantos === 1 ? "materia" : "materias"}`;
}

/**
 * Qué le falta al título, en partes: ítems, créditos y electivas.
 *
 * Los ítems van primero y no son opcionales: un título no se alcanza juntando
 * créditos, hay que **aprobar todos los ítems** de los ciclos que exige
 * (hallazgo 2), y son justo los de 0 créditos —Inglés II, Práctica Laboral— los
 * que dejaban el panel diciendo «faltan 0 créditos» con el título sin alcanzar.
 */
export function faltantesDelTitulo(
  titulo: ProgresoTitulo | undefined,
  faltanCreditos: number,
  faltanElectivas: number,
): string[] {
  const partes: string[] = [];
  if (titulo !== undefined && titulo.faltanItems.length > 0) {
    partes.push(
      `${contarItems(titulo.faltanItems.length)} (${listarItems(titulo.faltanItems)})`,
    );
  }
  if (faltanCreditos > 0) {
    const palabra = faltanCreditos === 1 ? "crédito" : "créditos";
    partes.push(`${String(faltanCreditos)} ${palabra}`);
  }
  if (faltanElectivas > 0) {
    partes.push(`${String(faltanElectivas)} de electivas`);
  }
  return partes;
}

/**
 * «Falta» o «Faltan», según la primera parte de la enumeración.
 *
 * La concordancia en español la manda el primer sustantivo: «Falta 1 materia y
 * 3 créditos», «Faltan 2 materias y 1 crédito».
 */
export function verboDeFaltantes(partes: readonly string[]): string {
  return partes[0]?.startsWith("1 ") === true ? "Falta" : "Faltan";
}

/** Une las partes: «A», «A y B», «A, B y C». */
export function unirPartes(partes: readonly string[]): string {
  if (partes.length <= 1) {
    return partes[0] ?? "";
  }
  return `${partes.slice(0, -1).join(", ")} y ${String(partes[partes.length - 1])}`;
}

export interface PropsBannerProgreso {
  plan: Plan;
  planUsuario: PlanUsuario;
  /**
   * Cuatrimestre desde el que se cuenta «con la carga actual, K cuatrimestres».
   * Por defecto, el primero que el usuario tiene abierto.
   */
  desde?: PeriodoId;
}

/** Alias histórico: el banner reemplazó al panel lateral. */
export type PropsPanelProgreso = PropsBannerProgreso;

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

/** «1.º 2028 · 4 cuatrimestres» o el aviso de que no alcanza. */
export function egresoEstimado(
  estimado: PeriodoId | null,
  desde: PeriodoId | null,
): string {
  if (estimado === null || desde === null) {
    return "Todavía no alcanza con lo planificado";
  }
  const cuantos = cuatrimestresHasta(desde, estimado);
  const palabra = cuantos === 1 ? "cuatrimestre" : "cuatrimestres";
  return `${etiquetaCorta(estimado)} · ${String(cuantos)} ${palabra}`;
}

/**
 * Barra de dos tonos: lo planificado por debajo, más largo y tenue; lo
 * aprobado encima. `color` es una custom property de estado o de minor.
 */
function Barra({
  aprobado,
  conPlanificado,
  listo,
  color,
}: {
  aprobado: number;
  conPlanificado: number;
  listo: boolean;
  color?: string;
}) {
  // Completo, el verde de estado manda sobre el color propio del bloque.
  const estilo =
    color === undefined || listo
      ? undefined
      : ({ "--barra-color": color } as CSSProperties);
  return (
    <span
      className={`banner-progreso__barra${
        listo ? " banner-progreso__barra--listo" : ""
      }`}
      style={estilo}
      aria-hidden="true"
    >
      <span
        className="banner-progreso__relleno banner-progreso__relleno--planificado"
        style={{ width: `${String(conPlanificado)}%` }}
      />
      <span
        className="banner-progreso__relleno"
        style={{ width: `${String(aprobado)}%` }}
      />
    </span>
  );
}

export function BannerProgreso({
  plan,
  planUsuario,
  desde,
}: PropsBannerProgreso) {
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

  const faltanCreditos =
    principal === undefined
      ? 0
      : Math.max(0, principal.requeridos - principal.creditos - planificados);
  const faltanElectivas = Math.max(
    0,
    electivas.requeridos - electivas.aprobados - electivas.planificados,
  );
  const partesQueFaltan = faltantesDelTitulo(
    principal,
    faltanCreditos,
    faltanElectivas,
  );
  const contados =
    principal === undefined ? 0 : principal.creditos + planificados;
  const requeridos = principal?.requeridos ?? 0;
  const alcanzado = principal?.alcanzado === true;

  const resumenDeTitulos = titulos
    .map((titulo) =>
      titulo.alcanzado
        ? `${titulo.nombre}: obtenible ya`
        : `${titulo.nombre}: ${String(titulo.creditos + planificados)} de ` +
          `${String(titulo.requeridos)} créditos`,
    )
    .join(" · ");

  const detalleDeFaltantes = alcanzado
    ? "Ya alcanzaste el título principal con lo que tenés aprobado."
    : partesQueFaltan.length === 0
      ? "Con lo planificado cubrís todo lo que pide el título principal."
      : `${verboDeFaltantes(partesQueFaltan)} ${unirPartes(partesQueFaltan)} ` +
        "para el título principal.";

  const egreso = egresoEstimado(principal?.estimado ?? null, referencia);

  return (
    <section className="banner-progreso" aria-label="Progreso">
      <Tooltip texto={`${resumenDeTitulos}. ${detalleDeFaltantes}`}>
        <div className="banner-progreso__bloque banner-progreso__bloque--creditos" tabIndex={0}>
          {/* En pantallas angostas el nombre del título cede su lugar a un
              rótulo corto; el nombre sigue en el tooltip. */}
          <span className="banner-progreso__rotulo banner-progreso__rotulo--largo">
            {principal?.nombre ?? "Créditos"}
          </span>
          <span className="banner-progreso__rotulo banner-progreso__rotulo--corto">
            Créditos
          </span>
          <span className="banner-progreso__valor">
            <span
              className={`banner-progreso__cifra${
                alcanzado ? " banner-progreso__cifra--listo" : ""
              }`}
            >
              {alcanzado ? `✓ ${String(requeridos)}` : `${String(contados)}/${String(requeridos)}`}
            </span>
            <span className="banner-progreso__unidad">cr</span>
            <Barra
              aprobado={
                alcanzado
                  ? 100
                  : porcentaje(principal?.creditos ?? 0, requeridos)
              }
              conPlanificado={alcanzado ? 100 : porcentaje(contados, requeridos)}
              listo={alcanzado}
            />
          </span>
        </div>
      </Tooltip>

      <Tooltip
        texto={
          `Electivas: ${String(electivas.aprobados)} créditos aprobados y ` +
          `${String(electivas.planificados)} planificados de ` +
          `${String(electivas.requeridos)}`
        }
      >
        <div className="banner-progreso__bloque" tabIndex={0}>
          <span className="banner-progreso__rotulo">Electivas</span>
          <span className="banner-progreso__valor">
            <span className="banner-progreso__cifra">
              {electivas.aprobados + electivas.planificados}/{electivas.requeridos}
            </span>
            <span className="banner-progreso__unidad">cr</span>
            <Barra
              aprobado={porcentaje(electivas.aprobados, electivas.requeridos)}
              conPlanificado={porcentaje(
                electivas.aprobados + electivas.planificados,
                electivas.requeridos,
              )}
              listo={electivas.aprobados >= electivas.requeridos}
              color="var(--acento)"
            />
          </span>
        </div>
      </Tooltip>

      <ul className="banner-progreso__minors" aria-label="Minors">
        {todosLosMinors.map((minor) => {
          const total = minor.creditos + minor.planificados;
          return (
            <li key={minor.sigla}>
              <Tooltip
                texto={
                  `${minor.nombre}: ${String(minor.creditos)} aprobados y ` +
                  `${String(minor.planificados)} planificados de ` +
                  `${String(minor.minimos)} créditos`
                }
              >
                <div
                  className="banner-progreso__minor"
                  tabIndex={0}
                  style={
                    {
                      "--minor-color": `var(--minor-${minor.sigla.toLowerCase()}, var(--linea-fuerte))`,
                    } as CSSProperties
                  }
                >
                  <span className="banner-progreso__sigla">{minor.sigla}</span>
                  <span className="banner-progreso__cifra">
                    {total}/{minor.minimos}
                  </span>
                  <Barra
                    aprobado={porcentaje(minor.creditos, minor.minimos)}
                    conPlanificado={porcentaje(total, minor.minimos)}
                    listo={minor.faltan === 0}
                    color="var(--minor-color)"
                  />
                </div>
              </Tooltip>
            </li>
          );
        })}
      </ul>

      <div className="banner-progreso__bloque banner-progreso__bloque--egreso">
        <span className="banner-progreso__rotulo">Egreso</span>
        <span
          className={`banner-progreso__cifra${
            principal?.estimado === undefined || principal.estimado === null
              ? " banner-progreso__cifra--pendiente"
              : ""
          }`}
        >
          {egreso}
        </span>
      </div>
    </section>
  );
}

/** Alias histórico: el panel lateral pasó a ser este banner. */
export const PanelProgreso = BannerProgreso;
