/**
 * Campo de búsqueda propio, sin `<input>`.
 *
 * La regla del autor no admite controles nativos con aspecto por defecto, y un
 * `<input type="search">` trae el suyo —la crucecita de limpiar de WebKit, el
 * relleno automático, el alto que cada navegador decide—. Acá el campo es un
 * elemento editable con `role="searchbox"`: el aspecto es todo de `tokens.css`
 * y el teclado sigue siendo el del navegador, que es lo único que sí conviene
 * heredar.
 *
 * El valor va sin controlar a propósito: escribir en un editable controlado
 * mueve el cursor al final en cada tecla. Se sincroniza desde afuera solo
 * cuando `valor` y el texto en pantalla difieren de verdad (una limpieza
 * programada, por ejemplo).
 *
 * Lo único que un editable hace y un `<input>` no es aceptar marcado al pegar:
 * por eso el pegado se intercepta y se aplana a texto plano de una sola línea
 * (`alPegar`), que es lo que el filtro espera recibir.
 */

import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
} from "react";

import "./CampoBusqueda.css";

export interface PropsCampoBusqueda {
  /** Nombre accesible; el campo no lleva `<label>` visible. */
  etiqueta: string;
  /** Texto de ayuda mientras está vacío. */
  placeholder?: string;
  valor: string;
  onCambio: (valor: string) => void;
  /**
   * Apagado: ni se edita ni recibe foco.
   *
   * Va como `aria-disabled` y no como el `disabled` de un control nativo —que
   * acá no existe—, así el lector de pantalla lo anuncia igual.
   */
  deshabilitado?: boolean;
  "aria-controls"?: string;
}

/** Una sola línea de texto plano: los saltos y los blancos de más se juntan. */
function aplanar(texto: string): string {
  return texto.replace(/\s+/gu, " ");
}

export function CampoBusqueda({
  etiqueta,
  placeholder,
  valor,
  onCambio,
  deshabilitado = false,
  "aria-controls": controls,
}: PropsCampoBusqueda) {
  const caja = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const elemento = caja.current;
    if (elemento !== null && elemento.textContent !== valor) {
      elemento.textContent = valor;
    }
  }, [valor]);

  /*
   * Pegar en un editable inserta el HTML del portapapeles tal cual: negritas,
   * enlaces y saltos de línea quedan dentro del campo y el filtro recibe un
   * texto que un `<input>` habría normalizado. Se corta el pegado nativo y se
   * inserta el `text/plain` aplanado en el punto donde estaba el cursor.
   */
  const alPegar = (evento: ClipboardEvent<HTMLSpanElement>) => {
    if (deshabilitado) {
      return;
    }
    evento.preventDefault();
    const elemento = evento.currentTarget;
    const plano = aplanar(evento.clipboardData.getData("text/plain"));
    const seleccion = window.getSelection();
    const rango =
      seleccion !== null &&
      seleccion.rangeCount > 0 &&
      elemento.contains(seleccion.getRangeAt(0).commonAncestorContainer)
        ? seleccion.getRangeAt(0)
        : null;

    if (rango === null) {
      // Sin cursor dentro del campo (puede pasar en pruebas o con el foco
      // recién puesto): el texto se agrega al final, que es donde estaría.
      elemento.textContent = `${elemento.textContent ?? ""}${plano}`;
    } else {
      rango.deleteContents();
      const nodo = document.createTextNode(plano);
      rango.insertNode(nodo);
      rango.setStartAfter(nodo);
      rango.collapse(true);
      seleccion?.removeAllRanges();
      seleccion?.addRange(rango);
    }
    onCambio(elemento.textContent ?? "");
  };

  return (
    <span
      ref={caja}
      className="campo-busqueda"
      role="searchbox"
      contentEditable={!deshabilitado}
      suppressContentEditableWarning
      tabIndex={deshabilitado ? -1 : 0}
      aria-label={etiqueta}
      aria-multiline="false"
      {...(deshabilitado ? { "aria-disabled": "true" } : {})}
      {...(controls === undefined ? {} : { "aria-controls": controls })}
      {...(placeholder === undefined ? {} : { "data-placeholder": placeholder })}
      onInput={(evento: FormEvent<HTMLSpanElement>) => {
        onCambio(evento.currentTarget.textContent ?? "");
      }}
      onPaste={alPegar}
    />
  );
}
