/**
 * Pantalla de trabajo (13b, con 13g y 13h adentro).
 *
 * El carrusel muestra un cuatrimestre por tarjeta. El único que tiene grilla es
 * el que tiene archivo de horarios publicado —el activo o el de vista previa—;
 * el resto son listas de materias con sus créditos y sus hitos, porque los
 * horarios de un cuatrimestre futuro todavía no existen (13g).
 *
 * La página no calcula reglas: `armado.ts` traduce lo que devuelve el motor a
 * lo que piden `Carrusel` y `TarjetaCuatrimestre`.
 */

import { useEffect, useMemo, useState } from "react";

import { BannerConflictos } from "../../componentes/BannerConflictos";
import { Carrusel } from "../../componentes/Carrusel";
import {
  PantallaCargando,
  PantallaError,
} from "../../componentes/PantallaEstado";
import { TarjetaCuatrimestre } from "../../componentes/TarjetaCuatrimestre";
import { Boton } from "../../componentes/primitivas";
import type {
  Codigo,
  Dia,
  Fecha,
  PeriodoId,
  Visibles,
} from "../../contrato/tipos";
import type { DatosCargados } from "../../datos/useDatos";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import {
  cambiosDeSede as calcularCambiosDeSede,
  choques as calcularChoques,
  type CambioDeSede,
  type Choque,
} from "../../motor";
import { navegar } from "../../rutas";
import {
  creditosDelPeriodo,
  hitosDelPeriodo,
  materiasDeLaLista,
  materiasEnGrilla,
  materiasSinHorarioPublicado,
  nombreCorto,
  periodoDeFecha,
  periodosDelCarrusel,
  resumenDelPeriodo,
} from "./armado";
import "./PaginaPlan.css";

/** Escala de la grilla: 18 px/h con una tarjeta sola, 15 con dos o tres. */
const HORA_PX_SOLA = 18;
const HORA_PX_ACOMPANADA = 15;

const VISIBLES: readonly Visibles[] = [1, 2, 3];

export interface PropsPaginaPlan {
  /**
   * El panel lateral de «Agregar materia» está abierto (13c). Mientras lo
   * está, el carrusel baja a una tarjeta y al cerrarse vuelve a la preferencia
   * guardada.
   */
  panelAbierto?: boolean;
  /** Abre el panel de U3.3 para ese cuatrimestre. */
  alAgregar?: (periodo: PeriodoId) => void;
  /** «Resolver» un choque: abre 13d para la primera materia del par. */
  alResolver?: (periodo: PeriodoId, codigoA: Codigo, codigoB: Codigo) => void;
}

function Vacio() {
  return (
    <section className="plan-vacio">
      <h2 className="plan-vacio__titulo">Todavía no hay nada en tu plan</h2>
      <p className="plan-vacio__detalle">
        Para empezar necesito saber qué aprobaste. Todo queda en este navegador:
        no hay cuenta ni servidor.
      </p>
      <a className="plan-vacio__enlace" href="#/inicio">
        Cargar tu historia académica
      </a>
    </section>
  );
}

/**
 * Cómo escribe `GrillaSemanal` el día en el nombre accesible del bloque.
 *
 * Es una copia deliberada de su `NOMBRE_DIA` (con acentos en miércoles y
 * sábado): el componente no lo exporta y no es de esta unidad, así que se
 * duplica acá en vez de tocarlo. Queda pedido en las notas que `GrillaSemanal`
 * exporte el mapa —o mejor, una prop para resaltar bloques— y entonces esto se
 * borra. Un selector de atributo de CSS distingue acentos: sin esta traducción,
 * «Ver» de un miércoles o un sábado no resaltaba nada y no avisaba.
 */
const NOMBRE_DIA: Record<Dia, string> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
};

/**
 * Regla CSS que resalta los dos bloques de un cambio de sede («Ver» de 13h).
 *
 * `GrillaSemanal` todavía no expone una prop para resaltar bloques (queda
 * pedido en las notas de la unidad) y su nombre accesible sí identifica al
 * bloque exacto: «<código> <nombre> · comisión <id> · <día> <desde>–<hasta>».
 * Los valores interpolados salen del motor; se quitan comillas y barras por si
 * algún día un nombre las trajera.
 */
export function reglaDeResaltado(cambio: CambioDeSede | null): string | null {
  if (cambio === null) {
    return null;
  }
  const limpiar = (texto: string) => texto.replace(/["\\]/g, "");
  const selectores = [cambio.a, cambio.b].map((lado) => {
    const prefijo = limpiar(`${lado.codigo} `);
    const franja = limpiar(
      ` · ${NOMBRE_DIA[lado.bloque.dia]} ${lado.bloque.desde}–` +
        `${lado.bloque.hasta}`,
    );
    return (
      `.plan--resaltando .grilla__bloque[aria-label^="${prefijo}"]` +
      `[aria-label*="${franja}"]`
    );
  });
  return `${selectores.join(",")}{outline:2px solid var(--choque);outline-offset:1px;}`;
}

export interface PropsPlanConDatos extends PropsPaginaPlan {
  datos: DatosCargados;
  /** Hoy, para saber en qué cuatrimestre estamos si el índice no lo dice. */
  hoy?: Fecha;
}

/** Identifica un cambio de sede sin depender de la identidad del objeto. */
function claveDelCambio(cambio: CambioDeSede): string {
  return `${cambio.dia}-${cambio.hora}-${cambio.a.codigo}-${cambio.b.codigo}`;
}

/** 13b con los datos ya cargados. `PaginaPlan` es esto más la carga. */
export function PlanConDatos({
  datos,
  hoy,
  panelAbierto = false,
  alAgregar,
  alResolver,
}: PropsPlanConDatos) {
  const { plan: planUsuario, despachar } = usePlanUsuario();
  const { plan, abreviaciones, vocabulario, indice, periodo, horarios } = datos;

  const activo = periodo?.entrada.periodo ?? null;
  const referencia = useMemo(() => periodoDeFecha(hoy ?? hoyIso()), [hoy]);
  const periodos = useMemo(
    () => periodosDelCarrusel(planUsuario, activo, referencia),
    [planUsuario, activo, referencia],
  );

  const [seleccionado, setSeleccionado] = useState<PeriodoId | null>(null);
  const [resaltado, setResaltado] = useState<CambioDeSede | null>(null);

  // Si el cuatrimestre elegido deja de estar en el carrusel, se vuelve al
  // primero en vez de quedar apuntando a la nada.
  useEffect(() => {
    setSeleccionado((actual) =>
      actual !== null && periodos.includes(actual) ? actual : null,
    );
  }, [periodos]);

  // El resaltado de «Ver» se apaga con Escape; el segundo clic en el mismo
  // «Ver» también (`alVer` más abajo). Sin esto quedaba puesto para siempre.
  useEffect(() => {
    if (resaltado === null) {
      return undefined;
    }
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setResaltado(null);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
    };
  }, [resaltado]);

  const nombreDeSede = useMemo(() => {
    const nombres = new Map(
      vocabulario.sedes.map((sede) => [sede.id, sede.nombre]),
    );
    return (id: string) => nombres.get(id) ?? id;
  }, [vocabulario]);

  const nombreDeMateria = useMemo(
    () => (codigo: Codigo, nombreDelCurso: string) =>
      nombreCorto(codigo, plan, abreviaciones, nombreDelCurso),
    [plan, abreviaciones],
  );

  const sinHistoria = Object.keys(planUsuario.historia).length === 0;
  const sinPeriodos = Object.keys(planUsuario.periodos).length === 0;
  if (sinHistoria && sinPeriodos) {
    return <Vacio />;
  }

  const enCurso = seleccionado ?? periodos[0] ?? null;
  const visibles: Visibles = panelAbierto
    ? 1
    : planUsuario.preferencias.visibles;
  const horaPx = visibles === 1 ? HORA_PX_SOLA : HORA_PX_ACOMPANADA;

  /** Choques y cambios de sede del único período que tiene horarios. */
  const conflictos: { choques: Choque[]; cambiosDeSede: CambioDeSede[] } =
    horarios === null || activo === null
      ? { choques: [], cambiosDeSede: [] }
      : {
          choques: calcularChoques(activo, planUsuario, horarios),
          cambiosDeSede: calcularCambiosDeSede(activo, planUsuario, horarios),
        };

  const regla = reglaDeResaltado(resaltado);

  function tarjeta(periodoDeLaTarjeta: PeriodoId) {
    const planificadas = planUsuario.periodos[periodoDeLaTarjeta] ?? [];
    const creditos = creditosDelPeriodo(periodoDeLaTarjeta, planUsuario, plan);
    const agregar =
      alAgregar === undefined
        ? undefined
        : () => {
            alAgregar(periodoDeLaTarjeta);
          };

    if (horarios !== null && periodoDeLaTarjeta === activo) {
      const resumen = resumenDelPeriodo(
        planificadas.length,
        creditos,
        conflictos.choques.length,
      );
      const publicado = periodo?.entrada.publicado;
      return (
        <TarjetaCuatrimestre
          variante="conHorarios"
          periodo={periodoDeLaTarjeta}
          {...(resumen === undefined ? {} : { resumen })}
          bloques={materiasEnGrilla(
            periodoDeLaTarjeta,
            planUsuario,
            plan,
            horarios,
            abreviaciones,
          )}
          choques={conflictos.choques}
          cambiosDeSede={conflictos.cambiosDeSede}
          horaPx={horaPx}
          sinHorarioPublicado={materiasSinHorarioPublicado(
            periodoDeLaTarjeta,
            planUsuario,
            plan,
            horarios,
            abreviaciones,
          )}
          {...(publicado === undefined ? {} : { publicado })}
          nombreDeSede={nombreDeSede}
          nombreDeMateria={nombreDeMateria}
          {...(alResolver === undefined
            ? {}
            : {
                alResolver: (choque: Choque) => {
                  alResolver(
                    periodoDeLaTarjeta,
                    choque.a.codigo,
                    choque.b.codigo,
                  );
                },
              })}
          alVer={(cambio: CambioDeSede) => {
            // Segundo clic en el mismo «Ver»: se apaga el resaltado.
            setResaltado((actual) =>
              actual !== null &&
              claveDelCambio(actual) === claveDelCambio(cambio)
                ? null
                : cambio,
            );
          }}
          alClic={(codigo) => {
            navegar({ vista: "materia", codigo });
          }}
        />
      );
    }

    if (planificadas.length === 0) {
      return (
        <TarjetaCuatrimestre
          variante="vacia"
          periodo={periodoDeLaTarjeta}
          {...(agregar === undefined ? {} : { alAgregar: agregar })}
        />
      );
    }

    const esperados = indice.horarios_esperados?.[periodoDeLaTarjeta];
    const resumen = resumenDelPeriodo(planificadas.length, creditos, 0);
    return (
      <TarjetaCuatrimestre
        variante="sinHorarios"
        periodo={periodoDeLaTarjeta}
        {...(resumen === undefined ? {} : { resumen })}
        materias={materiasDeLaLista(
          periodoDeLaTarjeta,
          planUsuario,
          plan,
          abreviaciones,
        )}
        {...(esperados === undefined ? {} : { horariosEsperados: esperados })}
        hitos={hitosDelPeriodo(
          periodoDeLaTarjeta,
          planUsuario,
          plan,
          periodos[0] ?? periodoDeLaTarjeta,
        )}
        {...(agregar === undefined ? {} : { alAgregar: agregar })}
      />
    );
  }

  return (
    <div className={`plan${resaltado === null ? "" : " plan--resaltando"}`}>
      {regla === null ? null : <style>{regla}</style>}

      {/* El contenedor solo existe si el banner va a dibujar algo: con cero
          choques `BannerConflictos` devuelve `null` y un div vacío dejaba un
          hueco arriba del carrusel que 13b no tiene. */}
      {activo === null || conflictos.choques.length === 0 ? null : (
        <div className="plan__banner">
          <BannerConflictos
            periodo={activo}
            choques={conflictos.choques}
            cambiosDeSede={conflictos.cambiosDeSede}
            {...(alResolver === undefined
              ? {}
              : {
                  alResolver: (choque: Choque) => {
                    alResolver(activo, choque.a.codigo, choque.b.codigo);
                  },
                })}
          />
        </div>
      )}

      {/* `periodosDelCarrusel` nunca devuelve la lista vacía: sin período
          activo y sin cuatrimestres propios arranca en el de hoy. */}
      <Carrusel
        periodos={periodos}
        visibles={visibles}
        onMover={setSeleccionado}
        acciones={
          <div className="plan__acciones">
            <div
              className="plan__visibles"
              role="group"
              aria-label="Cuatrimestres visibles"
            >
              {VISIBLES.map((cuantos) => (
                <button
                  type="button"
                  key={cuantos}
                  className={`plan__visible${
                    cuantos === visibles ? " plan__visible--activo" : ""
                  }`}
                  aria-pressed={cuantos === visibles}
                  disabled={panelAbierto}
                  onClick={() => {
                    despachar({ tipo: "setVisibles", visibles: cuantos });
                  }}
                >
                  {cuantos}
                </button>
              ))}
            </div>
            <Boton
              variante="primario"
              disabled={alAgregar === undefined || enCurso === null}
              onClick={() => {
                // TODO(U3.3): el orquestador conecta `alAgregar` con el panel
                // de «Agregar materia»; sin él, el botón queda deshabilitado.
                if (enCurso !== null) {
                  alAgregar?.(enCurso);
                }
              }}
            >
              Agregar materia
            </Boton>
          </div>
        }
        render={tarjeta}
      />
    </div>
  );
}

/** 13b completa: carga los datos publicados y dibuja el carrusel. */
export function PaginaPlan(props: PropsPaginaPlan) {
  const { plan: planUsuario } = usePlanUsuario();
  const hoy = useMemo(() => hoyIso(), []);
  const datos = useDatos(planUsuario.plan, hoy);

  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return <PlanConDatos datos={datos.datos} {...props} />;
}
