"use client";

// Guardar o cargar el progreso completo del planner, desde cualquier vista.
// El estado vive solo en localStorage: sin esto, cambiar de navegador (o venir
// desde el planner de StudyVaults) obliga a marcar todo de nuevo. Es la card
// «Preferencias» del IOModal del Plan de cursada, promovida a un modal propio y
// colgada del rail; reusa el mismo bundle (.json portable), la misma
// confirmación destructiva y el mismo acuse, así los dos caminos se comportan
// igual. Portalea a `.planner` en <body> como MinorsModal/IOModal.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlanner } from "@/components/planner/state";
import { useModalFocus } from "@/components/planner/useModalFocus";
import {
  ImportConfirm,
  ImportDone,
  summarize,
  type ImportSummary,
} from "@/components/planner/IOModal";
import { PLAN, byId } from "@/lib/planner/model";
import {
  parsePreferences,
  serializePreferences,
  type Persisted,
} from "@/lib/planner/persist";
import { downloadTextFile } from "@/lib/planner/download";
import { IconClose, IconDownload, IconUpload } from "@/components/planner/icons";

const nowStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function ProgresoModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePlanner();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useModalFocus<HTMLDivElement>();
  const [phase, setPhase] = useState<"idle" | "confirm" | "done">("idle");
  const [pending, setPending] = useState<Persisted | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Qué hay para llevarse, en las mismas unidades que el resto del planner:
  // aprobadas (obligatorias / electivas), cursando y las electivas que el
  // usuario sumó al plan (el pool trae además todas las obligatorias
  // pendientes, que no son una decisión suya: no se cuentan).
  const resumen = useMemo(() => {
    const oblig = PLAN.obligatorias.filter((m) => state.approved.has(m.codigo)).length;
    const elect = [...state.approved].filter((c) => byId.get(c)?.tipo === "electiva").length;
    const plan = [...state.plan.pool].filter((c) => byId.get(c)?.tipo === "electiva").length;
    return { oblig, elect, cursando: state.cursando.size, plan };
  }, [state.approved, state.cursando, state.plan.pool]);
  const vacio =
    resumen.oblig + resumen.elect + resumen.cursando + resumen.plan === 0;

  const exportar = () => {
    if (typeof window === "undefined") return;
    const fecha = nowStr();
    downloadTextFile(
      serializePreferences(state, fecha),
      `progreso-cuatris-${fecha}.json`,
      "application/json",
    );
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite reelegir el mismo archivo
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const payload = parsePreferences(String(reader.result ?? ""));
      if (!payload) {
        setError("El archivo no es un .json de progreso válido.");
        return;
      }
      setError(null);
      setPending(payload);
      setSummary(summarize(payload));
      setPhase("confirm");
    };
    reader.onerror = () => setError("No se pudo leer el archivo.");
    reader.readAsText(file);
  };

  const confirmar = () => {
    if (pending) dispatch({ type: "HYDRATE", payload: pending });
    setPending(null);
    setPhase("done");
  };
  const cancelar = () => {
    setPending(null);
    setSummary(null);
    setPhase("idle");
  };

  // Escape cierra solo cuando no hay un sub-modal encima manejando el suyo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "idle") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="planner" style={{ padding: 0 }}>
      <div
        className="mnr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prog-title"
      >
        <div className="mnr-modal__bg" onClick={onClose} />
        <div className="mnr-modal__panel prog-modal" ref={panelRef} tabIndex={-1}>
          <button className="mnr-close" onClick={onClose} aria-label="Cerrar">
            <IconClose size={15} />
          </button>
          <header className="mnr-head">
            <span className="mnr-kick">Tu progreso</span>
            <h3 id="prog-title">Guardar o cargar</h3>
            <p>
              Todo lo que marcaste y armaste vive en este navegador. Un archivo{" "}
              <b>.json</b> lo lleva a otro dispositivo — o lo trae desde el
              planificador de StudyVaults.
            </p>
          </header>

          <section className="plan2-io__card">
            <div className="prog-modal__stats" aria-label="Contenido a guardar">
              <span>
                <b>{resumen.oblig}</b> obligatorias
              </span>
              <span>
                <b>{resumen.elect}</b> electivas aprobadas
              </span>
              <span>
                <b>{resumen.cursando}</b> cursando
              </span>
              <span>
                <b>{resumen.plan}</b> electivas en el plan
              </span>
            </div>
            <div className="plan2-io__acts">
              <button
                type="button"
                className="btn btn--go btn--sm"
                disabled={vacio}
                onClick={exportar}
              >
                <IconDownload size={14} /> Guardar .json
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => fileRef.current?.click()}
              >
                <IconUpload size={14} /> Cargar .json
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={onPickFile}
              />
            </div>
            <p className="plan2-io__note">
              Cargar reemplaza todo el progreso de este navegador (te lo
              confirmamos antes).
            </p>
            {error && (
              <p className="plan2-io__err" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
      {phase === "confirm" && summary && (
        <ImportConfirm summary={summary} onCancel={cancelar} onConfirm={confirmar} />
      )}
      {phase === "done" && <ImportDone onClose={onClose} />}
    </div>,
    document.body,
  );
}
