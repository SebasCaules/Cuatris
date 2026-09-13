"use client";

// Lector full-screen de la ficha (programa analítico) de una electiva.
// Lee state.fichaCode para saber qué materia mostrar; null = cerrado.
// Otros componentes despachan OPEN_FICHA para abrirlo. Las flechas de navegación
// y el botón de cerrar recorren las electivas con ficha y cierran el lector.
//
// El overlay se monta vía portal en document.body para escapar del stacking
// context de <main class="page" z-index:1> y poder cubrir el navbar fijo del
// portal (z 1000). El wrapper `.planner fr-portal` (display:contents) reestablece
// el scope de las variables del planner sin generar caja/layout.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePlanner } from "@/components/planner/state";
import { useModalFocus } from "@/components/planner/useModalFocus";
import { FICHAS } from "@/lib/planner/fichas";
import { withBase } from "@/lib/content/slug";
import { ProgramaChips } from "@/components/planner/ProgramaChips";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
} from "@/components/planner/icons";
import type { Ficha } from "@/lib/planner/types";

/** Render de un texto multi-párrafo (separado por "\n\n") como <p> apilados. */
function Prose({ text }: { text: string }) {
  if (!text) return null;
  return (
    <>
      {text.split("\n\n").map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

export default function FichaReader() {
  const { state } = usePlanner();

  // Lector cerrado: no monta el modal. Al montarse recién en la apertura,
  // useModalFocus (foco inicial + trap de Tab + restore al disparador) corre en
  // cada apertura y devuelve el foco al cerrar. Mismo patrón que DetailDrawer.
  if (state.fichaCode == null) return null;
  // El portal necesita el DOM (cliente). En SSR no se renderiza.
  if (typeof document === "undefined") return null;

  // Wrapper `.planner` (display:contents vía .fr-portal) → reestablece las vars
  // del planner sin caja; montado en body, escapa del stacking context de main.
  return createPortal(
    <div className="planner fr-portal">
      <FichaReaderModal />
    </div>,
    document.body,
  );
}

function FichaReaderModal() {
  const { state, dispatch } = usePlanner();
  const code = state.fichaCode;

  // ref a .fr-doc para resetear el scroll al cambiar de código.
  const docRef = useRef<HTMLDivElement>(null);

  // Foco accesible del modal: foco inicial en el panel + trap de Tab + restore.
  const panelRef = useModalFocus<HTMLDivElement>();

  // Lista ordenada de electivas con ficha disponible (para prev/next).
  const list = Object.keys(FICHAS).sort((a, b) => a.localeCompare(b));
  const idx = code ? list.indexOf(code) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < list.length - 1;

  const close = () => dispatch({ type: "CLOSE_FICHA" });
  const goPrev = () => {
    if (hasPrev) dispatch({ type: "OPEN_FICHA", code: list[idx - 1] });
  };
  const goNext = () => {
    if (hasNext) dispatch({ type: "OPEN_FICHA", code: list[idx + 1] });
  };

  // Atajos de teclado (client-side: el listener vive dentro de useEffect).
  // Escape cierra; ArrowLeft/ArrowRight navegan. Se re-suscribe cuando cambian
  // código o los límites de navegación para capturar los handlers actuales.
  useEffect(() => {
    if (code == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, hasPrev, hasNext]);

  // Reset del scroll de .fr-doc al cambiar de electiva.
  useEffect(() => {
    if (docRef.current) docRef.current.scrollTop = 0;
  }, [code]);

  // code no es null acá (el padre no monta este componente si lo es); la guarda
  // narrowea el tipo para el resto del render.
  if (code == null) return null;

  const ficha: Ficha | undefined = FICHAS[code];
  const ch = ficha?.cargaHoraria;

  // Cabecera meta: depto · Programa {anio} · {creditos} créditos · carrera.
  const meta = ficha
    ? [
        ficha.departamento,
        ficha.anio && `Programa ${ficha.anio}`,
        ficha.creditos != null && `${ficha.creditos} créditos`,
        ficha.carrera,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const bar = (
    <header className="fr-bar">
      <div className="fr-bar__nav">
        <button
          className="fr-navbtn"
          disabled={!hasPrev}
          onClick={goPrev}
          aria-label="Anterior"
        >
          <IconChevronLeft size={16} />
        </button>
        <button
          className="fr-navbtn"
          disabled={!hasNext}
          onClick={goNext}
          aria-label="Siguiente"
        >
          <IconChevronRight size={16} />
        </button>
        {ficha ? (
          <span className="fr-bar__pos">
            {idx + 1} / {list.length}
          </span>
        ) : null}
      </div>
      <span className="fr-bar__title">Programa analítico</span>
      <button className="fr-close" onClick={close} aria-label="Cerrar">
        <IconClose size={16} />
      </button>
    </header>
  );

  // Ficha inexistente: overlay con mensaje vacío y navegación/cierre (no crashea).
  const content = !ficha ? (
    <div
      className="fr-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Ficha no disponible"
    >
      <div className="fr-scrim" onClick={close} />
      <div className="fr-panel" ref={panelRef} tabIndex={-1}>
        {bar}
        <article className="fr-doc" ref={docRef}>
          <div className="fr-empty">
            <p>No hay ficha disponible para esta materia.</p>
            <p style={{ marginTop: 8 }}>
              Usá las flechas de arriba para ver otra electiva, o cerrá el
              lector y elegí otra materia desde el plan.
            </p>
            <p style={{ marginTop: 16 }}>
              <button type="button" className="fr-pdf" onClick={close}>
                Cerrar lector
              </button>
            </p>
          </div>
        </article>
      </div>
    </div>
  ) : (
    <div
      className="fr-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Ficha de ${ficha.materia}`}
    >
      <div className="fr-scrim" onClick={close} />
      <div className="fr-panel" ref={panelRef} tabIndex={-1}>
        {bar}
        <article className="fr-doc" ref={docRef}>
          <div className="fr-head">
            <span className="fr-head__code">{ficha.codigo}</span>
            <h1 className="fr-title">{ficha.materia}</h1>
            {meta ? <p className="fr-head__meta">{meta}</p> : null}
            <ProgramaChips codigo={code} />
            <div className="fr-chips">
              {ch!.total != null ? (
                <span className="fr-chip">
                  <b>{ch!.total}</b> hs totales
                </span>
              ) : null}
              {ch!.teoricas != null ? (
                <span className="fr-chip">
                  <b>{ch!.teoricas}</b> hs teóricas
                </span>
              ) : null}
              {ch!.practicas != null ? (
                <span className="fr-chip">
                  <b>{ch!.practicas}</b> hs prácticas
                </span>
              ) : null}
              {ch!.laboratorio ? (
                <span className="fr-chip">
                  <b>{ch!.laboratorio}</b> hs laboratorio
                </span>
              ) : null}
              {ch!.semanales != null ? (
                <span className="fr-chip">
                  <b>{ch!.semanales}</b> hs semanales
                </span>
              ) : null}
              {ch!.presencial != null ? (
                <span className="fr-chip">
                  <b>{ch!.presencial}</b> hs presencial
                </span>
              ) : null}
              {ch!.distancia ? (
                <span className="fr-chip">
                  <b>{ch!.distancia}</b> hs a distancia
                </span>
              ) : null}
            </div>
          </div>

          <div className="fr-body">
            {ficha.presentacion ? (
              <section className="fr-sec">
                <h2>Presentación</h2>
                <Prose text={ficha.presentacion} />
              </section>
            ) : null}

            {ficha.objetivos ? (
              <section className="fr-sec">
                <h2>Objetivos</h2>
                <Prose text={ficha.objetivos} />
              </section>
            ) : null}

            {ficha.contenidosMinimos ? (
              <section className="fr-sec">
                <h2>Contenidos mínimos</h2>
                <Prose text={ficha.contenidosMinimos} />
              </section>
            ) : null}

            {ficha.estrategias ? (
              <section className="fr-sec">
                <h2>Estrategias de enseñanza</h2>
                <Prose text={ficha.estrategias} />
              </section>
            ) : null}

            {ficha.programa.length ? (
              <section className="fr-sec">
                <h2>Temario</h2>
                <ol className="fr-units">
                  {ficha.programa.map((u, i) => (
                    <li key={i}>
                      <span className="fr-units__t">{u.titulo}</span>
                      {u.descripcion ? (
                        <span className="fr-units__d">{u.descripcion}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {ficha.evaluacion ? (
              <section className="fr-sec">
                <h2>Modalidad de evaluación</h2>
                <Prose text={ficha.evaluacion} />
              </section>
            ) : null}

            {ficha.bibliografiaObligatoria.length ||
            ficha.bibliografiaComplementaria.length ? (
              <section className="fr-sec">
                <h2>Bibliografía</h2>
                {ficha.bibliografiaObligatoria.length ? (
                  <>
                    <p className="fr-biblio__lbl">Obligatoria</p>
                    <ul className="fr-biblio">
                      {ficha.bibliografiaObligatoria.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {ficha.bibliografiaComplementaria.length ? (
                  <>
                    <p className="fr-biblio__lbl">Complementaria</p>
                    <ul className="fr-biblio">
                      {ficha.bibliografiaComplementaria.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}

            <p style={{ marginTop: 32 }}>
              <a
                className="fr-pdf"
                href={withBase(ficha.pdf)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Descargar programa analítico (PDF)
              </a>
            </p>
          </div>
        </article>
      </div>
    </div>
  );

  return content;
}
