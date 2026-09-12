/**
 * Barra superior de 13b: identidad de la carrera, pestañas Plan/Progreso,
 * búsqueda, «Sugerir corrección» y el menú «⋯» con la copia de seguridad del
 * plan (exportar / importar / borrar todo).
 *
 * La barra no ejecuta nada: recibe callbacks. La búsqueda la conecta la Ola 3
 * y exportar/importar vive en el estado del usuario. Un control sin callback
 * se dibuja deshabilitado en vez de mentir que funciona.
 *
 * Los textos son los del mockup, en voseo: hablan a estudiantes del ITBA.
 */

import { useEffect, useRef, useState } from "react";

import type { Ruta } from "../../rutas";
import { Boton, Campo } from "../primitivas";
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
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", alApuntar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alApuntar);
      document.removeEventListener("keydown", alTeclear);
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
        <Boton
          variante="secundario"
          onClick={onSugerir}
          disabled={onSugerir === undefined}
        >
          Sugerir corrección
        </Boton>
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
