/**
 * Reglas de la lista de 13c: qué materias se muestran, en qué orden, con qué
 * estado y con qué etiqueta de horario.
 *
 * Es TypeScript puro —sin React y sin DOM— para poder probarlo solo. Todo el
 * razonamiento de dominio lo hace el motor (`buscar`, `estadoMateria`,
 * `motivosBloqueo`, `ordenarComisiones`, `cupoLleno`); acá solo se decide qué
 * filas entran y cómo se redactan sus textos.
 */

import type {
  Abreviaciones,
  Bloque,
  Codigo,
  Dia,
  Horarios,
  Materia,
  PeriodoId,
  Plan,
  PlanUsuario,
} from "../../contrato/tipos";
import type { MotivoBloqueo } from "../../motor";
import {
  buscar,
  cupoLleno,
  cursoDe,
  DIAS,
  estadoMateria,
  motivosBloqueo,
  ordenarComisiones,
  primerPeriodoPlanificado,
} from "../../motor";
import { etiquetaCorta } from "../Carrusel";
import { etiquetaDeFranja } from "../GrillaSemanal";

/** Los tres filtros que se excluyen entre sí (13c). */
export type FiltroPrincipal = "todas" | "disponibles" | "electivas";

/** Texto de cada chip principal, en el orden del mockup. */
export const FILTROS_PRINCIPALES: readonly {
  id: FiltroPrincipal;
  texto: string;
}[] = [
  { id: "todas", texto: "Todas" },
  { id: "disponibles", texto: "Disponibles" },
  { id: "electivas", texto: "Electivas" },
];

/** Tope del chip «≤ 6 cr», que se combina con cualquiera de los tres. */
export const CREDITOS_CHICOS = 6;

export interface Filtros {
  principal: FiltroPrincipal;
  hastaSeisCreditos: boolean;
}

/** Lo que ve el panel al abrirse: el mockup arranca con «Disponibles». */
export const FILTROS_INICIALES: Filtros = {
  principal: "disponibles",
  hastaSeisCreditos: false,
};

/**
 * Estado de una fila de resultados.
 *
 * La precedencia es la del motor (`estadoMateria`): aprobada → cursando →
 * bloqueada → planificada → disponible. Una materia que ya está en el plan y
 * además quedó bloqueada se muestra como bloqueada, igual que en la tarjeta del
 * cuatrimestre; que el panel dijera otra cosa sería una segunda verdad.
 */
export type EstadoFila =
  | { tipo: "disponible" }
  | { tipo: "aprobada" }
  | { tipo: "cursando" }
  | { tipo: "bloqueada"; motivos: readonly MotivoBloqueo[] }
  | { tipo: "enElPlan"; periodo: PeriodoId };

export interface Fila {
  materia: Materia;
  estado: EstadoFila;
}

/** Días como los abrevia el mockup: «Mié 10–12 · 007R». */
const DIA_CORTO: Record<Dia, string> = {
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  jueves: "Jue",
  viernes: "Vie",
  sabado: "Sáb",
  domingo: "Dom",
};

export function estadoDeFila(
  codigo: Codigo,
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
  planificadas: Map<Codigo, PeriodoId> = primerPeriodoPlanificado(planUsuario),
): EstadoFila {
  const estado = estadoMateria(codigo, periodo, planUsuario, plan);
  if (estado === "aprobada") {
    return { tipo: "aprobada" };
  }
  if (estado === "cursando") {
    return { tipo: "cursando" };
  }
  if (estado === "bloqueada") {
    return {
      tipo: "bloqueada",
      motivos: motivosBloqueo(codigo, periodo, planUsuario, plan),
    };
  }
  const donde = planificadas.get(codigo);
  if (donde !== undefined) {
    return { tipo: "enElPlan", periodo: donde };
  }
  return { tipo: "disponible" };
}

/** `"72.11"` → `«72.11 SO»`; sin abreviación, solo el código. */
function nombreCorto(codigo: Codigo, abreviaciones: Abreviaciones): string {
  const abreviacion = abreviaciones.abreviaciones[codigo] ?? "";
  return abreviacion === "" ? codigo : `${codigo} ${abreviacion}`;
}

/**
 * El motivo en una línea, como 13c: «falta 72.11 SO», «requiere 160 cr, tenés
 * 147» o «72.41 BD2 la cursás en 1.º 2026».
 */
export function textoDeMotivo(
  motivo: MotivoBloqueo,
  abreviaciones: Abreviaciones,
): string {
  if (motivo.tipo === "creditos") {
    return `requiere ${String(motivo.requeridos)} cr, tenés ${String(
      motivo.tienes,
    )}`;
  }
  const materia = nombreCorto(motivo.codigo, abreviaciones);
  if (motivo.estado === "falta" || motivo.periodo === undefined) {
    return `falta ${materia}`;
  }
  return `${materia} la cursás en ${etiquetaCorta(motivo.periodo)}`;
}

/** Todos los motivos, para el `title` de la fila. */
export function textoDeMotivos(
  motivos: readonly MotivoBloqueo[],
  abreviaciones: Abreviaciones,
): string {
  return motivos
    .map((motivo) => textoDeMotivo(motivo, abreviaciones))
    .join(" · ");
}

/** Lo que el período publica para una materia. */
export interface Oferta {
  /** Comisiones publicadas. Cero = no hay ninguna que elegir. */
  comisiones: number;
  /** Todas las comisiones publicadas están llenas. */
  cupoLleno: boolean;
  /** «Mié 10–12 · 007R»; vacío si la comisión no publicó bloques. */
  horario: string;
  /** «48/48» de la comisión que se muestra; vacío si el SGA no lo dice. */
  cupo: string;
}

/** Ninguna oferta: la materia no se dicta en el período o no tiene comisiones. */
const SIN_OFERTA: Oferta = {
  comisiones: 0,
  cupoLleno: false,
  horario: "",
  cupo: "",
};

/** El bloque que va primero en la semana, que es el que muestra 13c. */
function primerBloque(bloques: readonly Bloque[]): Bloque | null {
  const ordenados = [...bloques].sort((uno, otro) => {
    const dia = DIAS.indexOf(uno.dia) - DIAS.indexOf(otro.dia);
    if (dia !== 0) {
      return dia;
    }
    return uno.desde < otro.desde ? -1 : uno.desde > otro.desde ? 1 : 0;
  });
  return ordenados[0] ?? null;
}

/**
 * Qué muestra la segunda línea de la fila: el primer bloque de la comisión con
 * menos choques contra lo que el usuario ya tiene en ese cuatrimestre.
 *
 * `horarios` de otro período se ignora en vez de romper: el panel se abre sobre
 * cuatrimestres futuros, que todavía no tienen archivo publicado.
 */
export function ofertaDeFila(
  codigo: Codigo,
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  horarios: Horarios | null,
): Oferta {
  if (horarios === null || horarios.periodo.id !== periodo) {
    return SIN_OFERTA;
  }
  const curso = cursoDe(codigo, horarios);
  if (curso === null || curso.comisiones.length === 0) {
    return SIN_OFERTA;
  }
  const mejor = ordenarComisiones(codigo, periodo, planUsuario, horarios)[0];
  const comision =
    mejor === undefined
      ? undefined
      : curso.comisiones.find((candidata) => candidata.id === mejor.id);
  if (comision === undefined) {
    return SIN_OFERTA;
  }

  const bloque = primerBloque(comision.bloques);
  const aulas = bloque === null ? [] : bloque.aulas;
  const horario =
    bloque === null
      ? ""
      : `${DIA_CORTO[bloque.dia]} ${etiquetaDeFranja(
          bloque.desde,
          bloque.hasta,
        )}${aulas.length === 0 ? "" : ` · ${aulas.join(" · ")}`}`;

  const capacidad = comision.cupo?.capacidad;
  const inscriptos = comision.ocupacion?.inscriptos;
  return {
    comisiones: curso.comisiones.length,
    cupoLleno: curso.comisiones.every((candidata) => cupoLleno(candidata)),
    horario,
    cupo:
      capacidad === undefined || inscriptos === undefined
        ? ""
        : `${String(inscriptos)}/${String(capacidad)}`,
  };
}

function ordenSinTexto(plan: Plan): Materia[] {
  return [...plan.materias].sort((uno, otro) => {
    // Las electivas no tienen cuatrimestre sugerido: van al final.
    const unoSugerido = uno.cuatrimestre_sugerido ?? Number.MAX_SAFE_INTEGER;
    const otroSugerido = otro.cuatrimestre_sugerido ?? Number.MAX_SAFE_INTEGER;
    if (unoSugerido !== otroSugerido) {
      return unoSugerido - otroSugerido;
    }
    return uno.codigo < otro.codigo ? -1 : uno.codigo > otro.codigo ? 1 : 0;
  });
}

export interface OpcionesLista {
  texto: string;
  filtros: Filtros;
  periodo: PeriodoId;
  plan: Plan;
  abreviaciones: Abreviaciones;
  planUsuario: PlanUsuario;
  /** `null` mientras el período no tenga archivo de horarios publicado. */
  horarios: Horarios | null;
}

/**
 * Las filas que se dibujan, ya ordenadas.
 *
 * Con texto manda el orden de relevancia de `buscar`; sin texto, el
 * cuatrimestre sugerido y después el código. Las materias que el plan marca
 * como no vigentes nunca aparecen: `buscar` las devuelve a propósito y filtrar
 * por vigencia es trabajo de este panel.
 *
 * «Todas» muestra todo; «Disponibles» y «Electivas» esconden lo que ya cursaste
 * o aprobaste, que es lo único que el mockup saca de la lista: las bloqueadas
 * siguen apareciendo con su motivo, como dice el pie de 13c.
 */
export function filasDeResultados(opciones: OpcionesLista): Fila[] {
  const {
    texto,
    filtros,
    periodo,
    plan,
    abreviaciones,
    planUsuario,
    horarios,
  } = opciones;

  const porCodigo = new Map(
    plan.materias.map((materia) => [materia.codigo, materia] as const),
  );
  const ordenadas =
    texto.trim() === ""
      ? ordenSinTexto(plan)
      : buscar(texto, plan, abreviaciones, horarios ?? undefined)
          .map((codigo) => porCodigo.get(codigo))
          .filter((materia): materia is Materia => materia !== undefined);

  const planificadas = primerPeriodoPlanificado(planUsuario);
  const salida: Fila[] = [];
  for (const materia of ordenadas) {
    if (!materia.vigente) {
      continue;
    }
    if (
      filtros.hastaSeisCreditos &&
      materia.creditos > CREDITOS_CHICOS
    ) {
      continue;
    }
    if (filtros.principal === "electivas" && materia.ciclo !== "electiva") {
      continue;
    }
    const estado = estadoDeFila(
      materia.codigo,
      periodo,
      planUsuario,
      plan,
      planificadas,
    );
    if (
      filtros.principal !== "todas" &&
      (estado.tipo === "aprobada" || estado.tipo === "cursando")
    ) {
      continue;
    }
    salida.push({ materia, estado });
  }
  return salida;
}

/**
 * Pie de 13c con las siglas de los minors, armado con `plan.minors`: los
 * nombres y las siglas salen del plan, no de una lista escrita a mano
 * (hallazgo 1: son minors, no «orientaciones»).
 */
export function leyendaDeMinors(plan: Plan): string {
  return plan.minors
    .map((minor) => `${minor.sigla} ${minor.nombre}`)
    .join(" · ");
}

/** `sigla → nombre`, para que el chip 14b tenga nombre accesible. */
export function nombresDeMinors(plan: Plan): Map<string, string> {
  return new Map(plan.minors.map((minor) => [minor.sigla, minor.nombre]));
}
