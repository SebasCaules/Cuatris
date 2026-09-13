/**
 * Marcador de posición: una tarjeta con el nombre de la región del mockup y el
 * texto que el propio mockup le pone. Se reemplaza por el componente real en la
 * ola que lo construye; hasta entonces deja ver la disposición completa.
 */

import type { ReactNode } from "react";

import "./Marcador.css";

export interface PropsMarcador {
  titulo: string;
  /** Pantalla del mockup v2 de la que sale el texto (por ejemplo `13b`). */
  pantalla: string;
  children: ReactNode;
}

export function Marcador({ titulo, pantalla, children }: PropsMarcador) {
  return (
    <section className="marcador">
      <div className="marcador__encabezado">
        <h2 className="marcador__titulo">{titulo}</h2>
        <span className="marcador__pantalla">{pantalla}</span>
      </div>
      <div className="marcador__cuerpo">{children}</div>
    </section>
  );
}
