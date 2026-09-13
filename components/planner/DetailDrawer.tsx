"use client";

// Modal de detalle de materia. Antes era un drawer lateral derecho; ahora es un
// modal centrado (mismo patrón que MinorsModal: createPortal a document.body,
// envuelto en .planner para reexponer las variables de tema y evitar el
// containing block del transform de la vista). Los eventos despachan acciones
// del state global. Lee state.drawerCode para saber qué materia mostrar.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { byId } from "@/lib/planner/model";
import { isAvailable, approvedCredits } from "@/lib/planner/metrics";
import { comModalidad, isAsync } from "@/lib/planner/time";
import { usePlanner } from "@/components/planner/state";
import { EstadoControl } from "@/components/planner/EstadoControl";
import { AvailLock } from "@/components/planner/CardSignals";
import { estadoOf, tieneFinal } from "@/lib/planner/estado";
import { useModalFocus } from "@/components/planner/useModalFocus";
import { FICHAS } from "@/lib/planner/fichas";
import { minorsOf } from "@/lib/planner/minors";
import { MinorBadge } from "@/components/planner/MinorBadge";
import { CommissionSelect } from "@studyvaults/ui";
import { withBase } from "@/lib/content/slug";
import {
  ProgramaChips,
  ComingSoonBadge,
} from "@/components/planner/ProgramaChips";
import {
  IconClose,
  IconCheck,
  IconDownload,
  IconArrowUpRight,
  IconInfo,
} from "@/components/planner/icons";
import type { Comision, Ficha, MateriaM } from "@/lib/planner/types";
import "./detail-drawer.css";

// ---- preview de semana (mini-calendario de la comisión) ----

/** Nombre completo de día → abreviatura de 2 letras para el preview. */
const DAY_ABBR: Record<string, string> = {
  lunes: "Lu",
  martes: "Ma",
  miércoles: "Mi",
  miercoles: "Mi",
  jueves: "Ju",
  viernes: "Vi",
  sábado: "Sá",
  sabado: "Sá",
  domingo: "Do",
};
const dayAb = (dia: string): string =>
  DAY_ABBR[dia.trim().toLowerCase()] ?? dia.slice(0, 2);

/** Días base de la semana (Lu–Vi); se agrega Sá sólo si alguna comisión lo usa. */
const WEEK_BASE: { key: string; ab: string }[] = [
  { key: "Lunes", ab: "Lu" },
  { key: "Martes", ab: "Ma" },
  { key: "Miércoles", ab: "Mi" },
  { key: "Jueves", ab: "Ju" },
  { key: "Viernes", ab: "Vi" },
];

/** Abreviaturas de día en que se dicta una comisión (ignora slots asincrónicos). */
function comDays(cm: Comision): Set<string> {
  const s = new Set<string>();
  for (const sl of cm.slots) if (!isAsync(sl)) s.add(dayAb(sl.dia));
  return s;
}

/** Resumen compacto de horario de una comisión, para el tooltip del selector. */
function comSummary(cm: Comision): string {
  const parts = cm.slots
    .filter((s) => !isAsync(s))
    .map((s) => `${dayAb(s.dia)} ${s.desde}–${s.hasta}`);
  return parts.length ? parts.join(" · ") : comModalidad(cm) || "";
}

// ---- descarga del detalle como HTML autocontenido ----

const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

/** Texto multi-párrafo ("\n\n") → <p> serializados. */
const proseHTML = (text: string): string =>
  String(text || "")
    .split("\n\n")
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

/** Dispara la descarga de un string HTML como archivo .html. */
function downloadHTMLFile(html: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Documento HTML autocontenido con el detalle de una materia (y su ficha). */
function buildMateriaHTML(m: MateriaM, ficha: Ficha | undefined): string {
  const ob = m.tipo === "obligatoria";
  const hor = m.horario;
  const areas = m.areas || [];
  const correlativas = m.correlativas || [];

  const subParts = [
    ob
      ? `Obligatoria · ${esc(m.ciclo)} · Año ${esc(m.anio)} (${esc(m.cuatri)}.º cuat.)`
      : "Electiva",
    `${esc(m.creditos)} créditos`,
    m.creditosReq ? `requiere ${esc(m.creditosReq)}` : "",
    hor?.depto ? esc(hor.depto) : "",
  ].filter(Boolean);

  const areasHTML =
    !ob && areas.length
      ? `<section class="sec">
          <h2>Áreas · Minor</h2>
          <div class="chips">${areas.map((a) => `<span class="chip">${esc(a)}</span>`).join("")}</div>
        </section>`
      : "";

  const corrHTML = `<section class="sec">
      <h2>Correlativas</h2>
      ${
        correlativas.length
          ? `<div class="chips">${correlativas
              .map((c) => {
                const cm = byId.get(c);
                return `<span class="chip">${esc(c)}${cm ? " " + esc(cm.abbr) : ""}</span>`;
              })
              .join("")}</div>`
          : `<p class="muted">Sin correlativas</p>`
      }
    </section>`;

  const comsHTML =
    hor && hor.comisiones.length
      ? hor.comisiones
          .map((cm) => {
            const slots = cm.slots
              .map((s) => {
                const aula = [
                  s.sala ? "Aula " + esc(s.sala) : "",
                  s.sede ? esc(s.sede) : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return `<li>
                  <span class="d">${esc(s.dia)}</span>
                  <span class="h">${esc(s.desde)}–${esc(s.hasta)}</span>
                  <span class="au">${aula}</span>
                  <span class="mo">${esc(s.modalidad || "—")}</span>
                </li>`;
              })
              .join("");
            const profs = cm.profesores
              ? `<p class="profs">${esc(cm.profesores)}</p>`
              : "";
            return `<div class="com">
              <div class="com__h"><b>Comisión ${esc(cm.comision)}</b><span class="cupo">${esc(cm.cupo || "")}</span></div>
              <ul class="slots">${slots}</ul>
              ${profs}
            </div>`;
          })
          .join("")
      : `<p class="muted">Sin horario publicado para 2C 2026.</p>`;

  const horHTML = `<section class="sec">
      <h2>Horario 2C 2026</h2>
      ${comsHTML}
    </section>`;

  const detailBlock = (title: string, body: string): string =>
    body ? `<div class="block"><h3>${esc(title)}</h3>${body}</div>` : "";

  let fichaHTML = "";
  if (ficha) {
    const temario = ficha.programa.length
      ? `<ul class="units">${ficha.programa
          .map(
            (u) =>
              `<li><b>${esc(u.titulo)}</b>${u.descripcion ? " — " + esc(u.descripcion) : ""}</li>`,
          )
          .join("")}</ul>`
      : "";
    const biblio = (label: string, list: string[]): string =>
      list.length
        ? `<h4>${esc(label)}</h4><ul class="biblio">${list.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
        : "";
    const biblioBody =
      biblio("Obligatoria", ficha.bibliografiaObligatoria) +
      biblio("Complementaria", ficha.bibliografiaComplementaria);

    fichaHTML = `<section class="sec ficha">
      <h2>Programa analítico</h2>
      <p class="muted">${[ficha.departamento, ficha.anio && `Programa ${ficha.anio}`]
        .filter(Boolean)
        .map((x) => esc(x))
        .join(" · ")}</p>
      ${detailBlock("Presentación", proseHTML(ficha.presentacion))}
      ${detailBlock("Objetivos de aprendizaje", proseHTML(ficha.objetivos))}
      ${detailBlock("Contenidos mínimos", proseHTML(ficha.contenidosMinimos))}
      ${detailBlock("Temario", temario)}
      ${detailBlock("Modalidad de evaluación", proseHTML(ficha.evaluacion))}
      ${detailBlock("Bibliografía", biblioBody)}
    </section>`;
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.codigo)} · ${esc(m.abbr)} — ITBA</title>
<style>
  :root{
    --ink:#2b211c; --soft:#5a4d45; --muted:#8a7d73; --line:#e3d9cf;
    --paper:#fbf8f4; --panel:#fff; --coral:#d2754f;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:var(--paper); color:var(--ink);
    font-family:Georgia,"Times New Roman",serif; line-height:1.55;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .wrap{max-width:820px;margin:0 auto;padding:40px 32px 56px}
  .muted{color:var(--muted)}
  header.doc{border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:20px}
  header.doc .kick{font-family:"SFMono-Regular",Menlo,monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--coral);margin:0 0 6px}
  header.doc h1{font-size:25px;margin:0 0 6px;letter-spacing:-.01em}
  header.doc .sub{color:var(--soft);font-size:13px;font-family:"SFMono-Regular",Menlo,monospace;margin:0}
  section.sec{margin-bottom:22px}
  section.sec>h2{font-size:15px;margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line);letter-spacing:.02em}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{font-family:"SFMono-Regular",Menlo,monospace;font-size:11px;padding:3px 9px;border-radius:5px;background:var(--panel);border:1px solid var(--line);color:var(--soft)}
  .com{border:1px solid var(--line);border-radius:9px;background:var(--panel);padding:10px 14px;margin-bottom:10px}
  .com__h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px}
  .com__h .cupo{font-family:"SFMono-Regular",Menlo,monospace;font-size:11px;color:var(--muted)}
  ul.slots{list-style:none;margin:0;padding:0}
  ul.slots li{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;padding:3px 0;border-top:1px dashed var(--line)}
  ul.slots li:first-child{border-top:none}
  ul.slots .d{font-weight:bold;min-width:74px}
  ul.slots .h{font-family:"SFMono-Regular",Menlo,monospace;color:var(--soft);min-width:96px}
  ul.slots .au{color:var(--soft);flex:1;min-width:120px}
  ul.slots .mo{font-family:"SFMono-Regular",Menlo,monospace;font-size:11px;color:var(--muted)}
  .profs{font-size:11.5px;color:var(--muted);margin:6px 0 0}
  .ficha .block{margin:14px 0}
  .ficha .block h3{font-size:13.5px;margin:0 0 4px;color:var(--coral);font-family:"SFMono-Regular",Menlo,monospace;letter-spacing:.03em;text-transform:uppercase}
  .ficha .block h4{font-size:12.5px;margin:8px 0 3px}
  .ficha p{margin:0 0 8px;font-size:13px}
  ul.units,ul.biblio{margin:0;padding-left:18px}
  ul.units li,ul.biblio li{font-size:12.5px;margin-bottom:5px}
  footer.doc{margin-top:26px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:11px;font-family:"SFMono-Regular",Menlo,monospace}
  @page{size:A4;margin:14mm}
  @media print{ .wrap{padding:0;max-width:none} body{background:#fff} }
</style>
</head>
<body>
<div class="wrap">
  <header class="doc">
    <p class="kick">${esc(m.codigo)} · ${esc(m.abbr)}</p>
    <h1>${esc(m.nombre)}</h1>
    <p class="sub">${subParts.join(" · ")}</p>
  </header>
  ${areasHTML}
  ${corrHTML}
  ${horHTML}
  ${fichaHTML}
  <footer class="doc">Detalle de materia · studyvaults · ITBA</footer>
</div>
</body>
</html>`;
}

/** Apartado "Programa analítico" con la ficha oficial del ITBA (PDF parseado). */
function FichaSection({ ficha }: { ficha: Ficha }) {
  const { dispatch } = usePlanner();
  const ch = ficha.cargaHoraria;
  const totales = [
    ch.teoricas != null ? `${ch.teoricas} teóricas` : null,
    ch.practicas != null ? `${ch.practicas} prácticas` : null,
    ch.laboratorio ? `${ch.laboratorio} laboratorio` : null,
  ].filter(Boolean);
  const semanales = [
    ch.presencial != null ? `${ch.presencial} presencial` : null,
    ch.distancia ? `${ch.distancia} a distancia` : null,
  ].filter(Boolean);

  return (
    <div className="dr-sec dr-ficha">
      <h4>Programa analítico</h4>

      <p className="dr-ficha__meta">
        {[ficha.departamento, ficha.anio && `Programa ${ficha.anio}`]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <ProgramaChips codigo={ficha.codigo} />

      {ch.total != null || totales.length ? (
        <div className="dr-carga">
          {ch.total != null ? (
            <div>
              <b>{ch.total} hs</b> totales
              {totales.length ? ` · ${totales.join(" · ")}` : ""}
            </div>
          ) : null}
          {ch.semanales != null ? (
            <div>
              <b>{ch.semanales} hs</b> semanales
              {semanales.length ? ` · ${semanales.join(" · ")}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* La prosa del programa analítico (objetivos, contenidos, evaluación,
          temario, bibliografía) vive completa en el FichaReader (nivel 3). El
          drawer se queda en el resumen operativo: identidad, carga horaria y el
          puente a la ficha. */}
      <div className="dr-ficha__acts">
        <button
          type="button"
          className="dr-pdf dr-pdf--primary"
          onClick={() => {
            dispatch({ type: "OPEN_FICHA", code: ficha.codigo });
            dispatch({ type: "CLOSE_DRAWER" });
          }}
        >
          Leer el programa completo <IconArrowUpRight size={13} />
        </button>
        <a
          className="dr-pdf"
          href={withBase(ficha.pdf)}
          target="_blank"
          rel="noopener noreferrer"
        >
          PDF
        </a>
      </div>
    </div>
  );
}

export default function DetailDrawer() {
  const { state, dispatch } = usePlanner();
  const code = state.drawerCode;
  const m = code ? byId.get(code) : undefined;

  // cierre con Escape — SOLO con el drawer abierto: un listener global siempre
  // montado se come el Escape de los demás modales del planner (su re-suscripción
  // por deps inestables corre a mitad del dispatch y el handler propio nunca llega).
  useEffect(() => {
    if (!code) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CLOSE_DRAWER" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, dispatch]);

  // Modal cerrado (sin código o materia inexistente): no renderiza nada.
  if (!code || !m) return null;

  if (typeof document === "undefined") return null;

  // El cuerpo vive en un componente que monta recién al abrir (y remonta por
  // materia vía key): así el useModalFocus de adentro corre en cada apertura
  // (foco inicial + trap de Tab) y restaura el foco al cerrar.
  return createPortal(
    <div className="planner" style={{ padding: 0 }}>
      <DrawerModal key={code} m={m} code={code} />
    </div>,
    document.body,
  );
}

function DrawerModal({ m, code }: { m: MateriaM; code: string }) {
  const { state, dispatch } = usePlanner();

  // sombra de la barra de cierre sticky cuando el contenido pasa por debajo
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // foco accesible del modal: foco inicial en el panel + trap de Tab + restore
  const panelRef = useModalFocus<HTMLDivElement>();

  const ob = m.tipo === "obligatoria";
  const estado = estadoOf(code, state.approved, state.finalDone);
  const appr = estado !== "pendiente";
  const avail = isAvailable(m, state.approved);
  const hor = m.horario;
  const inCombo = state.combo.has(code);
  // guard del puente combinar→plan (mismo que la card de Electivas): una materia
  // ya aprobada nunca entra al plan, sólo queda en el combinador.
  const isApproved = state.approved.has(code);
  const coms = hor?.comisiones ?? [];
  const hasComs = coms.length > 0;

  const close = () => dispatch({ type: "CLOSE_DRAWER" });

  const areas = m.areas || [];
  const minors = minorsOf(areas);
  const correlativas = m.correlativas || [];
  const ficha = FICHAS[code];
  // descripción inline: presentación de la materia (o contenidos mínimos como fallback)
  const descInline = ficha
    ? ficha.presentacion || ficha.contenidosMinimos
    : "";

  // comisión fijada (SET_FIXED_COM) — cablea el CommissionSelect del horario
  const fixed = state.fixedCom.get(code) || "";
  // el mini-calendario incluye sábado sólo si alguna comisión lo usa
  const showSat = coms.some((cm) =>
    cm.slots.some((s) => !isAsync(s) && dayAb(s.dia) === "Sá"),
  );
  const weekDays = showSat
    ? [...WEEK_BASE, { key: "Sábado", ab: "Sá" }]
    : WEEK_BASE;

  // cursabilidad: pill al tope, junto a la identidad. Cursable = isAvailable &&
  // no aprobada; bloqueada = cuenta de correlativas que faltan aprobar.
  const faltanCorr = correlativas.filter((c) => !state.approved.has(c)).length;

  // estado académico en palabras, al lado del control tri-estado
  const estadoLabel =
    estado === "pendiente"
      ? "pendiente"
      : estado === "final"
        ? "final aprobado"
        : tieneFinal(code)
          ? "cursada regular — falta el final"
          : "promociona / terminada";

  // meta de identidad: SÓLO lo estructural (tipo · año/cuatri · créditos). El
  // "requiere N cr" pasó junto a la cursabilidad y el depto vive en Horario.
  const metaItems: string[] = [
    ...(ob
      ? ["Obligatoria", m.ciclo, `Año ${m.anio}`, `${m.cuatri}.º cuat.`]
      : ["Electiva"]),
    `${m.creditos} créditos`,
  ].filter(Boolean) as string[];

  const onDownload = () => {
    const html = buildMateriaHTML(m, ficha);
    const filename = `detalle-${m.codigo}-${m.abbr}.html`.replace(
      /[^a-zA-Z0-9._-]/g,
      "-",
    );
    downloadHTMLFile(html, filename);
  };

  return (
    <div
      className="dr-modal"
      role="dialog"
      aria-modal="true"
      aria-label={m.nombre}
    >
      <div className="dr-modal__bg" onClick={close} />
      {/* .dd-panel = contenedor de las container queries (flex column: barra de
          cierre sticky + cuerpo scrolleable). tabIndex=-1: fallback de foco
          inicial para useModalFocus. */}
      <div className="dd-panel" ref={panelRef} tabIndex={-1}>
        <div
          className="dd-scroll"
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (el) setScrolled(el.scrollTop > 4);
          }}
        >
          {/* FIX A — barra de cierre STICKY: la X queda siempre alcanzable.
              Descargar vive acá como icon-button discreto (fuera del flujo de
              acciones primarias). */}
          <div className={"dd-closebar" + (scrolled ? " is-scrolled" : "")}>
            <button
              type="button"
              className="dd-icon-btn"
              onClick={onDownload}
              aria-label="Descargar detalle (HTML)"
              title="Descargar detalle (HTML)"
            >
              <IconDownload size={15} />
            </button>
            <button className="dd-close" onClick={close} aria-label="Cerrar">
              <IconClose size={15} />
            </button>
          </div>

          {/* cuerpo con margen interno: el contenido no toca los bordes. */}
          <div className="dd-body">
            {/* identidad: nombre serif protagonista arriba; código+abbr como
                metadata mono debajo, en la misma fila que la cursabilidad. */}
            <header className="dd-head">
              <h3 className="dr-title">{m.nombre}</h3>
              <div className="dd-head__top">
                <span className={"dr-code " + (ob ? "ob" : "")}>
                  {m.codigo} · {m.abbr}
                </span>
                {!appr ? (
                  avail ? (
                    <span className="dd-avail dd-avail--go">
                      <AvailLock ok /> Cursable
                    </span>
                  ) : (
                    <span className="dd-avail dd-avail--wait">
                      <AvailLock ok={false} />{" "}
                      {faltanCorr > 0
                        ? `Te faltan ${faltanCorr} correlativa${faltanCorr > 1 ? "s" : ""}`
                        : "Requisitos pendientes"}
                    </span>
                  )
                ) : null}
                {m.creditosReq ? (
                  <span className="dd-req">requiere {m.creditosReq} cr</span>
                ) : null}
              </div>
              <div className="dd-meta">
                {metaItems.map((it, i) => (
                  <span className="dd-meta__item" key={i}>
                    {it}
                  </span>
                ))}
              </div>
            </header>

            {/* FIX B — fila de acciones del flujo: estado + combinador (si hay
                comisiones). Descargar salió a la barra de cierre. */}
            <div className={"dd-actions dd-actions--" + (hasComs ? "2" : "1")}>
              {/* tri-estado canónico + estado en palabras (reemplaza al viejo
                  toggle binario). El div ocupa una celda del grid de acciones;
                  el inline style sólo lo alinea a la altura de los botones. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 42,
                }}
              >
                <EstadoControl code={code} stopPropagation={false} />
                <span
                  className="muted"
                  style={{ fontSize: 11.5, lineHeight: 1.3 }}
                >
                  {estadoLabel}
                </span>
              </div>
              {hasComs ? (
                <button
                  className={"mini btn-co" + (inCombo ? " on plan" : "")}
                  title={
                    inCombo
                      ? isApproved
                        ? "En el combinador (ya la aprobaste: no entra al plan) · tocá para quitar"
                        : "En tu plan y en el combinador · tocá para quitar del combinador"
                      : "Combinar: arma tu semana y la suma a tu plan"
                  }
                  onClick={() => dispatch({ type: "TOGGLE_COMBO", code })}
                >
                  {inCombo
                    ? isApproved
                      ? "en combinador ✓"
                      : "en tu plan ✓"
                    : "combinar"}
                </button>
              ) : null}
            </div>

            {/* grid de dos columnas: main (áreas/correlativas/horario) + aside
                (descripción + programa analítico). Apila por container query. */}
            <div className="dd-grid">
              <div className="dd-col dd-main">
                {ob ? null : (
                  <div className="dr-sec">
                    <h4>Áreas · Minor</h4>
                    {minors.length ? (
                      <div className="dd-minors">
                        {minors.map((mn) => (
                          <div className="dd-minor-line" key={mn.id}>
                            <MinorBadge minor={mn} variant="pill" />
                            <span className="dd-minor-name">{mn.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </div>
                )}

                <div className="dr-sec">
                  <h4>Correlativas</h4>
                  <div className="dr-chips">
                    {correlativas.length ? (
                      correlativas.map((c) => {
                        const cm = byId.get(c);
                        const ok = state.approved.has(c);
                        return (
                          <span
                            key={c}
                            className="tag"
                            title={cm ? `${c} · ${cm.nombre}` : c}
                            style={
                              ok
                                ? {
                                    color: "var(--sage)",
                                    borderColor:
                                      "color-mix(in srgb, var(--sage) 30%, transparent)",
                                  }
                                : { color: "var(--muted)" }
                            }
                          >
                            {c} {cm ? cm.abbr : ""}{" "}
                            {ok ? <IconCheck size={12} /> : null}
                          </span>
                        );
                      })
                    ) : (
                      <span className="muted">Sin correlativas</span>
                    )}
                  </div>
                </div>

                <div className="dr-sec">
                  <div className="dd-hor__head">
                    <div className="dd-hor__title">
                      <h4>Horario 2C 2026</h4>
                      {hor?.depto ? (
                        <span className="dd-hor__depto">{hor.depto}</span>
                      ) : null}
                    </div>
                    {/* control de comisión: label + CommissionSelect (fija la
                        comisión, SET_FIXED_COM) + tooltip que explica "Auto". */}
                    {coms.length > 1 ? (
                      <div className="dd-hor__ctrl">
                        <label className="dd-hor__lbl" htmlFor="dd-com-select">
                          Comisión
                        </label>
                        <CommissionSelect
                          id="dd-com-select"
                          className="dd-hor__pick"
                          size="sm"
                          placeholder="Auto"
                          aria-label="Fijar comisión"
                          value={fixed}
                          onChange={(e) =>
                            dispatch({
                              type: "SET_FIXED_COM",
                              code,
                              comision: e.target.value || null,
                            })
                          }
                          options={coms.map((cm) => ({
                            value: cm.comision,
                            label: `com ${cm.comision} · ${comModalidad(cm)}`,
                            title: comSummary(cm),
                          }))}
                        />
                        <span className="dd-tip">
                          <button
                            type="button"
                            className="dd-tip__btn"
                            aria-label="Qué hace la opción Auto"
                          >
                            <IconInfo size={14} />
                          </button>
                          <span className="dd-tip__bubble" role="tooltip">
                            <b>Auto</b> — el optimizador del combinador elige la
                            comisión que mejor encaja con el resto de tu cursada.
                            Fijá una para forzar ese horario.
                          </span>
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {hasComs ? (
                    <div className="dd-coms">
                      {coms.map((cm) => {
                        const days = comDays(cm);
                        const isFixed = fixed === cm.comision;
                        return (
                          <div
                            className={"dd-com" + (isFixed ? " is-fixed" : "")}
                            key={cm.comision}
                          >
                            <div className="dd-com__top">
                              {/* preview de semana */}
                              <span className="dd-week" aria-hidden="true">
                                {weekDays.map((d) => (
                                  <span
                                    key={d.ab}
                                    className={
                                      "dd-week__d" + (days.has(d.ab) ? " on" : "")
                                    }
                                  >
                                    {d.ab}
                                  </span>
                                ))}
                              </span>
                              <span className="dd-com__name">
                                Comisión {cm.comision}
                              </span>
                              {isFixed ? (
                                <span className="dd-com__pin">fijada</span>
                              ) : null}
                              {cm.cupo ? (
                                <span className="dd-com__cupo">{cm.cupo}</span>
                              ) : null}
                            </div>
                            {cm.slots.map((s, i) => (
                              <div className="dr-slot" key={i}>
                                <span className="d">{s.dia}</span>
                                <span className="h">
                                  {s.desde}–{s.hasta}
                                </span>
                                <span className="au">
                                  {s.sala ? "Aula " + s.sala : ""}
                                  {s.sede ? " · " + s.sede : ""}
                                </span>
                                <span className="dr-slotmod">
                                  {s.modalidad || "—"}
                                </span>
                              </div>
                            ))}
                            {cm.profesores ? (
                              <div
                                className="muted"
                                style={{ fontSize: 11, marginTop: 7 }}
                              >
                                {cm.profesores}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="dd-hor__empty">
                      Sin horario publicado para 2C 2026.
                    </p>
                  )}
                </div>
              </div>

              <div className="dd-col dd-aside">
                {descInline ? (
                  <div className="dr-sec">
                    <h4>Descripción</h4>
                    <p className="dr-desc">{descInline}</p>
                  </div>
                ) : null}
                {ficha ? (
                  <FichaSection ficha={ficha} />
                ) : (
                  <div className="dr-sec">
                    <h4>Programa analítico</h4>
                    <ComingSoonBadge />
                    <p className="muted">
                      Todavía no cargamos el programa analítico de esta materia.
                      Va a estar disponible próximamente.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
