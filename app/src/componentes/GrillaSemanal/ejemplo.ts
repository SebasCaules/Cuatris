/**
 * Datos de ejemplo para el muestrario y para las pruebas de los tres
 * componentes de la Ola 3.
 *
 * **Nada de esto está inventado.** Cada valor sale de una fuente del
 * repositorio y `ejemplo.test.ts` lo comprueba contra ella:
 *
 * - los bloques, de `tests/fixtures/deben-pasar/horarios-casos-raros.json`
 *   (93.18 com. A, 72.44 com. S, 30.28 com. A y 15.09 sin comisiones);
 * - los créditos y los hitos, de `data/v1/planes/S10-Rev23.json`;
 * - las abreviaciones que existen, de `data/v1/abreviaciones.json`;
 * - los nombres de sede, de `data/v1/vocabulario.json`.
 *
 * Está transcrito en vez de importado porque el muestrario se sirve con Vite y
 * `server.fs.allow` (en `app/vite.config.ts`) solo deja salir de `app/` hacia
 * `data/`: un `import` de `tests/` funcionaría en el build y fallaría con 403
 * en `npm run dev`. La prueba de al lado es la que impide que la copia
 * envejezca: si el corpus cambia, rompe acá.
 *
 * Las abreviaciones de 93.18, 30.28 y 15.09 no están en `abreviaciones.json`
 * —no son materias del plan S10-Rev23— y se toman tal cual del mockup 13b,
 * que es la otra fuente aprobada.
 */

import type { Bloque, Codigo } from "../../contrato/tipos";
import {
  paresConCambioDeSede,
  paresQueChocan,
  type BloqueUbicado,
  type CambioDeSede,
  type Choque,
} from "../../motor";
import type { MateriaEnGrilla } from "./GrillaSemanal";

/** El período del archivo de casos raros. */
export const PERIODO = "2026-2C";

/** Cuatrimestre entero del archivo de casos raros. */
const CUATRIMESTRE = { desde: "2026-07-26", hasta: "2026-12-31" };
function presencial(
  dia: Bloque["dia"],
  desde: string,
  hasta: string,
  sede: string,
  aulas: string[],
): Bloque {
  return { dia, desde, hasta, sede, modalidad: "presencial", aulas };
}

/**
 * 93.18 Álgebra Lineal, comisión A. Es la materia del choque de 13b y la única
 * comisión del corpus que cruza sedes (miércoles en SDT).
 */
export const ALGEBRA: MateriaEnGrilla = {
  codigo: "93.18",
  nombre: "Álgebra Lineal",
  abreviacion: "Álgebra Lin.",
  color: 0,
  comision: "A",
  bloques: [
    presencial("lunes", "14:00", "16:00", "rectorado", ["001R"]),
    presencial("miercoles", "14:00", "16:00", "sdt", ["201T"]),
    presencial("jueves", "14:00", "16:00", "rectorado", ["203R"]),
  ],
};

/** 93.18 comisión B: la del miércoles en dos aulas a la vez (003T y 004T). */
export const ALGEBRA_B: MateriaEnGrilla = {
  ...ALGEBRA,
  comision: "B",
  bloques: [
    presencial("lunes", "12:00", "14:00", "rectorado", ["007R"]),
    presencial("miercoles", "10:00", "12:00", "sdt", ["003T", "004T"]),
    presencial("jueves", "12:00", "14:00", "rectorado", ["203R"]),
  ],
};

/** 72.44 Criptografía y Seguridad, comisión S (letra no contigua). */
export const CRIPTO: MateriaEnGrilla = {
  codigo: "72.44",
  nombre: "Criptografía y Seguridad",
  abreviacion: "Cripto",
  color: 5,
  comision: "S",
  bloques: [presencial("lunes", "15:00", "18:00", "rectorado", ["002R"])],
};

/** 30.28 Accionamientos Industriales, comisión A (jueves blended). */
export const ACCIONAMIENTOS: MateriaEnGrilla = {
  codigo: "30.28",
  nombre: "Accionamientos Industriales",
  abreviacion: "Accionamientos",
  color: 6,
  comision: "A",
  bloques: [
    {
      dia: "jueves",
      desde: "19:00",
      hasta: "22:00",
      sede: "sdt",
      modalidad: "blended",
      aulas: ["003T"],
    },
    presencial("viernes", "19:00", "22:00", "sdt", ["101T"]),
  ],
};

/**
 * 15.09 Agile, Lean y Lean Six Sigma: se ofrece —del 18/09 al 16/10, el
 * período corto—, pero sin comisiones. Es la materia que en 13b baja al pie
 * con la nota punteada.
 */
export const SIN_HORARIO = {
  codigo: "15.09" as Codigo,
  nombre: "Agile, Lean y Lean Six Sigma",
  abreviacion: "Agile / Lean",
  color: 2,
};

/** Las materias con horario del «1.º cuatrimestre 2026» de 13b. */
export const MATERIAS: readonly MateriaEnGrilla[] = [
  ALGEBRA,
  CRIPTO,
  ACCIONAMIENTOS,
];

function ubicar(
  materia: MateriaEnGrilla,
  vigencia = CUATRIMESTRE,
): BloqueUbicado[] {
  return materia.bloques.map((bloque) => ({
    codigo: materia.codigo,
    nombre: materia.nombre ?? materia.abreviacion,
    comision: materia.comision,
    vigencia,
    bloque,
  }));
}

/** Los bloques ubicados de las tres materias, como los arma el motor. */
export const UBICADOS: readonly BloqueUbicado[] = MATERIAS.flatMap((materia) =>
  ubicar(materia),
);

/** Un solo choque: 93.18 A ↔ 72.44 S, el lunes de 15 a 16. */
export const CHOQUES: readonly Choque[] = paresQueChocan(UBICADOS);

/**
 * Cambio de sede ↕ derivado, **no real**: en el corpus no hay dos bloques
 * pegados en sedes distintas (`motor/fixtures/sedes-consecutivas.ts` explica
 * por qué). Se corre el jueves de 30.28 com. A de 19:00–22:00 a 14:00–17:00
 * para que empiece justo cuando termina el jueves de 93.18 com. A (Rectorado).
 * Cambia una sola cosa: la hora de ese bloque.
 */
export const ACCIONAMIENTOS_PEGADO: MateriaEnGrilla = {
  ...ACCIONAMIENTOS,
  bloques: ACCIONAMIENTOS.bloques.map((bloque) =>
    bloque.dia === "jueves"
      ? { ...bloque, desde: "16:00", hasta: "19:00" }
      : bloque,
  ),
};

/** Un solo cambio de sede: jueves a las 16:00, Rectorado → SDT. */
export const CAMBIOS_DE_SEDE: readonly CambioDeSede[] = paresConCambioDeSede([
  ...ubicar(ALGEBRA),
  ...ubicar(ACCIONAMIENTOS_PEGADO),
]);

/**
 * Bloque de sábado, derivado igual que el anterior: el único bloque de 72.44
 * com. S (lunes 15–18, aula 002R) corrido al sábado de 09 a 12. El corpus no
 * trae ningún sábado y la regla «los sábados van al pie» no se podría mostrar.
 */
export const CRIPTO_SABADO: MateriaEnGrilla = {
  ...CRIPTO,
  bloques: [presencial("sabado", "09:00", "12:00", "rectorado", ["002R"])],
};

/** `rectorado` → `Rectorado`, como en `data/v1/vocabulario.json`. */
const SEDES: Record<string, string> = {
  rectorado: "Rectorado",
  sdt: "SDT",
};

/** Nombre de sede para las etiquetas; el id crudo si no está en el vocabulario. */
export function nombreDeSede(id: string): string {
  return SEDES[id] ?? id;
}

/** Una materia de la tarjeta sin horarios: barra de color, abreviación y créditos. */
export interface MateriaSinHorario {
  codigo: Codigo;
  abreviacion: string;
  color: number;
  creditos: number;
}

/** Tres materias del plan real para la variante «sin horarios» (13g). */
export const MATERIAS_SIN_HORARIOS: readonly MateriaSinHorario[] = [
  { codigo: "72.41", abreviacion: "BD2", color: 1, creditos: 6 },
  { codigo: "72.75", abreviacion: "ML", color: 4, creditos: 3 },
  { codigo: "72.45", abreviacion: "PF", color: 8, creditos: 12 },
];

/** Los dos hitos de 13g; los números salen del plan. */
export const HITOS: readonly string[] = [
  "✓ Al aprobar este cuatrimestre: 243 cr · Ingeniero/a en Informática",
  "72.45 Proyecto Final se destraba con 160 cr ✓",
];

/** Cuándo salen los horarios de 2027-1C (`horarios_esperados` de §5). */
export const HORARIOS_ESPERADOS = "2026-11";
