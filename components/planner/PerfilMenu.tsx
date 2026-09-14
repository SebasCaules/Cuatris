"use client";

// Perfiles, en la esquina derecha de la barra: un avatar con las iniciales
// del perfil activo abre un menú propio con los perfiles guardados en este
// navegador (tocar uno lo activa), renombrar, borrar con confirmación en
// línea (el principal no se borra), «Guardar como perfil nuevo» (copia la
// configuración actual y la activa) y «Nuevo perfil vacío» (arranca de cero:
// pide la carrera). Lo que se hace en el planner se guarda siempre en el
// perfil activo; nada se pierde al cambiar. La persistencia por perfil vive en
// lib/planner/persist.ts; PlannerApp remonta el árbol al cambiar.
// Al pie, lo que antes ocupaba lugar en la barra: el tema y las referencias.
import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "@studyvaults/ui";
import { useCarrera } from "./carreraContext";
import { usePlanner } from "./state";
import { Tooltip } from "./Tooltip";
import { IconCheck, IconPlus, IconTrash } from "./icons";
import {
  PERFIL_PRINCIPAL,
  borrarPerfil,
  crearPerfil,
  renombrarPerfil,
  type Perfil,
} from "@/lib/planner/persist";

type Modo = { tipo: "copiar" } | { tipo: "nuevo" } | { tipo: "renombrar"; perfil: Perfil } | null;

/** Iniciales para el avatar: primera letra de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const s = partes.slice(0, 2).map((p) => p[0]).join("");
  return (s || "?").toUpperCase();
}

export default function PerfilMenu() {
  const { codigo, perfil, perfiles, cargando, cambiarPerfil, refrescarPerfiles } = useCarrera();
  const { state, dispatch } = usePlanner();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<Modo>(null);
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState<Perfil | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const activo = perfiles.find((p) => p.id === perfil);
  const ocupado = cargando != null;

  // cerrar con clic afuera / Escape (Escape dentro del formulario solo lo cierra)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (!open) {
      setModo(null);
      setNombre("");
      setBorrando(null);
    }
  }, [open]);

  const abrirForm = (m: Modo) => {
    setBorrando(null);
    setNombre(m?.tipo === "renombrar" ? m.perfil.nombre : "");
    setModo(m);
  };
  const cerrarForm = () => {
    setModo(null);
    setNombre("");
  };

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modo) return;
    const n = nombre.trim();
    if (!n) return;
    if (modo.tipo === "renombrar") {
      renombrarPerfil(modo.perfil.id, n);
      refrescarPerfiles();
      cerrarForm();
      return;
    }
    // «copiar»: la configuración actual, entera, pasa al perfil nuevo
    const nuevo = crearPerfil(n, modo.tipo === "copiar" ? perfil : null);
    refrescarPerfiles();
    setOpen(false);
    void cambiarPerfil(nuevo.id);
  };

  const borrar = (p: Perfil) => {
    const eraActivo = p.id === perfil;
    borrarPerfil(p.id);
    refrescarPerfiles();
    setBorrando(null);
    if (eraActivo) {
      setOpen(false);
      void cambiarPerfil(PERFIL_PRINCIPAL);
    }
  };

  const elegir = (p: Perfil) => {
    if (p.id === perfil) return;
    setOpen(false);
    void cambiarPerfil(p.id);
  };

  return (
    <div className="pmenu" ref={rootRef}>
      <Tooltip
        content={
          <>
            <b>Perfiles</b> · activo: {activo?.nombre ?? "Principal"}
            <br />
            Guardá esta configuración con un nombre o creá una de cero
          </>
        }
        width={220}
        placement="bottom"
      >
        <button
          type="button"
          className={"pmenu__btn" + (open ? " is-open" : "")}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Perfiles (activo: ${activo?.nombre ?? "Principal"})`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="pmenu__avatar" aria-hidden="true">
            {iniciales(activo?.nombre ?? "P")}
          </span>
        </button>
      </Tooltip>

      {open && (
        <div className="pmenu__panel" id={menuId} role="dialog" aria-label="Perfiles">
          <div className="pmenu__head">
            <span className="pmenu__kick">Perfiles</span>
            <p className="pmenu__hint">
              Cada perfil guarda aparte la carrera y todo lo marcado. Lo que
              hacés queda en el activo.
            </p>
          </div>

          <ul className="pmenu__list" role="list">
            {perfiles.map((p) => {
              const esActivo = p.id === perfil;
              if (borrando?.id === p.id)
                return (
                  <li key={p.id} className="pmenu__item pmenu__item--confirm" role="alert">
                    <span className="pmenu__q">
                      ¿Borrar <b>{p.nombre}</b>? Se pierde todo lo guardado ahí.
                    </span>
                    <button type="button" className="btn btn--sm pmenu__del" onClick={() => borrar(p)}>
                      Borrar
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBorrando(null)}>
                      Cancelar
                    </button>
                  </li>
                );
              return (
                <li key={p.id} className={"pmenu__item" + (esActivo ? " is-active" : "")}>
                  <button
                    type="button"
                    className="pmenu__pick"
                    aria-current={esActivo ? "true" : undefined}
                    disabled={ocupado}
                    onClick={() => elegir(p)}
                  >
                    <span className="pmenu__mini" aria-hidden="true">
                      {iniciales(p.nombre)}
                    </span>
                    <span className="pmenu__name">{p.nombre}</span>
                    {esActivo && (
                      <span className="pmenu__tag">
                        <IconCheck size={10} /> activo
                      </span>
                    )}
                  </button>
                  <Tooltip content="Cambiar el nombre" width={140} placement="bottom">
                    <button
                      type="button"
                      className="pmenu__txtbtn"
                      aria-label={`Renombrar ${p.nombre}`}
                      onClick={() => abrirForm({ tipo: "renombrar", perfil: p })}
                    >
                      renombrar
                    </button>
                  </Tooltip>
                  {p.id !== PERFIL_PRINCIPAL && (
                    <Tooltip content="Borrar este perfil y todo lo guardado en él" width={200} placement="bottom">
                      <button
                        type="button"
                        className="pmenu__ico"
                        aria-label={`Borrar el perfil ${p.nombre}`}
                        disabled={ocupado}
                        onClick={() => {
                          cerrarForm();
                          setBorrando(p);
                        }}
                      >
                        <IconTrash size={13} />
                      </button>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>

          {modo ? (
            <form className="pmenu__form" onSubmit={confirmar}>
              <label className="pmenu__field">
                <span>
                  {modo.tipo === "renombrar"
                    ? "Nuevo nombre"
                    : modo.tipo === "copiar"
                      ? "Perfil nuevo con la configuración actual"
                      : "Perfil nuevo, de cero"}
                </span>
                <input
                  type="text"
                  value={nombre}
                  maxLength={40}
                  autoFocus
                  placeholder="Nombre del perfil"
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      cerrarForm();
                    }
                  }}
                />
              </label>
              <div className="pmenu__acts">
                <button type="submit" className="btn btn--go btn--sm" disabled={!nombre.trim() || ocupado}>
                  {modo.tipo === "renombrar" ? "Guardar" : modo.tipo === "copiar" ? "Guardar perfil" : "Crear"}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={cerrarForm}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="pmenu__new">
              <button
                type="button"
                className="pmenu__newbtn"
                disabled={ocupado}
                onClick={() => abrirForm({ tipo: "copiar" })}
              >
                <IconPlus size={13} />
                <span>
                  Guardar como perfil nuevo
                  <small>copia todo lo actual y lo deja activo</small>
                </span>
              </button>
              <button
                type="button"
                className="pmenu__newbtn"
                disabled={ocupado}
                onClick={() => abrirForm({ tipo: "nuevo" })}
              >
                <IconPlus size={13} />
                <span>
                  Nuevo perfil vacío
                  <small>arranca de cero y pide la carrera</small>
                </span>
              </button>
            </div>
          )}

          <div className="pmenu__foot">
            <ThemeToggle variant="mobile" />
            {codigo && (
              <button
                type="button"
                className={"pmenu__link" + (state.view === "ref" ? " is-active" : "")}
                aria-current={state.view === "ref" ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  dispatch({ type: "SET_VIEW", view: "ref" });
                }}
              >
                Referencias
                <small>abreviaturas y códigos de las materias</small>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
