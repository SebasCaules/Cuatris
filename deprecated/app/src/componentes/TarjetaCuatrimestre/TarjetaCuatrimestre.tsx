/**
 * Tarjeta de un cuatrimestre: la unidad que el carrusel repite (13b y 13g).
 *
 * Tres variantes, la misma caja:
 *
 * - `conHorarios`: la grilla semanal, las materias sin horario publicado al
 *   pie y la lista de conflictos.
 * - `sinHorarios`: sin grilla —todavía no existen los horarios—, con la lista
 *   de materias, sus créditos y los hitos del plan.
 * - `vacia`: solo el título y «+ agregar materia».
 *
 * El alto lo iguala el contenedor (`carrusel__tarjeta` usa `stretch`) y el
 * ancho lo fija `visibles`: la tarjeta no decide ninguno de los dos.
 */

import { useState, type CSSProperties } from "react";

import type { Codigo, Fecha, PeriodoId, Sigla } from "../../contrato/tipos";
import type { CambioDeSede, Choque } from "../../motor";
import { etiquetaLarga } from "../Carrusel";
import { GrillaSemanal, type MateriaEnGrilla } from "../GrillaSemanal";
import { ListaConflictos } from "../ListaConflictos";
import { Insignia, Nota, Tooltip } from "../primitivas";
import "./TarjetaCuatrimestre.css";

/**
 * Una materia sin horario: barra de color, abreviación grande, código chico,
 * insignias y créditos (13g, rediseño).
 */
export interface MateriaDeLaLista {
  codigo: Codigo;
  abreviacion: string;
  /** Nombre completo, para el tooltip. */
  nombre?: string;
  /** Índice 0–11 de la paleta. */
  color: number;
  creditos: number;
  /** Obligatoria del plan: lleva la insignia de troncal. */
  troncal?: boolean;
  /** Siglas de los minors a los que suma (electivas). */
  minors?: readonly Sigla[];
}

/**
 * La materia que se previsualiza en esta tarjeta mientras el puntero está
 * sobre ella en el panel de agregar. Se dibuja como fantasma: en la grilla, si
 * trae bloques; si no, como una fila más al pie de la lista.
 */
export interface Previsualizacion extends MateriaDeLaLista {
  /** Bloques de la mejor comisión, para dibujarla en la grilla. */
  enGrilla?: MateriaEnGrilla;
}

/** Una materia que se ofrece pero todavía no tiene comisiones publicadas. */
export interface MateriaSinHorarioPublicado {
  codigo: Codigo;
  abreviacion: string;
}

interface Comun {
  periodo: PeriodoId;
  /** Por defecto, «1.º cuatrimestre 2026» a partir del período. */
  titulo?: string;
  /** «7 materias · 39 cr · ▲ 1». Lo arma quien tiene el plan del usuario. */
  resumen?: string;
  /** Materia bajo el puntero en el panel de agregar, si entra acá. */
  previsualizacion?: Previsualizacion;
  /** `sigla → nombre` del minor, para los tooltips de las insignias. */
  nombresDeMinors?: Map<string, string>;
}

interface ConHorarios extends Comun {
  variante: "conHorarios";
  bloques: readonly MateriaEnGrilla[];
  choques?: readonly Choque[];
  cambiosDeSede?: readonly CambioDeSede[];
  /** 15 px con dos tarjetas lado a lado, 18 con una sola. */
  horaPx?: number;
  /** Las que se ofrecen sin comisión publicada; bajan al pie con nota punteada. */
  sinHorarioPublicado?: readonly MateriaSinHorarioPublicado[];
  /**
   * Planificadas acá pero fuera de la grilla: sin comisión elegida, o que el
   * período no ofrece. Van como filas al pie, arrastrables, para que el plan
   * no las pierda de vista.
   */
  sinComision?: readonly MateriaDeLaLista[];
  /** Fecha de publicación del índice; con ella sale la nota «hace n días». */
  publicado?: Fecha;
  /** Contra qué día se cuentan esos días; por defecto, hoy. */
  hoy?: Fecha;
  nombreDeSede?: (id: string) => string;
  nombreDeMateria?: (codigo: Codigo, nombreDelCurso: string) => string;
  alResolver?: (choque: Choque) => void;
  alVer?: (cambio: CambioDeSede) => void;
  alClic?: (codigo: Codigo) => void;
}

interface SinHorarios extends Comun {
  variante: "sinHorarios";
  materias: readonly MateriaDeLaLista[];
  /** `"2026-11"` de `horarios_esperados`; sin esto, la nota es más corta. */
  horariosEsperados?: string;
  /** Notas verdes del plan: títulos que se alcanzan, materias que se destraban. */
  hitos?: readonly string[];
  alAgregar?: () => void;
}

interface Vacia extends Comun {
  variante: "vacia";
  alAgregar?: () => void;
}

export type PropsTarjetaCuatrimestre = ConHorarios | SinHorarios | Vacia;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Un `horarios_esperados` que no tiene la forma `YYYY-MM` es un dato roto. */
export class MesIlegible extends Error {
  constructor(readonly valor: string) {
    super(`No se entiende el mes «${valor}»: se esperaba YYYY-MM.`);
    this.name = "MesIlegible";
  }
}

/** `"2026-11"` → `"noviembre de 2026"`. */
export function mesDeAnio(valor: string): string {
  const partes = valor.match(/^(\d{4})-(\d{2})$/);
  const anio = partes?.[1];
  const mes = partes?.[2];
  if (anio === undefined || mes === undefined) {
    throw new MesIlegible(valor);
  }
  const nombre = MESES[Number(mes) - 1];
  if (nombre === undefined) {
    throw new MesIlegible(valor);
  }
  return `${nombre} de ${anio}`;
}

function enDias(fecha: Fecha): number {
  const partes = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const anio = partes?.[1];
  const mes = partes?.[2];
  const dia = partes?.[3];
  if (anio === undefined || mes === undefined || dia === undefined) {
    throw new MesIlegible(fecha);
  }
  return Date.UTC(Number(anio), Number(mes) - 1, Number(dia)) / 86_400_000;
}

/** «Horarios publicados hace 3 días · pueden cambiar hasta la inscripción». */
export function textoDePublicacion(publicado: Fecha, hoy: Fecha): string {
  const dias = Math.max(0, Math.round(enDias(hoy) - enDias(publicado)));
  const cuando =
    dias === 0
      ? "hoy"
      : dias === 1
        ? "hace 1 día"
        : `hace ${String(dias)} días`;
  return `Horarios publicados ${cuando} · pueden cambiar hasta la inscripción`;
}

function hoyIso(): Fecha {
  const ahora = new Date();
  const anio = String(ahora.getFullYear()).padStart(4, "0");
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Las insignias de una materia: troncal, o sus minors. */
function Insignias({
  materia,
  nombresDeMinors,
}: {
  materia: MateriaDeLaLista;
  nombresDeMinors?: Map<string, string> | undefined;
}) {
  if (materia.troncal === true) {
    return (
      <Tooltip texto="Troncal: obligatoria del plan">
        <Insignia tono="troncal">troncal</Insignia>
      </Tooltip>
    );
  }
  return (
    <>
      {(materia.minors ?? []).slice(0, 4).map((sigla) => (
        <Tooltip
          key={sigla}
          texto={`Suma al minor ${nombresDeMinors?.get(sigla) ?? sigla}`}
        >
          <Insignia
            tono="minor"
            color={`var(--minor-${sigla.toLowerCase()})`}
            titulo={nombresDeMinors?.get(sigla) ?? sigla}
          >
            {sigla}
          </Insignia>
        </Tooltip>
      ))}
    </>
  );
}

/**
 * Una fila de materia de la lista (13g). Con `arrastrable`, lleva el
 * `data-arrastre-codigo` que `PaginaCursada` usa para moverla de tarjeta; la
 * previsualización no se arrastra.
 */
function FilaDeMateria({
  materia,
  nombresDeMinors,
  fantasma = false,
  nota,
}: {
  materia: MateriaDeLaLista;
  nombresDeMinors?: Map<string, string> | undefined;
  fantasma?: boolean;
  /** Aviso chico al pie de la fila («sin comisión elegida»). */
  nota?: string;
}) {
  const ayuda = fantasma
    ? `${materia.codigo} ${materia.nombre ?? materia.abreviacion} entra acá`
    : `${materia.codigo} ${materia.nombre ?? materia.abreviacion} · ` +
      `${String(materia.creditos)} cr · arrastrá para moverla de cuatrimestre`;
  return (
    <Tooltip texto={ayuda}>
      <li
        className={`tarjeta__materia${
          fantasma ? " tarjeta__materia--fantasma" : ""
        }`}
        style={
          {
            "--materia": `var(--materia-${String(materia.color)})`,
          } as CSSProperties
        }
        {...(fantasma ? { "aria-hidden": true } : { "data-arrastre-codigo": materia.codigo, tabIndex: 0 })}
      >
        <span className="tarjeta__barra" aria-hidden="true" />
        <span className="tarjeta__materia-cuerpo">
          <span className="tarjeta__abreviacion">{materia.abreviacion}</span>
          <span className="tarjeta__meta">
            <span className="tarjeta__codigo">{materia.codigo}</span>
            <Insignias materia={materia} nombresDeMinors={nombresDeMinors} />
            {nota === undefined ? null : (
              <span className="tarjeta__nota">{nota}</span>
            )}
          </span>
        </span>
        <span className="tarjeta__creditos">{materia.creditos} cr</span>
      </li>
    </Tooltip>
  );
}

function Agregar({ alAgregar }: { alAgregar?: (() => void) | undefined }) {
  return (
    <button
      type="button"
      className="tarjeta__agregar"
      onClick={alAgregar}
      disabled={alAgregar === undefined}
    >
      + agregar materia
    </button>
  );
}

function Cuerpo(props: PropsTarjetaCuatrimestre) {
  const [activo, setActivo] = useState<Choque | null>(null);

  const { previsualizacion, nombresDeMinors } = props;
  const fantasma =
    previsualizacion === undefined ? null : (
      <FilaDeMateria
        materia={previsualizacion}
        nombresDeMinors={nombresDeMinors}
        fantasma
      />
    );

  if (props.variante === "vacia") {
    return (
      <>
        {fantasma === null ? null : (
          <ul className="tarjeta__materias">{fantasma}</ul>
        )}
        <Agregar alAgregar={props.alAgregar} />
      </>
    );
  }

  if (props.variante === "sinHorarios") {
    const { materias, horariosEsperados, hitos = [], alAgregar } = props;
    return (
      <>
        <Nota variante="caja">
          {horariosEsperados === undefined
            ? "Sin horarios publicados."
            : `Sin horarios publicados: salen en ${mesDeAnio(horariosEsperados)}. ` +
              "Hasta entonces se planifica por carga y correlativas."}
        </Nota>
        <ul className="tarjeta__materias">
          {materias.map((materia) => (
            <FilaDeMateria
              key={materia.codigo}
              materia={materia}
              nombresDeMinors={nombresDeMinors}
            />
          ))}
          {fantasma}
        </ul>
        <Agregar alAgregar={alAgregar} />
        {hitos.map((hito) => (
          <p className="tarjeta__hito" key={hito}>
            {hito}
          </p>
        ))}
      </>
    );
  }

  const {
    bloques,
    choques = [],
    cambiosDeSede = [],
    horaPx,
    sinHorarioPublicado = [],
    sinComision = [],
    publicado,
    hoy,
    nombreDeSede,
    nombreDeMateria,
    alResolver,
    alVer,
    alClic,
  } = props;

  // La previsualización entra en la grilla como un bloque fantasma; si no
  // trae bloques (sin comisión publicada), va como fila al pie.
  const enGrilla = previsualizacion?.enGrilla;
  const bloquesConFantasma =
    enGrilla === undefined
      ? bloques
      : [...bloques, { ...enGrilla, estado: "previsualizada" as const }];

  return (
    <>
      <GrillaSemanal
        bloques={bloquesConFantasma}
        choques={choques}
        cambiosDeSede={cambiosDeSede}
        {...(horaPx === undefined ? {} : { horaPx })}
        {...(nombreDeSede === undefined ? {} : { nombreDeSede })}
        {...(alClic === undefined ? {} : { alClic })}
        alPasarChoque={setActivo}
      />

      {sinHorarioPublicado.map((materia) => (
        <div
          className="tarjeta__sin-horario"
          key={materia.codigo}
          data-arrastre-codigo={materia.codigo}
        >
          <Nota>
            — {materia.codigo} {materia.abreviacion} · sin horario publicado
          </Nota>
        </div>
      ))}
      {sinComision.length === 0 &&
      (previsualizacion === undefined || enGrilla !== undefined) ? null : (
        <ul className="tarjeta__materias tarjeta__materias--pie">
          {sinComision.map((materia) => (
            <FilaDeMateria
              key={materia.codigo}
              materia={materia}
              nombresDeMinors={nombresDeMinors}
              nota="sin comisión elegida"
            />
          ))}
          {enGrilla === undefined ? fantasma : null}
        </ul>
      )}

      <ListaConflictos
        choques={choques}
        cambiosDeSede={cambiosDeSede}
        activo={activo}
        {...(nombreDeMateria === undefined ? {} : { nombreDeMateria })}
        {...(nombreDeSede === undefined ? {} : { nombreDeSede })}
        {...(alResolver === undefined ? {} : { alResolver })}
        {...(alVer === undefined ? {} : { alVer })}
      />

      {publicado === undefined ? null : (
        <div className="tarjeta__publicado">
          <Nota>{textoDePublicacion(publicado, hoy ?? hoyIso())}</Nota>
        </div>
      )}
    </>
  );
}

export function TarjetaCuatrimestre(props: PropsTarjetaCuatrimestre) {
  const titulo = props.titulo ?? etiquetaLarga(props.periodo);
  return (
    <section className="tarjeta" aria-label={titulo}>
      <header className="tarjeta__cabecera">
        <h3 className="tarjeta__titulo">{titulo}</h3>
        {props.resumen === undefined ? null : (
          <p className="tarjeta__resumen">{props.resumen}</p>
        )}
      </header>
      <Cuerpo {...props} />
    </section>
  );
}
