/**
 * Atrapar el foco dentro de una capa (modal o panel).
 *
 * Lo usan `Modal` y `PanelLateral`. Vive aparte porque la regla es una sola y
 * repetirla en dos componentes es la forma segura de que se desincronicen.
 */

import { useEffect, useRef, type RefObject } from "react";

/**
 * Qué se puede enfocar con Tab. Se consulta en cada Tab y no una sola vez: el
 * contenido de la capa cambia (una lista que se filtra, un botón que se
 * habilita) y una lista vieja manda el foco a un elemento que ya no está.
 */
const ENFOCABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function enfocables(contenedor: HTMLElement): HTMLElement[] {
  // Sin filtro de visibilidad a propósito: `offsetParent` y `getBoundingClientRect`
  // no significan nada en jsdom, así que un filtro así haría pasar los tests por
  // el camino equivocado. Lo que no se muestra se desmonta, no se oculta.
  return Array.from(contenedor.querySelectorAll<HTMLElement>(ENFOCABLES));
}

export interface OpcionesFoco {
  /** Mientras sea falso el enganche no hace nada. */
  activo: boolean;
  /** Escape y el botón de cierre llaman a esto. */
  onCerrar: () => void;
}

/**
 * Mientras `activo`: Escape cierra, Tab da la vuelta dentro del contenedor y
 * al cerrarse el foco vuelve a donde estaba.
 */
export function useFocoAtrapado(
  contenedor: RefObject<HTMLElement | null>,
  { activo, onCerrar }: OpcionesFoco,
): void {
  // `onCerrar` va por referencia y no por dependencia a propósito. El idioma
  // normal de quien abre la capa es `onCerrar={() => setAbierto(false)}`: una
  // función nueva en cada render del padre. Si estuviera en las dependencias,
  // cada tecla que cambia el estado del padre volvería a montar el efecto, el
  // foco saltaría al primer enfocable (el ✕) y la capa se comería la mitad de
  // lo que se escribe adentro.
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!activo) {
      return;
    }
    const caja = contenedor.current;
    if (caja === null) {
      return;
    }

    const veniaDe =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const primero = enfocables(caja)[0];
    (primero ?? caja).focus();

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        cerrar.current();
        return;
      }
      if (evento.key !== "Tab") {
        return;
      }
      const lista = enfocables(caja);
      if (lista.length === 0) {
        evento.preventDefault();
        caja.focus();
        return;
      }
      const inicio = lista[0];
      const fin = lista[lista.length - 1];
      if (inicio === undefined || fin === undefined) {
        return;
      }
      const activoAhora = document.activeElement;
      if (evento.shiftKey && (activoAhora === inicio || activoAhora === caja)) {
        evento.preventDefault();
        fin.focus();
      } else if (!evento.shiftKey && activoAhora === fin) {
        evento.preventDefault();
        inicio.focus();
      }
    };

    caja.addEventListener("keydown", alTeclear);
    return () => {
      caja.removeEventListener("keydown", alTeclear);
      veniaDe?.focus();
    };
  }, [activo, contenedor]);
}
