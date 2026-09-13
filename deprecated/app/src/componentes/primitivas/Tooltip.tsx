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
 * tiene por qué esperar. Escape la cierra.
 *
 * La burbuja se dibuja en un portal sobre `document.body`, con posición fija
 * calculada a partir del control: así no la recorta ningún contenedor con
 * `overflow` (la ventana del carrusel, el panel lateral) y puede **darse
 * vuelta** cuando no entra arriba, o correrse de costado para no salirse del
 * viewport. La flecha sigue apuntando al centro del control aunque la burbuja
 * se haya corrido.
 *
 * Si el hijo es un elemento del DOM, la burbuja se le cuelga directamente
 * —sin envoltorio, para no meter un `span` en una lista—; si es un componente
 * propio que no reenvía sus props, se envuelve en un `span` `inline-flex`.
 */

import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import "./Tooltip.css";

/** Retardo del hover, en milisegundos. Con el foco la burbuja no espera. */
export const RETARDO_TOOLTIP_MS = 300;

/** Separación entre el control y la burbuja, y margen mínimo al viewport. */
const SEPARACION_PX = 8;
const MARGEN_PX = 8;

/** Dónde se dibuja la burbuja respecto del control. */
export type LadoTooltip = "arriba" | "abajo";

interface Posicion {
  lado: LadoTooltip;
  top: number;
  left: number;
  /** Dónde va la flecha dentro de la burbuja, en píxeles desde su borde. */
  flecha: number;
}

export interface PropsTooltip {
  /**
   * Lo que dice la burbuja. Es texto, no marcado. Vacío apaga el tooltip sin
   * sacar el envoltorio: así un control que solo a veces tiene algo que
   * explicar no se desmonta al cambiar de estado.
   */
  texto: string;
  /** Lado preferido; se da vuelta solo si no entra. */
  lado?: LadoTooltip;
  /** El control que describe; recibe el `aria-describedby`. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

/**
 * Dónde cabe la burbuja: en el lado pedido si entra, si no en el opuesto; y
 * corrida en horizontal lo justo para no salirse del viewport.
 */
export function ubicar(
  control: DOMRect,
  burbuja: { width: number; height: number },
  viewport: { width: number; height: number },
  preferido: LadoTooltip,
): Posicion {
  const entraArriba = control.top - SEPARACION_PX - burbuja.height >= MARGEN_PX;
  const entraAbajo =
    control.bottom + SEPARACION_PX + burbuja.height <=
    viewport.height - MARGEN_PX;
  let lado = preferido;
  if (preferido === "arriba" && !entraArriba && entraAbajo) {
    lado = "abajo";
  } else if (preferido === "abajo" && !entraAbajo && entraArriba) {
    lado = "arriba";
  }

  const centro = control.left + control.width / 2;
  const ideal = centro - burbuja.width / 2;
  const maximo = Math.max(MARGEN_PX, viewport.width - MARGEN_PX - burbuja.width);
  const left = Math.min(Math.max(ideal, MARGEN_PX), maximo);
  const top =
    lado === "arriba"
      ? control.top - SEPARACION_PX - burbuja.height
      : control.bottom + SEPARACION_PX;
  // La flecha apunta al centro del control, acotada al cuerpo de la burbuja.
  const flecha = Math.min(
    Math.max(centro - left, SEPARACION_PX),
    Math.max(SEPARACION_PX, burbuja.width - SEPARACION_PX),
  );
  return { lado, top, left, flecha };
}

export function Tooltip({ texto, lado = "arriba", children }: PropsTooltip) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const control = useRef<HTMLElement | null>(null);
  const burbuja = useRef<HTMLSpanElement | null>(null);

  const cancelar = () => {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  useEffect(() => cancelar, []);

  const ocultar = useCallback(() => {
    cancelar();
    setVisible(false);
    setPosicion(null);
  }, []);

  const mostrarConRetardo = (evento: MouseEvent<HTMLElement>) => {
    control.current = evento.currentTarget;
    cancelar();
    temporizador.current = setTimeout(() => {
      setVisible(true);
    }, RETARDO_TOOLTIP_MS);
  };

  const mostrarYa = (evento: FocusEvent<HTMLElement>) => {
    control.current = evento.currentTarget;
    cancelar();
    setVisible(true);
  };

  const mostrando = visible && texto !== "";

  // Medir y ubicar antes de pintar, para que no se vea saltar de lugar.
  useLayoutEffect(() => {
    if (!mostrando) {
      return;
    }
    const caja = burbuja.current;
    const ancla = control.current;
    if (caja === null || ancla === null) {
      return;
    }
    setPosicion(
      ubicar(
        ancla.getBoundingClientRect(),
        { width: caja.offsetWidth, height: caja.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        lado,
      ),
    );
  }, [mostrando, lado, texto]);

  // Escape cierra; un scroll o un cambio de tamaño la esconden en vez de
  // dejarla flotando lejos del control.
  useEffect(() => {
    if (!mostrando) {
      return undefined;
    }
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        ocultar();
      }
    };
    window.addEventListener("keydown", alTeclear);
    window.addEventListener("scroll", ocultar, true);
    window.addEventListener("resize", ocultar);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener("scroll", ocultar, true);
      window.removeEventListener("resize", ocultar);
    };
  }, [mostrando, ocultar]);

  /*
   * El `aria-describedby` solo apunta a la burbuja mientras está en el DOM: un
   * `describedby` colgando de un id inexistente no describe nada y además
   * ensucia el árbol de accesibilidad.
   */
  const heredado = children.props["aria-describedby"];
  const describedby = mostrando ? id : heredado;
  const manejadores = {
    onMouseEnter: mostrarConRetardo,
    onMouseLeave: ocultar,
    onFocus: mostrarYa,
    onBlur: ocultar,
  };

  const esDom = typeof children.type === "string";
  const hijo = esDom
    ? cloneElement(children, {
        ...(describedby === undefined ? {} : { "aria-describedby": describedby }),
        ...manejadores,
      })
    : cloneElement(
        children,
        describedby === undefined ? {} : { "aria-describedby": describedby },
      );

  const estilo: CSSProperties =
    posicion === null
      ? { visibility: "hidden", top: 0, left: 0 }
      : {
          top: posicion.top,
          left: posicion.left,
          "--tooltip-flecha": `${String(posicion.flecha)}px`,
        } as CSSProperties;

  const globo = mostrando
    ? createPortal(
        <span
          ref={burbuja}
          className={`tooltip__burbuja tooltip__burbuja--${
            posicion?.lado ?? lado
          }`}
          role="tooltip"
          id={id}
          style={estilo}
        >
          {texto}
        </span>,
        document.body,
      )
    : null;

  if (esDom) {
    return (
      <>
        {hijo}
        {globo}
      </>
    );
  }
  return (
    <>
      <span className="tooltip" {...manejadores}>
        {hijo}
      </span>
      {globo}
    </>
  );
}
