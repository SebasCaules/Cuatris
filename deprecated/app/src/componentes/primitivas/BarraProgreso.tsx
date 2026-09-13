/**
 * Barra de progreso: pista fina y hasta dos segmentos apilados.
 *
 * **No es un `<progress>`.** El control nativo trae el aspecto del navegador
 * —distinto en cada uno, imposible de alinear con la paleta 4a— y la regla del
 * autor es que ningún control con aspecto por defecto entre en la aplicación.
 * Acá la barra es un `div` con `role="progressbar"`: el mismo nombre accesible
 * y los mismos valores, sin aspecto prestado.
 *
 * El segundo segmento (R2) es lo que está **empezado pero no terminado**: en el
 * plan de estudios, las materias con la cursada aprobada o en curso. Va en
 * ámbar detrás del verde, así que la barra cuenta dos cosas sin necesitar dos
 * barras. `aria-valuenow` sigue midiendo solo lo terminado: es lo que la barra
 * promete.
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
  /** Lo empezado y no terminado; se dibuja en ámbar detrás de `valor`. */
  parcial?: number;
  /** Ancho fijo en píxeles; sin él la barra ocupa lo que le den. */
  ancho?: number;
}

export function BarraProgreso({
  valor,
  maximo,
  etiqueta,
  parcial = 0,
  ancho,
}: PropsBarraProgreso) {
  const tope = Math.max(maximo, 0);
  const dentro = Math.min(Math.max(valor, 0), tope);
  const empezado = Math.min(Math.max(parcial, 0), tope - dentro);
  const porcentaje = (parte: number) => (tope === 0 ? 0 : (parte / tope) * 100);
  const estilo = {
    "--barra-progreso-relleno": `${porcentaje(dentro)}%`,
    "--barra-progreso-parcial": `${porcentaje(empezado)}%`,
    ...(ancho === undefined ? {} : { "--barra-progreso-ancho": `${ancho}px` }),
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
      <span className="barra-progreso__parcial" />
    </div>
  );
}
