/**
 * Barra superior de 13b: identidad de la carrera, pestañas
 * Plan · Cursada · Progreso,
 * búsqueda, «Sugerir corrección» y el menú «⋯» con la copia de seguridad del
 * plan (exportar / importar / borrar todo).
 *
 * La barra no ejecuta nada: recibe callbacks. La búsqueda la conecta la Ola 3
 * y exportar/importar vive en el estado del usuario. Un control sin callback
 * se dibuja deshabilitado en vez de mentir que funciona.
 *
 * Los textos son los del mockup, en voseo: hablan a estudiantes del ITBA.
 */

import { useEffect, useId, useRef, useState } from "react";

import type { Ruta } from "../../rutas";
import { Boton, Campo, useEscapeDeCapa } from "../primitivas";
import "./BarraSuperior.css";

export interface PropsBarraSuperior {
  /** Nombre de la carrera, del plan cargado. */
  carrera: string;
  /** Identificador del plan (`S10-Rev23`). */
  plan: string;
  ruta: Ruta;
  ir: (destino: Ruta) => void;
  /** Cada tecla del campo de búsqueda. Sin esto el campo va deshabilitado. */
  onBuscar?: (texto: string) => void;
  onSugerir?: () => void;
  onExportar?: () => void;
  onImportar?: () => void;
  onBorrarTodo?: () => void;
}

interface ItemMenu {
  texto: string;
  accion: (() => void) | undefined;
}

function Pestana({
  texto,
  activa,
  onClick,
}: {
  texto: string;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="barra-superior__pestana"
      aria-current={activa ? "page" : undefined}
      onClick={onClick}
    >
      {texto}
    </button>
  );
}

function MenuPlan({ items }: { items: ItemMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  /*
   * El Escape del menú pasa por la pila de capas de `foco.ts`. Antes era un
   * `keydown` suelto en el documento y, con el panel «Agregar materia» abierto
   * detrás, un solo Escape cerraba las dos capas y se llevaba la consulta ya
   * tipeada en el panel. Como capa, este menú es la de más arriba: se cierra
   * él y el panel se queda hasta el segundo Escape.
   */
  useEscapeDeCapa({
    activo: abierto,
    onCerrar: () => {
      setAbierto(false);
    },
  });

  useEffect(() => {
    if (!abierto) {
      return;
    }
    const alApuntar = (evento: MouseEvent) => {
      const donde = evento.target;
      if (donde instanceof Node && caja.current?.contains(donde) !== true) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", alApuntar);
    return () => {
      document.removeEventListener("mousedown", alApuntar);
    };
  }, [abierto]);

  return (
    <div className="barra-superior__menu" ref={caja}>
      <button
        type="button"
        className="barra-superior__menu-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Más acciones"
        onClick={() => {
          setAbierto((antes) => !antes);
        }}
      >
        ⋯
      </button>
      {abierto ? (
        <ul className="barra-superior__menu-lista" role="menu">
          {items.map((item) => (
            <li key={item.texto} role="none">
              <button
                type="button"
                role="menuitem"
                className="barra-superior__menu-item"
                disabled={item.accion === undefined}
                onClick={() => {
                  setAbierto(false);
                  item.accion?.();
                }}
              >
                {item.texto}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Lo que se le dice a quien toca un control que todavía no existe. */
const NOTA_SUGERIR = "Llega en el Sprint 3";

export function BarraSuperior({
  carrera,
  plan,
  ruta,
  ir,
  onBuscar,
  onSugerir,
  onExportar,
  onImportar,
  onBorrarTodo,
}: PropsBarraSuperior) {
  const idNota = useId();
  return (
    <header className="barra-superior">
      <div className="barra-superior__identidad">
        <h1 className="barra-superior__carrera">{carrera}</h1>
        <p className="barra-superior__plan">plan {plan} · ITBA</p>
      </div>

      <nav className="barra-superior__pestanas" aria-label="Secciones">
        <Pestana
          texto="Plan"
          activa={ruta.vista === "plan"}
          onClick={() => {
            ir({ vista: "plan" });
          }}
        />
        <Pestana
          texto="Cursada"
          activa={ruta.vista === "cursada"}
          onClick={() => {
            ir({ vista: "cursada" });
          }}
        />
        <Pestana
          texto="Progreso"
          activa={ruta.vista === "progreso"}
          onClick={() => {
            ir({ vista: "progreso" });
          }}
        />
      </nav>

      <div className="barra-superior__acciones">
        <Campo
          tipo="busqueda"
          etiqueta="Buscar materia, código o docente"
          placeholder="Buscar materia, código o docente"
          disabled={onBuscar === undefined}
          {...(onBuscar === undefined ? {} : { onCambio: onBuscar })}
        />
        {/*
          Sin 13j el botón está apagado, pero con el mismo trato que los del pie
          de la ficha de materia: `aria-disabled` y no `disabled`, así recibe
          foco y con Tab se llega a él, y el motivo va en una nota **a la vista**
          que `aria-describedby` enlaza. Un `disabled` con la nota recortada no
          llega ni al teclado ni a una pantalla táctil, y dejaba a los dos
          controles apagados de la app comportándose distinto.
        */}
        <div className="barra-superior__sugerir">
          <Boton
            variante="secundario"
            {...(onSugerir === undefined
              ? {
                  "aria-disabled": "true",
                  title: NOTA_SUGERIR,
                  "aria-describedby": idNota,
                }
              : { onClick: onSugerir })}
          >
            Sugerir corrección
          </Boton>
          {onSugerir === undefined ? (
            <span className="barra-superior__nota" id={idNota}>
              {NOTA_SUGERIR}
            </span>
          ) : null}
        </div>
        <MenuPlan
          items={[
            { texto: "Exportar plan", accion: onExportar },
            { texto: "Importar plan", accion: onImportar },
            { texto: "Borrar todo", accion: onBorrarTodo },
          ]}
        />
      </div>
    </header>
  );
}
