/**
 * Las tres regiones de la pantalla 13b: la barra arriba, la zona principal
 * (carrusel) y el panel derecho fijo (progreso).
 */

import type { ReactNode } from "react";

import "./Disposicion.css";

export interface PropsDisposicion {
  barra: ReactNode;
  principal: ReactNode;
  panel: ReactNode;
}

export function Disposicion({ barra, principal, panel }: PropsDisposicion) {
  return (
    <div className="disposicion">
      {barra}
      <div className="disposicion__cuerpo">
        <main className="disposicion__principal">{principal}</main>
        <aside className="disposicion__panel" aria-label="Progreso">
          {panel}
        </aside>
      </div>
    </div>
  );
}
