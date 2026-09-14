import type { Metadata } from "next";
import PlannerPage from "@/components/shell/PlannerPage";

// "Planificador · Cuatris" es el título con el que llega la página; PlannerApp
// lo reemplaza por "<vista> · Cuatris" al montar y en cada cambio de vista.
// `absolute`: el template del layout no aplica a la página de su mismo segmento.
export const metadata: Metadata = {
  title: { absolute: "Planificador · Cuatris" },
};

/** La única ruta del standalone: el planificador completo. La vista, los
 *  filtros y el drawer abierto viajan en la query (?view=…), así que recargar
 *  o compartir el link reproduce el estado. */
export default function Page() {
  return <PlannerPage />;
}
