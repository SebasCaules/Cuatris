/**
 * Las regiones de 13b: barra arriba, zona principal con el banner de
 * conflictos encima del carrusel, y el panel derecho de ancho fijo.
 *
 * Bajo 1100 px el panel se esconde y la zona principal toma todo el ancho: el
 * mockup es de 1280 px y la versión móvil es de la Etapa 4 (Sprint 3). Se
 * esconde el panel —que es lectura— y no el carrusel, que es el trabajo.
 *
 * El alto está acotado a la ventana (`.disposicion` mide `100vh`) y cada
 * columna scrollea por dentro. Sin eso, un panel largo —los ~100 resultados de
 * «Agregar materia»— estiraba la página entera y la mitad izquierda quedaba en
 * blanco, incluidos la barra superior y la cabecera del propio panel.
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
  /**
   * Columna de trabajo de 13c («Agregar materia»). Trae su propio ancho —330 px
   * en el artboard—, así que no se envuelve en el hueco del progreso; y no se
   * esconde en pantallas angostas, porque es edición y no lectura.
   */
  agregar?: ReactNode;
}

export function Disposicion({
  barra,
  banner,
  principal,
  panel,
  agregar,
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
        {panel === null || panel === undefined ? null : (
          <aside className="disposicion__panel" aria-label="Progreso">
            {panel}
          </aside>
        )}
        {agregar === null || agregar === undefined ? null : agregar}
      </div>
    </div>
  );
}
