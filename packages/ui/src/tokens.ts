/**
 * Tokens tipados del sistema de diseño "Technical Split".
 * La fuente de verdad VISUAL son las CSS custom properties en
 * `src/styles/tokens.css` (derivadas de 6 hex base, conmutadas por
 * `[data-theme]`). Acá viven los espejos en TypeScript: uniones de
 * variantes y constantes que la API de los componentes consume, para
 * que el autocompletado y el type-check reflejen el CSS.
 */

/** Las 6 hex base — única fuente de verdad de color (ver tokens.css). */
export const BASE_HEX = {
  brown: "#241208",
  zinc: "#27272a",
  blue: "#92cff2",
  gray: "#a1a1aa",
  coral: "#f47c59",
  white: "#ffffff",
} as const;

/** Identificadores de las 7 materias (manejan el tint `--vault-tint`). */
export const VAULT_IDS = [
  "mna",
  "derecho",
  "economia",
  "proba",
  "paw",
  "sds",
  "inge2",
] as const;
export type VaultId = (typeof VAULT_IDS)[number];

/** Temas soportados (el script anti-flash fija `data-theme` antes de pintar). */
export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "sv-theme";

/** Variantes de botón (mapea a `.btn--*`). */
export type ButtonVariant =
  | "primary"
  | "blue"
  | "secondary"
  | "ghost"
  | "monolabel";
export type ButtonSize = "sm" | "md" | "lg";

/** Variantes de badge (mapea a `.badge--*`). */
export type BadgeVariant = "default" | "status" | "sys" | "solid";

/** Tonos de los readouts key-value (mapea a `.vtool-kv .v.*`). */
export type ReadoutTone = "default" | "accent" | "coral";

/** Escala de espaciado (base 8) expuesta como custom properties `--s-*`. */
export const SPACE = {
  1: "var(--s-1)",
  2: "var(--s-2)",
  3: "var(--s-3)",
  4: "var(--s-4)",
  5: "var(--s-5)",
  6: "var(--s-6)",
  7: "var(--s-7)",
} as const;
