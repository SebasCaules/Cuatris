/**
 * Carrusel horizontal de cuatrimestres (decisión 12a, pantalla 13b).
 *
 * La grilla nunca se sacrifica por caber: en vez de achicar las tarjetas para
 * que entren todas, se muestran `visibles` con su ancho entero y el resto
 * queda **oculto** a la derecha o a la izquierda, alcanzable con el trackpad
 * (rueda horizontal), arrastrando con el mouse, con las flechas o con el
 * teclado.
 *
 * El desplazamiento es el nativo del navegador —`overflow-x: auto` con
 * `scroll-snap`—, no una pista trasladada por JavaScript: es lo que hace que
 * el trackpad funcione sin código y que el estado visual nunca se desincronice
 * del componente. Lo único que se guarda es el índice de la primera tarjeta a
 * la vista, que se deduce del `scrollLeft` y sirve para las flechas, para el
 * teclado y para `irA()`.
 *
 * Las flechas se dibujan solo cuando hay más tarjetas en ese sentido: son el
 * único aviso de que el carrusel sigue.
 *
 * El carrusel no sabe qué hay adentro de cada tarjeta: `render(periodo)`
 * devuelve el contenido. Así la tarjeta con grilla y la tarjeta sin horarios
 * publicados (13g) conviven sin que el carrusel se entere.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as MouseEventDeReact,
  type PointerEvent as PointerEventDeReact,
  type ReactNode,
} from "react";

import type { PeriodoId, Visibles } from "../../contrato/tipos";
import { Tooltip } from "../primitivas";
import { etiquetaCorta, PeriodoFueraDelCarrusel } from "./periodos";
import "./Carrusel.css";

/** Lo que expone el carrusel por `ref`. */
export interface ManijaCarrusel {
  /**
   * Mueve el carrusel hasta dejar ese período a la vista. Lanza
   * `PeriodoFueraDelCarrusel` si el período no está en la lista.
   */
  irA: (periodo: PeriodoId) => void;
  /** Primer período visible. */
  primerVisible: () => PeriodoId | null;
}

export interface PropsCarrusel {
  /** Períodos en el orden en que se recorren, del más cercano al más lejano. */
  periodos: PeriodoId[];
  /** Cuántas tarjetas se ven a la vez. */
  visibles: Visibles;
  /** Contenido de la tarjeta de un período. */
  render: (periodo: PeriodoId) => ReactNode;
  /** Nombre accesible de la tarjeta; por defecto, «1.º 2026». */
  etiquetaDe?: (periodo: PeriodoId) => string;
  /** Se llama con el primer período visible cada vez que el carrusel se mueve. */
  onMover?: (primero: PeriodoId) => void;
  /** Controles a la derecha de la cabecera («Agregar materia» en 13b). */
  acciones?: ReactNode;
  /**
   * Clase extra para la tarjeta de un período (el destino de un arrastre, por
   * caso). El carrusel no sabe qué significa: solo la pone.
   */
  claseDe?: (periodo: PeriodoId) => string | undefined;
}

/** Hueco entre tarjetas, en píxeles. Es el `--carrusel-hueco` de la hoja. */
export const HUECO_PX = 10;

/** Cuánto hay que mover el puntero para que un clic pase a ser un arrastre. */
const UMBRAL_ARRASTRE_PX = 4;

function sinMovimiento(evento: KeyboardEvent<HTMLDivElement>): boolean {
  const destino = evento.target;
  if (!(destino instanceof HTMLElement)) {
    return false;
  }
  // Escribir en un campo no mueve el carrusel: las flechas son del cursor.
  return (
    destino.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(destino.tagName)
  );
}

/**
 * Lo que no se arrastra para scrollear: controles, y las materias que tienen
 * su propio arrastre (`data-arrastre-codigo`, ver `PaginaCursada`).
 */
function esArrastrePropio(destino: EventTarget | null): boolean {
  if (!(destino instanceof Element)) {
    return false;
  }
  return (
    destino.closest(
      "button, a, input, textarea, select, [data-arrastre-codigo]",
    ) !== null
  );
}

/** Ancho de una tarjeta más su hueco: lo que avanza una posición. */
function pasoDe(ventana: HTMLElement, visibles: number): number {
  const ancho = ventana.clientWidth;
  if (ancho <= 0) {
    return 0;
  }
  return (ancho - (visibles - 1) * HUECO_PX) / visibles + HUECO_PX;
}

export const Carrusel = forwardRef<ManijaCarrusel, PropsCarrusel>(
  function Carrusel(
    {
      periodos,
      visibles,
      render,
      etiquetaDe = etiquetaCorta,
      onMover,
      acciones,
      claseDe,
    },
    manija,
  ) {
    const ventana = useRef<HTMLDivElement>(null);
    const [indiceCrudo, setIndice] = useState(0);
    const [arrastrando, setArrastrando] = useState(false);
    const arrastre = useRef<{
      x: number;
      scroll: number;
      movido: boolean;
    } | null>(null);
    /**
     * A dónde va un scroll suave pedido por flecha, teclado o `irA()`. Mientras
     * viaja, los `scroll` intermedios no tocan el índice: si lo hicieran, el
     * índice iría y volvería durante la animación. Se libera al llegar, o a
     * los 600 ms si el usuario interrumpió la animación con el trackpad.
     */
    const objetivo = useRef<{ indice: number; hasta: number } | null>(null);

    const total = periodos.length;
    /** El último primer-visible posible: más allá quedaría hueco a la derecha. */
    const maximo = Math.max(0, total - visibles);
    const indice = Math.min(indiceCrudo, maximo);

    const desplazarA = useCallback(
      (destino: number, suave = true) => {
        const caja = ventana.current;
        if (caja === null) {
          return;
        }
        const paso = pasoDe(caja, visibles);
        const left = destino * paso;
        if (typeof caja.scrollTo === "function") {
          caja.scrollTo({ left, behavior: suave ? "smooth" : "auto" });
        } else {
          caja.scrollLeft = left;
        }
      },
      [visibles],
    );

    const irAlIndice = useCallback(
      (destino: number) => {
        const acotado = Math.min(Math.max(destino, 0), maximo);
        setIndice(acotado);
        objetivo.current = { indice: acotado, hasta: Date.now() + 600 };
        desplazarA(acotado);
        const primero = periodos[acotado];
        if (primero !== undefined) {
          onMover?.(primero);
        }
      },
      [desplazarA, maximo, onMover, periodos],
    );

    useImperativeHandle(
      manija,
      () => ({
        irA: (periodo: PeriodoId) => {
          const donde = periodos.indexOf(periodo);
          if (donde === -1) {
            throw new PeriodoFueraDelCarrusel(periodo, periodos);
          }
          // Si ya se ve, no hay nada que mover.
          if (donde >= indice && donde < indice + visibles) {
            return;
          }
          irAlIndice(donde);
        },
        primerVisible: () => periodos[indice] ?? null,
      }),
      [indice, irAlIndice, periodos, visibles],
    );

    // Cambiar cuántas se ven cambia el ancho de cada una: se reacomoda el
    // scroll para que el índice siga apuntando a la misma tarjeta.
    useEffect(() => {
      desplazarA(indice, false);
      // Solo cuando cambia `visibles`: el índice ya se movió con su scroll.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibles, desplazarA]);

    /** El scroll nativo (trackpad, rueda, arrastre) actualiza el índice. */
    const alDesplazar = () => {
      const caja = ventana.current;
      if (caja === null || arrastre.current !== null) {
        return;
      }
      const paso = pasoDe(caja, visibles);
      if (paso <= 0) {
        return;
      }
      const viaje = objetivo.current;
      if (viaje !== null) {
        const llego = Math.abs(caja.scrollLeft - viaje.indice * paso) < 2;
        if (!llego && Date.now() < viaje.hasta) {
          return;
        }
        objetivo.current = null;
      }
      const nuevo = Math.min(
        Math.max(Math.round(caja.scrollLeft / paso), 0),
        maximo,
      );
      if (nuevo !== indice) {
        setIndice(nuevo);
        const primero = periodos[nuevo];
        if (primero !== undefined) {
          onMover?.(primero);
        }
      }
    };

    const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
      if (sinMovimiento(evento)) {
        return;
      }
      if (evento.key === "ArrowLeft") {
        evento.preventDefault();
        irAlIndice(indice - 1);
      } else if (evento.key === "ArrowRight") {
        evento.preventDefault();
        irAlIndice(indice + 1);
      }
    };

    /*
     * Arrastre con el mouse sobre el fondo de la ventana: se mueve el
     * `scrollLeft` a mano mientras dura y, al soltar, el snap acomoda la
     * tarjeta. Los pointers táctiles ya scrollean solos; los controles y las
     * materias arrastrables se dejan en paz.
     */
    const alApretar = (evento: PointerEventDeReact<HTMLDivElement>) => {
      if (
        evento.pointerType !== "mouse" ||
        evento.button !== 0 ||
        esArrastrePropio(evento.target)
      ) {
        return;
      }
      const caja = ventana.current;
      if (caja === null) {
        return;
      }
      arrastre.current = { x: evento.clientX, scroll: caja.scrollLeft, movido: false };
    };

    const alMover = (evento: PointerEventDeReact<HTMLDivElement>) => {
      const estado = arrastre.current;
      const caja = ventana.current;
      if (estado === null || caja === null) {
        return;
      }
      const delta = evento.clientX - estado.x;
      if (!estado.movido && Math.abs(delta) < UMBRAL_ARRASTRE_PX) {
        return;
      }
      if (!estado.movido) {
        estado.movido = true;
        setArrastrando(true);
        if (typeof caja.setPointerCapture === "function") {
          caja.setPointerCapture(evento.pointerId);
        }
      }
      caja.scrollLeft = estado.scroll - delta;
    };

    const alSoltar = (evento: PointerEventDeReact<HTMLDivElement>) => {
      const estado = arrastre.current;
      const caja = ventana.current;
      arrastre.current = null;
      if (estado === null || caja === null || !estado.movido) {
        return;
      }
      if (
        typeof caja.hasPointerCapture === "function" &&
        caja.hasPointerCapture(evento.pointerId)
      ) {
        caja.releasePointerCapture(evento.pointerId);
      }
      setArrastrando(false);
      // Al soltar, la tarjeta más cercana pasa a ser la primera visible.
      const paso = pasoDe(caja, visibles);
      if (paso > 0) {
        irAlIndice(Math.round(caja.scrollLeft / paso));
      }
    };

    // Un arrastre no es un clic: se traga el `click` que el navegador dispara
    // al soltar, para no abrir lo que quedó debajo del puntero.
    const alClicCapturado = (evento: MouseEventDeReact<HTMLDivElement>) => {
      if (arrastrando) {
        evento.stopPropagation();
        evento.preventDefault();
      }
    };

    const aLaVista = Math.min(visibles, total);
    const estilo = {
      "--carrusel-visibles": visibles,
      "--carrusel-indice": indice,
    } as CSSProperties;

    return (
      <section className="carrusel" style={estilo} aria-label="Cuatrimestres">
        {acciones === undefined ? null : (
          <div className="carrusel__controles">
            <p className="carrusel__cuenta" aria-live="polite">
              {aLaVista} de {total} visibles
            </p>
            <div className="carrusel__acciones">{acciones}</div>
          </div>
        )}

        <div className="carrusel__marco">
          {indice > 0 ? (
            <Tooltip texto="Cuatrimestre anterior">
              <button
                type="button"
                className="carrusel__flecha carrusel__flecha--anterior"
                onClick={() => {
                  irAlIndice(indice - 1);
                }}
                aria-label="Cuatrimestre anterior"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                  <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </Tooltip>
          ) : null}
          {indice < maximo ? (
            <Tooltip texto="Cuatrimestre siguiente">
              <button
                type="button"
                className="carrusel__flecha carrusel__flecha--siguiente"
                onClick={() => {
                  irAlIndice(indice + 1);
                }}
                aria-label="Cuatrimestre siguiente"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                  <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </Tooltip>
          ) : null}

          <div
            className={`carrusel__ventana${
              arrastrando ? " carrusel__ventana--arrastrando" : ""
            }`}
            ref={ventana}
            tabIndex={0}
            onKeyDown={alTeclear}
            onScroll={alDesplazar}
            onPointerDown={alApretar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={alSoltar}
            onClickCapture={alClicCapturado}
          >
            <div className="carrusel__pista">
              {periodos.map((periodo) => {
                const extra = claseDe?.(periodo);
                return (
                  <article
                    key={periodo}
                    className={`carrusel__tarjeta${
                      extra === undefined ? "" : ` ${extra}`
                    }`}
                    aria-label={etiquetaDe(periodo)}
                    data-periodo={periodo}
                  >
                    {render(periodo)}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  },
);
