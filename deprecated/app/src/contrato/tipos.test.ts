/**
 * Los tipos generados tienen que aceptar los datos reales.
 *
 * La parte importante de este archivo la corre `tsc`, no `vitest`: cada
 * `satisfies` de abajo falla en `npm run typecheck` si un schema deja de
 * describir lo que hay en `data/v1/` o en `app/src/datos/ejemplo/`.
 *
 * Una limitación conocida de TypeScript obliga al rodeo de `ComoJson`: al
 * importar un JSON, TypeScript ensancha cada string a `string` y pierde los
 * literales, así que `"basico" satisfies Ciclo` no compila aunque el dato sea
 * correcto. `ComoJson<T>` aplica el mismo ensanchamiento al tipo esperado, de
 * modo que el `satisfies` comprueba la forma —propiedades obligatorias,
 * anidamiento, arrays, números contra strings— y el test de abajo comprueba a
 * mano lo que el ensanchamiento deja afuera: que los valores de los campos con
 * `enum` estén entre los que el schema declara.
 */

import { describe, expect, it } from "vitest";

import abreviacionesDatos from "../../../data/v1/abreviaciones.json";
import indiceDatos from "../../../data/index.json";
import planDatos from "../../../data/v1/planes/S10-Rev23.json";
import vocabularioDatos from "../../../data/v1/vocabulario.json";
import esquemaHorarios from "../../../schemas/v1/horarios.schema.json";
import esquemaPlanes from "../../../schemas/v1/planes.schema.json";
import abreviacionesEjemplo from "../datos/ejemplo/v1/abreviaciones.json";
import horariosEjemplo from "../datos/ejemplo/v1/horarios/2026-2C.json";
import indiceEjemplo from "../datos/ejemplo/index.json";
import planEjemplo from "../datos/ejemplo/v1/planes/S10-Rev23.json";
import vocabularioEjemplo from "../datos/ejemplo/v1/vocabulario.json";
import type {
  Abreviaciones,
  Horarios,
  Indice,
  Plan,
  Vocabulario,
} from "./tipos";

/**
 * El tipo `T` tal como lo ve TypeScript después de importar un JSON: mismas
 * propiedades y misma estructura, pero con los literales de string ensanchados.
 */
type ComoJson<T> = T extends (infer U)[]
  ? ComoJson<U>[]
  : T extends string
    ? string
    : T extends object
      ? { [K in keyof T]: ComoJson<T[K]> }
      : T;

/* Datos publicados: `data/index.json` y `data/v1/`. */
const indicePublicado = indiceDatos satisfies ComoJson<Indice>;
const planPublicado = planDatos satisfies ComoJson<Plan>;
const abreviacionesPublicadas =
  abreviacionesDatos satisfies ComoJson<Abreviaciones>;
const vocabularioPublicado =
  vocabularioDatos satisfies ComoJson<Vocabulario>;

/* Fixtures de la aplicación: `app/src/datos/ejemplo/`. */
const indiceDeEjemplo = indiceEjemplo satisfies ComoJson<Indice>;
const planDeEjemplo = planEjemplo satisfies ComoJson<Plan>;
const horariosDeEjemplo = horariosEjemplo satisfies ComoJson<Horarios>;
const abreviacionesDeEjemplo =
  abreviacionesEjemplo satisfies ComoJson<Abreviaciones>;
const vocabularioDeEjemplo =
  vocabularioEjemplo satisfies ComoJson<Vocabulario>;

const FIXTURES = [
  indicePublicado,
  planPublicado,
  abreviacionesPublicadas,
  vocabularioPublicado,
  indiceDeEjemplo,
  planDeEjemplo,
  horariosDeEjemplo,
  abreviacionesDeEjemplo,
  vocabularioDeEjemplo,
];

describe("tipos generados del contrato", () => {
  it("aceptan las nueve fixtures de data/ y de datos/ejemplo", () => {
    // Si este archivo compila, los `satisfies` de arriba ya pasaron; queda
    // dejar constancia de que ninguna fixture se quedó sin comprobar.
    expect(FIXTURES).toHaveLength(9);
    for (const fixture of FIXTURES) {
      expect(fixture).toHaveProperty("contrato");
    }
  });

  it("los días y modalidades de los horarios están en el schema", () => {
    const dias = esquemaHorarios.definitions.bloque.properties.dia.enum;
    const modalidades =
      esquemaHorarios.definitions.bloque.properties.modalidad.enum;
    const cuatrimestres =
      esquemaHorarios.properties.periodo.properties.cuatrimestre.enum;

    expect(cuatrimestres).toContain(horariosDeEjemplo.periodo.cuatrimestre);
    let bloques = 0;
    for (const curso of horariosDeEjemplo.cursos) {
      for (const comision of curso.comisiones) {
        for (const bloque of comision.bloques) {
          bloques += 1;
          expect(dias).toContain(bloque.dia);
          expect(modalidades).toContain(bloque.modalidad);
        }
      }
    }
    expect(bloques).toBeGreaterThan(0);
  });

  it("los ciclos y tipos de título del plan están en el schema", () => {
    const ciclos = esquemaPlanes.definitions.ciclo.enum;
    const tipos = esquemaPlanes.definitions.titulo.properties.tipo.enum;

    for (const plan of [planPublicado, planDeEjemplo]) {
      expect(plan.materias.length).toBeGreaterThan(0);
      for (const materia of plan.materias) {
        expect(ciclos).toContain(materia.ciclo);
      }
      for (const titulo of plan.titulos) {
        expect(tipos).toContain(titulo.tipo);
      }
    }
  });
});
