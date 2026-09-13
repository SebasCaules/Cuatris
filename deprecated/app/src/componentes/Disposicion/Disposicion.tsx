/**
 * Las regiones de 13b: barra arriba y zona principal con el banner de
 * conflictos encima del carrusel. La columna derecha de progreso se fue en el
 * rediseño: su información vive en un banner compacto arriba del carrusel
 * (`BannerProgreso`), así los calendarios ocupan todo el ancho.
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
  /**
   * Columna de trabajo de 13c («Agregar materia»). Trae su propio ancho —330 px
   * en el artboard— y no se esconde en pantallas angostas, porque es edición y
   * no lectura.
   */
  agregar?: ReactNode;
}

export function Disposicion({
  barra,
  banner,
  principal,
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
        {agregar === null || agregar === undefined ? null : agregar}
      </div>
    </div>
  );
}
