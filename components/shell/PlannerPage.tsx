"use client";

import PlannerApp from "@/components/planner/PlannerApp";
import Header from "./Header";

/** Compone el planner con la barra del sitio: PlannerApp entrega su navegación
 *  de vistas y sus herramientas, y Header las ubica junto a la marca. (Va en
 *  un client component porque `chrome` es una función.) */
export default function PlannerPage() {
  return (
    <PlannerApp chrome={(nav, tools) => <Header nav={nav} tools={tools} />} />
  );
}
