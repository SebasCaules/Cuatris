"use client";

// Perfil, en la esquina derecha de la barra: un icono de persona abre el menú
// del perfil activo. Arriba, quién es (nombre y carrera). Después, en
// secciones: la CARRERA del perfil (se cambia ahí mismo, con la lista en
// línea), el COLOR del perfil (icono de la barra), los PERFILES guardados en
// este navegador (tocar uno lo activa; renombrar; borrar con confirmación —
// cualquiera, también el principal; sin ninguno queda uno nuevo vacío—;
// «Guardar como perfil nuevo» copia la configuración actual y la activa;
// «Nuevo perfil vacío» arranca de cero y pide la carrera) y, al pie,
// «Referencias». Lo que se hace en el planner se
// guarda siempre en el perfil activo; nada se pierde al cambiar. La
// persistencia por perfil vive en lib/planner/persist.ts; PlannerApp remonta
// el árbol al cambiar de perfil o de carrera.
// Al elegir carrera en la primera visita, la tarjeta vuela hasta este icono
// (carreraVuelo.ts): el botón es el destino del vuelo.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useCarrera } from "./carreraContext";
import { usePlanner } from "./state";
import { Tooltip } from "./Tooltip";
import CarreraLista from "./CarreraLista";
import { aterrizar } from "./carreraVuelo";
import { IconBin, IconCheck, IconChevronDown, IconPencil, IconPlus, IconUser } from "./icons";
import { carreraInfo, nombreCorto } from "@/lib/planner/carreras";
import { PERFIL_COLORES } from "@/lib/planner/perfilColores";
import {
  borrarPerfil,
  colorearPerfil,
  crearPerfil,
  renombrarPerfil,
  type Perfil,
} from "@/lib/planner/persist";

type Modo = { tipo: "copiar" } | { tipo: "nuevo" } | { tipo: "renombrar"; perfil: Perfil } | null;

export default function PerfilMenu() {
  const { codigo, cargando, cambiar, perfil, perfiles, cambiarPerfil, refrescarPerfiles } =
    useCarrera();
  const { state, dispatch } = usePlanner();
  const [open, setOpen] = useState(false);
  const [carrerasAbiertas, setCarrerasAbiertas] = useState(false);
  const [modo, setModo] = useState<Modo>(null);
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState<Perfil | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const activo = perfiles.find((p) => p.id === perfil);
  const nombreActivo = activo?.nombre ?? "Principal";
  const carrera = codigo ? carreraInfo(codigo) : undefined;
  const ocupado = cargando != null;
  // color del perfil como variable CSS (sin color, el acento del sitio)
  const colorStyle = (c?: string) =>
    (c ? { "--pf": c } : undefined) as React.CSSProperties | undefined;

  // destino del vuelo de la tarjeta de carrera (sin vuelo pendiente, no-op)
  useLayoutEffect(() => {
    if (btnRef.current) aterrizar(btnRef.current);
  }, []);

  // cerrar con clic afuera / Escape
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
      setCarrerasAbiertas(false);
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

  // cualquier perfil se borra; sin ninguno, persist crea uno nuevo vacío
  const borrar = (p: Perfil) => {
    const eraActivo = p.id === perfil;
    const queda = borrarPerfil(p.id);
    refrescarPerfiles();
    setBorrando(null);
    if (eraActivo) {
      setOpen(false);
      void cambiarPerfil(queda);
    }
  };

  const colorear = (hex: string | null) => {
    colorearPerfil(perfil, hex);
    refrescarPerfiles();
  };

  const elegirPerfil = (p: Perfil) => {
    if (p.id === perfil) return;
    setOpen(false);
    void cambiarPerfil(p.id);
  };

  const elegirCarrera = (c: string) => {
    setOpen(false);
    void cambiar(c);
  };

  return (
    <div className="pmenu" ref={rootRef}>
      <Tooltip
        content={
          <>
            <b>{nombreActivo}</b>
            {carrera ? ` · ${nombreCorto(carrera.nombre)}` : ""}
            <br />
            Perfil: carrera, color, otros perfiles
          </>
        }
        width={200}
        placement="bottom"
      >
        <button
          ref={btnRef}
          type="button"
          className={"pmenu__btn" + (open ? " is-open" : "")}
          style={colorStyle(activo?.color)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Perfil ${nombreActivo}`}
          onClick={() => setOpen((v) => !v)}
        >
          <IconUser size={20} />
        </button>
      </Tooltip>

      {open && (
        <div className="pmenu__panel" id={menuId} role="dialog" aria-label="Perfil">
          {/* quién: perfil activo y su carrera */}
          <div className="pmenu__who">
            <span className="pmenu__who-ico" aria-hidden="true" style={colorStyle(activo?.color)}>
              <IconUser size={18} />
            </span>
            <span className="pmenu__who-txt">
              <b>{nombreActivo}</b>
              <small>{carrera ? `${carrera.codigo} · ${nombreCorto(carrera.nombre)}` : "Sin carrera"}</small>
            </span>
          </div>

          {/* CARRERA del perfil: se cambia acá, con la lista en línea */}
          <section className="pmenu__sec" aria-labelledby={`${menuId}-car`}>
            <span className="pmenu__lbl" id={`${menuId}-car`}>
              Carrera
            </span>
            {codigo ? (
              <button
                type="button"
                className={"pmenu__row pmenu__row--carrera" + (carrerasAbiertas ? " is-open" : "")}
                aria-expanded={carrerasAbiertas}
                disabled={ocupado}
                onClick={() => setCarrerasAbiertas((v) => !v)}
              >
                <span className="carrera__code">{cargando ?? codigo}</span>
                <span className="pmenu__row-txt">
                  {cargando ? "Cargando…" : nombreCorto(carrera?.nombre ?? codigo)}
                </span>
                <IconChevronDown size={14} />
              </button>
            ) : (
              <p className="pmenu__hint">Sin carrera</p>
            )}
            {carrerasAbiertas && codigo && <CarreraLista codigo={codigo} onElegir={elegirCarrera} />}
          </section>

          {/* COLOR del perfil */}
          <section className="pmenu__sec" aria-labelledby={`${menuId}-col`}>
            <span className="pmenu__lbl" id={`${menuId}-col`}>
              Color
            </span>
            <div className="pmenu__colors" role="radiogroup" aria-label="Color del perfil">
              {PERFIL_COLORES.map((c) => {
                const on = activo?.color === c.hex;
                return (
                  <Tooltip key={c.hex} content={c.nombre} width={110} placement="bottom">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={c.nombre}
                      className={"pmenu__swatch" + (on ? " is-on" : "")}
                      style={{ "--pf": c.hex } as React.CSSProperties}
                      onClick={() => colorear(on ? null : c.hex)}
                    >
                      {on && <IconCheck size={11} />}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </section>

          {/* PERFILES guardados en este navegador */}
          <section className="pmenu__sec" aria-labelledby={`${menuId}-per`}>
            <span className="pmenu__lbl" id={`${menuId}-per`}>
              Perfiles
            </span>
            <ul className="pmenu__list" role="list">
              {perfiles.map((p) => {
                const esActivo = p.id === perfil;
                if (borrando?.id === p.id)
                  return (
                    <li key={p.id} className="pmenu__confirm" role="alert">
                      <span className="pmenu__q">
                        ¿Borrar <b>{p.nombre}</b>?
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
                      className="pmenu__row"
                      aria-current={esActivo ? "true" : undefined}
                      disabled={ocupado}
                      onClick={() => elegirPerfil(p)}
                    >
                      <span className="pmenu__mark" aria-hidden="true" style={colorStyle(p.color)}>
                        {esActivo && <IconCheck size={11} />}
                      </span>
                      <span className="pmenu__row-txt">{p.nombre}</span>
                      {esActivo && <span className="pmenu__tag">activo</span>}
                    </button>
                    <span className="pmenu__acciones">
                      <Tooltip content="Renombrar" width={110} placement="bottom">
                        <button
                          type="button"
                          className="pmenu__ico"
                          aria-label={`Renombrar ${p.nombre}`}
                          onClick={() => abrirForm({ tipo: "renombrar", perfil: p })}
                        >
                          <IconPencil size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Borrar el perfil y todo lo guardado en él" width={190} placement="bottom">
                        <button
                          type="button"
                          className="pmenu__ico pmenu__ico--del"
                          aria-label={`Borrar el perfil ${p.nombre}`}
                          disabled={ocupado}
                          onClick={() => {
                            cerrarForm();
                            setBorrando(p);
                          }}
                        >
                          <IconBin size={15} />
                        </button>
                      </Tooltip>
                    </span>
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
                        ? "Nombre del perfil (copia lo actual)"
                        : "Nombre del perfil (vacío)"}
                  </span>
                  <input
                    type="text"
                    value={nombre}
                    maxLength={40}
                    autoFocus
                    placeholder="p. ej. Plan A"
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
                    {modo.tipo === "renombrar" ? "Guardar" : "Crear"}
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={cerrarForm}>
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="pmenu__new">
                <Tooltip content="Copia todo lo actual a un perfil nuevo y lo deja activo" width={210} placement="bottom">
                  <button
                    type="button"
                    className="pmenu__row pmenu__row--new"
                    disabled={ocupado}
                    onClick={() => abrirForm({ tipo: "copiar" })}
                  >
                    <span className="pmenu__mark pmenu__mark--plus" aria-hidden="true">
                      <IconPlus size={11} />
                    </span>
                    <span className="pmenu__row-txt">Guardar como perfil nuevo</span>
                  </button>
                </Tooltip>
                <Tooltip content="Arranca de cero y pide la carrera" width={190} placement="bottom">
                  <button
                    type="button"
                    className="pmenu__row pmenu__row--new"
                    disabled={ocupado}
                    onClick={() => abrirForm({ tipo: "nuevo" })}
                  >
                    <span className="pmenu__mark pmenu__mark--plus" aria-hidden="true">
                      <IconPlus size={11} />
                    </span>
                    <span className="pmenu__row-txt">Nuevo perfil vacío</span>
                  </button>
                </Tooltip>
              </div>
            )}
          </section>

          {codigo && (
            <div className="pmenu__foot">
              <button
                type="button"
                className={"pmenu__row" + (state.view === "ref" ? " is-active" : "")}
                aria-current={state.view === "ref" ? "page" : undefined}
                onClick={() => {
                  setOpen(false);
                  dispatch({ type: "SET_VIEW", view: "ref" });
                }}
              >
                <span className="pmenu__row-txt">Referencias</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
