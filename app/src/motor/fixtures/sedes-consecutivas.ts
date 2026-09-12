/**
 * Fixture **derivado, no real**, para ejercitar `cambiosDeSede`. Solo tests.
 *
 * En todo el material verificado no hay dos bloques pegados (`hasta` de uno =
 * `desde` del otro, el mismo día) en sedes distintas: la única comisión que
 * cruza sedes lo hace en días distintos (93.18 com. A, lunes en Rectorado y
 * miércoles en SDT, `material-raw/02-sga/HALLAZGOS.md`). Sin un caso así la
 * regla ↕ del hallazgo 8 no se podría probar.
 *
 * Por eso este fixture parte del archivo real de casos raros y cambia **un solo
 * dato, explícito y acotado**: el bloque de jueves de 30.28 com. A pasa de
 * 19:00–22:00 a 14:00–17:00, para que empiece justo cuando termina el jueves de
 * 93.18 com. B (12:00–14:00, Rectorado). Códigos, nombres, sedes, aulas y
 * modalidades quedan como están. Nada de esto se publica: vive en `motor/` y no
 * entra en `data/`.
 */

import type { Bloque, Horarios } from "../../contrato/tipos";
import { HORARIOS_RAROS } from "./reales";

/** Hora a la que el fixture mueve el jueves de 30.28. */
export const DESDE_MOVIDO = "14:00";
/** Fin del bloque movido; conserva las tres horas del original. */
export const HASTA_MOVIDO = "17:00";

/**
 * La sede del jueves de 93.18 com. B, con la que el bloque movido queda
 * pegado. Usarla en `horariosConSedeRepetida` da el caso que **no** es ↕.
 */
export const SEDE_VECINA: Bloque["sede"] = "rectorado";

/**
 * Los mismos horarios de casos raros con el jueves de 30.28 com. A corrido,
 * de modo que 93.18 com. B (Rectorado) y 30.28 com. A (SDT) queden pegados.
 */
export function horariosConSedesConsecutivas(): Horarios {
  return horariosConJuevesMovido(null);
}

/**
 * El mismo movimiento, pero además con el bloque de 30.28 puesto en la sede de
 * 93.18 com. B: dos bloques pegados **en la misma sede**, que es el caso que no
 * tiene que dar ↕. Es el par negativo de `horariosConSedesConsecutivas`: cambia
 * un solo dato más respecto de aquel, la sede.
 */
export function horariosConSedeRepetida(): Horarios {
  return horariosConJuevesMovido(SEDE_VECINA);
}

/** `sede` en `null` deja la sede original del bloque. */
function horariosConJuevesMovido(sede: Bloque["sede"] | null): Horarios {
  const copia = structuredClone(HORARIOS_RAROS);
  const curso = copia.cursos.find((candidato) => candidato.codigo === "30.28");
  if (curso === undefined) {
    throw new Error("El fixture real ya no trae 30.28: revisá este derivado.");
  }
  const comision = curso.comisiones.find((candidata) => candidata.id === "A");
  if (comision === undefined) {
    throw new Error("30.28 ya no tiene comisión A: revisá este derivado.");
  }
  const jueves = comision.bloques.find((bloque) => bloque.dia === "jueves");
  if (jueves === undefined) {
    throw new Error("30.28 com. A ya no tiene jueves: revisá este derivado.");
  }
  jueves.desde = DESDE_MOVIDO;
  jueves.hasta = HASTA_MOVIDO;
  if (sede !== null) {
    jueves.sede = sede;
  }
  return copia;
}
