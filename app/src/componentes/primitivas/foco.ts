/**
 * Foco de una capa (modal o panel): foco inicial, Escape y —solo en un modal—
 * Tab que da la vuelta adentro.
 *
 * Lo usan `Modal` y `PanelLateral`. Vive aparte porque la regla es una sola y
 * repetirla en dos componentes es la forma segura de que se desincronicen.
 *
 * Atrapar el Tab es cosa de un modal, no de un panel: `PanelLateral` no lleva
 * velo ni `aria-modal` justamente para que el carrusel siga usable, así que con
 * `atrapar: false` el Tab sale del panel como sale con el mouse. Ahí el Escape
 * se engancha en el documento y no en la caja: si el foco se fue del panel con
 * un clic afuera, Escape tiene que seguir cerrándolo.
 *
 * Escuchar en el documento trae su propio problema: dos capas abiertas a la vez
 * —el panel «Agregar materia» y el menú ⋯ de la barra— oían el mismo Escape y
 * se cerraban las dos de un saque, perdiendo la consulta ya tipeada en el
 * panel. Por eso las capas se anotan en una pila y **una sola** tecla Escape
 * cierra **una sola** capa: la de más arriba. `useEscapeDeCapa` es la misma
 * regla para una capa que no necesita foco propio (un menú desplegable).
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

/**
 * Capas abiertas, de la más vieja a la de más arriba. Es estado de módulo a
 * propósito: el orden es una propiedad de la pantalla entera, no de un
 * componente, y las capas ni se conocen entre sí (el menú de la barra vive en
 * un árbol y el panel lateral en otro).
 */
const capas: object[] = [];

function anotarCapa(): object {
  const capa = {};
  capas.push(capa);
  return capa;
}

function borrarCapa(capa: object): void {
  const donde = capas.lastIndexOf(capa);
  if (donde !== -1) {
    capas.splice(donde, 1);
  }
}

/** Solo la capa de más arriba reacciona al Escape. */
function esLaDeArriba(capa: object): boolean {
  return capas[capas.length - 1] === capa;
}

export interface OpcionesEscape {
  /** Mientras sea falso la capa no se anota ni escucha nada. */
  activo: boolean;
  /** Escape llama a esto, pero solo si esta es la capa de más arriba. */
  onCerrar: () => void;
}

/**
 * Escape para una capa que no mueve el foco (un menú desplegable, un popover).
 * Se anota en la misma pila que `useFocoAtrapado`, así que si hay un panel
 * debajo, el primer Escape cierra el menú y hace falta un segundo para el panel.
 */
export function useEscapeDeCapa({ activo, onCerrar }: OpcionesEscape): void {
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!activo) {
      return;
    }
    const capa = anotarCapa();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape" || !esLaDeArriba(capa)) {
        return;
      }
      evento.stopPropagation();
      cerrar.current();
    };
    const enganche = alTeclear as EventListener;
    document.addEventListener("keydown", enganche);
    return () => {
      document.removeEventListener("keydown", enganche);
      borrarCapa(capa);
    };
  }, [activo]);
}

export interface OpcionesFoco {
  /** Mientras sea falso el enganche no hace nada. */
  activo: boolean;
  /** Escape y el botón de cierre llaman a esto. */
  onCerrar: () => void;
  /**
   * Con `true` (por omisión) el Tab da la vuelta dentro de la caja, que es lo
   * que corresponde a un modal. Con `false` el Tab queda libre y Escape se
   * escucha en el documento.
   */
  atrapar?: boolean;
  /**
   * Con `true` (por omisión) el foco entra en la capa al abrirse. Con `false`
   * se queda donde estaba: es lo que corresponde cuando la capa se abrió sola
   * mientras el usuario escribía en otro lado.
   */
  enfocar?: boolean;
}

/**
 * Mientras `activo`: Escape cierra, el foco entra en la capa y al cerrarse
 * vuelve a donde estaba. Con `atrapar` (por omisión), además el Tab da la
 * vuelta dentro del contenedor.
 */
export function useFocoAtrapado(
  contenedor: RefObject<HTMLElement | null>,
  { activo, onCerrar, atrapar = true, enfocar = true }: OpcionesFoco,
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

    const capa = anotarCapa();

    const veniaDe =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (enfocar) {
      const primero = enfocables(caja)[0];
      (primero ?? caja).focus();
    }

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        // Una capa por Escape: si encima de esta hay otra abierta (el menú ⋯
        // de la barra sobre el panel «Agregar materia»), la de arriba es la
        // que cierra y esta se queda con lo que el usuario ya había escrito.
        if (!esLaDeArriba(capa)) {
          return;
        }
        evento.stopPropagation();
        cerrar.current();
        return;
      }
      if (evento.key !== "Tab" || !atrapar) {
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

    // Sin trampa el foco puede estar fuera de la caja cuando llega el Escape,
    // así que la tecla se escucha en el documento. Con trampa se queda en la
    // caja, que es donde `stopPropagation` protege al modal de arriba.
    const donde: HTMLElement | Document = atrapar ? caja : document;
    const enganche = alTeclear as EventListener;
    donde.addEventListener("keydown", enganche);
    return () => {
      donde.removeEventListener("keydown", enganche);
      borrarCapa(capa);
      if (enfocar) {
        veniaDe?.focus();
      }
    };
  }, [activo, atrapar, contenedor, enfocar]);
}
