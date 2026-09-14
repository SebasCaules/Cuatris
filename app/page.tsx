import type { Metadata } from "next";
import Landing from "@/components/shell/Landing";

export const metadata: Metadata = {
  title: { absolute: "Cuatris — Planificador de cursada · ITBA" },
};

/** Portada: explica en tres pasos cómo se usa el planificador (elegir carrera,
 *  marcar materias, planificar) y de dónde salen los datos. El planificador
 *  vive en /planificar/. */
export default function Page() {
  return <Landing />;
}
