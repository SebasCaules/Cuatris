/**
 * «CONFLICTOS · n»: el registro estable del choque (decisión 9d).
 *
 * La franja rayada de la grilla se ve pero no se puede leer; esta lista es la
 * que dice qué se pisa con qué y ofrece la salida. Van dos clases de fila:
 *
 * - ▲ **choque**: recuadro oscuro, numerado, con «Resolver».
 * - ↕ **cambio de sede**: recuadro claro, sin número, con «Ver». No bloquea
 *   nada; es un aviso, porque la sede la elige el ITBA (hallazgo 8).
 *
 * Los textos salen de 13b y 13h; los datos, del motor, sin recalcular nada.
 */

import type { Codigo } from "../../contrato/tipos";
import type { CambioDeSede, Choque } from "../../motor";
import { etiquetaDeFranja, ladosDelChoque } from "../GrillaSemanal";
import { Boton } from "../primitivas";
import "./ListaConflictos.css";

const DIA_CORTO: Record<Choque["dia"], string> = {
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  jueves: "Jue",
  viernes: "Vie",
  sabado: "Sáb",
  domingo: "Dom",
};

export interface PropsListaConflictos {
  choques: readonly Choque[];
  cambiosDeSede?: readonly CambioDeSede[];
  /** El choque resaltado: el que tiene el mouse encima en la grilla. */
  activo?: Choque | null;
  /** Nombre corto de la materia; por defecto, el del curso en los horarios. */
  nombreDeMateria?: (codigo: Codigo, nombreDelCurso: string) => string;
  /** `rectorado` → `Rectorado`; por defecto se muestra el id tal cual. */
  nombreDeSede?: (id: string) => string;
  alResolver?: (choque: Choque) => void;
  alVer?: (cambio: CambioDeSede) => void;
}

/** Dos choques son el mismo si coinciden día, franja y las dos materias. */
export function mismoChoque(uno: Choque, otro: Choque): boolean {
  return (
    uno.dia === otro.dia &&
    uno.desde === otro.desde &&
    uno.hasta === otro.hasta &&
    uno.a.codigo === otro.a.codigo &&
    uno.b.codigo === otro.b.codigo
  );
}

function claveDeChoque(choque: Choque): string {
  return `${choque.dia}-${choque.desde}-${choque.a.codigo}-${choque.b.codigo}`;
}

export function ListaConflictos({
  choques,
  cambiosDeSede = [],
  activo = null,
  nombreDeMateria = (_codigo, nombreDelCurso) => nombreDelCurso,
  nombreDeSede = (id) => id,
  alResolver,
  alVer,
}: PropsListaConflictos) {
  const total = choques.length + cambiosDeSede.length;
  if (total === 0) {
    return null;
  }

  return (
    <section className="conflictos" aria-label={`Conflictos: ${String(total)}`}>
      <p className="conflictos__titulo">CONFLICTOS · {total}</p>
      <ul className="conflictos__lista">
        {choques.map((choque, indice) => {
          const encendida = activo !== null && mismoChoque(activo, choque);
          const [primero, segundo] = ladosDelChoque(choque);
          return (
            <li
              className={`conflictos__fila conflictos__fila--choque${
                encendida ? " conflictos__fila--activa" : ""
              }`}
              key={claveDeChoque(choque)}
              aria-current={encendida ? "true" : undefined}
            >
              <span className="conflictos__marca" aria-hidden="true">
                {indice + 1}
              </span>
              <span className="conflictos__texto">
                {DIA_CORTO[choque.dia]}{" "}
                {etiquetaDeFranja(choque.desde, choque.hasta)} ·{" "}
                <strong>{primero.codigo}</strong>{" "}
                {nombreDeMateria(primero.codigo, primero.nombre)} ↔{" "}
                <strong>{segundo.codigo}</strong>{" "}
                {nombreDeMateria(segundo.codigo, segundo.nombre)}
              </span>
              {alResolver === undefined ? null : (
                <Boton
                  variante="terciario"
                  tamano="chico"
                  onClick={() => {
                    alResolver(choque);
                  }}
                >
                  Resolver
                </Boton>
              )}
            </li>
          );
        })}

        {cambiosDeSede.map((cambio) => {
          const desde = nombreDeSede(cambio.a.bloque.sede ?? "");
          const hasta = nombreDeSede(cambio.b.bloque.sede ?? "");
          /* Cuando los bloques están pegados las dos horas son la misma y
             repetirla no agrega nada; con un hueco en el medio, 13h muestra
             las dos («Jue 16:00 Rectorado → 19:00 SDT»). */
          const pegados = cambio.a.bloque.hasta === cambio.b.bloque.desde;
          return (
            <li
              className="conflictos__fila conflictos__fila--sede"
              key={`${cambio.dia}-${cambio.hora}-${cambio.a.codigo}-${cambio.b.codigo}`}
            >
              <span className="conflictos__marca conflictos__marca--sede">
                <span aria-hidden="true">↕</span>
                <span className="conflictos__oculto">Cambio de sede</span>
              </span>
              <span className="conflictos__texto">
                {DIA_CORTO[cambio.dia]} {cambio.a.bloque.hasta} {desde} →{" "}
                {pegados ? "" : `${cambio.b.bloque.desde} `}
                {hasta}
              </span>
              {alVer === undefined ? null : (
                <Boton
                  variante="terciario"
                  tamano="chico"
                  onClick={() => {
                    alVer(cambio);
                  }}
                >
                  Ver
                </Boton>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
