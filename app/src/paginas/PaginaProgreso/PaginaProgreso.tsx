/**
 * Pestaña «Progreso» (13i): títulos, electivas y minors, en versión de lectura.
 *
 * Es la misma información del panel derecho de 13b pero con espacio para el
 * detalle: cada título con su estimado, cada electiva con su estado y cada
 * minor con lo que le falta. No edita nada; todo sale del motor.
 *
 * Como en el panel, el mockup dice «Orientaciones … / 18» y el plan real dice
 * **minors** con mínimo **14 créditos** (hallazgo 1 de `05-plan-sprints.md`).
 */

import { useMemo } from "react";

import { etiquetaCorta } from "../../componentes/Carrusel";
import { creditosPlanificados } from "../../componentes/PanelProgreso";
import {
  PantallaCargando,
  PantallaError,
} from "../../componentes/PantallaEstado";
import type { Codigo, Plan, PlanUsuario } from "../../contrato/tipos";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import {
  electivas as calcularElectivas,
  indiceDeMaterias,
  itemsAprobados,
  minors as calcularMinors,
  progresoTitulos,
  type ProgresoMinor,
  type ProgresoTitulo,
} from "../../motor";
import "./PaginaProgreso.css";

/** Cómo llama el plan a cada tipo de título; es lo que muestra 13i. */
const TIPO: Record<string, string> = {
  intermedio: "intermedio",
  principal: "principal",
};

function porcentaje(parte: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (parte / total) * 100));
}

/**
 * Cuántas electivas más hacen falta para cerrar el minor.
 *
 * El tamaño de «una electiva» no se inventa ni se fija en 3: es el valor **más
 * frecuente** entre las electivas del minor que todavía no están contadas (en
 * S10-Rev23 son 3 créditos en los cuatro minors). Se usa la moda y no el mínimo
 * porque un par de electivas de 1 crédito darían una cuenta absurda —«14
 * electivas más»— que no describe ningún recorrido real. Empate: el valor más
 * grande, que es la cuenta más prudente. Sin electivas libres no hay cuenta
 * posible y la línea no se muestra.
 */
export function electivasQueFaltan(
  minor: ProgresoMinor,
  plan: Plan,
  planUsuario: PlanUsuario,
): number | null {
  const faltan = minor.minimos - minor.creditos - minor.planificados;
  if (faltan <= 0) {
    return null;
  }
  const contadas = new Set<Codigo>([
    ...itemsAprobados(planUsuario.historia, plan),
    ...Object.values(planUsuario.periodos).flatMap((lista) =>
      lista.map((materia) => materia.codigo),
    ),
  ]);
  const cuantas = new Map<number, number>();
  for (const materia of plan.materias) {
    if (
      !materia.vigente ||
      !materia.minors.includes(minor.sigla) ||
      contadas.has(materia.codigo) ||
      materia.creditos <= 0
    ) {
      continue;
    }
    cuantas.set(materia.creditos, (cuantas.get(materia.creditos) ?? 0) + 1);
  }
  let habitual = 0;
  let repeticiones = 0;
  for (const [creditos, veces] of cuantas) {
    if (veces > repeticiones || (veces === repeticiones && creditos > habitual)) {
      habitual = creditos;
      repeticiones = veces;
    }
  }
  if (habitual === 0) {
    return null;
  }
  return Math.ceil(faltan / habitual);
}

/**
 * «faltan 59 cr · estimado 1.º 2028», o el estado de un título alcanzado.
 *
 * `planificados` son los créditos que el usuario planificó y todavía no aprobó:
 * la cuenta de 13i («184 / 192 cr», «faltan 8 cr») es contra lo aprobado más lo
 * planificado, igual que el panel de 13b.
 */
export function pieDelTitulo(
  titulo: ProgresoTitulo,
  planificados = 0,
): string {
  if (titulo.alcanzado) {
    return "alcanzado con lo aprobado";
  }
  const faltan = Math.max(
    0,
    titulo.requeridos - titulo.creditos - planificados,
  );
  const base = `faltan ${String(faltan)} cr`;
  if (titulo.estimado === null) {
    return `${base} · todavía no alcanza con lo planificado`;
  }
  return `${base} · estimado ${etiquetaCorta(titulo.estimado)}`;
}

export interface PropsProgresoConDatos {
  plan: Plan;
  planUsuario: PlanUsuario;
}

/** 13i con el plan ya cargado. `PaginaProgreso` es esto más la carga. */
export function ProgresoConDatos({ plan, planUsuario }: PropsProgresoConDatos) {
  const titulos = progresoTitulos(planUsuario, plan);
  const planificados = creditosPlanificados(planUsuario, plan);
  const electivas = calcularElectivas(planUsuario, plan);
  const minors = calcularMinors(planUsuario, plan);
  const materias = indiceDeMaterias(plan);
  const total = electivas.aprobados + electivas.planificados;

  return (
    <div className="progreso">
      <section className="progreso__columna" aria-label="Títulos y electivas">
        <h2 className="progreso__encabezado">Títulos</h2>

        {titulos.map((titulo) => {
          const tipoDelPlan = plan.titulos.find(
            (candidato) => candidato.id === titulo.id,
          )?.tipo;
          const contados = titulo.creditos + planificados;
          const ancho = titulo.alcanzado
            ? 100
            : porcentaje(contados, titulo.requeridos);
          return (
            <div className="progreso__titulo" key={titulo.id}>
              <div className="progreso__fila">
                <span className="progreso__nombre">
                  {titulo.nombre}{" "}
                  {tipoDelPlan === undefined ? null : (
                    <span className="progreso__tipo">
                      {TIPO[tipoDelPlan] ?? tipoDelPlan}
                    </span>
                  )}
                </span>
                <span
                  className={`progreso__cifra${
                    titulo.alcanzado ? " progreso__cifra--listo" : ""
                  }`}
                >
                  {titulo.alcanzado
                    ? "✓ obtenible ya"
                    : `${String(contados)} / ${String(titulo.requeridos)} cr`}
                </span>
              </div>
              <div className="progreso__barra">
                <div
                  className={`progreso__barra-relleno${
                    titulo.alcanzado ? " progreso__barra-relleno--listo" : ""
                  }`}
                  style={{ width: `${String(ancho)}%` }}
                />
              </div>
              <p className="progreso__pie">
                {pieDelTitulo(titulo, planificados)}
              </p>
            </div>
          );
        })}

        <div className="progreso__seccion">
          <h2 className="progreso__encabezado">
            Electivas · {total} de {electivas.requeridos} créditos
          </h2>
          {electivas.lista.length === 0 ? (
            <p className="progreso__vacio">
              Todavía no cargaste ninguna electiva.
            </p>
          ) : (
            <ul className="progreso__electivas">
              {electivas.lista.map((electiva) => (
                <li className="progreso__electiva" key={electiva.codigo}>
                  <span className="progreso__codigo">{electiva.codigo}</span>
                  <span className="progreso__materia">
                    {materias.get(electiva.codigo)?.nombre ?? electiva.codigo}
                  </span>
                  <span className="progreso__cifra">
                    {electiva.creditos} cr
                  </span>
                  <span
                    className={`progreso__estado${
                      electiva.estado === "aprobada"
                        ? " progreso__estado--aprobada"
                        : ""
                    }`}
                  >
                    {electiva.estado === "aprobada"
                      ? "✓ aprobada"
                      : "◇ planificada"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="progreso__minors" aria-label="Minors">
        <h2 className="progreso__encabezado">Minors</h2>
        <p className="progreso__intro">
          Opcionales. Se obtienen concentrando electivas en un área; podés
          perseguir uno o ninguno.
        </p>
        {minors.map((minor) => {
          const cuenta = minor.creditos + minor.planificados;
          const faltan = electivasQueFaltan(minor, plan, planUsuario);
          return (
            <div
              className={`progreso__minor${
                cuenta > 0 ? " progreso__minor--empezado" : ""
              }`}
              key={minor.sigla}
            >
              <div className="progreso__fila">
                <span className="progreso__nombre">{minor.nombre}</span>
                <span className="progreso__cifra">
                  {cuenta} / {minor.minimos} cr
                </span>
              </div>
              <div className="progreso__barra progreso__barra--minor">
                <div
                  className="progreso__barra-relleno progreso__barra-relleno--minor"
                  style={{
                    width: `${String(porcentaje(cuenta, minor.minimos))}%`,
                  }}
                />
              </div>
              {/* «n electivas más y queda» solo en los minors empezados, como
                  en 13i: en uno en 0/14 no dice nada que el 0 no diga ya. */}
              {faltan === null || cuenta === 0 ? null : (
                <p className="progreso__pie">
                  {faltan === 1
                    ? "1 electiva más y queda"
                    : `${String(faltan)} electivas más y queda`}
                </p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** 13i completa: carga el plan publicado y lo cruza con lo del navegador. */
export function PaginaProgreso() {
  const { plan: planUsuario } = usePlanUsuario();
  const hoy = useMemo(() => hoyIso(), []);
  const datos = useDatos(planUsuario.plan, hoy);

  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return (
    <ProgresoConDatos plan={datos.datos.plan} planUsuario={planUsuario} />
  );
}
