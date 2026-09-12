/**
 * Chip: etiqueta breve, a veces pulsable.
 *
 * - `relleno`: fondo suave y contorno. Filtro en reposo (13c).
 * - `contorno`: sobre la superficie, solo contorno. Período no visible (13b).
 * - `seleccionado`: relleno oscuro. Filtro activo (13c) y período visible (13b).
 * - `minor`: la marca 14b — contorno gris fino y la sigla en mono, sin fondo.
 *
 * Con `onClick` es un `<button>` y lleva `aria-pressed`; sin él es un `<span>`,
 * porque una marca que no hace nada no es un control.
 *
 * `pastilla` redondea del todo: así son los chips de período en 13b. El resto
 * usa el radio de chip de `tokens.md` (4 px).
 */

import type { ReactNode } from "react";

import "./Chip.css";

export type VarianteChip =
  | "relleno"
  | "contorno"
  | "seleccionado"
  | "minor";

export interface PropsChip {
  variante?: VarianteChip;
  /** Redondeo completo, como los chips de período de 13b. */
  pastilla?: boolean;
  /** Si viene, el chip es un botón. */
  onClick?: () => void;
  /** Nombre accesible cuando el texto visible no alcanza (una sigla, por caso). */
  titulo?: string;
  disabled?: boolean;
  children: ReactNode;
}

export function Chip({
  variante = "contorno",
  pastilla = false,
  onClick,
  titulo,
  disabled,
  children,
}: PropsChip) {
  const clases = [
    "chip",
    `chip--${variante}`,
    pastilla ? "chip--pastilla" : "",
  ]
    .filter((clase) => clase !== "")
    .join(" ");

  if (onClick === undefined) {
    return (
      <span className={clases} title={titulo} aria-label={titulo}>
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={clases}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={variante === "seleccionado"}
      title={titulo}
      aria-label={titulo}
    >
      {children}
    </button>
  );
}
