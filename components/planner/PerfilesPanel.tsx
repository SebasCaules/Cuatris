"use client";

// Perfiles: varias configuraciones guardadas aparte en este navegador (carrera
// elegida + todo lo marcado y armado en cada carrera). Es la card de arriba
// del modal de progreso: lista de perfiles (tocar uno lo activa), renombrar,
// borrar, «Guardar como perfil nuevo» (copia la configuración actual y la
// activa) y «Nuevo perfil vacío» (arranca de cero: pide la carrera). Lo que se
// hace en el planner se guarda siempre en el perfil activo; nada se pierde al
// cambiar. La persistencia por perfil vive en lib/planner/persist.ts.
import { useState } from "react";
import { useCarrera } from "./carreraContext";
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

export default function PerfilesPanel() {
  const { perfil, perfiles, cargando, cambiarPerfil, refrescarPerfiles } = useCarrera();
  const [modo, setModo] = useState<Modo>(null);
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState<Perfil | null>(null);
  const ocupado = cargando != null;

  const abrir = (m: Modo) => {
    setBorrando(null);
    setNombre(m?.tipo === "renombrar" ? m.perfil.nombre : "");
    setModo(m);
  };
  const cerrar = () => {
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
    } else {
      // «copiar»: la configuración actual, entera, pasa al perfil nuevo
      const nuevo = crearPerfil(n, modo.tipo === "copiar" ? perfil : null);
      refrescarPerfiles();
      void cambiarPerfil(nuevo.id);
    }
    cerrar();
  };

  const borrar = (p: Perfil) => {
    const eraActivo = p.id === perfil;
    borrarPerfil(p.id);
    refrescarPerfiles();
    setBorrando(null);
    if (eraActivo) void cambiarPerfil(PERFIL_PRINCIPAL);
  };

  return (
    <section className="plan2-io__card perf" aria-labelledby="perf-h">
      <div className="plan2-io__cardtop">
        <span className="plan2-io__kick">Perfiles</span>
        <h4 id="perf-h">Una configuración por perfil</h4>
        <p>
          Cada perfil guarda aparte, en este navegador, la carrera elegida y
          todo lo que marcaste y armaste. Lo que hacés queda en el perfil
          activo; tocá otro para verlo.
        </p>
      </div>

      <ul className="perf__list" role="list">
        {perfiles.map((p) => {
          const activo = p.id === perfil;
          if (borrando?.id === p.id)
            return (
              <li key={p.id} className="perf__item perf__item--confirm" role="alert">
                <span className="perf__q">
                  ¿Borrar <b>{p.nombre}</b>? Se pierde todo lo guardado en ese perfil.
                </span>
                <button type="button" className="btn btn--sm perf__del" onClick={() => borrar(p)}>
                  Borrar
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBorrando(null)}>
                  Cancelar
                </button>
              </li>
            );
          return (
            <li key={p.id} className={"perf__item" + (activo ? " is-active" : "")}>
              <Tooltip
                content={activo ? "Perfil activo: acá se guarda lo que hacés" : `Cambiar a ${p.nombre}`}
                width={190}
              >
                <button
                  type="button"
                  className="perf__pick"
                  aria-current={activo ? "true" : undefined}
                  disabled={ocupado}
                  onClick={() => {
                    if (!activo) void cambiarPerfil(p.id);
                  }}
                >
                  <span className="perf__mark" aria-hidden="true">
                    {activo && <IconCheck size={11} />}
                  </span>
                  <span className="perf__name">{p.nombre}</span>
                  {activo && <span className="perf__tag">activo</span>}
                </button>
              </Tooltip>
              <button
                type="button"
                className="perf__txtbtn"
                onClick={() => abrir({ tipo: "renombrar", perfil: p })}
              >
                renombrar
              </button>
              {p.id !== PERFIL_PRINCIPAL && (
                <Tooltip content="Borrar este perfil y todo lo guardado en él" width={200}>
                  <button
                    type="button"
                    className="perf__ico"
                    aria-label={`Borrar el perfil ${p.nombre}`}
                    disabled={ocupado}
                    onClick={() => {
                      cerrar();
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
        <form className="perf__form" onSubmit={confirmar}>
          <label className="plan2-field perf__field">
            <span>
              {modo.tipo === "renombrar"
                ? "Nuevo nombre"
                : modo.tipo === "copiar"
                  ? "Nombre del perfil nuevo (con la configuración actual)"
                  : "Nombre del perfil nuevo (vacío)"}
            </span>
            <input
              type="text"
              value={nombre}
              maxLength={40}
              autoFocus
              placeholder="p. ej. Plan A, Con minor IA, Prueba"
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  cerrar();
                }
              }}
            />
          </label>
          <div className="plan2-io__acts">
            <button type="submit" className="btn btn--go btn--sm" disabled={!nombre.trim() || ocupado}>
              {modo.tipo === "renombrar" ? "Guardar nombre" : modo.tipo === "copiar" ? "Guardar como perfil" : "Crear vacío"}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={cerrar}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="plan2-io__acts">
          <Tooltip content="Copia todo lo actual a un perfil nuevo y lo deja activo" width={200}>
            <button
              type="button"
              className="btn btn--go btn--sm"
              disabled={ocupado}
              onClick={() => abrir({ tipo: "copiar" })}
            >
              Guardar como perfil nuevo
            </button>
          </Tooltip>
          <Tooltip content="Arranca de cero: pide la carrera y no trae nada marcado" width={200}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={ocupado}
              onClick={() => abrir({ tipo: "nuevo" })}
            >
              <IconPlus size={13} /> Nuevo perfil vacío
            </button>
          </Tooltip>
        </div>
      )}
    </section>
  );
}
