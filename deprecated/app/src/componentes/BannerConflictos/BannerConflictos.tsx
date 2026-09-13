/**
 * Banner de conflictos sin resolver (13h).
 *
 * Va arriba del carrusel y solo cuando el período que se está cursando tiene
 * al menos un choque ▲: un cambio de sede ↕ no bloquea nada y por sí solo no
 * justifica interrumpir la pantalla (hallazgo 8). Cuando el banner aparece, la
 * cuenta incluye los dos tipos, como en 13h («3 conflictos» = 2 choques + 1
 * cambio de sede).
 *
 * No decide nada: recibe los conflictos ya calculados por el motor y avisa.
 */

import type { PeriodoId } from "../../contrato/tipos";
import type { CambioDeSede, Choque } from "../../motor";
import { etiquetaCorta } from "../Carrusel";
import { Boton, Glifo } from "../primitivas";
import "./BannerConflictos.css";

export interface PropsBannerConflictos {
  /** Período al que pertenecen los conflictos; da el «en 1.º 2026». */
  periodo: PeriodoId;
  choques: readonly Choque[];
  cambiosDeSede?: readonly CambioDeSede[];
  /** «Resolver de a uno»: se dispara con el primer choque de la lista. */
  alResolver?: (choque: Choque) => void;
}

/** «3 conflictos sin resolver en 1.º 2026», con el singular resuelto. */
export function textoDeConflictos(total: number, periodo: PeriodoId): string {
  const palabra = total === 1 ? "conflicto" : "conflictos";
  return `${String(total)} ${palabra} sin resolver en ${etiquetaCorta(periodo)}`;
}

export function BannerConflictos({
  periodo,
  choques,
  cambiosDeSede = [],
  alResolver,
}: PropsBannerConflictos) {
  const primero = choques[0];
  if (primero === undefined) {
    return null;
  }
  const total = choques.length + cambiosDeSede.length;

  return (
    <section className="banner-conflictos" aria-label="Conflictos sin resolver">
      <span className="banner-conflictos__marca">
        <Glifo nombre="choque" />
      </span>
      <p className="banner-conflictos__texto">
        {textoDeConflictos(total, periodo)}
      </p>
      {alResolver === undefined ? null : (
        <Boton
          variante="primario"
          onClick={() => {
            alResolver(primero);
          }}
        >
          Resolver de a uno
        </Boton>
      )}
    </section>
  );
}
