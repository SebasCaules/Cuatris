// Constantes compartidas del planner que no salen de data.json.

/**
 * Cantidad máxima de cuatrimestres que maneja el plan: optimize.ts arranca
 * con 14 y extiende el horizonte hasta acá cuando hace falta (topes muy
 * bajos, materias fijadas lejos). Es el tope de índice para fijar una materia
 * o guardar una combinación — no hardcodear 8/12/14 en las vistas.
 */
export const MAX_PLAN_CUATRIS = 42;
