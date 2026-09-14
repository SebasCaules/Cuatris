// Vistas del planificador tal como se nombran en la barra superior. Módulo de
// datos puro (sin "use client") para que lo lean tanto ViewNav (pestañas
// vivas del planner) como la portada (pestañas que llevan a `/planificar/`).
import type { ViewKey } from "./types";

export interface NavView {
  view: ViewKey;
  label: string;
  /** qué se hace en la vista (tooltip de la pestaña, texto de la portada) */
  tip?: string;
}

// Etiquetas descriptivas (pedido del autor): dicen qué se hace en cada vista,
// no solo el tema. "Referencias" no es hermana: va en las tools.
export const NAV_VIEWS: NavView[] = [
  { view: "cuatri", label: "Materias y electivas", tip: "Marcá lo aprobado y lo que cursás; obligatorias por año y electivas por minor" },
  { view: "plan", label: "Plan de cursada", tip: "Cuatrimestre a cuatrimestre hasta recibirte" },
  { view: "combo", label: "Combinador de horarios", tip: "Armá el cuatrimestre eligiendo comisiones sin choques" },
  { view: "finales", label: "Combinador de finales", tip: "Fechas de finales sin superposiciones" },
  { view: "grafo", label: "Mapa de correlativas", tip: "Qué destraba cada materia" },
];
