/**
 * Botón. Tres variantes y dos tamaños, los del mockup v2.
 *
 * - `primario`: relleno ladrillo (`--acento`). «Resolver», «+», «Elegida».
 * - `secundario`: contorno sobre superficie. «Sugerir corrección», «Elegir».
 * - `terciario`: solo texto, sin caja. Acciones al pie de una ficha.
 *
 * Tamaños: `normal` (5×10 px del mockup) y `chico` (2×7 px, el «+» de 13c).
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

import "./Boton.css";

export type VarianteBoton = "primario" | "secundario" | "terciario";
export type TamanoBoton = "normal" | "chico";

export interface PropsBoton
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  children: ReactNode;
}

export function Boton({
  variante = "secundario",
  tamano = "normal",
  type = "button",
  children,
  ...resto
}: PropsBoton) {
  return (
    <button
      type={type}
      className={`boton boton--${variante} boton--${tamano}`}
      {...resto}
    >
      {children}
    </button>
  );
}
