/**
 * 13d — elegir comisión: la lista comparable a la izquierda y el cuatrimestre
 * recalculado a la derecha.
 *
 * El modal **no decide nada de dominio**. El orden sale de `ordenarComisiones`
 * (hallazgo 7: sin choques, cupo disponible, menos cambios de sede, id) y lo
 * que se ve en la vista previa sale de `choques` y `cambiosDeSede` corridos
 * sobre un plan simulado: el del usuario con esta materia puesta en la comisión
 * que está bajo el cursor. Simular en vez de recalcular a mano es lo que
 * garantiza que la vista previa y la pantalla 13b digan lo mismo.
 *
 * Elegir una comisión llena está permitido: el cupo del SGA es de la captura,
 * no del momento de la inscripción, así que se advierte y no se bloquea.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";

import type {
  Codigo,
  Comision,
  Horarios,
  PeriodoId,
  PlanUsuario,
} from "../../contrato/tipos";
import { colorAsignado } from "../../estado/planUsuario";
import { usePlanUsuario } from "../../estado/contexto";
import {
  cambiosDeSede,
  choques,
  cupoLleno,
  cursoDe,
  ordenarComisiones,
  type Choque,
} from "../../motor";
import { etiquetaCorta } from "../Carrusel";
import { GrillaSemanal, type MateriaEnGrilla } from "../GrillaSemanal";
import { Boton, Glifo, Modal } from "../primitivas";
import {
  consecuenciasDeComision,
  etiquetaDelColapsado,
  lineaDeBloque,
  resultadoDeVistaPrevia,
  sedesDeComision,
  subtituloDelModal,
  textoDeCupo,
  textoDeFechas,
  type Segmento,
} from "./textos";
import "./ModalComisiones.css";

/** Cuántas comisiones se ven sin desplegar el colapsado (13d). */
export const VISIBLES = 4;

/** La grilla de la vista previa va a 15 px por hora, como en el mockup. */
const HORA_PX = 15;

export interface PropsModalComisiones {
  periodo: PeriodoId;
  codigo: Codigo;
  /** La otra materia del choque, cuando se llega desde «Resolver» (13h). */
  fijada?: Codigo;
  alCerrar: () => void;
  /** Horarios del período; los trae quien abre el modal. */
  horarios: Horarios;
  /** `abreviaciones.json`: código → nombre corto para los bloques. */
  abreviaciones?: Readonly<Record<Codigo, string>>;
  /** `rectorado` → `Rectorado`; por defecto se muestra el id tal cual. */
  nombreDeSede?: (id: string) => string;
  /** Nombre de la materia cuando el período no publica su curso. */
  nombre?: string;
}

/** Una comisión con todo lo que la tarjeta de la lista necesita mostrar. */
interface Evaluada {
  comision: Comision;
  /** Choques de **esta** materia si se eligiera esta comisión. */
  choques: Choque[];
  /** Todos los choques del cuatrimestre simulado; van a la grilla. */
  choquesDelPeriodo: Choque[];
  consecuencias: Segmento[];
  cupo: string | null;
  llena: boolean;
}

function tocaA(choque: Choque, codigo: Codigo): boolean {
  return choque.a.codigo === codigo || choque.b.codigo === codigo;
}

function esDelPar(choque: Choque, uno: Codigo, otro: Codigo): boolean {
  return tocaA(choque, uno) && tocaA(choque, otro);
}

/** El plan del usuario con `codigo` puesto en `comision` dentro de `periodo`. */
function conComision(
  plan: PlanUsuario,
  periodo: PeriodoId,
  codigo: Codigo,
  comision: string,
): PlanUsuario {
  const resto = (plan.periodos[periodo] ?? []).filter(
    (materia) => materia.codigo !== codigo,
  );
  return {
    ...plan,
    periodos: { ...plan.periodos, [periodo]: [...resto, { codigo, comision }] },
  };
}

function Linea({ segmentos }: { segmentos: readonly Segmento[] }) {
  return (
    <>
      {segmentos.map((segmento, indice) => (
        <Fragment key={segmento.texto}>
          {indice === 0 ? null : (
            <span className="comisiones__punto" aria-hidden="true">
              {" · "}
            </span>
          )}
          <Glifo nombre={segmento.glifo} etiqueta={segmento.etiqueta} />{" "}
          <span
            className={`comisiones__consecuencia${
              segmento.glifo === "aprobada"
                ? " comisiones__consecuencia--bien"
                : ""
            }`}
          >
            {segmento.texto}
          </span>
        </Fragment>
      ))}
    </>
  );
}

export function ModalComisiones({
  periodo,
  codigo,
  fijada,
  alCerrar,
  horarios,
  abreviaciones = {},
  nombreDeSede = (id) => id,
  nombre,
}: PropsModalComisiones) {
  const { plan, despachar } = usePlanUsuario();
  const [desplegada, setDesplegada] = useState(false);
  const [sobrevolada, setSobrevolada] = useState<string | null>(null);

  const curso = useMemo(
    () => cursoDe(codigo, horarios),
    [codigo, horarios],
  );

  /** La comisión que el usuario ya tiene elegida en este período, si la hay. */
  const elegida = (plan.periodos[periodo] ?? []).find(
    (materia) => materia.codigo === codigo,
  )?.comision;

  /** El choque que hay hoy, antes de tocar nada: el que «desaparece» o «sigue». */
  const antes = useMemo<Choque | null>(() => {
    const actuales = choques(periodo, plan, horarios).filter((choque) =>
      fijada === undefined
        ? tocaA(choque, codigo)
        : esDelPar(choque, codigo, fijada),
    );
    return actuales[0] ?? null;
  }, [periodo, plan, horarios, codigo, fijada]);

  const evaluadas = useMemo<Evaluada[]>(() => {
    if (curso === null) {
      return [];
    }
    const porId = new Map(
      curso.comisiones.map((comision) => [comision.id, comision]),
    );
    return ordenarComisiones(codigo, periodo, plan, horarios).flatMap(
      (orden) => {
        const comision = porId.get(orden.id);
        if (comision === undefined) {
          return [];
        }
        const simulado = conComision(plan, periodo, codigo, comision.id);
        const choquesDelPeriodo = choques(periodo, simulado, horarios);
        const propios = choquesDelPeriodo.filter((choque) =>
          tocaA(choque, codigo),
        );
        const llena = cupoLleno(comision);
        return [
          {
            comision,
            choques: propios,
            choquesDelPeriodo,
            consecuencias: consecuenciasDeComision({
              choques: propios,
              sedes: sedesDeComision(comision),
              llena,
              sinHorario: comision.bloques.length === 0,
            }),
            cupo: textoDeCupo(comision),
            llena,
          },
        ];
      },
    );
  }, [curso, codigo, periodo, plan, horarios]);

  /** Sin cursor encima: la elegida, y si no hay, la primera del orden. */
  const previa =
    evaluadas.find((candidata) => candidata.comision.id === sobrevolada) ??
    evaluadas.find((candidata) => candidata.comision.id === elegida) ??
    evaluadas[0] ??
    null;

  const bloquesDeLaPrevia = useMemo<MateriaEnGrilla[]>(() => {
    if (previa === null) {
      return [];
    }
    const simulado = conComision(plan, periodo, codigo, previa.comision.id);
    return (simulado.periodos[periodo] ?? []).flatMap((materia) => {
      if (materia.comision === undefined) {
        return [];
      }
      const suCurso = cursoDe(materia.codigo, horarios);
      const suComision = suCurso?.comisiones.find(
        (candidata) => candidata.id === materia.comision,
      );
      if (suCurso === null || suComision === undefined) {
        return [];
      }
      return [
        {
          codigo: materia.codigo,
          nombre: suCurso.nombre,
          abreviacion: abreviaciones[materia.codigo] ?? suCurso.nombre,
          color: colorAsignado(plan.colores, materia.codigo),
          comision: suComision.id,
          bloques: suComision.bloques,
        },
      ];
    });
  }, [previa, plan, periodo, codigo, horarios, abreviaciones]);

  const sedesDeLaPrevia = useMemo(() => {
    if (previa === null) {
      return [];
    }
    return cambiosDeSede(
      periodo,
      conComision(plan, periodo, codigo, previa.comision.id),
      horarios,
    );
  }, [previa, plan, periodo, codigo, horarios]);

  // Sin curso publicado el nombre puede no existir en ninguna fuente; entonces
  // el título es solo el código, y no se inventa nada.
  const comoSeLlama = curso?.nombre ?? nombre;
  const titulo =
    comoSeLlama === undefined
      ? `${codigo} · elegir comisión`
      : `${codigo} ${comoSeLlama} · elegir comisión`;

  function agregarSiFalta(): void {
    if (elegida === undefined && !(plan.periodos[periodo] ?? []).some(
      (materia) => materia.codigo === codigo,
    )) {
      // `agregarMateria` ya reserva el color de la materia (uno por carrera).
      despachar({ tipo: "agregarMateria", periodo, codigo });
    }
  }

  function elegir(comision: string): void {
    agregarSiFalta();
    despachar({ tipo: "elegirComision", periodo, codigo, comision });
    alCerrar();
  }

  function agregarSinComision(): void {
    agregarSiFalta();
    alCerrar();
  }

  let cuerpo: ReactNode;
  if (evaluadas.length === 0) {
    cuerpo = (
      <div className="comisiones__vacio">
        <p className="comisiones__aviso">
          {curso === null
            ? `Esta materia no aparece en los horarios de ${etiquetaCorta(periodo)}.`
            : "Todavía no publicaron las comisiones de esta materia."}
        </p>
        <p className="comisiones__aviso-secundario">
          Podés agregarla igual y elegir comisión cuando salgan los horarios.
        </p>
        <Boton variante="primario" onClick={agregarSinComision}>
          Agregar sin comisión
        </Boton>
      </div>
    );
  } else {
    const alaVista = desplegada ? evaluadas : evaluadas.slice(0, VISIBLES);
    const ocultas = desplegada ? [] : evaluadas.slice(VISIBLES);
    cuerpo = (
      <div className="comisiones">
        <div className="comisiones__lista">
          {alaVista.map((evaluada) => {
            const esLaElegida = evaluada.comision.id === elegida;
            return (
              <article
                className={`comisiones__tarjeta${
                  esLaElegida ? " comisiones__tarjeta--elegida" : ""
                }`}
                key={evaluada.comision.id}
                aria-label={`Comisión ${evaluada.comision.id}`}
                onMouseEnter={() => {
                  setSobrevolada(evaluada.comision.id);
                }}
                onMouseLeave={() => {
                  setSobrevolada(null);
                }}
                onFocus={() => {
                  setSobrevolada(evaluada.comision.id);
                }}
                onBlur={() => {
                  setSobrevolada(null);
                }}
              >
                <header className="comisiones__cabecera">
                  <h3 className="comisiones__nombre">
                    Comisión {evaluada.comision.id}
                    {textoDeFechas(evaluada.comision) === null ? null : (
                      <span className="comisiones__fechas">
                        {textoDeFechas(evaluada.comision)}
                      </span>
                    )}
                  </h3>
                  {evaluada.cupo === null ? null : (
                    <p
                      className={`comisiones__cupo${
                        evaluada.llena ? " comisiones__cupo--llena" : ""
                      }`}
                    >
                      {evaluada.llena ? (
                        <>
                          <Glifo nombre="cupoLleno" />{" "}
                        </>
                      ) : null}
                      <span className="comisiones__cupo-texto">
                        {evaluada.cupo}
                      </span>
                    </p>
                  )}
                </header>

                <ul className="comisiones__horario">
                  {evaluada.comision.bloques.map((bloque) => (
                    <li
                      className="comisiones__bloque"
                      key={`${bloque.dia}-${bloque.desde}-${bloque.aulas.join("-")}`}
                    >
                      {lineaDeBloque(bloque, nombreDeSede)}
                    </li>
                  ))}
                </ul>

                <footer className="comisiones__pie">
                  <p className="comisiones__consecuencias">
                    <Linea segmentos={evaluada.consecuencias} />
                  </p>
                  <Boton
                    variante={esLaElegida ? "primario" : "secundario"}
                    onClick={() => {
                      elegir(evaluada.comision.id);
                    }}
                  >
                    {esLaElegida ? "Elegida" : "Elegir"}
                  </Boton>
                </footer>
              </article>
            );
          })}

          {ocultas.length === 0 ? null : (
            <button
              type="button"
              className="comisiones__mas"
              onClick={() => {
                setDesplegada(true);
              }}
            >
              {etiquetaDelColapsado(
                ocultas.map((evaluada) => evaluada.comision.id),
              )}
            </button>
          )}
        </div>

        {previa === null ? null : (
          <aside
            className="comisiones__previa"
            aria-label={`Vista previa con la comisión ${previa.comision.id}`}
          >
            <h3 className="comisiones__previa-titulo">
              Tu {etiquetaCorta(periodo)} con la comisión {previa.comision.id}
            </h3>
            <p className="comisiones__resultado">
              <Linea
                segmentos={[
                  resultadoDeVistaPrevia(
                    previa.choquesDelPeriodo.filter((choque) =>
                      fijada === undefined
                        ? tocaA(choque, codigo)
                        : esDelPar(choque, codigo, fijada),
                    ),
                    antes,
                  ),
                ]}
              />
            </p>
            <GrillaSemanal
              bloques={bloquesDeLaPrevia}
              choques={previa.choquesDelPeriodo}
              cambiosDeSede={sedesDeLaPrevia}
              horaPx={HORA_PX}
              nombreDeSede={nombreDeSede}
            />
          </aside>
        )}
      </div>
    );
  }

  return (
    <Modal
      abierto
      ancho={1060}
      titulo={titulo}
      subtitulo={
        evaluadas.length === 0
          ? undefined
          : subtituloDelModal(evaluadas.length, etiquetaCorta(periodo))
      }
      onCerrar={alCerrar}
    >
      {cuerpo}
    </Modal>
  );
}
