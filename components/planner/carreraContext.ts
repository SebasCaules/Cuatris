"use client";

// Carrera y perfil activos del planner, para el selector de la barra y el
// modal de progreso. Los provee PlannerApp (que es quien carga el plan, apunta
// la persistencia y remonta el árbol al cambiar cualquiera de los dos).
import { createContext, useContext } from "react";
import type { Perfil } from "@/lib/planner/persist";

export interface CarreraCtx {
  /** código de la carrera cargada ("S", "I", …); null hasta que el usuario elige. */
  codigo: string | null;
  /** código de la carrera que se está cargando, o null. */
  cargando: string | null;
  /** cambia de carrera: trae el plan, apunta la persistencia y remonta. */
  cambiar: (codigo: string) => Promise<void>;
  /** id del perfil activo ("" = principal). */
  perfil: string;
  /** registro de perfiles (principal primero). */
  perfiles: Perfil[];
  /** activa otro perfil: apunta la persistencia, resuelve su carrera y remonta. */
  cambiarPerfil: (id: string) => Promise<void>;
  /** relee el registro tras crear, renombrar o borrar un perfil. */
  refrescarPerfiles: () => void;
}

export const CarreraContext = createContext<CarreraCtx>({
  codigo: null,
  cargando: null,
  cambiar: async () => {},
  perfil: "",
  perfiles: [],
  cambiarPerfil: async () => {},
  refrescarPerfiles: () => {},
});

export const useCarrera = () => useContext(CarreraContext);
