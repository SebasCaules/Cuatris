/**
 * Pestaña «Cursada» (13b, con 13g y 13h adentro).
 *
 * Es la pantalla de trabajo: el banner de progreso arriba y el carrusel de
 * cuatrimestres con sus horarios ocupando todo el ancho. Lo que se aprobó no
 * se marca acá —eso pasó a la pestaña «Plan» (R1)—; acá se arma la cursada
 * que viene.
 *
 * El carrusel muestra un cuatrimestre por tarjeta. El único que tiene grilla es
 * el que tiene archivo de horarios publicado —el activo o el de vista previa—;
 * el resto son listas de materias con sus créditos y sus hitos, porque los
 * horarios de un cuatrimestre futuro todavía no existen (13g).
 *
 * Tres interacciones del rediseño viven acá porque cruzan tarjetas:
 *
 * - **Previsualización**: la materia bajo el puntero en el panel de agregar
 *   (`previsualizada`) se dibuja como fantasma en cada tarjeta donde entra.
 * - **Arrastre** (Pointer Events, sin librería): cualquier materia colocada se
 *   lleva de una tarjeta a otra; el destino se marca válido o inválido con la
 *   simulación de `armado.destinoValido`.
 * - **Autocolocación** de las troncales pendientes, con su «Deshacer».
 *
 * La página no calcula reglas: `armado.ts` traduce lo que devuelve el motor a
 * lo que piden `Carrusel` y `TarjetaCuatrimestre`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as MouseEventDeReact,
  type PointerEvent as PointerEventDeReact,
} from "react";

import { BannerConflictos } from "../../componentes/BannerConflictos";
import { Carrusel } from "../../componentes/Carrusel";
import { nombresDeMinors } from "../../componentes/PanelAgregar";
import { BannerProgreso } from "../../componentes/PanelProgreso";
import {
  PantallaCargando,
  PantallaError,
} from "../../componentes/PantallaEstado";
import { TarjetaCuatrimestre } from "../../componentes/TarjetaCuatrimestre";
import { Boton, Nota, Tooltip } from "../../componentes/primitivas";
import type {
  Codigo,
  Dia,
  Fecha,
  PeriodoId,
  PlanUsuario,
  Visibles,
} from "../../contrato/tipos";
import type { DatosCargados } from "../../datos/useDatos";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import { reducir } from "../../estado/planUsuario";
import {
  cambiosDeSede as calcularCambiosDeSede,
  choques as calcularChoques,
  type CambioDeSede,
  type Choque,
} from "../../motor";
import { navegar } from "../../rutas";
import {
  autocolocar,
  creditosDelPeriodo,
  destinoValido,
  hitosDelPeriodo,
  materiasDeLaLista,
  materiasEnGrilla,
  materiasSinComision,
  materiasSinHorarioPublicado,
  nombreCorto,
  periodoDeFecha,
  periodosDelCarrusel,
  previsualizacionEn,
  resumenDelPeriodo,
} from "./armado";
import "./PaginaCursada.css";

/** Escala de la grilla: 18 px/h con una tarjeta sola, 15 con dos o tres. */
const HORA_PX_SOLA = 18;
const HORA_PX_ACOMPANADA = 15;

const VISIBLES: readonly Visibles[] = [1, 2, 3];

/** Cuánto hay que mover el puntero para que un clic pase a ser un arrastre. */
const UMBRAL_ARRASTRE_PX = 5;

/** Ancho de la franja, en cada borde del carrusel, que lo hace scrollear. */
const BORDE_AUTOSCROLL_PX = 48;

export interface PropsPaginaCursada {
  /**
   * El panel lateral de «Agregar materia» está abierto (13c). El carrusel no
   * cambia de tamaño por eso —13c conserva sus dos tarjetas al lado del panel
   * de 330 px—; solo se achica la escala de la grilla para que las dos entren
   * en el ancho que queda.
   */
  panelAbierto?: boolean;
  /** Abre el panel de U3.3 para ese cuatrimestre. */
  alAgregar?: (periodo: PeriodoId) => void;
  /** «Resolver» un choque: abre 13d para la primera materia del par. */
  alResolver?: (periodo: PeriodoId, codigoA: Codigo, codigoB: Codigo) => void;
  /** Materia bajo el puntero en el panel de agregar; se previsualiza. */
  previsualizada?: Codigo | null;
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
  domingo: "domingo",
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
      `.cursada--resaltando .grilla__bloque[aria-label^="${prefijo}"]` +
      `[aria-label*="${franja}"]`
    );
  });
  return `${selectores.join(",")}{outline:2px solid var(--choque);outline-offset:1px;}`;
}

export interface PropsCursadaConDatos extends PropsPaginaCursada {
  datos: DatosCargados;
  /** Hoy, para saber en qué cuatrimestre estamos si el índice no lo dice. */
  hoy?: Fecha;
}

/** Identifica un cambio de sede sin depender de la identidad del objeto. */
function claveDelCambio(cambio: CambioDeSede): string {
  return `${cambio.dia}-${cambio.hora}-${cambio.a.codigo}-${cambio.b.codigo}`;
}

/** Un arrastre de materia en curso. */
interface Arrastre {
  codigo: Codigo;
  desde: PeriodoId;
  etiqueta: string;
  x: number;
  y: number;
  /** Tarjeta bajo el puntero, si hay. */
  hacia: PeriodoId | null;
  valido: boolean;
}

/** Lo que se apretó y todavía no se movió lo suficiente para ser arrastre. */
interface ArrastrePendiente {
  codigo: Codigo;
  desde: PeriodoId;
  x: number;
  y: number;
}

/** La materia y la tarjeta detrás de un `pointerdown`, si lo hay. */
function origenDelArrastre(destino: EventTarget | null): ArrastrePendiente | null {
  if (!(destino instanceof Element)) {
    return null;
  }
  const materia = destino.closest<HTMLElement>("[data-arrastre-codigo]");
  const tarjeta = materia?.closest<HTMLElement>("[data-periodo]");
  const codigo = materia?.dataset["arrastreCodigo"];
  const desde = tarjeta?.dataset["periodo"];
  if (codigo === undefined || desde === undefined) {
    return null;
  }
  return { codigo, desde, x: 0, y: 0 };
}

/** La tarjeta de cuatrimestre debajo de un punto de la pantalla. */
function periodoBajo(x: number, y: number): PeriodoId | null {
  const elemento = document.elementFromPoint(x, y);
  const tarjeta = elemento?.closest<HTMLElement>("[data-periodo]");
  return tarjeta?.dataset["periodo"] ?? null;
}

/** Regla CSS que atenúa el origen de lo que se está arrastrando. */
export function reglaDeArrastre(codigo: Codigo | null): string | null {
  if (codigo === null) {
    return null;
  }
  const limpio = codigo.replace(/["\\]/g, "");
  return (
    `.cursada--arrastrando [data-arrastre-codigo="${limpio}"]` +
    "{opacity:.35;}"
  );
}

/** 13b con los datos ya cargados. `PaginaCursada` es esto más la carga. */
export function CursadaConDatos({
  datos,
  hoy,
  panelAbierto = false,
  alAgregar,
  alResolver,
  previsualizada = null,
}: PropsCursadaConDatos) {
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
  /**
   * El plan de antes y de después de autocolocar. «Deshacer» vale mientras el
   * plan siga siendo el de después: al primer cambio ajeno se descarta, porque
   * volver atrás borraría también ese cambio.
   */
  const [autocolocado, setAutocolocado] = useState<{
    antes: PlanUsuario;
    despues: PlanUsuario;
  } | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const pendiente = useRef<ArrastrePendiente | null>(null);
  const recienArrastrado = useRef(false);
  const raiz = useRef<HTMLDivElement>(null);

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

  const minors = useMemo(() => nombresDeMinors(plan), [plan]);

  useEffect(() => {
    setAutocolocado((actual) =>
      actual !== null && actual.despues !== planUsuario ? null : actual,
    );
  }, [planUsuario]);

  const escapeDelArrastre = arrastre !== null;
  useEffect(() => {
    if (!escapeDelArrastre) {
      return undefined;
    }
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        pendiente.current = null;
        setArrastre(null);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
    };
  }, [escapeDelArrastre]);

  /*
   * Arrastre de materias entre tarjetas. El `pointerdown` se escucha en la
   * raíz de la página, delegado: cualquier elemento con `data-arrastre-codigo`
   * dentro de una tarjeta con `data-periodo` es arrastrable. El carrusel no
   * compite: su arrastre-para-scrollear ignora esos elementos.
   */
  const alApretar = (evento: PointerEventDeReact<HTMLDivElement>) => {
    if (evento.button !== 0) {
      return;
    }
    const origen = origenDelArrastre(evento.target);
    if (origen === null) {
      return;
    }
    pendiente.current = { ...origen, x: evento.clientX, y: evento.clientY };
  };

  const alMover = (evento: PointerEventDeReact<HTMLDivElement>) => {
    const inicio = pendiente.current;
    if (inicio !== null && arrastre === null) {
      if (
        Math.abs(evento.clientX - inicio.x) < UMBRAL_ARRASTRE_PX &&
        Math.abs(evento.clientY - inicio.y) < UMBRAL_ARRASTRE_PX
      ) {
        return;
      }
      const contenedor = raiz.current;
      if (contenedor !== null && typeof contenedor.setPointerCapture === "function") {
        contenedor.setPointerCapture(evento.pointerId);
      }
      setArrastre({
        codigo: inicio.codigo,
        desde: inicio.desde,
        etiqueta: `${inicio.codigo} ${nombreCorto(inicio.codigo, plan, abreviaciones)}`,
        x: evento.clientX,
        y: evento.clientY,
        hacia: null,
        valido: false,
      });
      return;
    }
    if (arrastre === null) {
      return;
    }
    const hacia = periodoBajo(evento.clientX, evento.clientY);
    setArrastre((actual) => {
      if (actual === null) {
        return actual;
      }
      const valido =
        hacia === actual.hacia
          ? actual.valido
          : hacia !== null &&
            destinoValido(actual.codigo, actual.desde, hacia, planUsuario, plan);
      return { ...actual, x: evento.clientX, y: evento.clientY, hacia, valido };
    });
  };

  const alSoltar = (evento: PointerEventDeReact<HTMLDivElement>) => {
    pendiente.current = null;
    if (arrastre === null) {
      return;
    }
    const contenedor = raiz.current;
    if (
      contenedor !== null &&
      typeof contenedor.hasPointerCapture === "function" &&
      contenedor.hasPointerCapture(evento.pointerId)
    ) {
      contenedor.releasePointerCapture(evento.pointerId);
    }
    if (arrastre.hacia !== null && arrastre.valido) {
      despachar({
        tipo: "moverMateria",
        desde: arrastre.desde,
        hacia: arrastre.hacia,
        codigo: arrastre.codigo,
      });
    }
    // El clic que el navegador dispara al soltar no es un clic: se traga.
    recienArrastrado.current = true;
    setArrastre(null);
  };

  const alClicCapturado = (evento: MouseEventDeReact<HTMLDivElement>) => {
    if (recienArrastrado.current) {
      recienArrastrado.current = false;
      evento.stopPropagation();
      evento.preventDefault();
    }
  };

  // Cerca de un borde del carrusel, arrastrar lo hace scrollear: si no, solo
  // se podría soltar en las tarjetas que ya están a la vista.
  const bordeDelArrastre =
    arrastre === null ? null : arrastre.x;
  useEffect(() => {
    if (bordeDelArrastre === null) {
      return undefined;
    }
    const ventana = raiz.current?.querySelector<HTMLElement>(".carrusel__ventana");
    if (ventana === null || ventana === undefined) {
      return undefined;
    }
    const caja = ventana.getBoundingClientRect();
    const paso =
      bordeDelArrastre < caja.left + BORDE_AUTOSCROLL_PX
        ? -10
        : bordeDelArrastre > caja.right - BORDE_AUTOSCROLL_PX
          ? 10
          : 0;
    if (paso === 0) {
      return undefined;
    }
    let cuadro = 0;
    const avanzar = () => {
      ventana.scrollLeft += paso;
      cuadro = requestAnimationFrame(avanzar);
    };
    cuadro = requestAnimationFrame(avanzar);
    return () => {
      cancelAnimationFrame(cuadro);
    };
  }, [bordeDelArrastre]);

  const claseDeTarjeta = useCallback(
    (periodoDeLaTarjeta: PeriodoId) => {
      if (arrastre === null || arrastre.hacia !== periodoDeLaTarjeta) {
        return undefined;
      }
      if (periodoDeLaTarjeta === arrastre.desde) {
        return undefined;
      }
      return arrastre.valido
        ? "carrusel__tarjeta--destino-valido"
        : "carrusel__tarjeta--destino-invalido";
    },
    [arrastre],
  );

  /**
   * Autocoloca las troncales que faltan. El plan resultante se calcula acá con
   * el mismo reductor y se despacha como `reemplazar`, para quedarse con la
   * referencia exacta que va a tener el contexto y saber después si cambió.
   */
  const completarTroncales = () => {
    const colocaciones = autocolocar(planUsuario, plan, periodos);
    if (colocaciones.length === 0) {
      return;
    }
    const despues = reducir(planUsuario, { tipo: "agregarVarias", colocaciones });
    setAutocolocado({ antes: planUsuario, despues });
    despachar({ tipo: "reemplazar", plan: despues });
  };

  const deshacerAutocolocacion = () => {
    if (autocolocado === null) {
      return;
    }
    despachar({ tipo: "reemplazar", plan: autocolocado.antes });
    setAutocolocado(null);
  };

  /*
   * Sin nada aprobado el carrusel igual se dibuja: R1 sacó la pantalla vacía
   * que tapaba 13b. Lo que se avisa es que las reglas que dan sentido a esta
   * pantalla —choques, correlativas, créditos— se calculan sobre lo aprobado,
   * y eso se marca en la pestaña «Plan».
   */
  const sinHistoria = Object.keys(planUsuario.historia).length === 0;

  const enCurso = seleccionado ?? periodos[0] ?? null;
  const visibles: Visibles = planUsuario.preferencias.visibles;
  const horaPx =
    visibles === 1 && !panelAbierto ? HORA_PX_SOLA : HORA_PX_ACOMPANADA;

  /** Choques y cambios de sede del único período que tiene horarios. */
  const conflictos: { choques: Choque[]; cambiosDeSede: CambioDeSede[] } =
    horarios === null || activo === null
      ? { choques: [], cambiosDeSede: [] }
      : {
          choques: calcularChoques(activo, planUsuario, horarios),
          cambiosDeSede: calcularCambiosDeSede(activo, planUsuario, horarios),
        };

  const regla = reglaDeResaltado(resaltado);
  const reglaArrastre = reglaDeArrastre(arrastre?.codigo ?? null);

  function tarjeta(periodoDeLaTarjeta: PeriodoId) {
    const planificadas = planUsuario.periodos[periodoDeLaTarjeta] ?? [];
    const creditos = creditosDelPeriodo(periodoDeLaTarjeta, planUsuario, plan);
    const agregar =
      alAgregar === undefined
        ? undefined
        : () => {
            alAgregar(periodoDeLaTarjeta);
          };
    const previsualizacion =
      previsualizada === null
        ? null
        : previsualizacionEn(
            previsualizada,
            periodoDeLaTarjeta,
            planUsuario,
            plan,
            abreviaciones,
            periodoDeLaTarjeta === activo ? horarios : null,
          );
    const comunes = {
      nombresDeMinors: minors,
      ...(previsualizacion === null ? {} : { previsualizacion }),
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
          {...comunes}
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
          sinComision={materiasSinComision(
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
          {...comunes}
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
        {...comunes}
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

  const clases = [
    "cursada",
    resaltado === null ? "" : "cursada--resaltando",
    arrastre === null ? "" : "cursada--arrastrando",
  ]
    .filter((clase) => clase !== "")
    .join(" ");

  return (
    <div
      className={clases}
      ref={raiz}
      onPointerDown={alApretar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onClickCapture={alClicCapturado}
    >
      {regla === null ? null : <style>{regla}</style>}
      {reglaArrastre === null ? null : <style>{reglaArrastre}</style>}

      <div className="cursada__progreso">
        {activo === null ? (
          <BannerProgreso plan={plan} planUsuario={planUsuario} />
        ) : (
          <BannerProgreso plan={plan} planUsuario={planUsuario} desde={activo} />
        )}
      </div>

      {sinHistoria ? (
        <div className="cursada__aviso">
          <Nota variante="caja">
            Todavía no marcaste nada en el Plan: los choques y correlativas se
            calculan sobre lo aprobado.{" "}
            <a className="cursada__aviso-enlace" href="#/plan">
              Ir al plan
            </a>
          </Nota>
        </div>
      ) : null}

      {/* El contenedor solo existe si el banner va a dibujar algo: con cero
          choques `BannerConflictos` devuelve `null` y un div vacío dejaba un
          hueco arriba del carrusel que 13b no tiene. */}
      {activo === null || conflictos.choques.length === 0 ? null : (
        <div className="cursada__banner">
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
          <div className="cursada__acciones">
            <div
              className="cursada__visibles"
              role="group"
              aria-label="Cuatrimestres visibles"
            >
              {VISIBLES.map((cuantos) => (
                <button
                  type="button"
                  key={cuantos}
                  className={`cursada__visible${
                    cuantos === visibles ? " cursada__visible--activo" : ""
                  }`}
                  aria-pressed={cuantos === visibles}
                  onClick={() => {
                    despachar({ tipo: "setVisibles", visibles: cuantos });
                  }}
                >
                  {cuantos}
                </button>
              ))}
            </div>
            {autocolocado === null ? (
              <Tooltip texto="Pone las troncales pendientes en los cuatrimestres que faltan, respetando correlativas y carga">
                <Boton variante="secundario" onClick={completarTroncales}>
                  Autocompletar troncales
                </Boton>
              </Tooltip>
            ) : (
              <Tooltip texto="Vuelve al plan de antes de autocompletar">
                <Boton variante="secundario" onClick={deshacerAutocolocacion}>
                  Deshacer
                </Boton>
              </Tooltip>
            )}
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
        claseDe={claseDeTarjeta}
        render={tarjeta}
      />

      {arrastre === null ? null : (
        <div
          className={`cursada__fantasma${
            arrastre.hacia === null || arrastre.hacia === arrastre.desde
              ? ""
              : arrastre.valido
                ? " cursada__fantasma--valido"
                : " cursada__fantasma--invalido"
          }`}
          style={{ left: arrastre.x, top: arrastre.y }}
          aria-hidden="true"
        >
          {arrastre.etiqueta}
        </div>
      )}
    </div>
  );
}

/** 13b completa: carga los datos publicados y dibuja el carrusel. */
export function PaginaCursada(props: PropsPaginaCursada) {
  const { plan: planUsuario } = usePlanUsuario();
  const hoy = useMemo(() => hoyIso(), []);
  const datos = useDatos(planUsuario.plan, hoy);

  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return <CursadaConDatos datos={datos.datos} {...props} />;
}
