/**
 * Lo que hay que calcular para dibujar 13b, sin React de por medio.
 *
 * La página no decide reglas de dominio: las pide al motor y acá solamente las
 * traduce a lo que piden `Carrusel` y `TarjetaCuatrimestre`. Está separado para
 * poder probarlo con el plan real y con la fixture de casos raros sin montar
 * ningún componente.
 */

import type {
  Abreviaciones,
  Codigo,
  Fecha,
  Horarios,
  PeriodoId,
  Plan,
  PlanUsuario,
} from "../../contrato/tipos";
import type {
  MateriaDeLaLista,
  MateriaSinHorarioPublicado,
} from "../../componentes/TarjetaCuatrimestre";
import type { MateriaEnGrilla } from "../../componentes/GrillaSemanal";
import {
  compararPeriodos,
  cursoDe,
  estadoMateria,
  indiceDeMaterias,
  ordenarPeriodos,
  periodosDesde,
  primerPeriodoPlanificado,
  progresoTitulos,
  seDestrabaEn,
  siguientePeriodo,
} from "../../motor";
import { colorAsignado } from "../../estado/planUsuario";

/** Cuántos cuatrimestres vacíos se dejan al final para poder planificar. */
export const FUTUROS_VACIOS = 2;

/** Una fecha que no tiene la forma `YYYY-MM-DD`. */
export class FechaIlegible extends Error {
  constructor(fecha: string) {
    super(`No entiendo la fecha «${fecha}»: se espera YYYY-MM-DD.`);
    this.name = "FechaIlegible";
  }
}

/**
 * El cuatrimestre al que pertenece una fecha.
 *
 * Es el último recurso del carrusel: solo se usa cuando no hay **ningún** otro
 * ancla —ni período activo en el índice, ni cuatrimestres en el plan del
 * usuario—, para que alguien que acaba de cargar su historia tenga dónde
 * planificar. No es un dato publicado: el ITBA no publica su calendario en
 * `data/`, así que se usa la única regla que el índice real respalda —el 2.º
 * cuatrimestre de 2026 va del 2026-07-26 al 2026-12-31—: de agosto en adelante
 * es 2C, antes es 1C. En cuanto el índice publique un período, manda el índice
 * y esta cuenta deja de intervenir.
 */
export function periodoDeFecha(fecha: Fecha): PeriodoId {
  const partes = fecha.match(/^(\d{4})-(\d{2})-\d{2}$/);
  const anio = partes?.[1];
  const mes = partes?.[2];
  if (anio === undefined || mes === undefined) {
    throw new FechaIlegible(fecha);
  }
  return `${anio}-${Number(mes) >= 8 ? "2" : "1"}C`;
}

/**
 * Los cuatrimestres que muestra el carrusel, en orden cronológico.
 *
 * Son los que el usuario tiene con materias, más el período activo del índice,
 * más los que quedan en el medio —un hueco no se puede planificar si no se
 * ve—, más `vaciosAlFinal` cuatrimestres después del último.
 *
 * Nunca devuelve la lista vacía: cuando no hay nada que anclar —el índice no
 * publica período activo y el plan del usuario no tiene cuatrimestres— el
 * carrusel arranca en `referencia` (el cuatrimestre de hoy) y le agrega los
 * mismos vacíos del final, que es lo único que hace falta para empezar a
 * planificar.
 */
export function periodosDelCarrusel(
  planUsuario: PlanUsuario,
  activo: PeriodoId | null,
  referencia: PeriodoId,
  vaciosAlFinal: number = FUTUROS_VACIOS,
): PeriodoId[] {
  const conMaterias = Object.entries(planUsuario.periodos)
    .filter(([, materias]) => materias.length > 0)
    .map(([periodo]) => periodo);
  const anclas = activo === null ? conMaterias : [...conMaterias, activo];
  // Un cuatrimestre abierto sin materias sigue siendo un cuatrimestre del
  // usuario: si no hay ningún otro ancla, es lo que hay que mostrar.
  const base = anclas.length > 0 ? anclas : Object.keys(planUsuario.periodos);
  const marcados = ordenarPeriodos([...new Set(base)]);
  const primero = marcados[0] ?? referencia;
  const ultimo = marcados[marcados.length - 1] ?? referencia;

  const salida: PeriodoId[] = [];
  let actual = primero;
  while (compararPeriodos(actual, ultimo) <= 0) {
    salida.push(actual);
    actual = siguientePeriodo(actual);
  }
  // `periodosDesde` incluye el que recibe, y ese ya está en la lista.
  salida.push(...periodosDesde(actual, Math.max(0, vaciosAlFinal)));
  return salida;
}

/**
 * Nombre corto de una materia: la abreviación aprobada si existe, si no el
 * nombre del plan y, para los códigos que el plan no tiene (93.18 está en el
 * SGA pero no en S10-Rev23), el nombre que publican los horarios.
 */
export function nombreCorto(
  codigo: Codigo,
  plan: Plan,
  abreviaciones: Abreviaciones,
  nombreDelCurso?: string,
): string {
  const abreviacion = abreviaciones.abreviaciones[codigo];
  if (abreviacion !== undefined) {
    return abreviacion;
  }
  const materia = plan.materias.find(
    (candidata) => candidata.codigo === codigo,
  );
  return materia?.nombre ?? nombreDelCurso ?? codigo;
}

/** Créditos que suma el período, según el plan. Lo que el plan no tiene, cero. */
export function creditosDelPeriodo(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): number {
  const materias = indiceDeMaterias(plan);
  let total = 0;
  for (const planificada of planUsuario.periodos[periodo] ?? []) {
    total += materias.get(planificada.codigo)?.creditos ?? 0;
  }
  return total;
}

/** «7 materias · 39 cr · ▲ 1». Sin materias no hay resumen. */
export function resumenDelPeriodo(
  cuantas: number,
  creditos: number,
  choques: number,
): string | undefined {
  if (cuantas === 0) {
    return undefined;
  }
  const materias = cuantas === 1 ? "materia" : "materias";
  const base = `${String(cuantas)} ${materias} · ${String(creditos)} cr`;
  return choques === 0 ? base : `${base} · ▲ ${String(choques)}`;
}

/** El estado de la materia, traducido a los tres que la grilla sabe dibujar. */
function estadoEnGrilla(
  codigo: Codigo,
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
): MateriaEnGrilla["estado"] {
  if (!indiceDeMaterias(plan).has(codigo)) {
    return "planificada";
  }
  const estado = estadoMateria(codigo, periodo, planUsuario, plan);
  if (estado === "cursando") {
    return "cursando";
  }
  return estado === "planificada" ? "planificada" : undefined;
}

/**
 * Las materias del período con los bloques de la comisión elegida.
 *
 * Sin comisión elegida no hay bloques que dibujar, así que la materia no entra
 * en la grilla (es la misma regla de `motor/horarios.bloquesDelPeriodo`).
 */
export function materiasEnGrilla(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
  horarios: Horarios,
  abreviaciones: Abreviaciones,
): MateriaEnGrilla[] {
  const salida: MateriaEnGrilla[] = [];
  for (const planificada of planUsuario.periodos[periodo] ?? []) {
    if (planificada.comision === undefined) {
      continue;
    }
    const curso = cursoDe(planificada.codigo, horarios);
    if (curso === null) {
      continue;
    }
    const comision = curso.comisiones.find(
      (candidata) => candidata.id === planificada.comision,
    );
    if (comision === undefined || comision.bloques.length === 0) {
      continue;
    }
    const estado = estadoEnGrilla(planificada.codigo, periodo, planUsuario, plan);
    salida.push({
      codigo: planificada.codigo,
      abreviacion: nombreCorto(
        planificada.codigo,
        plan,
        abreviaciones,
        curso.nombre,
      ),
      color: colorAsignado(planUsuario.colores, planificada.codigo),
      comision: comision.id,
      nombre: curso.nombre,
      ...(estado === undefined ? {} : { estado }),
      bloques: comision.bloques,
    });
  }
  return salida;
}

/**
 * Materias del período que el cuatrimestre ofrece pero sin ninguna comisión
 * con horario publicado (15.09 en el corpus). Bajan al pie de la tarjeta.
 */
export function materiasSinHorarioPublicado(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
  horarios: Horarios,
  abreviaciones: Abreviaciones,
): MateriaSinHorarioPublicado[] {
  const salida: MateriaSinHorarioPublicado[] = [];
  for (const planificada of planUsuario.periodos[periodo] ?? []) {
    const curso = cursoDe(planificada.codigo, horarios);
    if (curso === null) {
      continue;
    }
    const publicado = curso.comisiones.some(
      (comision) => comision.bloques.length > 0,
    );
    if (publicado) {
      continue;
    }
    salida.push({
      codigo: planificada.codigo,
      abreviacion: nombreCorto(
        planificada.codigo,
        plan,
        abreviaciones,
        curso.nombre,
      ),
    });
  }
  return salida;
}

/** Las materias del período para la variante sin horarios (13g). */
export function materiasDeLaLista(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
  abreviaciones: Abreviaciones,
): MateriaDeLaLista[] {
  const materias = indiceDeMaterias(plan);
  return (planUsuario.periodos[periodo] ?? []).map((planificada) => ({
    codigo: planificada.codigo,
    abreviacion: nombreCorto(planificada.codigo, plan, abreviaciones),
    color: colorAsignado(planUsuario.colores, planificada.codigo),
    creditos: materias.get(planificada.codigo)?.creditos ?? 0,
  }));
}

/**
 * Las notas verdes de 13g para `periodo`:
 *
 * - «✓ Al aprobar este cuatrimestre: 243 cr · Ingeniero/a en Informática»
 *   cuando la simulación alcanza un título al terminarlo;
 * - «72.45 Proyecto Final se destraba con 160 cr ✓» cuando una materia que el
 *   usuario planificó en este cuatrimestre o más adelante deja de estar
 *   bloqueada por créditos justo acá.
 *
 * `referencia` es el cuatrimestre que se está por cursar: lo que ya está
 * disponible ahí no se anuncia como un destrabe futuro.
 */
export function hitosDelPeriodo(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  plan: Plan,
  referencia: PeriodoId,
): string[] {
  const salida: string[] = [];

  for (const titulo of progresoTitulos(planUsuario, plan)) {
    if (titulo.estimado === periodo) {
      salida.push(
        `✓ Al aprobar este cuatrimestre: ${String(titulo.requeridos)} cr · ` +
          titulo.nombre,
      );
    }
  }

  const materias = indiceDeMaterias(plan);
  const planificadas = [...primerPeriodoPlanificado(planUsuario)].sort(
    ([uno], [otro]) => (uno < otro ? -1 : uno > otro ? 1 : 0),
  );
  for (const [codigo, cuando] of planificadas) {
    // Solo lo que está planificado en este cuatrimestre o más adelante: lo que
    // ya quedó atrás no se destraba, se cursó.
    if (compararPeriodos(cuando, periodo) < 0) {
      continue;
    }
    const materia = materias.get(codigo);
    if (materia === undefined || materia.creditos_requeridos <= 0) {
      continue;
    }
    const destrabe = seDestrabaEn(codigo, planUsuario, plan, referencia);
    if (destrabe !== periodo || compararPeriodos(destrabe, referencia) <= 0) {
      continue;
    }
    salida.push(
      `${codigo} ${materia.nombre} se destraba con ` +
        `${String(materia.creditos_requeridos)} cr ✓`,
    );
  }

  return salida;
}
