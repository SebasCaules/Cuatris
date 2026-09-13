/**
 * Parser tolerante de la historia académica pegada (13a, S-01).
 *
 * **No hay muestra real del SGA** (gap G-02): lo único conocido es el formato
 * del mockup, `93.18 Álgebra Lineal 9 Aprobada`. Por eso el parser no intenta
 * entender la línea entera: busca un código con la forma `\d{2}\.\d{2}` y una
 * palabra clave de estado, y devuelve **verbatim** todo lo que no reconoció
 * para que la pantalla lo muestre y el usuario lo marque a mano. Nunca inventa
 * una materia ni descarta una línea en silencio.
 */

import type { Codigo, EntradaHistoria, Plan } from "../contrato/tipos";
import { indiceDeMaterias } from "./creditos";
import { normalizar } from "./buscar";

/** Un código de materia que no forma parte de un número más largo. */
const CODIGO_EN_LINEA = /(?<!\d)(\d{2}\.\d{2})(?!\d)/;

/**
 * Raíces que niegan la aprobación. Se prueban **antes** que `PALABRAS` porque
 * el emparejamiento es por substring y «desaprobada» contiene «aprobad»: sin
 * este paso una materia reprobada entraría como aprobada. Una línea con
 * cualquiera de estas raíces no se reconoce —el motor no tiene un estado para
 * «desaprobada»— y va verbatim a `noReconocidas` para que el usuario decida.
 */
const NEGATIVAS: readonly string[] = [
  "desaprobad",
  "no aprobad",
  "ausente",
  "libre",
];

/**
 * Palabras clave de estado, en orden de prioridad. Son raíces a propósito:
 * cubren «Aprobada», «Aprobado», «Aprobada (final)», «Cursando», «Cursándola».
 */
const PALABRAS: readonly { raiz: string; estado: EntradaHistoria["estado"] }[] =
  [
    { raiz: "aprobad", estado: "aprobada" },
    { raiz: "regular", estado: "regular" },
    { raiz: "cursand", estado: "cursando" },
  ];

export interface HistoriaParseada {
  /** Lo que se pudo reconocer, listo para `cargarHistoria`. */
  reconocidas: Record<Codigo, EntradaHistoria>;
  /** Las líneas que quedaron afuera, tal como venían. */
  noReconocidas: string[];
}

/**
 * Lee un pegado de historia académica.
 *
 * Una línea entra en `reconocidas` si tiene un código **y ese código está en el
 * plan** **y no dice que la materia no se aprobó** (ver `NEGATIVAS`). Sin
 * palabra clave de estado se asume `aprobada`: lo que se pega es
 * una historia, y lo que abunda ahí es lo aprobado. Todo lo demás —líneas de
 * encabezado, totales, códigos de otra carrera— va a `noReconocidas` sin
 * tocar, incluido el `93.18` del mockup, que no pertenece a S10-Rev23.
 *
 * Si la misma materia aparece dos veces, gana la última línea.
 */
export function parsearHistoria(texto: string, plan: Plan): HistoriaParseada {
  const materias = indiceDeMaterias(plan);
  const reconocidas: Record<Codigo, EntradaHistoria> = {};
  const noReconocidas: string[] = [];

  for (const linea of texto.split(/\r?\n/)) {
    if (linea.trim() === "") {
      continue;
    }
    const encontrado = linea.match(CODIGO_EN_LINEA);
    const codigo = encontrado?.[1];
    if (codigo === undefined || !materias.has(codigo)) {
      noReconocidas.push(linea);
      continue;
    }
    const normalizada = normalizar(linea);
    if (NEGATIVAS.some((raiz) => normalizada.includes(raiz))) {
      noReconocidas.push(linea);
      continue;
    }
    const palabra = PALABRAS.find((candidata) =>
      normalizada.includes(candidata.raiz),
    );
    reconocidas[codigo] = { estado: palabra?.estado ?? "aprobada" };
  }

  return { reconocidas, noReconocidas };
}
