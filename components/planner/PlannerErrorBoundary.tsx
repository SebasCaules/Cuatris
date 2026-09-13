"use client";

// Boundary local del planner: si algo revienta al montar/hidratar (p. ej. estado
// persistido con una forma que ni la validación por clave pudo salvar), en vez de
// caer a la pantalla genérica de Next mostramos un mensaje sobrio con una salida
// real —reiniciar SOLO los datos del planner—, sin tocar el resto del sitio.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearPlannerStorage } from "@/lib/planner/persist";

const IconWarnTri = ({ size = 21 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3.6 21 19.2H3L12 3.6Z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" />
  </svg>
);

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class PlannerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof console !== "undefined") console.error("Planner error:", error, info);
  }

  handleReset = () => {
    clearPlannerStorage();
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        className="planner"
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "56px 24px",
        }}
      >
        <div className="pv-reset" style={{ maxWidth: 460 }}>
          <div className="pv-reset__icon">
            <IconWarnTri />
          </div>
          <h3>No pudimos abrir el planner</h3>
          <p>
            Puede que haya quedado guardado algún dato en un formato que esta
            versión ya no entiende. Reiniciá tus datos del planner para volver a
            empezar: se borran solo materias, plan y preferencias de este
            navegador, nada más del sitio.
          </p>
          <div className="pv-reset__acts">
            <button
              type="button"
              className="btn btn--go btn--sm"
              onClick={this.handleReset}
            >
              Reiniciar mis datos del planner
            </button>
          </div>
        </div>
      </div>
    );
  }
}
