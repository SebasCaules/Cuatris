/**
 * Tooltip propio: la burbuja que explica un control sin agregarle texto fijo.
 *
 * **Nunca `title=`.** El atributo del navegador aparece con un retardo que no
 * se controla, no se puede estilar, no sale nunca en una pantalla táctil y no
 * lo anuncia ningún lector de pantalla de forma predecible. Acá la burbuja es
 * un `role="tooltip"` propio, enlazado al control por `aria-describedby`.
 *
 * Aparece a los ~300 ms de dejar el puntero encima y **al instante con el
 * foco**: quien llega con el teclado ya pidió el control a propósito y no
 * tiene por qué esperar.
 */

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";

import "./Tooltip.css";

/** Retardo del hover, en milisegundos. Con el foco la burbuja no espera. */
export const RETARDO_TOOLTIP_MS = 300;

/** Dónde se dibuja la burbuja respecto del control. */
export type LadoTooltip = "arriba" | "abajo";

export interface PropsTooltip {
  /**
   * Lo que dice la burbuja. Es texto, no marcado. Vacío apaga el tooltip sin
   * sacar el envoltorio: así un control que solo a veces tiene algo que
   * explicar no se desmonta al cambiar de estado.
   */
  texto: string;
  lado?: LadoTooltip;
  /** El control que describe; recibe el `aria-describedby`. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

export function Tooltip({ texto, lado = "arriba", children }: PropsTooltip) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelar = () => {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  useEffect(() => cancelar, []);

  const mostrarConRetardo = () => {
    cancelar();
    temporizador.current = setTimeout(() => {
      setVisible(true);
    }, RETARDO_TOOLTIP_MS);
  };

  const ocultar = () => {
    cancelar();
    setVisible(false);
  };

  /*
   * El `aria-describedby` solo apunta a la burbuja mientras está en el DOM: un
   * `describedby` colgando de un id inexistente no describe nada y además
   * ensucia el árbol de accesibilidad.
   */
  const mostrando = visible && texto !== "";
  const heredado = children.props["aria-describedby"];
  const describedby = mostrando ? id : heredado;
  const control = cloneElement(
    children,
    describedby === undefined ? {} : { "aria-describedby": describedby },
  );

  return (
    <span
      className="tooltip"
      onMouseEnter={mostrarConRetardo}
      onMouseLeave={ocultar}
      onFocus={() => {
        cancelar();
        setVisible(true);
      }}
      onBlur={ocultar}
    >
      {control}
      {mostrando ? (
        <span className={`tooltip__burbuja tooltip__burbuja--${lado}`} role="tooltip" id={id}>
          {texto}
        </span>
      ) : null}
    </span>
  );
}
