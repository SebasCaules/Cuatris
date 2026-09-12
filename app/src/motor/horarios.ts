/**
 * Horarios: choques ▲, cambios de sede ↕ y orden de comisiones.
 *
 * Todo lo de acá se calcula sobre los bloques de las **comisiones elegidas**:
 * una materia planificada sin comisión no ocupa ninguna franja, así que no
 * choca con nada. Es deliberado —el mockup muestra el choque recién cuando el
 * estudiante eligió las dos comisiones.
 *
 * Dos cursos solo pueden chocar si además se dictan a la vez: el período corto
 * (15.09, del 18/09 al 16/10) no choca con lo que termina antes de empezar él.
 */

import type {
  Bloque,
  Codigo,
  Comision,
  Curso,
  Dia,
  Fecha,
  Hora,
  Horarios,
  PeriodoId,
  PlanUsuario,
} from "../contrato/tipos";

/** Orden de la grilla semanal; `sabado` va al pie de la tarjeta. */
export const DIAS: readonly Dia[] = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

/** Un bloque con la materia y la comisión a las que pertenece. */
export interface BloqueUbicado {
  codigo: Codigo;
  /** Nombre del curso tal como lo publica el SGA. */
  nombre: string;
  comision: string;
  /** Días de dictado del curso; un período corto no cubre el cuatrimestre. */
  vigencia: { desde: Fecha; hasta: Fecha };
  bloque: Bloque;
}

/** Dos bloques de materias distintas que se pisan. */
export interface Choque {
  a: BloqueUbicado;
  b: BloqueUbicado;
  dia: Dia;
  /** Franja en la que se superponen, no la de cada bloque. */
  desde: Hora;
  hasta: Hora;
}

/** Dos bloques pegados el mismo día en sedes distintas. */
export interface CambioDeSede {
  a: BloqueUbicado;
  b: BloqueUbicado;
  dia: Dia;
  /** Hora en la que termina uno y empieza el otro. */
  hora: Hora;
}

/** Una comisión evaluada contra el resto del cuatrimestre. */
export interface ComisionEvaluada {
  id: string;
  choques: number;
  cupoLleno: boolean;
  cambiosDeSede: number;
  /** Textos para la interfaz, en el registro del mockup. */
  consecuencias: string[];
}

function indiceDia(dia: Dia): number {
  const posicion = DIAS.indexOf(dia);
  return posicion === -1 ? DIAS.length : posicion;
}

function seSolapanFechas(a: BloqueUbicado, b: BloqueUbicado): boolean {
  return a.vigencia.desde <= b.vigencia.hasta && b.vigencia.desde <= a.vigencia.hasta;
}

function seSolapanHoras(a: Bloque, b: Bloque): boolean {
  return a.desde < b.hasta && b.desde < a.hasta;
}

/** El curso de `codigo` en estos horarios, o `null` si no se ofrece. */
export function cursoDe(codigo: Codigo, horarios: Horarios): Curso | null {
  return horarios.cursos.find((curso) => curso.codigo === codigo) ?? null;
}

/** Si la materia tiene curso publicado en este período. */
export function seOfrece(codigo: Codigo, horarios: Horarios): boolean {
  return cursoDe(codigo, horarios) !== null;
}

/**
 * Si la comisión no tiene lugar. Sin `cupo` o sin `ocupacion` no se sabe, y no
 * saber no es estar llena.
 */
export function cupoLleno(comision: Comision): boolean {
  const capacidad = comision.cupo?.capacidad;
  const inscriptos = comision.ocupacion?.inscriptos;
  if (capacidad === undefined || inscriptos === undefined) {
    return false;
  }
  return inscriptos >= capacidad;
}

function ubicar(curso: Curso, comision: Comision): BloqueUbicado[] {
  return comision.bloques.map((bloque) => ({
    codigo: curso.codigo,
    nombre: curso.nombre,
    comision: comision.id,
    vigencia: { desde: curso.desde, hasta: curso.hasta },
    bloque,
  }));
}

/**
 * Bloques que el usuario ocupa en `periodo`, según las comisiones elegidas.
 *
 * Sin comisión elegida no hay bloques. Una comisión guardada que ya no existe
 * en los horarios publicados tampoco aporta bloques: avisar de ese cambio es
 * trabajo del Sprint 2, y hasta entonces callar es mejor que dibujar una franja
 * que ya no se dicta.
 */
export function bloquesDelPeriodo(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  horarios: Horarios,
): BloqueUbicado[] {
  exigirMismoPeriodo(periodo, horarios);
  const salida: BloqueUbicado[] = [];
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
    if (comision === undefined) {
      continue;
    }
    salida.push(...ubicar(curso, comision));
  }
  return salida;
}

function ordenarChoques(choques: Choque[]): Choque[] {
  return choques.sort((uno, otro) => {
    const dia = indiceDia(uno.dia) - indiceDia(otro.dia);
    if (dia !== 0) {
      return dia;
    }
    if (uno.desde !== otro.desde) {
      return uno.desde < otro.desde ? -1 : 1;
    }
    if (uno.a.codigo !== otro.a.codigo) {
      return uno.a.codigo < otro.a.codigo ? -1 : 1;
    }
    return uno.b.codigo < otro.b.codigo ? -1 : uno.b.codigo > otro.b.codigo ? 1 : 0;
  });
}

/**
 * Pares de bloques de **materias distintas** que se superponen.
 *
 * Dos bloques de la misma comisión nunca son un choque: una comisión que ocupa
 * dos aulas a la vez (93.18 com. B, miércoles en 003T y 004T) es un solo bloque
 * con dos aulas, y dos comisiones de la misma materia no se cursan juntas.
 */
export function paresQueChocan(bloques: readonly BloqueUbicado[]): Choque[] {
  const salida: Choque[] = [];
  for (let i = 0; i < bloques.length; i += 1) {
    for (let j = i + 1; j < bloques.length; j += 1) {
      const uno = bloques[i];
      const otro = bloques[j];
      if (uno === undefined || otro === undefined) {
        continue;
      }
      if (uno.codigo === otro.codigo) {
        continue;
      }
      if (uno.bloque.dia !== otro.bloque.dia) {
        continue;
      }
      if (!seSolapanHoras(uno.bloque, otro.bloque)) {
        continue;
      }
      if (!seSolapanFechas(uno, otro)) {
        continue;
      }
      const [a, b] = uno.codigo <= otro.codigo ? [uno, otro] : [otro, uno];
      salida.push({
        a,
        b,
        dia: a.bloque.dia,
        desde: a.bloque.desde > b.bloque.desde ? a.bloque.desde : b.bloque.desde,
        hasta: a.bloque.hasta < b.bloque.hasta ? a.bloque.hasta : b.bloque.hasta,
      });
    }
  }
  return ordenarChoques(salida);
}

/**
 * Pares de bloques pegados (`hasta` de uno igual a `desde` del otro, el mismo
 * día) en sedes distintas.
 *
 * Cuenta también dentro de una misma comisión: hay comisiones que cruzan sedes
 * (93.18 com. A, Rectorado y SDT). Un bloque sin sede (`null`, virtual) no
 * entra: no hay a dónde viajar.
 */
export function paresConCambioDeSede(
  bloques: readonly BloqueUbicado[],
): CambioDeSede[] {
  const salida: CambioDeSede[] = [];
  for (let i = 0; i < bloques.length; i += 1) {
    for (let j = 0; j < bloques.length; j += 1) {
      if (i === j) {
        continue;
      }
      const uno = bloques[i];
      const otro = bloques[j];
      if (uno === undefined || otro === undefined) {
        continue;
      }
      if (uno.bloque.dia !== otro.bloque.dia) {
        continue;
      }
      if (uno.bloque.hasta !== otro.bloque.desde) {
        continue;
      }
      const sedeUno = uno.bloque.sede;
      const sedeOtro = otro.bloque.sede;
      if (sedeUno === null || sedeOtro === null || sedeUno === sedeOtro) {
        continue;
      }
      if (!seSolapanFechas(uno, otro)) {
        continue;
      }
      salida.push({
        a: uno,
        b: otro,
        dia: uno.bloque.dia,
        hora: uno.bloque.hasta,
      });
    }
  }
  return salida.sort((uno, otro) => {
    const dia = indiceDia(uno.dia) - indiceDia(otro.dia);
    if (dia !== 0) {
      return dia;
    }
    if (uno.hora !== otro.hora) {
      return uno.hora < otro.hora ? -1 : 1;
    }
    return uno.a.codigo < otro.a.codigo ? -1 : uno.a.codigo > otro.a.codigo ? 1 : 0;
  });
}

/** Choques del cuatrimestre `periodo`. Ver `paresQueChocan`. */
export function choques(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  horarios: Horarios,
): Choque[] {
  return paresQueChocan(bloquesDelPeriodo(periodo, planUsuario, horarios));
}

/**
 * Cambios de sede del cuatrimestre `periodo`. No bloquean nada: son un aviso
 * («↕») porque la sede la elige el ITBA, no el estudiante.
 */
export function cambiosDeSede(
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  horarios: Horarios,
): CambioDeSede[] {
  return paresConCambioDeSede(bloquesDelPeriodo(periodo, planUsuario, horarios));
}

const NOMBRE_DIA: Record<Dia, string> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
};

/**
 * Comisiones de `codigo` en `periodo`, evaluadas contra lo que el usuario ya
 * tiene planificado, y ordenadas por compatibilidad (hallazgo 7):
 *
 * 1. menos choques;
 * 2. con cupo antes que llenas;
 * 3. menos cambios de sede;
 * 4. por `id`.
 *
 * La materia que se está eligiendo se saca del cálculo: se compara contra el
 * resto del cuatrimestre, no contra la comisión que ya tenía elegida.
 * Si la materia no se ofrece en el período, la lista es vacía.
 */
export function ordenarComisiones(
  codigo: Codigo,
  periodo: PeriodoId,
  planUsuario: PlanUsuario,
  horarios: Horarios,
): ComisionEvaluada[] {
  exigirMismoPeriodo(periodo, horarios);
  const curso = cursoDe(codigo, horarios);
  if (curso === null) {
    return [];
  }
  const resto = bloquesDelPeriodo(periodo, planUsuario, horarios).filter(
    (ubicado) => ubicado.codigo !== codigo,
  );

  const evaluadas = curso.comisiones.map((comision): ComisionEvaluada => {
    const propios = ubicar(curso, comision);
    const todos = [...resto, ...propios];
    const choquesPropios = paresQueChocan(todos).filter(
      (choque) => choque.a.codigo === codigo || choque.b.codigo === codigo,
    );
    const cambiosPropios = paresConCambioDeSede(todos).filter(
      (cambio) => cambio.a.codigo === codigo || cambio.b.codigo === codigo,
    );
    const llena = cupoLleno(comision);

    const consecuencias: string[] = [];
    for (const choque of choquesPropios) {
      const otro = choque.a.codigo === codigo ? choque.b : choque.a;
      consecuencias.push(
        `Se superpone con ${otro.nombre} (comisión ${otro.comision}) el ` +
          `${NOMBRE_DIA[choque.dia]} de ${choque.desde} a ${choque.hasta}`,
      );
    }
    for (const cambio of cambiosPropios) {
      consecuencias.push(
        `Cambiás de sede el ${NOMBRE_DIA[cambio.dia]} a las ${cambio.hora}`,
      );
    }
    if (llena) {
      const capacidad = comision.cupo?.capacidad ?? 0;
      const inscriptos = comision.ocupacion?.inscriptos ?? 0;
      consecuencias.push(
        `El cupo está lleno: ${inscriptos} de ${capacidad}`,
      );
    }
    if (comision.bloques.length === 0) {
      consecuencias.push("Todavía no publicaron el horario");
    }

    return {
      id: comision.id,
      choques: choquesPropios.length,
      cupoLleno: llena,
      cambiosDeSede: cambiosPropios.length,
      consecuencias,
    };
  });

  return evaluadas.sort((uno, otro) => {
    if (uno.choques !== otro.choques) {
      return uno.choques - otro.choques;
    }
    if (uno.cupoLleno !== otro.cupoLleno) {
      return uno.cupoLleno ? 1 : -1;
    }
    if (uno.cambiosDeSede !== otro.cambiosDeSede) {
      return uno.cambiosDeSede - otro.cambiosDeSede;
    }
    return uno.id < otro.id ? -1 : uno.id > otro.id ? 1 : 0;
  });
}

/**
 * Pasar el archivo de horarios de otro período es un error del llamador, no
 * «cero bloques»: callar acá se vería como un cuatrimestre sin choques.
 */
export class HorariosDeOtroPeriodo extends Error {
  constructor(
    readonly periodo: PeriodoId,
    readonly periodoDelArchivo: PeriodoId,
  ) {
    super(
      `Se pidió el período ${periodo} con el archivo de horarios de ${periodoDelArchivo}.`,
    );
    this.name = "HorariosDeOtroPeriodo";
  }
}

function exigirMismoPeriodo(periodo: PeriodoId, horarios: Horarios): void {
  if (horarios.periodo.id !== periodo) {
    throw new HorariosDeOtroPeriodo(periodo, horarios.periodo.id);
  }
}
