/**
 * Barra de progreso: pista fina gris y relleno verde proporcional.
 *
 * **No es un `<progress>`.** El control nativo trae el aspecto del navegador
 * —distinto en cada uno, imposible de alinear con la paleta 4a— y la regla del
 * autor es que ningún control con aspecto por defecto entre en la aplicación.
 * Acá la barra es un `div` con `role="progressbar"`: el mismo nombre accesible
 * y los mismos valores, sin aspecto prestado.
 *
 * El texto que acompaña a la barra («9/9») lo pone quien la usa: la primitiva
 * no sabe si cuenta materias o créditos.
 */

import type { CSSProperties } from "react";

import "./BarraProgreso.css";

export interface PropsBarraProgreso {
  /** Cuánto se lleva hecho. Se recorta a `0…maximo`. */
  valor: number;
  /** El total contra el que se mide. Con `0` la barra queda vacía. */
  maximo: number;
  /** Nombre accesible; una barra sin nombre no dice qué mide. */
  etiqueta: string;
}

export function BarraProgreso({ valor, maximo, etiqueta }: PropsBarraProgreso) {
  const tope = Math.max(maximo, 0);
  const dentro = Math.min(Math.max(valor, 0), tope);
  const porcentaje = tope === 0 ? 0 : (dentro / tope) * 100;
  const estilo = {
    "--barra-progreso-relleno": `${porcentaje}%`,
  } as CSSProperties;

  return (
    <div
      className="barra-progreso"
      role="progressbar"
      aria-label={etiqueta}
      aria-valuenow={dentro}
      aria-valuemin={0}
      aria-valuemax={tope}
      style={estilo}
    >
      <span className="barra-progreso__relleno" />
    </div>
  );
}
