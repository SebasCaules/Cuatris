import PlannerApp from "@/components/planner/PlannerApp";

/** La única ruta del standalone: el planificador completo. La vista,
 *  los filtros y el drawer abierto viajan en la query (?view=…), así que
 *  recargar o compartir el link reproduce el estado. */
export default function Page() {
  return <PlannerApp />;
}
