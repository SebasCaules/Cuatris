// Normalización de texto para buscar: minúsculas y sin tildes ni diéresis
// («Álgebra» ≈ «algebra», «Física» ≈ «fisica»). La usan todos los buscadores
// del planner (materias, electivas, pool del plan, referencias, grafo,
// combinador); el estado guarda la consulta ya normalizada.
export const sinTildes = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Texto listo para comparar con `includes`/`startsWith`. */
export const normalizar = (s: string): string => sinTildes(s).toLowerCase();
