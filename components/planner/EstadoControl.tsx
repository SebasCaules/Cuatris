"use client";

// Control de avance (doble-check estilo WhatsApp) para marcar el estado real de
// una materia en la pestaña de aprobadas. Ciclo cronológico:
//   pendiente → ● cursando → ✓ cursada regular (falta el final) → ✓✓ final → pendiente
// Las materias que promocionan / no rinden final tienen un solo nivel terminal
// (una tilde teal): pendiente → cursando → promocionada → pendiente.
// Fuente única del control; lo consume CuatriView (aprobadas) y puede reusarlo
// la vista de finales. Cada estado se explica con el Tooltip propio del planner
// (nada de `title`): qué estado es y qué hace el próximo clic.
import { usePlanner } from "@/components/planner/state";
import { Tooltip } from "@/components/planner/Tooltip";
import { estadoOf, tieneFinal, type Estado } from "@/lib/planner/estado";

// Re-export de compatibilidad: la fuente única ahora es lib/planner/estado.ts
// (helpers puros, consumibles también por el reducer sin ciclos de import).
export { estadoOf, tieneFinal };

export const CheckSingle = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.5L6.5 12L13 4.5" />
  </svg>
);

export const CheckDouble = () => (
  <svg
    viewBox="0 0 24 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2.5 8.5L6 12L11.5 4.5" />
    <path d="M9.5 8.5L13 12L18.5 4.5" />
  </svg>
);

// Tilde RELLENA (silueta sólida) para el estado terminal de promoción. Distingue
// por FORMA — no sólo color — la materia saldada (promociona / no rinde final)
// de la cursada que todavía debe final (CheckSingle, contorno fino): quedan
// legibles aun sin percibir el color (daltonismo).
export const CheckFilled = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

// Punto: "cursando" (en curso). Forma propia, distinta de las tildes, para que
// se lea aun sin percibir el color.
export const DotCursando = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="8" cy="8" r="3.4" />
  </svg>
);

/** Texto del estado y de lo que hace el próximo clic (para tooltips y aria). */
export function describirEstado(estado: Estado, has2: boolean) {
  const label =
    estado === "pendiente"
      ? "Pendiente"
      : estado === "cursando"
        ? "Cursando"
        : estado === "regular"
          ? has2
            ? "Cursada — falta el final"
            : "Promocionada — no rinde final"
          : "Final aprobado";
  const siguiente =
    estado === "pendiente"
      ? "cursando"
      : estado === "cursando"
        ? has2
          ? "cursada"
          : "promocionada"
        : estado === "regular" && has2
          ? "final aprobado"
          : "pendiente";
  return { label, siguiente };
}

export function EstadoControl({
  code,
  className,
  stopPropagation = true,
}: {
  code: string;
  className?: string;
  /** frena la propagación del click (útil dentro de cards clickeables). */
  stopPropagation?: boolean;
}) {
  const { state, dispatch } = usePlanner();
  const has2 = tieneFinal(code);
  const estado = estadoOf(code, state.approved, state.finalDone, state.cursando);

  const next = (): Estado => {
    if (estado === "pendiente") return "cursando";
    if (estado === "cursando") return "regular";
    if (estado === "regular") return has2 ? "final" : "pendiente";
    return "pendiente";
  };

  // Retroceso un paso: final → regular (desaprobó el final) → cursando →
  // pendiente. Un solo paso por vez, sin cascadear el plan. Desde "pendiente"
  // no hay nada que deshacer.
  const prev = (): Estado | null => {
    if (estado === "pendiente") return null;
    if (estado === "final") return "regular";
    if (estado === "regular") return "cursando";
    return "pendiente";
  };

  const goBack = () => {
    const p = prev();
    if (p) dispatch({ type: "SET_ESTADO", code, estado: p });
  };

  const stateCls =
    estado === "pendiente"
      ? "st-pending"
      : estado === "cursando"
        ? "st-cursando"
        : estado === "final"
          ? "st-final"
          : has2
            ? "st-regular"
            : "st-promo";

  const { label, siguiente } = describirEstado(estado, has2);

  // Retroceso disponible en todo estado avanzado, por clic derecho + tecla
  // Retroceso; el tooltip lo dice.
  const canGoBack = estado !== "pendiente";

  // Para lectores de pantalla: sin avance = false; en curso o cursada que
  // todavía debe final = "mixed" (parcial); final/promoción/terminada = true.
  const ariaChecked: boolean | "mixed" =
    estado === "pendiente"
      ? false
      : estado === "cursando" || (estado === "regular" && has2)
        ? "mixed"
        : true;

  return (
    <Tooltip
      width={200}
      content={
        <>
          <b>{label}</b>
          <br />
          clic: {siguiente}
          {canGoBack ? " · clic derecho: volver" : ""}
        </>
      }
    >
    <button
      type="button"
      className={"estado-ctl " + stateCls + (className ? " " + className : "")}
      role="checkbox"
      aria-checked={ariaChecked}
      aria-label={label}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        dispatch({ type: "SET_ESTADO", code, estado: next() });
      }}
      onContextMenu={(e) => {
        if (!canGoBack) return;
        e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        goBack();
      }}
      onKeyDown={(e) => {
        // Retroceso por teclado (secundario): Retroceso / flecha abajo.
        if (canGoBack && (e.key === "Backspace" || e.key === "ArrowDown")) {
          e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          goBack();
        }
      }}
    >
      {/* `key` por estado: el icono se remonta y entra con un pop (motion.css) */}
      <span className="estado-ctl__ico" key={estado} aria-hidden="true">
        {estado === "final" ? (
          <CheckDouble />
        ) : estado === "cursando" ? (
          <DotCursando />
        ) : estado === "regular" ? (
          has2 ? (
            <CheckSingle />
          ) : (
            <CheckFilled />
          )
        ) : (
          // Affordance de "agregable": un + fantasma señala que el círculo hueco
          // es clickeable (un toque lo marca cursada). Su opacidad la fija cards.css.
          <svg
            className="ctl-plus"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M8 4.2v7.6M4.2 8h7.6" />
          </svg>
        )}
      </span>
    </button>
    </Tooltip>
  );
}
