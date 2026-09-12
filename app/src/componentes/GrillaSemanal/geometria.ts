/**
 * Geometría de la grilla semanal: horas a píxeles y tramos exclusivos.
 *
 * Es aritmética pura, sin React ni DOM, para poder probarla sola y para que la
 * grilla no mezcle el cálculo con el dibujo. Las medidas salen de `tokens.md`
 * («Grilla semanal (widget 7a)»): filas 08–22 y una escala en píxeles por hora
 * que es un token, no una constante del componente.
 */

import type { Bloque, Hora } from "../../contrato/tipos";
import type { BloqueUbicado, Choque } from "../../motor";

/** Primera fila de la grilla (tokens.md: horas 08–22). */
export const DESDE_HORA = 8;
/** Última fila de la grilla. */
export const HASTA_HORA = 22;
/** Alto de una hora con dos tarjetas lado a lado; con una sola son 18. */
export const HORA_PX_POR_DEFECTO = 15;

/** Horas enteras que llevan línea y etiqueta, de 08 a 22. */
export const HORAS: readonly number[] = Array.from(
  { length: HASTA_HORA - DESDE_HORA + 1 },
  (_, indice) => DESDE_HORA + indice,
);

const FORMA_HORA = /^(\d{2}):(\d{2})$/;

/**
 * Una hora del contrato que no tiene la forma `HH:MM` es un error del dato, no
 * un cero: dibujar un bloque a las 00:00 escondería el problema.
 */
export class HoraIlegible extends Error {
  constructor(readonly valor: string) {
    super(`No se entiende la hora «${valor}»: se esperaba HH:MM de 24 h.`);
    this.name = "HoraIlegible";
  }
}

function partesDe(hora: Hora): [string, string] {
  const partes = FORMA_HORA.exec(hora);
  const horas = partes?.[1];
  const minutos = partes?.[2];
  if (horas === undefined || minutos === undefined) {
    throw new HoraIlegible(hora);
  }
  if (Number(horas) > 23 || Number(minutos) > 59) {
    throw new HoraIlegible(hora);
  }
  return [horas, minutos];
}

/** `"14:30"` → `14.5`. Lanza `HoraIlegible` con el fragmento problemático. */
export function enHoras(hora: Hora): number {
  const [horas, minutos] = partesDe(hora);
  return Number(horas) + Number(minutos) / 60;
}

/** Píxeles desde el borde superior de la columna hasta esa hora. */
export function desplazamiento(horas: number, horaPx: number): number {
  return (horas - DESDE_HORA) * horaPx;
}

/** Alto total de una columna con esa escala. */
export function altoDeColumna(horaPx: number): number {
  return (HASTA_HORA - DESDE_HORA) * horaPx;
}

/** Un intervalo de horas decimales; `hasta` siempre mayor que `desde`. */
export interface Tramo {
  desde: number;
  hasta: number;
}

/** El tramo del bloque, en horas decimales. */
export function tramoDe(bloque: Bloque): Tramo {
  return { desde: enHoras(bloque.desde), hasta: enHoras(bloque.hasta) };
}

/** Lo que queda de `tramo` después de sacarle los `quitados`. */
export function restar(tramo: Tramo, quitados: readonly Tramo[]): Tramo[] {
  let pedazos: Tramo[] = [tramo];
  for (const quitado of quitados) {
    const siguientes: Tramo[] = [];
    for (const pedazo of pedazos) {
      if (quitado.hasta <= pedazo.desde || quitado.desde >= pedazo.hasta) {
        siguientes.push(pedazo);
        continue;
      }
      if (quitado.desde > pedazo.desde) {
        siguientes.push({ desde: pedazo.desde, hasta: quitado.desde });
      }
      if (quitado.hasta < pedazo.hasta) {
        siguientes.push({ desde: quitado.hasta, hasta: pedazo.hasta });
      }
    }
    pedazos = siguientes;
  }
  return pedazos;
}

/**
 * Choques que pisan a ese bloque: los que caen el mismo día, tocan a esa
 * materia y se superponen con sus horas.
 */
export function choquesDelBloque(
  codigo: string,
  bloque: Bloque,
  choques: readonly Choque[],
): Choque[] {
  const tramo = tramoDe(bloque);
  return choques.filter((choque) => {
    if (choque.dia !== bloque.dia) {
      return false;
    }
    if (choque.a.codigo !== codigo && choque.b.codigo !== codigo) {
      return false;
    }
    const suyo = { desde: enHoras(choque.desde), hasta: enHoras(choque.hasta) };
    return suyo.desde < tramo.hasta && tramo.desde < suyo.hasta;
  });
}

/**
 * Los dos lados del choque en el orden en que se leen: primero el que empieza
 * antes, como en 13b («93.18 Álgebra ↔ 72.44 Criptografía», y 93.18 arranca a
 * las 14). El motor los ordena por código, que es lo que necesita para
 * comparar, no para mostrar. Con la misma hora manda el código.
 */
export function ladosDelChoque(choque: Choque): [BloqueUbicado, BloqueUbicado] {
  const unoEmpieza = enHoras(choque.a.bloque.desde);
  const otroEmpieza = enHoras(choque.b.bloque.desde);
  if (
    otroEmpieza < unoEmpieza ||
    (otroEmpieza === unoEmpieza && choque.b.codigo < choque.a.codigo)
  ) {
    return [choque.b, choque.a];
  }
  return [choque.a, choque.b];
}

/** `"15:00"` → `«15»`; `"14:30"` → `«14:30»`. Como las etiquetas del mockup. */
export function etiquetaDeHora(hora: Hora): string {
  const [horas, minutos] = partesDe(hora);
  return minutos === "00" ? horas : `${horas}:${minutos}`;
}

/** `«15–16»`, con raya y sin los `:00`, como «▲ 15–16» del widget 7a. */
export function etiquetaDeFranja(desde: Hora, hasta: Hora): string {
  return `${etiquetaDeHora(desde)}–${etiquetaDeHora(hasta)}`;
}
