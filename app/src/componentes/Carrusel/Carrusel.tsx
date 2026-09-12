/**
 * Carrusel horizontal de cuatrimestres (decisión 12a, pantalla 13b).
 *
 * La grilla nunca se sacrifica por caber: en vez de achicar las tarjetas para
 * que entren todas, se muestran `visibles` con su ancho entero y el resto se
 * alcanza con las flechas, los chips o el teclado.
 *
 * El carrusel no sabe qué hay adentro de cada tarjeta: `render(periodo)`
 * devuelve el contenido. Así la tarjeta con grilla y la tarjeta sin horarios
 * publicados (13g) conviven sin que el carrusel se entere.
 */

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { PeriodoId, Visibles } from "../../contrato/tipos";
import { Chip } from "../primitivas";
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
  /** Texto del chip; por defecto, «1.º 2026». */
  etiquetaDe?: (periodo: PeriodoId) => string;
  /** Se llama con el primer período visible cada vez que el carrusel se mueve. */
  onMover?: (primero: PeriodoId) => void;
  /** Controles a la derecha de la fila de chips («Agregar materia» en 13b). */
  acciones?: ReactNode;
}

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

export const Carrusel = forwardRef<ManijaCarrusel, PropsCarrusel>(
  function Carrusel(
    {
      periodos,
      visibles,
      render,
      etiquetaDe = etiquetaCorta,
      onMover,
      acciones,
    },
    manija,
  ) {
    const [indiceCrudo, setIndice] = useState(0);

    const total = periodos.length;
    /** El último primer-visible posible: más allá quedaría hueco a la derecha. */
    const maximo = Math.max(0, total - visibles);
    const indice = Math.min(indiceCrudo, maximo);

    const irAlIndice = useCallback(
      (destino: number) => {
        const acotado = Math.min(Math.max(destino, 0), maximo);
        setIndice(acotado);
        const primero = periodos[acotado];
        if (primero !== undefined) {
          onMover?.(primero);
        }
      },
      [maximo, onMover, periodos],
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

    const aLaVista = Math.min(visibles, total);
    const porcentaje = total === 0 ? 100 : (aLaVista / total) * 100;
    const desplazamiento = total === 0 ? 0 : (indice / total) * 100;

    const estilo = {
      "--carrusel-visibles": visibles,
      "--carrusel-indice": indice,
      "--carrusel-barra-ancho": `${porcentaje}%`,
      "--carrusel-barra-desde": `${desplazamiento}%`,
    } as CSSProperties;

    return (
      <section className="carrusel" style={estilo} aria-label="Cuatrimestres">
        <div className="carrusel__controles">
          <button
            type="button"
            className="carrusel__flecha"
            onClick={() => {
              irAlIndice(indice - 1);
            }}
            disabled={indice === 0}
            aria-label="Cuatrimestre anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="carrusel__flecha"
            onClick={() => {
              irAlIndice(indice + 1);
            }}
            disabled={indice >= maximo}
            aria-label="Cuatrimestre siguiente"
          >
            ›
          </button>

          <div className="carrusel__chips">
            {periodos.map((periodo, posicion) => (
              <Chip
                key={periodo}
                pastilla
                variante={
                  posicion >= indice && posicion < indice + visibles
                    ? "seleccionado"
                    : "contorno"
                }
                onClick={() => {
                  irAlIndice(posicion);
                }}
              >
                {etiquetaDe(periodo)}
              </Chip>
            ))}
          </div>

          <p className="carrusel__cuenta" aria-live="polite">
            {aLaVista} de {total} visibles
          </p>
          {acciones === undefined ? null : (
            <div className="carrusel__acciones">{acciones}</div>
          )}
        </div>

        <div className="carrusel__ventana" tabIndex={0} onKeyDown={alTeclear}>
          <div className="carrusel__pista">
            {periodos.map((periodo) => (
              /*
               * Todas las tarjetas quedan en el DOM y ninguna lleva
               * `aria-hidden`: las de afuera de la ventana tienen controles
               * enfocables, y un elemento enfocable dentro de `aria-hidden` es
               * una trampa para quien navega con lector de pantalla.
               */
              <article
                key={periodo}
                className="carrusel__tarjeta"
                aria-label={etiquetaDe(periodo)}
              >
                {render(periodo)}
              </article>
            ))}
          </div>
        </div>

        <div className="carrusel__posicion" aria-hidden="true">
          <div className="carrusel__posicion-tramo" />
        </div>
      </section>
    );
  },
);
