/**
 * Hook que trae todo lo que el cascarón necesita para dibujar una pantalla:
 * índice, plan, abreviaciones, vocabulario y los horarios del período elegido.
 */

import { useEffect, useState } from "react";

import type {
  Abreviaciones,
  Fecha,
  Horarios,
  Indice,
  Plan,
  Vocabulario,
} from "../contrato/tipos";
import {
  cargarAbreviaciones,
  cargarHorarios,
  cargarIndice,
  cargarPlan,
  cargarVocabulario,
  periodoActivo,
  type PeriodoElegido,
} from "./cargar";

export interface DatosCargados {
  indice: Indice;
  plan: Plan;
  abreviaciones: Abreviaciones;
  vocabulario: Vocabulario;
  /** `null` si el índice no publica ningún período activo ni futuro. */
  periodo: PeriodoElegido | null;
  /** `null` cuando no hay período que mostrar. */
  horarios: Horarios | null;
}

export type EstadoDatos =
  | { fase: "cargando" }
  | { fase: "listo"; datos: DatosCargados }
  | { fase: "error"; error: unknown };

/** Fecha de hoy en `YYYY-MM-DD`, en la zona horaria del navegador. */
export function hoyIso(momento: Date = new Date()): Fecha {
  const anio = String(momento.getFullYear()).padStart(4, "0");
  const mes = String(momento.getMonth() + 1).padStart(2, "0");
  const dia = String(momento.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export async function cargarTodo(
  idPlan: string,
  hoy: Fecha,
): Promise<DatosCargados> {
  const indice = await cargarIndice();
  const periodo = periodoActivo(indice, hoy);
  const [plan, abreviaciones, vocabulario] = await Promise.all([
    cargarPlan(idPlan, indice),
    cargarAbreviaciones(indice),
    cargarVocabulario(indice),
  ]);
  const horarios =
    periodo === null
      ? null
      : await cargarHorarios(periodo.entrada.periodo, indice);
  return { indice, plan, abreviaciones, vocabulario, periodo, horarios };
}

export function useDatos(idPlan: string, hoy: Fecha): EstadoDatos {
  const [estado, setEstado] = useState<EstadoDatos>({ fase: "cargando" });

  useEffect(() => {
    let vigente = true;
    setEstado({ fase: "cargando" });
    cargarTodo(idPlan, hoy)
      .then((datos) => {
        if (vigente) {
          setEstado({ fase: "listo", datos });
        }
      })
      .catch((error: unknown) => {
        if (vigente) {
          setEstado({ fase: "error", error });
        }
      });
    return () => {
      vigente = false;
    };
  }, [idPlan, hoy]);

  return estado;
}
