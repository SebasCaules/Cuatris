"use client";

// Primera visita (o sin carrera en la URL ni guardada): el planner no asume
// ninguna carrera y pide elegirla. Ocupa el lugar de la vista; al elegir se
// carga el plan y aparece el planner de esa carrera. Cada carrera guarda su
// progreso aparte, y el selector de la barra permite cambiar después: la
// tarjeta elegida vuela hasta ese selector (carreraVuelo.ts) para mostrarlo.
import { useEffect, useState } from "react";
import { CARRERAS, nombreCorto } from "@/lib/planner/carreras";
import { tieneProgreso } from "@/lib/planner/persist";
import { useCarrera } from "./carreraContext";
import { despegar } from "./carreraVuelo";
import { Tooltip } from "./Tooltip";
import { IconCheck } from "./icons";

/** «Ingeniería» / «Licenciatura» para la línea chica de la tarjeta (el nombre
 *  corto ya no lo dice); vacío para Bioingeniería y similares. */
const tipoDe = (nombre: string): string =>
  /^ingenier/i.test(nombre) ? "Ingeniería" : /^lic/i.test(nombre) ? "Licenciatura" : "";

export default function CarreraPicker() {
  const { cargando, cambiar } = useCarrera();
  // progreso guardado por carrera: solo cliente (localStorage), tras montar
  const [conProgreso, setConProgreso] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setConProgreso(new Set(CARRERAS.filter((c) => tieneProgreso(c.codigo)).map((c) => c.codigo)));
  }, []);

  return (
    <section className="cpick" aria-labelledby="cpick-h">
      <header className="cpick__head">
        <span className="cpick__kick">Cuatris · ITBA</span>
        <h2 id="cpick-h">¿Qué carrera cursás?</h2>
        <p>
          El planificador se arma con el plan de estudios de tu carrera. Cada una
          guarda su propio progreso en este navegador; podés cambiarla cuando
          quieras desde la barra.
        </p>
      </header>
      <div className="cpick__grid" role="list">
        {CARRERAS.map((c) => {
          const guardado = conProgreso.has(c.codigo);
          const card = (
            <button
              key={c.codigo}
              type="button"
              role="listitem"
              className={
                "cpick__card" +
                (guardado ? " has-progress" : "") +
                (cargando === c.codigo ? " is-loading" : "")
              }
              disabled={!c.disponible || cargando != null}
              aria-busy={cargando === c.codigo}
              onClick={(e) => {
                despegar(e.currentTarget, c.codigo, nombreCorto(c.nombre));
                void cambiar(c.codigo);
              }}
            >
              <span className="cpick__code">{c.codigo}</span>
              <span className="cpick__name">{nombreCorto(c.nombre)}</span>
              <span className="cpick__meta">
                {tipoDe(c.nombre) && <span className="cpick__tipo">{tipoDe(c.nombre)}</span>}
                {c.plan && <span className="cpick__plan">{c.plan}</span>}
                {cargando === c.codigo ? (
                  <span className="cpick__saved">Cargando…</span>
                ) : (
                  guardado && (
                    <span className="cpick__saved">
                      <IconCheck size={10} />
                      progreso guardado
                    </span>
                  )
                )}
              </span>
            </button>
          );
          if (c.disponible) return card;
          return (
            <Tooltip
              key={c.codigo}
              width={210}
              content={
                c.plan
                  ? "El SGA todavía no tiene cargadas las materias de este plan"
                  : "Sin plan de estudios en el SGA"
              }
            >
              {card}
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
