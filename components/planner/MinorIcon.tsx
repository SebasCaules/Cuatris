// Glyph reconocible por minor: cada área tiene su ícono propio (no un puntito
// genérico) para que la insignia se lea de un vistazo aun antes que la sigla.
//   CD  Ciencia de Datos        → barras (gráfico de datos)
//   IRV Imágenes y Realidad Virt → cubo 3D
//   IA  Inteligencia Artificial  → nodos conectados (red neuronal)
//   ARQ Arquitectura de Software → pila de bloques (estructura)
// Presentacional puro: hereda el color del minor por `currentColor`, así queda
// coloreado por el contenedor (badge). Sin hex propio. Static-export safe.
import type { Minor } from "@/lib/planner/minors";

/** Trazos por minor, indexados por `Minor.id` (= string de área del plan). */
function glyph(id: string) {
  switch (id) {
    // Ciencia de Datos — barras de un gráfico sobre su base.
    case "Ciencia de Datos":
      return (
        <>
          <path d="M2.8 13.2h10.4" strokeWidth={1.7} />
          <path d="M4.7 13.2V9.1" strokeWidth={2} />
          <path d="M8 13.2V4.8" strokeWidth={2} />
          <path d="M11.3 13.2V7.3" strokeWidth={2} />
        </>
      );
    // Imágenes y Realidad Virtual — cubo isométrico (volumen 3D / RV).
    case "Imágenes y Realidad Virtual":
      return (
        <>
          <path d="M8 2.3 13.1 5.1V10.9L8 13.7 2.9 10.9V5.1Z" strokeWidth={1.4} />
          <path d="M2.9 5.1 8 8 13.1 5.1" strokeWidth={1.4} />
          <path d="M8 8V13.7" strokeWidth={1.4} />
        </>
      );
    // Inteligencia Artificial — red de nodos (dos entradas → un nodo).
    case "Inteligencia Artificial":
      return (
        <>
          <path d="M4.4 4.7 11.4 8M4.4 11.3 11.4 8" strokeWidth={1.4} />
          <circle cx="4.4" cy="4.7" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="4.4" cy="11.3" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="11.8" cy="8" r="1.9" fill="currentColor" stroke="none" />
        </>
      );
    // Arquitectura de Software — pila de bloques en ziggurat (estructura).
    case "Arquitectura de Software":
      return (
        <>
          <rect x="5" y="3" width="6" height="2.4" rx=".8" strokeWidth={1.4} />
          <rect x="3.4" y="6.8" width="9.2" height="2.4" rx=".8" strokeWidth={1.4} />
          <rect x="2.4" y="10.6" width="11.2" height="2.4" rx=".8" strokeWidth={1.4} />
        </>
      );
    // Fallback: rombo simple (área desconocida — no debería ocurrir).
    default:
      return <circle cx="8" cy="8" r="3.4" strokeWidth={1.6} />;
  }
}

/** Ícono/logo de un minor. Toma el color por `currentColor` del contenedor. */
export function MinorIcon({
  minor,
  className,
}: {
  minor: Minor;
  className?: string;
}) {
  return (
    <svg
      className={"minor-icon" + (className ? " " + className : "")}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph(minor.id)}
    </svg>
  );
}
