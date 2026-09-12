/**
 * Muestrario: todas las primitivas, en todos sus estados, en una sola página.
 *
 * Sirve para comparar contra el mockup sin tener que armar una pantalla real,
 * y para ver de una que un cambio de token no rompió nada. No es parte del
 * producto: no la enlaza ninguna pantalla, se llega por `#/muestrario`.
 *
 * Los textos de ejemplo salen del mockup v2 (13b, 13c, 13d): así lo que se
 * compara es lo mismo que hay que reproducir, y no hay ningún dato inventado.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { BarraSuperior } from "../componentes/BarraSuperior";
import {
  Carrusel,
  etiquetaLarga,
  type ManijaCarrusel,
} from "../componentes/Carrusel";
import { GrillaSemanal } from "../componentes/GrillaSemanal";
import {
  ACCIONAMIENTOS_PEGADO,
  ALGEBRA,
  CAMBIOS_DE_SEDE,
  CHOQUES,
  CRIPTO_SABADO,
  HITOS,
  HORARIOS_ESPERADOS,
  MATERIAS,
  MATERIAS_SIN_HORARIOS,
  nombreDeSede,
  PERIODO,
  SIN_HORARIO,
} from "../componentes/GrillaSemanal/ejemplo";
import { ListaConflictos } from "../componentes/ListaConflictos";
import {
  DESCRIPCION_MARCA,
  MarcaMateria,
  type EstadoMarca,
} from "../componentes/MarcaMateria";
import { TarjetaAnio } from "../componentes/TarjetaAnio";
import { COLUMNAS_ANIO_1 } from "../componentes/TarjetaAnio/ejemplo";
import { TarjetaCuatrimestre } from "../componentes/TarjetaCuatrimestre";
import {
  BarraProgreso,
  Boton,
  Campo,
  Chip,
  Etiqueta,
  Glifo,
  Modal,
  Nota,
  NOMBRES_GLIFO,
  PanelLateral,
} from "../componentes/primitivas";
import type { Codigo, PeriodoId, Visibles } from "../contrato/tipos";
import type { Ruta } from "../rutas";
import "./Muestrario.css";

/** Los cinco períodos que muestra el carrusel de 13b. */
const PERIODOS: PeriodoId[] = [
  "2026-1C",
  "2026-2C",
  "2027-1C",
  "2027-2C",
  "2028-1C",
];

const VISIBLES: Visibles[] = [1, 2, 3];

/**
 * Hash en el que vive esta página.
 *
 * `rutas.ts` es de la Ola 1 y no se toca desde acá: quien cablee la ruta usa
 * estas tres cosas y no tiene que volver a escribir el formato del hash.
 */
export const HASH_MUESTRARIO = "#/muestrario";

/** ¿Ese `location.hash` apunta al muestrario? */
export function esRutaMuestrario(hash: string): boolean {
  return hash.replace(/^#/, "").replace(/^\/+/, "") === "muestrario";
}

/**
 * ¿La ventana está parada en el muestrario ahora mismo?
 *
 * Hace falta un enganche propio porque `useRuta` de `rutas.ts` colapsa todo
 * hash desconocido en `{vista: "plan"}`: preguntarle por el muestrario
 * siempre daría que no.
 */
export function useEsRutaMuestrario(): boolean {
  const [enMuestrario, setEnMuestrario] = useState(() =>
    esRutaMuestrario(window.location.hash),
  );

  useEffect(() => {
    const alCambiar = () => {
      setEnMuestrario(esRutaMuestrario(window.location.hash));
    };
    window.addEventListener("hashchange", alCambiar);
    // Por si el hash cambió entre el primer render y este efecto.
    alCambiar();
    return () => {
      window.removeEventListener("hashchange", alCambiar);
    };
  }, []);

  return enMuestrario;
}

function Seccion({
  titulo,
  pantalla,
  children,
}: {
  titulo: string;
  /** Pantalla del mockup de la que sale el patrón. */
  pantalla?: string;
  children: ReactNode;
}) {
  return (
    <section className="muestrario__seccion">
      <h2 className="muestrario__titulo">
        {titulo}
        {pantalla === undefined ? null : (
          <span className="muestrario__pantalla">{pantalla}</span>
        )}
      </h2>
      <div className="muestrario__cuerpo">{children}</div>
    </section>
  );
}

function Fila({ children }: { children: ReactNode }) {
  return <div className="muestrario__fila">{children}</div>;
}

/** Los cuatro estados de la marca, en el orden en que los recorre el clic. */
const ESTADOS_MARCA: readonly EstadoMarca[] = [
  "pendiente",
  "final",
  "cursada",
  "cursando",
];

/**
 * La pestaña «Plan» en chico: la marca en sus cuatro estados, la barra en tres
 * llenados y una `TarjetaAnio` completa con el año 1 del plan real.
 *
 * Tiene estado propio porque la tarjeta no lo guarda: así se puede ciclar una
 * materia acá mismo y ver los cuatro aspectos sin montar el plan del usuario.
 */
function SeccionPlanDeEstudios() {
  const [estados, setEstados] = useState<Record<Codigo, EstadoMarca>>({
    "31.08": "final",
    "72.03": "cursada",
    "93.26": "cursando",
  });

  const marcar = (codigos: readonly Codigo[], estado: EstadoMarca) => {
    setEstados((antes) => {
      const salida = { ...antes };
      for (const codigo of codigos) {
        salida[codigo] = estado;
      }
      return salida;
    });
  };

  return (
    <Seccion titulo="Plan de estudios" pantalla="R1">
      <Fila>
        {ESTADOS_MARCA.map((estado) => (
          <div className="muestrario__marca" key={estado}>
            <MarcaMateria
              codigo="31.08"
              nombre="Sistemas de Representación"
              estado={estado}
              alCambiar={() => undefined}
            />
            <p className="muestrario__dato">{DESCRIPCION_MARCA[estado]}</p>
          </div>
        ))}
      </Fila>

      <div className="muestrario__barras">
        {[0, 50, 100].map((porcentaje) => (
          <div className="muestrario__barra" key={porcentaje}>
            <BarraProgreso
              valor={porcentaje}
              maximo={100}
              etiqueta={`Ejemplo al ${porcentaje} %`}
            />
            <p className="muestrario__dato">{porcentaje} %</p>
          </div>
        ))}
      </div>

      <TarjetaAnio
        titulo="Año 1"
        ciclo="CICLO BÁSICO"
        columnas={COLUMNAS_ANIO_1}
        estadoDe={(codigo) => estados[codigo] ?? "pendiente"}
        alCambiar={(codigo, siguiente) => {
          marcar([codigo], siguiente);
        }}
        alMarcarVarias={marcar}
      />
    </Seccion>
  );
}

export function Muestrario() {
  const [ruta, setRuta] = useState<Ruta>({ vista: "plan" });
  const [buscado, setBuscado] = useState("");
  const [ultimaAccion, setUltimaAccion] = useState("—");
  const [visibles, setVisibles] = useState<Visibles>(2);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [enElPanel, setEnElPanel] = useState("");
  const carrusel = useRef<ManijaCarrusel>(null);

  return (
    <div className="muestrario">
      <h1 className="muestrario__encabezado">
        Muestrario de primitivas
        <span className="muestrario__pantalla">paleta 4a · mockup v2</span>
      </h1>

      <Seccion titulo="Barra superior" pantalla="13b">
        <BarraSuperior
          carrera="Ingeniería en Informática"
          plan="S10-Rev23"
          ruta={ruta}
          ir={setRuta}
          onBuscar={setBuscado}
          onSugerir={() => {
            setUltimaAccion("Sugerir corrección");
          }}
          onExportar={() => {
            setUltimaAccion("Exportar plan");
          }}
          onImportar={() => {
            setUltimaAccion("Importar plan");
          }}
          onBorrarTodo={() => {
            setUltimaAccion("Borrar todo");
          }}
        />
        <p className="muestrario__dato">
          vista {ruta.vista} · búsqueda «{buscado}» · última acción{" "}
          {ultimaAccion}
        </p>
      </Seccion>

      <Seccion titulo="Botones" pantalla="13b · 13c · 13d">
        <Fila>
          <Boton variante="primario">Resolver</Boton>
          <Boton variante="secundario">Elegir</Boton>
          <Boton variante="terciario">Ver ficha</Boton>
        </Fila>
        <Fila>
          <Boton variante="primario" tamano="chico">
            +
          </Boton>
          <Boton variante="secundario" tamano="chico">
            Agregar materia
          </Boton>
          <Boton variante="terciario" tamano="chico">
            Cambiar de comisión
          </Boton>
        </Fila>
        <Fila>
          <Boton variante="primario" disabled>
            Resolver
          </Boton>
          <Boton variante="secundario" disabled>
            Elegir
          </Boton>
          <Boton variante="terciario" disabled>
            Ver ficha
          </Boton>
        </Fila>
      </Seccion>

      <Seccion titulo="Chips" pantalla="13b · 13c · 14b">
        <Fila>
          <Chip variante="relleno">Todas</Chip>
          <Chip variante="seleccionado">Disponibles</Chip>
          <Chip variante="contorno">Electivas</Chip>
          <Chip variante="relleno">≤ 6 cr</Chip>
        </Fila>
        <Fila>
          <Chip pastilla variante="seleccionado">
            1.º 2026
          </Chip>
          <Chip pastilla variante="contorno">
            1.º 2027
          </Chip>
          <Chip
            pastilla
            variante="contorno"
            onClick={() => {
              setUltimaAccion("chip pulsable");
            }}
          >
            2.º 2027
          </Chip>
          <Chip pastilla variante="contorno" onClick={() => undefined} disabled>
            1.º 2028
          </Chip>
        </Fila>
        <Fila>
          <Chip variante="minor" titulo="Ciencia de Datos">
            CD
          </Chip>
          <Chip variante="minor" titulo="Inteligencia Artificial">
            IA
          </Chip>
          <Chip variante="minor" titulo="Imágenes y Realidad Virtual">
            IRV
          </Chip>
          <Chip variante="minor" titulo="Arquitectura de Software">
            ARQ
          </Chip>
        </Fila>
      </Seccion>

      <Seccion titulo="Campos" pantalla="13b · 13c">
        <Fila>
          <Campo etiqueta="Texto de ejemplo" placeholder="análisis" />
          <Campo
            tipo="busqueda"
            etiqueta="Buscar materia, código o docente (muestrario)"
            placeholder="Buscar materia, código o docente"
          />
          <Campo
            etiqueta="Campo deshabilitado"
            placeholder="análisis"
            disabled
          />
        </Fila>
      </Seccion>

      <Seccion titulo="Etiquetas" pantalla="13b · 13c">
        <Fila>
          <Etiqueta>93.18</Etiqueta>
          <Etiqueta>Lun 14–16</Etiqueta>
          <Etiqueta variante="contorno">101T</Etiqueta>
          <Etiqueta variante="contorno" color="var(--materia-4)">
            003T
          </Etiqueta>
          <Etiqueta variante="contorno" color="var(--materia-6)">
            201T
          </Etiqueta>
        </Fila>
      </Seccion>

      <Seccion titulo="Glifos de estado" pantalla="tokens.md">
        <Fila>
          {NOMBRES_GLIFO.map((nombre) => (
            <span className="muestrario__glifo" key={nombre}>
              <Glifo nombre={nombre} />
              <span className="muestrario__dato">{nombre}</span>
            </span>
          ))}
        </Fila>
      </Seccion>

      <Seccion titulo="Notas" pantalla="13b · 13g">
        <Nota>— 15.09 Agile / Lean · sin horario publicado</Nota>
        <Nota>
          Horarios publicados hace 3 días · pueden cambiar hasta la inscripción
        </Nota>
        <Nota variante="caja">
          Sin horarios publicados: salen en noviembre de 2026. Hasta entonces se
          planifica por carga y correlativas.
        </Nota>
      </Seccion>

      <Seccion titulo="Capas" pantalla="13c · 13d">
        <Fila>
          <Boton
            variante="secundario"
            onClick={() => {
              setModalAbierto(true);
            }}
          >
            Abrir el modal
          </Boton>
          <Boton
            variante="secundario"
            onClick={() => {
              setPanelAbierto(true);
            }}
          >
            Abrir el panel lateral
          </Boton>
        </Fila>
        <Modal
          abierto={modalAbierto}
          titulo="93.18 Álgebra Lineal · elegir comisión"
          subtitulo="9 comisiones · ordenadas por compatibilidad con tu 1.º 2026"
          ancho={1060}
          onCerrar={() => {
            setModalAbierto(false);
          }}
        >
          <Fila>
            <Boton variante="primario">Elegida</Boton>
            <Boton variante="secundario">Elegir</Boton>
            <Etiqueta>Lun 12–14 · 007R Rectorado</Etiqueta>
          </Fila>
        </Modal>
        {panelAbierto ? (
          <div className="muestrario__panel">
            <PanelLateral
              abierto
              titulo="Agregar a 1.º 2026"
              onCerrar={() => {
                setPanelAbierto(false);
              }}
            >
              {/*
                El campo va adentro a propósito: 13c es buscar con el panel
                abierto, y es el caso donde una trampa de foco mal hecha se
                come las teclas. Si se puede escribir acá, el panel sirve.
              */}
              <Campo
                tipo="busqueda"
                etiqueta="Buscar materia"
                placeholder="análisis"
                valor={enElPanel}
                onCambio={setEnElPanel}
              />
              <Fila>
                <Chip variante="relleno">Todas</Chip>
                <Chip variante="seleccionado">Disponibles</Chip>
              </Fila>
              <Nota>— sin horario publicado</Nota>
            </PanelLateral>
          </div>
        ) : null}
      </Seccion>

      <Seccion titulo="Carrusel" pantalla="13b">
        <Fila>
          {VISIBLES.map((cuantas) => (
            <Chip
              key={cuantas}
              variante={cuantas === visibles ? "seleccionado" : "contorno"}
              onClick={() => {
                setVisibles(cuantas);
              }}
            >
              {cuantas} visible{cuantas === 1 ? "" : "s"}
            </Chip>
          ))}
          <Boton
            variante="secundario"
            tamano="chico"
            onClick={() => {
              carrusel.current?.irA("2027-2C");
            }}
          >
            Planificar en 2.º 2027
          </Boton>
        </Fila>
        <Carrusel
          ref={carrusel}
          periodos={PERIODOS}
          visibles={visibles}
          acciones={
            <Boton variante="secundario" tamano="chico">
              Agregar materia
            </Boton>
          }
          render={(periodo) => (
            <div className="muestrario__tarjeta">
              <p className="muestrario__tarjeta-titulo">
                {etiquetaLarga(periodo)}
              </p>
              {/* Alturas distintas a propósito: las tarjetas se igualan solas. */}
              <p className="muestrario__dato">
                {periodo === "2026-1C"
                  ? "7 materias · 39 cr · ▲ 1"
                  : "5 materias · 30 cr"}
              </p>
              {periodo === "2026-1C" ? (
                <Nota>— 15.09 Agile / Lean · sin horario publicado</Nota>
              ) : null}
            </div>
          )}
        />
      </Seccion>

      <Seccion titulo="Colores de materia" pantalla="tokens.md">
        <Fila>
          {Array.from({ length: 10 }, (_, indice) => (
            <span
              className="muestrario__color"
              key={indice}
              style={
                {
                  "--muestra": `var(--materia-${indice})`,
                } as CSSProperties
              }
            >
              <Etiqueta>{indice}</Etiqueta>
            </span>
          ))}
        </Fila>
      </Seccion>

      {/*
        Widget 7a con el choque 9d y la tarjeta que lo contiene. Los datos son
        los del corpus (`componentes/GrillaSemanal/ejemplo.ts`): 93.18 com. A,
        72.44 com. S y 30.28 com. A del archivo de casos raros, con el choque y
        el cambio de sede que calcula el motor.
      */}
      <Seccion titulo="Grilla semanal" pantalla="7a · 13b">
        <p className="muestrario__dato">
          15 px por hora (dos tarjetas) · choque del lunes 15–16
        </p>
        <GrillaSemanal
          bloques={MATERIAS}
          choques={CHOQUES}
          horaPx={15}
          nombreDeSede={nombreDeSede}
          alClic={(codigo) => {
            setUltimaAccion(`clic en ${codigo}`);
          }}
          alPasar={(bloque) => {
            setUltimaAccion(
              bloque === null ? "—" : `mouse en ${bloque.materia.codigo}`,
            );
          }}
        />
        <p className="muestrario__dato">
          18 px por hora (una tarjeta sola) · estados, cambio de sede ↕ y bloque
          de sábado al pie
        </p>
        <GrillaSemanal
          bloques={[
            { ...ALGEBRA, estado: "cursando" },
            { ...ACCIONAMIENTOS_PEGADO, estado: "planificada" },
            CRIPTO_SABADO,
          ]}
          cambiosDeSede={CAMBIOS_DE_SEDE}
          horaPx={18}
          nombreDeSede={nombreDeSede}
        />
      </Seccion>

      <Seccion titulo="Lista de conflictos" pantalla="13b · 13h">
        <ListaConflictos
          choques={CHOQUES}
          cambiosDeSede={CAMBIOS_DE_SEDE}
          nombreDeSede={nombreDeSede}
          alResolver={(choque) => {
            setUltimaAccion(`resolver ${choque.a.codigo} ↔ ${choque.b.codigo}`);
          }}
          alVer={(cambio) => {
            setUltimaAccion(`ver cambio de sede ${cambio.dia} ${cambio.hora}`);
          }}
        />
      </Seccion>

      <Seccion titulo="Tarjeta de cuatrimestre" pantalla="13b · 13g">
        <Carrusel
          periodos={[PERIODO, "2027-1C", "2027-2C"]}
          visibles={2}
          render={(periodo) =>
            periodo === PERIODO ? (
              <TarjetaCuatrimestre
                variante="conHorarios"
                periodo={periodo}
                resumen="3 materias · ▲ 1"
                bloques={MATERIAS}
                choques={CHOQUES}
                horaPx={15}
                sinHorarioPublicado={[
                  {
                    codigo: SIN_HORARIO.codigo,
                    abreviacion: SIN_HORARIO.abreviacion,
                  },
                ]}
                publicado="2026-09-09"
                hoy="2026-09-12"
                nombreDeSede={nombreDeSede}
                alResolver={(choque) => {
                  setUltimaAccion(`resolver ${choque.a.codigo}`);
                }}
                alClic={(codigo) => {
                  setUltimaAccion(`ficha de ${codigo}`);
                }}
              />
            ) : periodo === "2027-1C" ? (
              <TarjetaCuatrimestre
                variante="sinHorarios"
                periodo={periodo}
                resumen="3 materias · 21 cr"
                materias={MATERIAS_SIN_HORARIOS}
                horariosEsperados={HORARIOS_ESPERADOS}
                hitos={HITOS}
                alAgregar={() => {
                  setUltimaAccion("agregar materia en 1.º 2027");
                }}
              />
            ) : (
              <TarjetaCuatrimestre
                variante="vacia"
                periodo={periodo}
                alAgregar={() => {
                  setUltimaAccion("agregar materia en 2.º 2027");
                }}
              />
            )
          }
        />
      </Seccion>

      <SeccionPlanDeEstudios />
    </div>
  );
}
