/**
 * Las regiones de 13b: barra arriba, zona principal con el banner de
 * conflictos encima del carrusel, y el panel derecho de ancho fijo.
 *
 * Bajo 1100 px el panel se esconde y la zona principal toma todo el ancho: el
 * mockup es de 1280 px y la versión móvil es de la Etapa 4 (Sprint 3). Se
 * esconde el panel —que es lectura— y no el carrusel, que es el trabajo.
 */

import type { ReactNode } from "react";

import "./Disposicion.css";

export interface PropsDisposicion {
  barra: ReactNode;
  /** Banner de conflictos (13h). Va arriba del carrusel; vacío no ocupa nada. */
  banner?: ReactNode;
  principal: ReactNode;
  /** Progreso. Se oculta bajo 1100 px. */
  panel: ReactNode;
}

export function Disposicion({
  barra,
  banner,
  principal,
  panel,
}: PropsDisposicion) {

  return (
    <div className="disposicion">
      {barra}
      <div className="disposicion__cuerpo">
        <main className="disposicion__principal">
          {banner === undefined ? null : (
            <div className="disposicion__banner">{banner}</div>
          )}
          {principal}
        </main>
        <aside className="disposicion__panel" aria-label="Progreso">
          {panel}
        </aside>
      </div>
    </div>
  );
}
