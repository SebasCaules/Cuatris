"use client";

// Hub de exportar/importar del Plan de cursada. Reúne en un solo modal las dos
// cosas que antes vivían sueltas en el toolbar: (1) el DOCUMENTO del plan
// (HTML/PDF, para leer o imprimir) y (2) las PREFERENCIAS portables (.json con
// todo el estado, para llevar el plan a otro navegador). Reusa el chrome del
// modal de minors (.mnr-modal*) y portalea a `.planner` en <body> — el mismo
// patrón que MinorsModal, para escapar el transform de `.view-panel`.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "@/components/planner/useModalFocus";
import { parsePreferences, type Persisted } from "@/lib/planner/persist";
import {
  IconClose,
  IconCheck,
  IconDownload,
  IconUpload,
  IconFileText,
  IconPrinter,
} from "@/components/planner/icons";

// Triángulo de aviso para la confirmación destructiva del import (mismo trazo
// que el reset del plan: es la misma clase de decisión "¿confirmás reemplazar?").
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

interface ImportSummary {
  aprobadas: number;
  electivas: number;
}

const summarize = (p: Persisted): ImportSummary => ({
  aprobadas: p.approved?.length ?? 0,
  electivas: p.pool?.length ?? 0,
});

/** Confirmación previa al import: reemplazar el plan es destructivo e
 *  irreversible, así que sigue el mismo patrón (chrome + foco) que el reset. */
function ImportConfirm({
  summary,
  onCancel,
  onConfirm,
}: {
  summary: ImportSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useModalFocus<HTMLDivElement>();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const partes: string[] = [];
  if (summary.aprobadas > 0)
    partes.push(
      `${summary.aprobadas} ${summary.aprobadas === 1 ? "materia aprobada" : "materias aprobadas"}`,
    );
  if (summary.electivas > 0)
    partes.push(
      `${summary.electivas} ${summary.electivas === 1 ? "electiva en el plan" : "electivas en el plan"}`,
    );

  return (
    <div
      className="mnr-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="io-import-title"
    >
      <div className="mnr-modal__bg" onClick={onCancel} />
      <div className="pv-reset" ref={panelRef}>
        <div className="pv-reset__icon">
          <IconWarnTri />
        </div>
        <h3 id="io-import-title">¿Reemplazar tu plan actual?</h3>
        <p>
          Importar estas preferencias reemplaza por completo tu plan en este
          navegador —materias, topes, método y comisiones fijadas—{" "}
          {partes.length > 0 ? (
            <>
              por el del archivo (<b>{partes.join(" · ")}</b>).
            </>
          ) : (
            <>por el del archivo.</>
          )}{" "}
          Esta acción no se puede deshacer.
        </p>
        <div className="pv-reset__acts">
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--go btn--sm"
            onClick={onConfirm}
          >
            Reemplazar plan
          </button>
        </div>
      </div>
    </div>
  );
}

/** Acuse tras un import exitoso: sin él, el plan cambia detrás del modal sin
 *  ninguna señal de que se aplicó. */
function ImportDone({ onClose }: { onClose: () => void }) {
  const panelRef = useModalFocus<HTMLDivElement>();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="mnr-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="io-done-title"
    >
      <div className="mnr-modal__bg" onClick={onClose} />
      <div className="pv-reset" ref={panelRef}>
        <div className="pv-reset__icon">
          <IconCheck size={20} />
        </div>
        <h3 id="io-done-title">Preferencias importadas</h3>
        <p>Tu plan de cursada quedó reemplazado por el del archivo.</p>
        <div className="pv-reset__acts">
          <button
            type="button"
            className="btn btn--go btn--sm"
            onClick={onClose}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export interface IOCuatri {
  idx: number; // índice de cuatrimestre en el plan
  tag: string; // etiqueta corta ("2C 26")
  materias: number;
}

export default function IOModal({
  onClose,
  cuatris,
  onExportHTML,
  onExportPDF,
  onExportPrefs,
  onImportFile,
  prefsError,
}: {
  onClose: () => void;
  cuatris: IOCuatri[];
  onExportHTML: (cuatris: number[]) => void;
  onExportPDF: (cuatris: number[]) => void;
  onExportPrefs: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  prefsError: string | null;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  // foco accesible del modal: foco inicial en el panel + trap de Tab + restore
  const panelRef = useModalFocus<HTMLDivElement>();
  // selección de cuatrimestres a incluir en el documento (arranca con todos).
  const [sel, setSel] = useState<Set<number>>(
    () => new Set(cuatris.map((c) => c.idx)),
  );
  const allOn = cuatris.length > 0 && sel.size === cuatris.length;
  const toggle = (idx: number) =>
    setSel((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  const toggleAll = () =>
    setSel(allOn ? new Set() : new Set(cuatris.map((c) => c.idx)));
  const chosen = () => cuatris.map((c) => c.idx).filter((i) => sel.has(i));
  const nada = sel.size === 0;

  // Import en dos pasos: el archivo se parsea acá para (1) validar y (2) resumir
  // qué trae; recién con la confirmación explícita se aplica el HYDRATE (vía el
  // onImportFile del padre, que relee el mismo input y despacha). "done" muestra
  // el acuse antes de cerrar.
  const [phase, setPhase] = useState<"idle" | "confirm" | "done">("idle");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  // Reconstruye un evento mínimo con el input real (que sigue conteniendo el
  // archivo) para que `onImportFile` lo relea y limpie `value` como siempre.
  const forwardToImport = () => {
    const el = fileRef.current;
    if (!el) return;
    onImportFile({
      target: el,
      currentTarget: el,
    } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const payload = parsePreferences(String(reader.result ?? ""));
      if (!payload) {
        // inválido: deja que el padre surface el error (relee y muestra prefsError)
        forwardToImport();
        return;
      }
      setSummary(summarize(payload));
      setPhase("confirm");
    };
    reader.onerror = () => forwardToImport();
    reader.readAsText(file);
  };

  const confirmImport = () => {
    forwardToImport();
    setPhase("done");
  };

  const cancelImport = () => {
    if (fileRef.current) fileRef.current.value = ""; // permite reelegir archivo
    setSummary(null);
    setPhase("idle");
  };

  // cierre con Escape (igual que MinorsModal); solo cuando no hay un sub-modal
  // (confirmación/acuse) encima manejando su propio Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "idle") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const modal = (
    <div
      className="mnr-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Exportar o importar el plan de cursada"
    >
      <div className="mnr-modal__bg" onClick={onClose} />
      {/* tabIndex=-1: fallback de foco inicial para useModalFocus */}
      <div className="mnr-modal__panel plan2-io" ref={panelRef} tabIndex={-1}>
        <button className="mnr-close" onClick={onClose} aria-label="Cerrar">
          <IconClose size={15} />
        </button>
        <header className="mnr-head">
          <span className="mnr-kick">Plan de cursada</span>
          <h3>Exportar o importar</h3>
          <p>
            Descargá tu plan para leerlo o imprimirlo, o guardá y restaurá tus
            preferencias entre navegadores.
          </p>
        </header>

        <div className="plan2-io__grid">
          <section className="plan2-io__card">
            <div className="plan2-io__cardtop">
              <span className="plan2-io__kick">Documento</span>
              <h4>Tu plan, listo para leer</h4>
              <p>
                Calendarios y, por cada materia, un resumen con los puntos clave
                y la evaluación. Elegí qué cuatrimestres incluir.
              </p>
            </div>

            {cuatris.length > 1 ? (
              <div className="plan2-io__pick">
                <div className="plan2-io__pickhead">
                  <span className="plan2-io__minilbl">Cuatrimestres</span>
                  <button
                    type="button"
                    className="plan2-io__all"
                    onClick={toggleAll}
                  >
                    {allOn ? "Ninguno" : "Todos"}
                  </button>
                </div>
                <div className="plan2-io__chips">
                  {cuatris.map((c) => {
                    const on = sel.has(c.idx);
                    return (
                      <button
                        type="button"
                        key={c.idx}
                        className={"plan2-io__chip" + (on ? " is-on" : "")}
                        aria-pressed={on}
                        onClick={() => toggle(c.idx)}
                      >
                        {on ? <IconCheck size={11} /> : null}
                        {c.tag}
                        <i>{c.materias}</i>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="plan2-io__acts">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={nada}
                onClick={() => onExportHTML(chosen())}
              >
                <IconFileText size={14} /> Exportar HTML
              </button>
              <button
                type="button"
                className="btn btn--go btn--sm"
                disabled={nada}
                onClick={() => onExportPDF(chosen())}
              >
                <IconPrinter size={14} /> Descargar PDF
              </button>
            </div>
          </section>

          <section className="plan2-io__card">
            <div className="plan2-io__cardtop">
              <span className="plan2-io__kick">Preferencias</span>
              <h4>Llevá tu plan a otro lado</h4>
              <p>
                Un archivo <b>.json</b> con todo tu estado: materias agregadas,
                topes por cuatrimestre, método, punto de partida y cuatrimestres
                fijados.
              </p>
            </div>
            <div className="plan2-io__acts">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={onExportPrefs}
              >
                <IconDownload size={14} /> Exportar .json
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => fileRef.current?.click()}
              >
                <IconUpload size={14} /> Importar .json
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
              Importar reemplaza el plan actual en este navegador.
            </p>
            {prefsError && (
              <p className="plan2-io__err" role="alert">
                {prefsError}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="planner" style={{ padding: 0 }}>
      {modal}
      {phase === "confirm" && summary && (
        <ImportConfirm
          summary={summary}
          onCancel={cancelImport}
          onConfirm={confirmImport}
        />
      )}
      {phase === "done" && <ImportDone onClose={onClose} />}
    </div>,
    document.body,
  );
}
