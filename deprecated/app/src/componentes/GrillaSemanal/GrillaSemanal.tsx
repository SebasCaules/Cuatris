/**
 * Grilla semanal: el widget 7a con el choque según 9d.
 *
 * Dibuja lunes–viernes de 08 a 22, con línea solo en la hora en punto y la
 * etiqueta de hora centrada sobre su línea. Los bloques van en posición
 * absoluta: es la única forma de que dos materias compartan una franja y de
 * que el corte rayado del choque caiga exactamente sobre las horas que se
 * pisan.
 *
 * **La grilla no calcula nada de dominio.** Recibe los bloques ya resueltos
 * por materia (código, abreviación, color, comisión) y los `choques` y
 * `cambiosDeSede` tal como los devuelve `motor/horarios`. Así el mismo widget
 * sirve a 13b, 13d y 13h sin repetir reglas que ya están probadas en el motor.
 *
 * Lo que queda afuera de la grilla nunca desaparece: los bloques de sábado y
 * de domingo, y los que caen fuera de 08–22, se listan al pie con una Etiqueta.
 */

import type { CSSProperties } from "react";

import type { Bloque, Codigo, Dia } from "../../contrato/tipos";
import type { CambioDeSede, Choque } from "../../motor";
import { Etiqueta, Glifo, type NombreGlifo } from "../primitivas";
import {
  altoDeColumna,
  choquesDelBloque,
  desplazamiento,
  enHoras,
  etiquetaDeFranja,
  DESDE_HORA,
  HASTA_HORA,
  HORAS,
  HORA_PX_POR_DEFECTO,
  ladosDelChoque,
  restar,
  tramoDe,
  type Tramo,
} from "./geometria";
import "./GrillaSemanal.css";

/**
 * Estados que cambian el borde y agregan glifo; el relleno no se toca.
 *
 * `bloqueada` está acá porque el motor le da precedencia sobre `planificada`
 * (`motor/estado.ts`): una materia planificada que quedó bloqueada tiene que
 * verse bloqueada, y sin este estado el bloque se dibujaba como uno normal.
 */
export type EstadoEnGrilla =
  | "cursando"
  | "planificada"
  | "bloqueada"
  | "sinHorario"
  /** Fantasma de la materia bajo el puntero en el panel de agregar. */
  | "previsualizada";

/** Una materia del cuatrimestre con los bloques de la comisión elegida. */
export interface MateriaEnGrilla {
  codigo: Codigo;
  /** Lo que se lee dentro del bloque (`abreviaciones.json`). */
  abreviacion: string;
  /** Índice 0–11 de la paleta; lo fija el orden de agregado al plan. */
  color: number;
  comision: string;
  /** Nombre completo del curso, para los nombres accesibles. */
  nombre?: string;
  estado?: EstadoEnGrilla;
  bloques: readonly Bloque[];
}

/** Un bloque con la materia a la que pertenece, para los callbacks. */
export interface BloqueDeMateria {
  materia: MateriaEnGrilla;
  bloque: Bloque;
}

export interface PropsGrillaSemanal {
  /** Materias con sus bloques del contrato, ya resueltas por quien llama. */
  bloques: readonly MateriaEnGrilla[];
  /** Choques del período, de `motor/horarios`. */
  choques?: readonly Choque[];
  /** Cambios de sede del período, de `motor/horarios`. */
  cambiosDeSede?: readonly CambioDeSede[];
  /** 15 px con dos tarjetas lado a lado, 18 con una sola (tokens.md). */
  horaPx?: number;
  /** `rectorado` → `Rectorado`; por defecto se muestra el id tal cual. */
  nombreDeSede?: (id: string) => string;
  /** Se llama al entrar y salir de un bloque; `null` al salir. */
  alPasar?: (bloque: BloqueDeMateria | null) => void;
  /**
   * Se llama al entrar y salir de una franja de choque; `null` al salir. Es lo
   * que enciende la fila de `ListaConflictos` que le corresponde.
   */
  alPasarChoque?: (choque: Choque | null) => void;
  /** Clic en un bloque. Sin esto los bloques no son controles. */
  alClic?: (codigo: Codigo) => void;
}

/** Columnas de la grilla; sábado y domingo se listan al pie (CONTRATO-v1 §1). */
const DIAS_GRILLA: readonly Dia[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
];

const ENCABEZADO: Record<Dia, string> = {
  lunes: "LUN",
  martes: "MAR",
  miercoles: "MIÉ",
  jueves: "JUE",
  viernes: "VIE",
  sabado: "SÁB",
  domingo: "DOM",
};

const NOMBRE_DIA: Record<Dia, string> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
  domingo: "domingo",
};

/** Abreviación del día al pie: «sáb 09–12 · 002R». */
const DIA_CORTO: Record<Dia, string> = {
  lunes: "lun",
  martes: "mar",
  miercoles: "mié",
  jueves: "jue",
  viernes: "vie",
  sabado: "sáb",
  domingo: "dom",
};

/** Glifo de estado; «sin horario» no tiene bloques, pero el tipo lo admite. */
const GLIFO: Record<EstadoEnGrilla, NombreGlifo> = {
  cursando: "cursando",
  planificada: "planificada",
  bloqueada: "bloqueada",
  sinHorario: "sinHorario",
  previsualizada: "planificada",
};

/** Un pedazo dibujable de un bloque: lo que le queda después del choque. */
interface Pieza {
  clave: string;
  materia: MateriaEnGrilla;
  bloque: Bloque;
  tramo: Tramo;
  /** Solo el primer pedazo lleva el nombre de la materia. */
  conNombre: boolean;
}

function aulas(bloque: Bloque): string {
  return bloque.aulas.join(" · ");
}

function dentroDeLaGrilla(bloque: Bloque): boolean {
  return (
    DIAS_GRILLA.includes(bloque.dia) &&
    enHoras(bloque.hasta) > DESDE_HORA &&
    enHoras(bloque.desde) < HASTA_HORA
  );
}

function nombreLargo(materia: MateriaEnGrilla): string {
  return materia.nombre ?? materia.abreviacion;
}

function descripcion(materia: MateriaEnGrilla, bloque: Bloque): string {
  const lugar = bloque.aulas.length === 0 ? "" : ` · ${aulas(bloque)}`;
  return (
    `${materia.codigo} ${nombreLargo(materia)} · comisión ${materia.comision}` +
    ` · ${NOMBRE_DIA[bloque.dia]} ${bloque.desde}–${bloque.hasta}${lugar}`
  );
}

function piezasDelDia(
  dia: Dia,
  materias: readonly MateriaEnGrilla[],
  choques: readonly Choque[],
): Pieza[] {
  const piezas: Pieza[] = [];
  for (const materia of materias) {
    for (const [indice, bloque] of materia.bloques.entries()) {
      if (bloque.dia !== dia || !dentroDeLaGrilla(bloque)) {
        continue;
      }
      const pisados = choquesDelBloque(materia.codigo, bloque, choques).map(
        (choque) => ({
          desde: enHoras(choque.desde),
          hasta: enHoras(choque.hasta),
        }),
      );
      const tramos = restar(tramoDe(bloque), pisados);
      for (const [pedazo, tramo] of tramos.entries()) {
        piezas.push({
          clave: `${materia.codigo}-${materia.comision}-${String(indice)}-${String(pedazo)}`,
          materia,
          bloque,
          tramo,
          conNombre: pedazo === 0,
        });
      }
    }
  }
  return piezas;
}

/** Recorta el tramo a las filas dibujadas; un 07–09 se ve desde las 08. */
function recortado(tramo: Tramo): Tramo {
  return {
    desde: Math.max(tramo.desde, DESDE_HORA),
    hasta: Math.min(tramo.hasta, HASTA_HORA),
  };
}

function caja(tramo: Tramo, horaPx: number): CSSProperties {
  const visible = recortado(tramo);
  return {
    top: `${String(desplazamiento(visible.desde, horaPx))}px`,
    height: `${String((visible.hasta - visible.desde) * horaPx)}px`,
  };
}

export function GrillaSemanal({
  bloques,
  choques = [],
  cambiosDeSede = [],
  horaPx = HORA_PX_POR_DEFECTO,
  nombreDeSede = (id) => id,
  alPasar,
  alPasarChoque,
  alClic,
}: PropsGrillaSemanal) {
  const estilo = {
    "--hora-px": `${String(horaPx)}px`,
    "--grilla-alto": `${String(altoDeColumna(horaPx))}px`,
  } as CSSProperties;

  /** Bloques que no entran en la grilla: sábado, domingo y horas fuera de 08–22. */
  const alPie = bloques.flatMap((materia) =>
    materia.bloques
      .filter((bloque) => !dentroDeLaGrilla(bloque))
      .map((bloque) => ({ materia, bloque })),
  );

  return (
    <div className="grilla" style={estilo}>
      <div className="grilla__semana">
        <div className="grilla__escala" aria-hidden="true">
          <div className="grilla__encabezado" />
          <div className="grilla__horas">
            {HORAS.map((hora) => (
              <span
                className="grilla__hora"
                key={hora}
                style={{
                  top: `${String(desplazamiento(hora, horaPx))}px`,
                }}
              >
                {String(hora).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>

        {DIAS_GRILLA.map((dia) => (
          <div className="grilla__dia" key={dia}>
            <div className="grilla__encabezado">{ENCABEZADO[dia]}</div>
            <div
              className="grilla__columna"
              role="group"
              aria-label={NOMBRE_DIA[dia]}
            >
              {piezasDelDia(dia, bloques, choques).map((pieza) => {
                const { materia, bloque, tramo } = pieza;
                const duracion = tramo.hasta - tramo.desde;
                const clases = [
                  "grilla__bloque",
                  materia.estado === undefined
                    ? ""
                    : `grilla__bloque--${materia.estado}`,
                ]
                  .filter((clase) => clase !== "")
                  .join(" ");
                const estiloBloque = {
                  ...caja(tramo, horaPx),
                  "--materia": `var(--materia-${String(materia.color)})`,
                } as CSSProperties;
                const contenido = (
                  <>
                    {pieza.conNombre ? (
                      <span className="grilla__nombre">
                        {materia.estado === undefined ? null : (
                          /* Decorativo: el nombre accesible del bloque ya dice
                             todo, y un segundo «Planificada» solo repetiría. */
                          <span aria-hidden="true">
                            <Glifo nombre={GLIFO[materia.estado]} />
                          </span>
                        )}
                        {materia.abreviacion}
                      </span>
                    ) : null}
                    {/* La etiqueta de aula solo cuando hay dos horas de alto:
                        en un tramo de una hora no entra (tokens.md). */}
                    {duracion >= 2 && bloque.aulas.length > 0 ? (
                      <Etiqueta
                        variante="contorno"
                        color={`var(--materia-${String(materia.color)})`}
                      >
                        {aulas(bloque)}
                      </Etiqueta>
                    ) : null}
                  </>
                );
                const comunes = {
                  className: clases,
                  style: estiloBloque,
                  // El fantasma de la previsualización no se arrastra.
                  ...(materia.estado === "previsualizada"
                    ? {}
                    : { "data-arrastre-codigo": materia.codigo }),
                  onMouseEnter: () => {
                    alPasar?.({ materia, bloque });
                  },
                  onMouseLeave: () => {
                    alPasar?.(null);
                  },
                };
                return alClic === undefined ? (
                  <div
                    key={pieza.clave}
                    {...comunes}
                    role="img"
                    aria-label={descripcion(materia, bloque)}
                  >
                    {contenido}
                  </div>
                ) : (
                  <button
                    key={pieza.clave}
                    type="button"
                    {...comunes}
                    aria-label={descripcion(materia, bloque)}
                    onFocus={() => {
                      alPasar?.({ materia, bloque });
                    }}
                    onBlur={() => {
                      alPasar?.(null);
                    }}
                    onClick={() => {
                      alClic(materia.codigo);
                    }}
                  >
                    {contenido}
                  </button>
                );
              })}

              {choques
                .filter((choque) => choque.dia === dia)
                .map((choque) => {
                  const [primero, segundo] = ladosDelChoque(choque);
                  return (
                    <div
                      className="grilla__choque"
                      key={`${choque.a.codigo}-${choque.b.codigo}-${choque.desde}`}
                      style={caja(
                        {
                          desde: enHoras(choque.desde),
                          hasta: enHoras(choque.hasta),
                        },
                        horaPx,
                      )}
                      role="img"
                      aria-label={
                        `Choque ${NOMBRE_DIA[dia]} de ${choque.desde} a ${choque.hasta}: ` +
                        `${primero.codigo} ${primero.nombre} (comisión ${primero.comision})` +
                        ` y ${segundo.codigo} ${segundo.nombre} (comisión ${segundo.comision})`
                      }
                      onMouseEnter={() => {
                        alPasarChoque?.(choque);
                      }}
                      onMouseLeave={() => {
                        alPasarChoque?.(null);
                      }}
                    >
                      {/* En reposo la franja no lleva texto (9d): el registro
                        estable es la lista «CONFLICTOS · n» al pie. */}
                      <span className="grilla__choque-texto">
                        ▲ {primero.codigo} ↔ {segundo.codigo} ·{" "}
                        {etiquetaDeFranja(choque.desde, choque.hasta)}
                      </span>
                    </div>
                  );
                })}

              {cambiosDeSede
                .filter((cambio) => cambio.dia === dia)
                .map((cambio) => (
                  <span
                    className="grilla__sede"
                    key={`${cambio.a.codigo}-${cambio.b.codigo}-${cambio.hora}`}
                    style={{
                      top: `${String(desplazamiento(enHoras(cambio.hora), horaPx))}px`,
                    }}
                    role="img"
                    aria-label={
                      `Cambio de sede el ${NOMBRE_DIA[dia]} a las ${cambio.hora}: ` +
                      `${nombreDeSede(cambio.a.bloque.sede ?? "")} → ` +
                      `${nombreDeSede(cambio.b.bloque.sede ?? "")}`
                    }
                  >
                    ↕
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {alPie.length === 0 ? null : (
        <ul className="grilla__pie" aria-label="Bloques fuera de la grilla">
          {alPie.map(({ materia, bloque }) => (
            <li
              key={`${materia.codigo}-${bloque.dia}-${bloque.desde}`}
              className="grilla__pie-fila"
            >
              <Etiqueta titulo={descripcion(materia, bloque)}>
                {DIA_CORTO[bloque.dia]}{" "}
                {etiquetaDeFranja(bloque.desde, bloque.hasta)}
                {bloque.aulas.length === 0 ? "" : ` · ${aulas(bloque)}`}
              </Etiqueta>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
