/**
 * Campo de texto o de búsqueda.
 *
 * Al foco el borde pasa a 1.5 px (`--borde-campo-activo`, tokens.md): el
 * grosor cambia dentro de la misma caja porque el `box-sizing` es `border-box`
 * y el alto está fijado, así que el campo no salta.
 *
 * La etiqueta accesible es obligatoria: el mockup no dibuja `<label>` visible
 * y un campo sin nombre no se puede usar con lector de pantalla.
 */

import type { ChangeEvent, InputHTMLAttributes } from "react";

import "./Campo.css";

export type TipoCampo = "texto" | "busqueda";

export interface PropsCampo
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "className" | "type" | "onChange" | "value"
  > {
  tipo?: TipoCampo;
  /** Nombre accesible; también es el `aria-label` del input. */
  etiqueta: string;
  valor?: string;
  onCambio?: (valor: string) => void;
}

export function Campo({
  tipo = "texto",
  etiqueta,
  valor,
  onCambio,
  ...resto
}: PropsCampo) {
  const alCambiar = (evento: ChangeEvent<HTMLInputElement>) => {
    onCambio?.(evento.target.value);
  };

  return (
    <input
      className={`campo campo--${tipo}`}
      type={tipo === "busqueda" ? "search" : "text"}
      aria-label={etiqueta}
      {...(valor === undefined ? {} : { value: valor })}
      onChange={alCambiar}
      {...resto}
    />
  );
}
