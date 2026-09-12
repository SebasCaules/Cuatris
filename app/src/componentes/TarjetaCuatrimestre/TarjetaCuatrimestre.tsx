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

import type { Codigo, Fecha, PeriodoId } from "../../contrato/tipos";
import type { CambioDeSede, Choque } from "../../motor";
import { etiquetaLarga } from "../Carrusel";
import { GrillaSemanal, type MateriaEnGrilla } from "../GrillaSemanal";
import { ListaConflictos } from "../ListaConflictos";
import { Nota } from "../primitivas";
import "./TarjetaCuatrimestre.css";

/** Una materia sin horario: barra de color, abreviación y créditos (13g). */
export interface MateriaDeLaLista {
  codigo: Codigo;
  abreviacion: string;
  /** Índice 0–9 de la paleta. */
  color: number;
  creditos: number;
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

  if (props.variante === "vacia") {
    return <Agregar alAgregar={props.alAgregar} />;
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
            <li className="tarjeta__materia" key={materia.codigo}>
              <span
                className="tarjeta__barra"
                style={
                  {
                    "--materia": `var(--materia-${String(materia.color)})`,
                  } as CSSProperties
                }
                aria-hidden="true"
              />
              <span className="tarjeta__abreviacion">
                {materia.abreviacion}
              </span>
              <span className="tarjeta__creditos">{materia.creditos} cr</span>
            </li>
          ))}
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
    publicado,
    hoy,
    nombreDeSede,
    nombreDeMateria,
    alResolver,
    alVer,
    alClic,
  } = props;

  return (
    <>
      <GrillaSemanal
        bloques={bloques}
        choques={choques}
        cambiosDeSede={cambiosDeSede}
        {...(horaPx === undefined ? {} : { horaPx })}
        {...(nombreDeSede === undefined ? {} : { nombreDeSede })}
        {...(alClic === undefined ? {} : { alClic })}
        alPasarChoque={setActivo}
      />

      {sinHorarioPublicado.map((materia) => (
        <div className="tarjeta__sin-horario" key={materia.codigo}>
          <Nota>
            — {materia.codigo} {materia.abreviacion} · sin horario publicado
          </Nota>
        </div>
      ))}

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
