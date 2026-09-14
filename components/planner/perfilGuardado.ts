"use client";

// Guardar el perfil a propósito (⌘S / Ctrl+S) y saber si hay cambios sin
// guardar. Todo el estado se autoguarda como borrador (nada se pierde al
// recargar); la «instantánea» es lo que el usuario guardó y el punto al que
// puede volver con «Descartar cambios». Se compara la firma del estado actual
// con la de la instantánea (persist.ts). Lo consume PlannerInner (atajo de
// teclado y aviso) y se lo pasa a PerfilMenu (punto en el avatar, estado y
// acciones en el menú).
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlanner } from "./state";
import { firmaEstado, loadSnapshot, saveSnapshot } from "@/lib/planner/persist";

export interface PerfilGuardado {
  /** hay cambios desde la última vez que se guardó (o nunca se guardó y hay algo) */
  sinGuardar: boolean;
  /** nunca se guardó esta carrera en este perfil */
  nuncaGuardado: boolean;
  /** fecha ISO de la última instantánea, o null */
  fecha: string | null;
  /** «⌘S» o «Ctrl+S», según la plataforma (vacío hasta montar) */
  atajo: string;
  guardar: () => void;
  /** vuelve a la instantánea guardada (solo si existe) */
  descartar: () => void;
}

/** ¿El estado está en blanco? (sin nada marcado ni armado: un perfil recién
 *  creado no cuenta como «sin guardar» hasta que se toca algo). */
function enBlanco(s: ReturnType<typeof usePlanner>["state"]): boolean {
  return (
    s.approved.size === 0 &&
    s.cursando.size === 0 &&
    s.combo.size === 0 &&
    s.plan.fixed.size === 0 &&
    s.plan.lockedIdx.size === 0 &&
    s.finales.seleccion.size === 0 &&
    s.finales.extra.size === 0
  );
}

export function usePerfilGuardado(): PerfilGuardado {
  const { state, dispatch } = usePlanner();
  // undefined = todavía no se leyó localStorage; null = no hay instantánea
  const [firmaGuardada, setFirmaGuardada] = useState<string | null | undefined>(undefined);
  const [fecha, setFecha] = useState<string | null>(null);
  const [atajo, setAtajo] = useState("");

  useEffect(() => {
    const snap = loadSnapshot();
    setFirmaGuardada(snap ? snap.firma : null);
    setFecha(snap?.fecha ?? null);
    setAtajo(/mac|iphone|ipad/i.test(navigator.platform) ? "⌘S" : "Ctrl+S");
  }, []);

  const firmaActual = useMemo(() => (state.hydrated ? firmaEstado(state) : null), [state]);
  const sinGuardar =
    state.hydrated &&
    firmaGuardada !== undefined &&
    (firmaGuardada === null ? !enBlanco(state) : firmaGuardada !== firmaActual);

  const guardar = useCallback(() => {
    const f = saveSnapshot(state);
    setFirmaGuardada(firmaEstado(state));
    setFecha(f);
  }, [state]);

  const descartar = useCallback(() => {
    const snap = loadSnapshot();
    if (snap) dispatch({ type: "HYDRATE", payload: snap.persisted });
  }, [dispatch]);

  return { sinGuardar, nuncaGuardado: firmaGuardada === null, fecha, atajo, guardar, descartar };
}

/** «14:32» si es de hoy, si no «3/9 14:32». */
export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mismoDia =
    d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
  return mismoDia ? hm : `${d.getDate()}/${d.getMonth() + 1} ${hm}`;
}
