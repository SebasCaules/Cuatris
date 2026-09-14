"use client";

// Switch «Mi progreso» compartido por los dos combinadores (horarios y
// finales): ON (default) = el combinador parte de tu progreso: solo lo que
// te falta; OFF = ignora el progreso: cualquier materia. Es un solo flag del
// estado (`comboSolo`, persistido): apagarlo en una vista lo apaga en la
// otra. Sin progreso marcado (ni aprobadas ni cursando) no se muestra,
// porque ambos modos serían idénticos.
import { Tooltip } from "@/components/planner/Tooltip";
import { usePlanner } from "@/components/planner/state";
import type { PlannerState } from "@/lib/planner/types";

/** ¿Hay progreso marcado en el estado vivo? (distinto de `tieneProgreso` de
 *  persist.ts, que mira lo guardado de una carrera.) */
export function hayProgreso(state: PlannerState): boolean {
  return state.approved.size > 0 || state.cursando.size > 0;
}

export function usaProgreso(state: PlannerState): boolean {
  return !state.comboSolo && hayProgreso(state);
}

const COPY: Record<"combo" | "finales", { on: string; off: string }> = {
  combo: {
    on: "Según tu progreso: solo las materias que te faltan. Apagalo para elegir cualquiera, también las aprobadas.",
    off: "Ignorando tu progreso: cualquier materia, también las aprobadas. Prendelo para volver a las que te faltan.",
  },
  finales: {
    on: "Según tu progreso: los finales de lo que cursaste, con sus correlativas. Apagalo para combinar cualquier final.",
    off: "Ignorando tu progreso: cualquier final, sin correlativas. Prendelo para volver a los que te faltan.",
  },
};

export default function ProgresoSwitch({ vista }: { vista: "combo" | "finales" }) {
  const { state, dispatch } = usePlanner();
  if (!hayProgreso(state)) return null;
  const on = !state.comboSolo;
  return (
    <Tooltip content={COPY[vista][on ? "on" : "off"]} width={240}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className="prog-switch"
        onClick={() => dispatch({ type: "SET_COMBO_SOLO", value: on })}
      >
        Mi progreso
        <span className="prog-switch__track" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
