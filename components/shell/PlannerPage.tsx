"use client";

import PlannerApp from "@/components/planner/PlannerApp";
import Header from "./Header";

/** Compone el planner con la barra del sitio: PlannerApp entrega su navegación
 *  de vistas, sus herramientas y el menú de perfiles, y Header los ubica junto
 *  a la marca. (Va en un client component porque `chrome` es una función.) */
export default function PlannerPage() {
  return (
    <PlannerApp
      chrome={(nav, tools, perfil) => <Header nav={nav} tools={tools} perfil={perfil} />}
    />
  );
}
