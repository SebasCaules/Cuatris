/**
 * Ficha de materia (13e): todo lo que se sabe de una materia en un
 * cuatrimestre, en una sola caja de 560 px.
 *
 * La ficha **no calcula dominio**: el estado, las correlativas, lo que habilita
 * y el cupo salen del motor (`estadoMateria`, `habilita`, `cupoLleno`) y de los
 * horarios del período tal como los publica el contrato. Lo único que hace acá
 * es elegir el período de referencia cuando quien la usa no lo fija: primero
 * donde está planificada, después el del archivo de horarios, y por último el
 * primero del plan del usuario.
 *
 * El plan del usuario y las acciones vienen del contexto (`usePlanUsuario`);
 * el plan de estudios y los horarios, por props, porque son datos cargados.
 */

import { useId, useState, type CSSProperties } from "react";

import type {
  Bloque,
  Codigo,
  Comision,
  Dia,
  Horarios,
  Modalidad,
  PeriodoId,
  Plan,
} from "../../contrato/tipos";
import { usePlanUsuario } from "../../estado/contexto";
import { colorAsignado } from "../../estado/planUsuario";
import {
  cupoLleno,
  cursoDe,
  estadoMateria,
  habilita,
  indiceDeMaterias,
  primerPeriodoDelPlan,
  primerPeriodoPlanificado,
  type EstadoMateria,
} from "../../motor";
import { etiquetaCorta } from "../Carrusel";
import { Boton, Chip, Etiqueta, Glifo, Nota } from "../primitivas";
import type { NombreGlifo } from "../primitivas";
import "./FichaMateria.css";

/** Los cinco estados con el texto que muestra el chip (13e). */
const TEXTO_ESTADO: Record<EstadoMateria, string> = {
  aprobada: "Aprobada",
  cursando: "Cursando",
  planificada: "Planificada",
  disponible: "Disponible",
  bloqueada: "Bloqueada",
};

/** Día con mayúscula inicial: «Martes 10:00–12:00» del mockup. */
const DIA: Record<Dia, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sabado: "Sábado",
};

/**
 * Etiquetas de modalidad: las mismas que publica el SGA y que el scraper mapea
 * al enum del contrato (CONTRATO-v1 §1). No se traducen ni se inventan.
 */
const MODALIDAD: Record<Modalidad, string> = {
  presencial: "Presencial",
  virtual_sincronica: "Virtual Sinc.",
  virtual_asincronica: "Virtual Asinc.",
  blended: "Blended",
};

/** «6 créditos», «1 crédito», «0 créditos». */
export function textoCreditos(creditos: number): string {
  return creditos === 1 ? "1 crédito" : `${String(creditos)} créditos`;
}

/** Cómo se ve una correlativa en la columna CORRELATIVAS. */
interface MarcaDeCorrelativa {
  glifo: NombreGlifo;
  texto: string;
}

export interface PropsFichaMateria {
  codigo: Codigo;
  /** Cuatrimestre desde el que se la mira; por defecto se deduce (ver arriba). */
  periodo?: PeriodoId;
  /** Plan de estudios cargado. */
  plan: Plan;
  /** Horarios del período; solo se usan si son los de `periodo`. */
  horarios?: Horarios | null;
  /** `rectorado` → `Rectorado`; por defecto se muestra el id tal cual. */
  nombreDeSede?: (id: string) => string;
  /** Abre `ModalComisiones` (U3.4). Sin esto el botón queda apagado. */
  alCambiarComision?: (codigo: Codigo, periodo: PeriodoId) => void;
  /** ✕ de la cabecera; sin esto no se dibuja. */
  alCerrar?: () => void;
}

/** Cuándo llegan las dos acciones del pie que todavía no existen. */
const SPRINT_MOVER = "Llega en el Sprint 2";
const SPRINT_SUGERIR = "Llega en el Sprint 3";

export function FichaMateria({
  codigo,
  periodo: periodoPedido,
  plan,
  horarios = null,
  nombreDeSede = (id) => id,
  alCambiarComision,
  alCerrar,
}: PropsFichaMateria) {
  const { plan: planUsuario, despachar } = usePlanUsuario();
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const idMover = useId();
  const idSugerir = useId();

  const materias = indiceDeMaterias(plan);
  const materia = materias.get(codigo);
  if (materia === undefined) {
    return (
      <section className="ficha" aria-label={`Materia ${codigo}`}>
        <Nota variante="caja">
          {codigo} no está en el plan {plan.plan}.
        </Nota>
      </section>
    );
  }

  const planificadas = primerPeriodoPlanificado(planUsuario);
  const periodo =
    periodoPedido ??
    planificadas.get(codigo) ??
    horarios?.periodo.id ??
    primerPeriodoDelPlan(planUsuario);

  const estado =
    periodo === null
      ? null
      : estadoMateria(codigo, periodo, planUsuario, plan);

  const enElPeriodo =
    periodo === null
      ? undefined
      : (planUsuario.periodos[periodo] ?? []).find(
          (planificada) => planificada.codigo === codigo,
        );
  const curso =
    horarios !== null && periodo !== null && horarios.periodo.id === periodo
      ? cursoDe(codigo, horarios)
      : null;
  const comision: Comision | null =
    curso === null || enElPeriodo?.comision === undefined
      ? null
      : (curso.comisiones.find(
          (candidata) => candidata.id === enElPeriodo.comision,
        ) ?? null);
  /** Se eligió una comisión que ya no está en los horarios publicados (S-11). */
  const comisionDesaparecida =
    curso !== null && enElPeriodo?.comision !== undefined && comision === null
      ? enElPeriodo.comision
      : null;

  const color = colorAsignado(planUsuario.colores, codigo);

  const encabezado = [
    curso?.departamento,
    textoCreditos(materia.creditos),
    materia.ciclo === "electiva" ? "electiva" : "troncal",
    periodo === null ? undefined : etiquetaCorta(periodo),
  ].filter((parte): parte is string => parte !== undefined);

  function marcaDeCorrelativa(correlativa: Codigo): MarcaDeCorrelativa {
    const enHistoria = planUsuario.historia[correlativa];
    if (enHistoria?.estado === "aprobada") {
      return { glifo: "aprobada", texto: "aprobada" };
    }
    if (enHistoria !== undefined) {
      return { glifo: "cursando", texto: "la estás cursando" };
    }
    const cuando = planificadas.get(correlativa);
    if (cuando !== undefined) {
      return {
        glifo: "planificada",
        texto: `planificada en ${etiquetaCorta(cuando)}`,
      };
    }
    return { glifo: "bloqueada", texto: "falta" };
  }

  function nombreDe(otro: Codigo): string {
    return materias.get(otro)?.nombre ?? "";
  }

  function textoDeBloque(bloque: Bloque): string {
    return [
      bloque.aulas.length === 0 ? undefined : bloque.aulas.join(" · "),
      bloque.sede === null ? undefined : nombreDeSede(bloque.sede),
      MODALIDAD[bloque.modalidad],
    ]
      .filter((parte): parte is string => parte !== undefined)
      .join(" · ");
  }

  const habilitadas = habilita(codigo, plan);
  const puedeCambiarComision =
    alCambiarComision !== undefined && periodo !== null && curso !== null;

  return (
    <section className="ficha" aria-label={`${codigo} ${materia.nombre}`}>
      <header className="ficha__cabecera">
        <h2 className="ficha__titulo">
          {codigo} · {materia.nombre}
        </h2>
        {alCerrar === undefined ? null : (
          <button
            type="button"
            className="ficha__cerrar"
            onClick={alCerrar}
            aria-label="Cerrar la ficha"
          >
            ✕
          </button>
        )}
      </header>

      <p className="ficha__encabezado">{encabezado.join(" · ")}</p>

      <div className="ficha__chips">
        {estado === null ? null : (
          <span className="ficha__chip-estado">
            <Chip variante="seleccionado">
              <Glifo nombre={estado} />
              <span>{TEXTO_ESTADO[estado]}</span>
            </Chip>
          </span>
        )}
        {enElPeriodo?.comision === undefined ? null : (
          <Chip variante="relleno">
            <span>Comisión {enElPeriodo.comision}</span>
          </Chip>
        )}
        {comision?.cupo === undefined ||
        comision.ocupacion === undefined ? null : (
          <Chip variante="relleno">
            <Glifo
              nombre="cupoLleno"
              {...(cupoLleno(comision) ? {} : { etiqueta: "Cupo" })}
            />
            <span>
              cupo {comision.ocupacion.inscriptos} / {comision.cupo.capacidad}
            </span>
          </Chip>
        )}
      </div>

      <div className="ficha__columnas">
        <div className="ficha__columna">
          <p className="ficha__rotulo">CORRELATIVAS</p>
          {materia.correlativas.length === 0 ? (
            <p className="ficha__vacio">No tiene correlativas.</p>
          ) : (
            <ul className="ficha__lista">
              {materia.correlativas.map((correlativa) => {
                const marca = marcaDeCorrelativa(correlativa);
                return (
                  <li className="ficha__fila" key={correlativa}>
                    <Etiqueta>{correlativa}</Etiqueta>
                    <span className="ficha__nombre">
                      {nombreDe(correlativa)}
                    </span>
                    <span className="ficha__marca">
                      <Glifo nombre={marca.glifo} />
                      {marca.texto}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="ficha__rotulo">HABILITA</p>
          {habilitadas.length === 0 ? (
            <p className="ficha__vacio">No habilita ninguna materia.</p>
          ) : (
            <ul className="ficha__lista">
              {habilitadas.map((habilitada) => (
                <li className="ficha__fila" key={habilitada}>
                  <Etiqueta>{habilitada}</Etiqueta>
                  <span className="ficha__nombre">{nombreDe(habilitada)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ficha__columna">
          <p className="ficha__rotulo">
            HORARIO
            {comision === null ? "" : ` · COMISIÓN ${comision.id}`}
          </p>
          {curso === null ? (
            <Nota>
              — Sin horario publicado
              {periodo === null ? "" : ` para ${etiquetaCorta(periodo)}`}
            </Nota>
          ) : comisionDesaparecida !== null ? (
            <Nota>
              La comisión {comisionDesaparecida} ya no figura en los horarios
              publicados. Elegí otra.
            </Nota>
          ) : comision === null ? (
            <Nota>Todavía no elegiste comisión.</Nota>
          ) : comision.bloques.length === 0 ? (
            <Nota>
              Todavía no publicaron el horario de la comisión {comision.id}.
            </Nota>
          ) : (
            <ul className="ficha__bloques">
              {comision.bloques.map((bloque, indice) => (
                <li
                  className="ficha__bloque"
                  key={`${bloque.dia}-${bloque.desde}-${String(indice)}`}
                  style={
                    {
                      "--materia": `var(--materia-${String(color)})`,
                    } as CSSProperties
                  }
                >
                  <span className="ficha__bloque-cuando">
                    {DIA[bloque.dia]} {bloque.desde}–{bloque.hasta}
                  </span>
                  <span className="ficha__bloque-donde">
                    {textoDeBloque(bloque)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {comision === null || comision.docentes.length === 0 ? null : (
            <>
              <p className="ficha__rotulo">DOCENTES</p>
              <ul className="ficha__docentes">
                {comision.docentes.map((docente) => (
                  <li key={docente}>{docente}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="ficha__pie">
        <Boton
          variante="primario"
          onClick={
            puedeCambiarComision
              ? () => {
                  if (periodo !== null) {
                    alCambiarComision?.(codigo, periodo);
                  }
                }
              : undefined
          }
          disabled={!puedeCambiarComision}
        >
          Cambiar de comisión
        </Boton>
        {/*
          `aria-disabled` y no `disabled`: un botón `disabled` no recibe foco,
          así que su motivo no llega ni por teclado ni por lector de pantalla, y
          el `title` solo aparece con el mouse quieto encima (nunca en una
          pantalla táctil). Con `aria-disabled` el botón se enfoca, se anuncia
          como deshabilitado y `aria-describedby` lleva a la nota de abajo, que
          además está a la vista.
        */}
        <Boton
          aria-disabled="true"
          aria-describedby={idMover}
        >
          Mover a otro cuatrimestre
        </Boton>
        <Boton
          aria-disabled="true"
          aria-describedby={idSugerir}
        >
          Sugerir corrección
        </Boton>
        {enElPeriodo === undefined ? null : (
          <Boton
            variante="terciario"
            onClick={() => {
              setConfirmandoQuitar(true);
            }}
          >
            Quitar del plan
          </Boton>
        )}
      </div>

      <p className="ficha__pendientes">
        <span id={idMover}>Mover a otro cuatrimestre: {SPRINT_MOVER}.</span>{" "}
        <span id={idSugerir}>Sugerir corrección: {SPRINT_SUGERIR}.</span>
      </p>

      {enElPeriodo === undefined || periodo === null || !confirmandoQuitar ? null : (
        <p className="ficha__confirmar">
          ¿Quitar {codigo} de {etiquetaCorta(periodo)}?{" "}
          <Boton
            variante="terciario"
            tamano="chico"
            onClick={() => {
              despachar({ tipo: "quitarMateria", periodo, codigo });
              setConfirmandoQuitar(false);
            }}
          >
            Sí
          </Boton>
          <span className="ficha__separador" aria-hidden="true">
            ·
          </span>
          <Boton
            variante="terciario"
            tamano="chico"
            onClick={() => {
              setConfirmandoQuitar(false);
            }}
          >
            No
          </Boton>
        </p>
      )}
    </section>
  );
}
