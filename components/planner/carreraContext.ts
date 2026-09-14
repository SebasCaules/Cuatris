"use client";

// Carrera activa del planner, para el selector de la barra. La provee
// PlannerApp (que es quien carga el plan y remonta el árbol al cambiar).
import { createContext, useContext } from "react";

export interface CarreraCtx {
  /** código de la carrera cargada ("S", "I", …); null hasta que el usuario elige. */
  codigo: string | null;
  /** código de la carrera que se está cargando, o null. */
  cargando: string | null;
  /** cambia de carrera: trae el plan, apunta la persistencia y remonta. */
  cambiar: (codigo: string) => Promise<void>;
}

export const CarreraContext = createContext<CarreraCtx>({
  codigo: null,
  cargando: null,
  cambiar: async () => {},
});

export const useCarrera = () => useContext(CarreraContext);
