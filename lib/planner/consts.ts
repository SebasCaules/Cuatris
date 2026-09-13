// Constantes compartidas del planner que no salen de data.json.

/**
 * Cantidad máxima de cuatrimestres que maneja el plan (optimize.ts trabaja
 * hasta este horizonte). Todos los selects de "fijar cuatrimestre" derivan
 * su rango de acá — no hardcodear 8/12 en las vistas.
 */
export const MAX_PLAN_CUATRIS = 14;
