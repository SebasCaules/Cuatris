/**
 * Fixture **derivada, no real**, para ejercitar el estado «cupo lleno» de 13c.
 * Solo tests.
 *
 * En el archivo real de casos raros la única materia del plan S10-Rev23 con
 * comisión publicada es 72.44 Criptografía y Seguridad, y su comisión «S» está
 * 51 de 70: no hay ninguna materia del plan con **todas** sus comisiones llenas
 * (el 48/48 verificado es de 93.18, que no pertenece a este plan). Sin un caso
 * así la fila «◐ cupo …» no se podría probar.
 *
 * Por eso esta fixture parte del archivo real y cambia **un solo dato**: los
 * inscriptos de 72.44 com. S pasan de 51 a 70, la capacidad que ya declara el
 * SGA. Códigos, nombres, horarios, sedes y aulas quedan como están, y nada de
 * esto se publica: vive en el componente y no entra en `data/`.
 */

import type { Horarios } from "../../contrato/tipos";
import { HORARIOS_RAROS } from "../../motor/fixtures/reales";

/** Los mismos horarios con 72.44 com. S completa (70 de 70). */
export function horariosConCupoLleno(): Horarios {
  const copia = structuredClone(HORARIOS_RAROS);
  const curso = copia.cursos.find((candidato) => candidato.codigo === "72.44");
  if (curso === undefined) {
    throw new Error("El fixture real ya no trae 72.44: revisá este derivado.");
  }
  const comision = curso.comisiones.find((candidata) => candidata.id === "S");
  if (comision === undefined) {
    throw new Error("72.44 ya no tiene comisión S: revisá este derivado.");
  }
  const capacidad = comision.cupo?.capacidad;
  const ocupacion = comision.ocupacion;
  if (capacidad === undefined || ocupacion === undefined) {
    throw new Error(
      "72.44 com. S ya no declara cupo y ocupación: revisá este derivado.",
    );
  }
  ocupacion.inscriptos = capacidad;
  return copia;
}
