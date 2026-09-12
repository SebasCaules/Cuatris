/**
 * Los textos de 13d, aparte del componente: son reglas de redacción y se
 * prueban solas.
 *
 * Nada de acá calcula dominio. Los choques, los cambios de sede y el cupo los
 * decide `motor/horarios`; estas funciones solo eligen qué palabras y qué
 * glifo le tocan a cada resultado, en el registro del mockup (voseo).
 */

import type { Bloque, Comision, Dia } from "../../contrato/tipos";
import type { Choque } from "../../motor";
import { etiquetaDeFranja } from "../GrillaSemanal";
import type { NombreGlifo } from "../primitivas";

/** «Lun», como los encabezados de la grilla y las líneas de horario de 13d. */
const DIA_CORTO: Record<Dia, string> = {
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  jueves: "Jue",
  viernes: "Vie",
  sabado: "Sáb",
};

/** «lun», el de la línea de consecuencias («▲ choque lun 15–16»). */
const DIA_MINUSCULA: Record<Dia, string> = {
  lunes: "lun",
  martes: "mar",
  miercoles: "mié",
  jueves: "jue",
  viernes: "vie",
  sabado: "sáb",
};

/** «lunes», el de la línea de resultado («el choque del lunes desaparece»). */
const DIA_LARGO: Record<Dia, string> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miércoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sábado",
};

/**
 * Un pedazo de la línea de consecuencias: glifo con nombre accesible y texto.
 *
 * Va partido porque un «▲» suelto no se lee: el glifo lo dibuja `Glifo`, que
 * le pone `role="img"` y su nombre.
 */
export interface Segmento {
  glifo: NombreGlifo;
  /** Nombre accesible del glifo en este contexto. */
  etiqueta: string;
  texto: string;
}

/** `"001R"`, `"rectorado"` → «Lun 14–16 · 001R Rectorado» (línea de horario). */
export function lineaDeBloque(
  bloque: Bloque,
  nombreDeSede: (id: string) => string,
): string {
  const franja = `${DIA_CORTO[bloque.dia]} ${etiquetaDeFranja(bloque.desde, bloque.hasta)}`;
  // Una comisión puede ocupar dos aulas a la vez (93.18 com. B, miércoles en
  // 003T y 004T): se listan las dos, no la primera.
  const lugar = [
    ...bloque.aulas,
    bloque.sede === null ? "" : nombreDeSede(bloque.sede),
  ]
    .filter((parte) => parte !== "")
    .join(" ");
  return lugar === "" ? franja : `${franja} · ${lugar}`;
}

/**
 * «cupo 48 / 48» y si está llena. Sin `cupo` ni `ocupacion` no hay línea: no
 * saber cuántos lugares quedan no es lo mismo que no quedar ninguno.
 */
export function textoDeCupo(comision: Comision): string | null {
  const capacidad = comision.cupo?.capacidad;
  const inscriptos = comision.ocupacion?.inscriptos;
  if (capacidad === undefined && inscriptos === undefined) {
    return null;
  }
  if (capacidad === undefined) {
    return `${String(inscriptos)} inscriptos`;
  }
  const ocupados = inscriptos === undefined ? "—" : String(inscriptos);
  return `cupo ${ocupados} / ${String(capacidad)}`;
}

/** Cuántas sedes distintas toca la comisión; los bloques virtuales no cuentan. */
export function sedesDeComision(comision: Comision): number {
  const sedes = new Set<string>();
  for (const bloque of comision.bloques) {
    if (bloque.sede !== null) {
      sedes.add(bloque.sede);
    }
  }
  return sedes.size;
}

/** «lun 15–16», la franja de un choque dentro de la línea de consecuencias. */
function franjaDeChoque(choque: Choque): string {
  return `${DIA_MINUSCULA[choque.dia]} ${etiquetaDeFranja(choque.desde, choque.hasta)}`;
}

/**
 * La línea de consecuencias de una comisión, como 13d:
 * «▲ choque lun 15–16 · ◐ llena», «✓ sin choques · ↕ 2 sedes», «✓ sin choques».
 *
 * El mockup muestra el «↕ n sedes» solo cuando no hay choque —las comisiones A
 * y K cruzan sedes y su línea no lo dice—: con un choque encima, lo que importa
 * es el choque, y el ↕ sigue estando en la grilla de la vista previa.
 */
export function consecuenciasDeComision(datos: {
  choques: readonly Choque[];
  sedes: number;
  llena: boolean;
  sinHorario: boolean;
}): Segmento[] {
  const segmentos: Segmento[] = [];

  if (datos.sinHorario) {
    segmentos.push({
      glifo: "sinHorario",
      etiqueta: "Sin horario publicado",
      texto: "sin horario publicado",
    });
  } else if (datos.choques.length === 0) {
    segmentos.push({
      glifo: "aprobada",
      etiqueta: "Sin choques",
      texto: "sin choques",
    });
    if (datos.sedes > 1) {
      segmentos.push({
        glifo: "cambioDeSede",
        etiqueta: "Cambio de sede",
        texto: `${String(datos.sedes)} sedes`,
      });
    }
  } else {
    const franjas = datos.choques.map(franjaDeChoque);
    segmentos.push({
      glifo: "choque",
      etiqueta: "Choque de horario",
      texto:
        franjas.length === 1
          ? `choque ${franjas[0] ?? ""}`
          : `choques ${franjas.join(", ")}`,
    });
  }

  if (datos.llena) {
    segmentos.push({
      glifo: "cupoLleno",
      etiqueta: "Cupo lleno",
      texto: "llena",
    });
  }

  return segmentos;
}

/**
 * La línea de resultado de la vista previa.
 *
 * `antes` es el choque que ya había con el plan tal como está hoy; `ahora`, los
 * que quedan con la comisión que se está mirando. Por eso se puede decir
 * «desaparece» y «sigue» en vez de repetir «hay choque».
 */
export function resultadoDeVistaPrevia(
  ahora: readonly Choque[],
  antes: Choque | null,
): Segmento {
  const primero = ahora[0];
  if (primero !== undefined) {
    return {
      glifo: "choque",
      etiqueta: "Choque de horario",
      texto:
        antes !== null && antes.dia === primero.dia
          ? `sigue el choque del ${DIA_LARGO[primero.dia]}`
          : `choque el ${DIA_LARGO[primero.dia]}`,
    };
  }
  if (antes !== null) {
    return {
      glifo: "aprobada",
      etiqueta: "Sin choques",
      texto: `el choque del ${DIA_LARGO[antes.dia]} desaparece`,
    };
  }
  return { glifo: "aprobada", etiqueta: "Sin choques", texto: "sin choques" };
}

/** «9 comisiones · ordenadas por compatibilidad con tu 1.º 2026». */
export function subtituloDelModal(cuantas: number, periodo: string): string {
  return cuantas === 1
    ? `1 comisión · ordenada por compatibilidad con tu ${periodo}`
    : `${String(cuantas)} comisiones · ordenadas por compatibilidad con tu ${periodo}`;
}

/** «D · E · F · G · H — 5 comisiones más», el rótulo del colapsado. */
export function etiquetaDelColapsado(ids: readonly string[]): string {
  const cuantas = ids.length;
  const cola = cuantas === 1 ? "1 comisión más" : `${String(cuantas)} comisiones más`;
  return `${ids.join(" · ")} — ${cola}`;
}
