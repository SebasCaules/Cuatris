/**
 * Escenario de 13b armado con datos reales. **Solo para tests.**
 *
 * Se apoya en `motor/fixtures/reales.ts`, que importa el plan y el corpus por
 * ruta relativa en vez de copiarlos: si el plan o la fixture de casos raros
 * cambian, rompe acá y no en silencio.
 *
 * El índice se construye a mano porque `data/index.json` todavía no publica
 * ningún período de horarios (el scraper lo corre el autor). Sus fechas y su
 * período salen del propio archivo de casos raros, no de la imaginación.
 */

import vocabularioCrudo from "../../../../data/v1/vocabulario.json";
import type { Indice, PlanUsuario, Vocabulario } from "../../contrato/tipos";
import type { DatosCargados } from "../../datos/useDatos";
import {
  codigosDelCiclo,
  historiaCon,
  HORARIOS_RAROS,
  PERIODO_RARO,
  PLAN,
  ABREVIACIONES,
  planCon,
} from "../../motor/fixtures/reales";

/** `data/v1/vocabulario.json`: las dos sedes del ITBA. */
export const VOCABULARIO: Vocabulario =
  vocabularioCrudo as unknown as Vocabulario;

/** Hash de relleno para el índice de prueba; nada lo verifica en los tests. */
const HASH = `sha256:${"0".repeat(64)}`;

/** El cuatrimestre siguiente al del corpus: el que todavía no tiene horarios. */
export const PERIODO_FUTURO = "2027-1C";

/** El cuatrimestre en el que la simulación destraba 72.45 Proyecto Final. */
export const PERIODO_DEL_DESTRABE = "2027-2C";

/** Índice con el período del corpus publicado y activo. */
export const INDICE: Indice = {
  contrato: "1.0.0",
  actualizado: "2026-09-12",
  planes: [{ plan: "S10-Rev23", archivo: "v1/planes/S10-Rev23.json", hash: HASH }],
  abreviaciones: { archivo: "v1/abreviaciones.json", hash: HASH },
  vocabulario: { archivo: "v1/vocabulario.json", hash: HASH },
  horarios: [
    {
      periodo: PERIODO_RARO,
      archivo: `v1/horarios/${PERIODO_RARO}.json`,
      publicado: "2026-09-09",
      desde: HORARIOS_RAROS.periodo.desde,
      hasta: HORARIOS_RAROS.periodo.hasta,
      hash: HASH,
    },
  ],
  horarios_esperados: { [PERIODO_FUTURO]: "2026-11" },
};

/** Lo que `useDatos` entrega cuando el período del corpus está en curso. */
export const DATOS: DatosCargados = {
  indice: INDICE,
  plan: PLAN,
  abreviaciones: ABREVIACIONES,
  vocabulario: VOCABULARIO,
  periodo: { entrada: INDICE.horarios[0]!, estado: "activo" },
  horarios: HORARIOS_RAROS,
};

/** Los mismos datos, pero sin ningún período de horarios publicado. */
export const DATOS_SIN_HORARIOS: DatosCargados = {
  ...DATOS,
  indice: { ...INDICE, horarios: [] },
  periodo: null,
  horarios: null,
};

/**
 * El plan del usuario de 13b: ciclo básico aprobado (147 créditos, el título
 * de Analista ya alcanzado), el cuatrimestre del corpus con 93.18 com. A y
 * 72.44 com. S —el choque del lunes de 15 a 16— más 15.09, que se ofrece sin
 * comisiones, y dos cuatrimestres futuros que llevan a los 160 créditos que
 * 72.45 Proyecto Final exige.
 */
export function planDePrueba(): PlanUsuario {
  return planCon(historiaCon(codigosDelCiclo("basico")), {
    [PERIODO_RARO]: [
      { codigo: "93.18", comision: "A" },
      { codigo: "72.44", comision: "S" },
      { codigo: "15.09" },
    ],
    [PERIODO_FUTURO]: [{ codigo: "72.41" }, { codigo: "72.42" }],
    [PERIODO_DEL_DESTRABE]: [{ codigo: "72.45" }],
  });
}

/**
 * Variante con electivas del minor de Ciencia de Datos: 16.50 aprobada (3 cr)
 * y 72.49 planificada (3 cr). Es la que ejercita 13i —una fila ✓ aprobada y
 * otra ◇ planificada— y el «n electivas más y queda» del minor.
 */
export function planConElectivas(): PlanUsuario {
  return planCon(historiaCon([...codigosDelCiclo("basico"), "16.50"]), {
    [PERIODO_RARO]: [{ codigo: "72.49" }],
  });
}

/**
 * Variante que llega a los 192 créditos del Bachiller al terminar el
 * cuatrimestre del corpus: es la que muestra el hito «✓ Al aprobar este
 * cuatrimestre». Las once materias del ciclo profesional suman 48 créditos.
 */
export function planQueAlcanzaElBachiller(): PlanUsuario {
  return planCon(historiaCon(codigosDelCiclo("basico")), {
    [PERIODO_RARO]: [
      "12.83",
      "61.23",
      "61.32",
      "72.20",
      "72.25",
      "72.27",
      "72.40",
      "72.41",
      "72.42",
      "72.43",
      "72.44",
    ].map((codigo) => ({ codigo })),
  });
}
