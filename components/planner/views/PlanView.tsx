"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePlanner } from "@/components/planner/state";
import {
  byId,
  abbrOf,
  isElectiva,
  hasHorario,
  planPriority,
  PALETTE,
  DAYS,
  PLAN,
  REQUISITOS,
  remainingOblig,
} from "@/lib/planner/model";
import { approvedCredits, electiveCredits } from "@/lib/planner/metrics";
import { isAsync, slotsConflict, comModalidad, salaLabel } from "@/lib/planner/time";
import {
  optimizePlan,
  planOverlaps,
  assignComs,
  compareCuatri,
  cuatriAt,
  currentCuatri,
  nextCuatri,
  cuatriLabel,
  cuatriName,
  OPT_METHODS,
  type OptMethodMeta,
  type PlanOverlap,
} from "@/lib/planner/optimize";
import { recommendElectives, type Recommendation } from "@/lib/planner/recommend";
import {
  buildCuatriSheet,
  buildPlanHTML,
  PLAN_SHEET_H,
  PLAN_SHEET_PAD,
  PLAN_SHEET_W,
  type CalendarRenderer,
} from "@/lib/planner/exportPlan";
import { downloadBlob, htmlToPngBlob } from "@/lib/planner/exportImage";
import { renderStaticHTML } from "@/components/planner/renderStatic";
import { CURSADA_CALENDAR_PRINT_CSS } from "@/components/planner/cursadaCalendarPrint";
import { openForPrint } from "@/lib/planner/download";
import {
  loadPlanCols,
  savePlanCols,
  type PlanCols,
} from "@/lib/planner/persist";
import { MINORS, minorsOf } from "@/lib/planner/minors";
import { CommissionSelect } from "@studyvaults/ui";
import CursadaCalendar from "@/components/planner/CursadaCalendar";
import MinorsModal from "@/components/planner/MinorsModal";
import { MinorBadge, MinorBadges } from "@/components/planner/MinorBadge";
import { Tooltip } from "@/components/planner/Tooltip";
import { RecRow, RecSig } from "@/components/planner/RecRow";
import {
  IconClose,
  IconGraduationCap,
  IconCalendar,
  IconScale,
  IconRoute,
  IconDownload,
  IconGrip,
  IconSliders,
  IconRotateCcw,
  IconLayers,
  IconFileText,
  IconCompactPage,
  IconCheck,
  IconLock,
  IconUnlock,
  type IconProps,
} from "@/components/planner/icons";
import { useModalFocus } from "@/components/planner/useModalFocus";
import { MAX_PLAN_CUATRIS } from "@/lib/planner/consts";
import type {
  Comision,
  MateriaM,
  OptMethod,
  PlacedMateria,
  PlanResult,
  PlanState,
  PlanStart,
  WeekBlock,
} from "@/lib/planner/types";
import { normalizar } from "@/lib/planner/texto";
import "@/components/planner/planview.css";

// créditos electivos requeridos por el plan ACTIVO (cambia con la carrera)
const elecReq = () => PLAN.creditosElectivasReq ?? 27;
const EMPTY_BLOCKS: WeekBlock[] = [];
const EMPTY_CODES: string[] = [];

/* ---------- iconos locales (no existen en icons.tsx) ---------- */
const IconDots = ({ size = 16, ...rest }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden="true"
    {...rest}
  >
    <circle cx="5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="19" cy="12" r="1.9" />
  </svg>
);
const IconWarnTri = ({ size = 21, ...rest }: IconProps) => (
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
    {...rest}
  >
    <path d="M12 3.6 21 19.2H3L12 3.6Z" />
    <path d="M12 9.6v4.2" />
    <circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/* ---------- helpers de dominio ---------- */
/** ¿mostramos el tag "recomendada"? Electiva que aporta a un minor, con el
 *  recomendador encendido (el dot de minor se muestra siempre; el tag lo
 *  gatea el toggle, igual que `body.rec-on .rec-tag` del mockup). */
const isRecTagged = (m: MateriaM, recOn: boolean) =>
  recOn && m.tipo === "electiva" && minorsOf(m.areas).length > 0;

/* ---------- export HTML / PDF ---------- */
function nowStr(): string {
  try {
    return new Date().toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/* ---------- input numérico robusto (arregla el "Máx. …") ---------- */
function NumField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
  stepper = false,
  unit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  /** Con `stepper`, el campo es un control propio −/n/+ (banner del plan):
   *  los botones y las flechas ↑/↓ cambian de a uno y commitean al instante;
   *  el número también se puede escribir (commit en blur/Enter). */
  stepper?: boolean;
  /** sufijo tenue al lado del número («cr», «mat.»). */
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  // mientras no se está editando, el input refleja el valor real
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commitDraft = () => {
    const n = parseInt(draft, 10);
    const c = Number.isNaN(n) ? value : clamp(n);
    if (c !== value) onCommit(c);
    setDraft(String(c));
  };
  const stepBy = (d: number) => {
    const c = clamp(value + d);
    if (c !== value) onCommit(c);
    setDraft(String(c));
  };
  const input = (
    <input
      type={stepper ? "text" : "number"}
      id={id}
      min={min}
      max={max}
      inputMode="numeric"
      pattern={stepper ? "[0-9]*" : undefined}
      value={draft}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onFocus={(e) => {
        setFocused(true);
        if (stepper) e.target.select();
      }}
      onChange={(e) => {
        // Solo actualizamos el borrador local: NO commiteamos por dígito (cada
        // commit re-optimiza todo el plan). El valor real se fija en blur/Enter.
        setDraft(e.target.value);
      }}
      onBlur={() => {
        setFocused(false);
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (!stepper) return;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          stepBy(e.key === "ArrowUp" ? 1 : -1);
        }
      }}
    />
  );
  if (!stepper) {
    return (
      <div className="plan2-field">
        <label htmlFor={id}>{label}</label>
        {input}
      </div>
    );
  }
  return (
    <div className="plan2-field pv-num">
      <label htmlFor={id}>{label}</label>
      <div className="pv-num__ctl" role="group" aria-label={label}>
        <button
          type="button"
          className="pv-num__btn"
          aria-label={`Menos ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => stepBy(-1)}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <span className="pv-num__val">
          {input}
          {unit && <span className="pv-num__unit">{unit}</span>}
        </span>
        <button
          type="button"
          className="pv-num__btn"
          aria-label={`Más ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => stepBy(1)}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ---------- icono de cada objetivo ---------- */
function MethodIcon({ method, size }: { method: OptMethod; size: number }) {
  if (method === "dias") return <IconCalendar size={size} />;
  if (method === "balance") return <IconScale size={size} />;
  return <IconGraduationCap size={size} />;
}

/* ---------- texto del método ---------- */
function methodText(
  R: PlanResult,
  PL: { method: OptMethod; maxCred: number; maxMat: number; avoid: boolean },
  lastIdx: number,
) {
  const meta = OPT_METHODS.find((m) => m.key === PL.method);
  const objetivo = meta?.objetivo ?? "Minimizar la cantidad de cuatrimestres.";
  const minimo = R.minLast != null && R.minLast === lastIdx && R.unplaced.length === 0;
  const secundario =
    PL.method === "dias"
      ? "entre los planes que terminan ahí, el de menos días de campus por semana."
      : PL.method === "balance"
        ? "entre los planes que terminan ahí, el de carga más pareja entre cuatrimestres."
        : "entre los planes que terminan ahí, el que más respeta el orden del plan de estudios y menos idas a la facultad pide.";
  return (
    <>
      <b>{meta?.label ?? "Recibirte antes"}.</b> {objetivo} Primero se busca
      la fecha de egreso más temprana —varias colocaciones (orden del plan de
      estudios, urgencia por correlativas y reinicios) y se queda con la que
      termina antes— y después, {secundario}{" "}
      {minimo
        ? "El egreso coincide con la cota mínima: no existe plan más corto con estas restricciones."
        : R.minLast != null && R.minLast >= 0 && R.unplaced.length === 0
          ? `Cota teórica: ${R.minLast + 1} cuatrimestres (calculada sin combinar los topes con los créditos requeridos ni las superposiciones, así que puede no ser alcanzable).`
          : ""}{" "}
      Restricciones respetadas: paridad 1.º/2.º cuatrimestre · correlativas ·
      créditos requeridos
      {PL.avoid
        ? " · sin superposición horaria (incluye traslados entre sedes)"
        : ""}
      . Tope por cuatrimestre: {PL.maxCred} créditos y {PL.maxMat} materias. Las
      comisiones se eligen para pedir menos idas a la facultad.{" "}
      {R.moved
        ? PL.method === "balance"
          ? `Rebalanceo: ${R.moved} movimiento(s) entre cuatrimestres para emparejar la carga.`
          : `Compactación: ${R.moved} materia(s) adelantadas a cuatrimestres con lugar.`
        : ""}
    </>
  );
}

/* ---------- bloques de la grilla semanal de un cuatrimestre ---------- */
function computeCuatriBlocks(it: PlacedMateria[]) {
  const blocks: WeekBlock[] = [];
  const asyncs: { abbr: string; txt: string; color?: string; codigo?: string }[] = [];
  const seenB = new Set<string>();
  const campus = new Set<string>();
  it.forEach((x, k) => {
    const color = PALETTE[k % PALETTE.length];
    const com = x.com;
    if (!com) {
      asyncs.push({ abbr: x.m.abbr, txt: "sin horario", color, codigo: x.m.codigo });
      return;
    }
    com.slots.forEach((s) => {
      const key = x.m.codigo + s.dia + s.desde + s.hasta;
      if (isAsync(s) || !DAYS.includes(s.dia)) {
        asyncs.push({
          abbr: x.m.abbr,
          txt: `${s.dia} ${s.desde}–${s.hasta}`,
          color,
          codigo: x.m.codigo,
        });
      } else {
        campus.add(s.dia);
        if (seenB.has(key)) return;
        seenB.add(key);
        blocks.push({ ...s, abbr: x.m.abbr, nombre: x.m.nombre, codigo: x.m.codigo, color });
      }
    });
  });
  blocks.forEach((a) => {
    a.conf = blocks.some((b) => b !== a && slotsConflict(a, b));
  });
  return { blocks, asyncs, campusDays: campus.size };
}

/* ---------- fila de asincrónicas / otros ---------- */
function AsyncRow({
  asyncs,
  dragging,
  onChipPointerDown,
}: {
  asyncs: { abbr: string; txt: string; color?: string; codigo?: string }[];
  dragging?: string | null;
  onChipPointerDown?: (code: string, e: React.PointerEvent) => void;
}) {
  if (!asyncs.length) return null;
  return (
    <div className="async-row">
      <span className="lbl">Asincrónico / otros</span>
      {asyncs.map((a, k) => (
        <span
          className={
            "async-chip" + (dragging && a.codigo === dragging ? " is-dragging" : "")
          }
          key={k}
          style={a.codigo && onChipPointerDown ? { cursor: "grab" } : undefined}
          onPointerDown={
            a.codigo && onChipPointerDown
              ? (e) => onChipPointerDown(a.codigo!, e)
              : undefined
          }
        >
          {a.abbr}
          {a.txt ? " · " + a.txt : ""}
        </span>
      ))}
    </div>
  );
}

/* ---------- ¿dónde entra una materia? (vista previa y drag & drop) ----------
 * Para cada cuatrimestre del plan decide si la materia `code` entra HOY, sin
 * reoptimizar: paridad, correlativas (aprobadas o ubicadas antes), créditos
 * requeridos, topes del cuatri (globales u override) y —si "Evitar
 * superposiciones" está encendido— una comisión sin choques con lo que ya hay.
 * Devuelve los índices válidos y los bloques fantasma (comisión elegida) para
 * dibujarlos en cada calendario. Un cuatri finalizado nunca es destino. */
type FitResult = { idx: Set<number>; ghosts: Map<number, WeekBlock[]> };

function pickComision(
  m: MateriaM,
  existing: WeekBlock[],
  fixedCom: Map<string, string>,
  avoid: boolean,
): { com: Comision | null; ok: boolean } {
  const coms = m.horario?.comisiones ?? [];
  if (!coms.length) return { com: null, ok: true };
  const fx = fixedCom.get(m.codigo);
  const candidates = fx ? coms.filter((c) => c.comision === fx) : coms;
  if (!candidates.length) return { com: null, ok: false };
  const clashes = (c: Comision) =>
    c.slots.some(
      (s) => !isAsync(s) && existing.some((b) => slotsConflict(b, s)),
    );
  const free = candidates.find((c) => !clashes(c));
  if (free) return { com: free, ok: true };
  return { com: candidates[0], ok: !avoid };
}

function fitsOf(
  code: string,
  R: PlanResult,
  PL: PlanState,
  approved: Set<string>,
  fixedCom: Map<string, string>,
  used: { it: PlacedMateria[]; i: number }[],
): FitResult {
  const out: FitResult = { idx: new Set(), ghosts: new Map() };
  const m = byId.get(code);
  if (!m) return out;
  used.forEach(({ it, i }) => {
    if (PL.lockedIdx.has(i)) return;
    if (it.some((x) => x.m.codigo === code)) return;
    const cu = cuatriAt(PL.start, i);
    if (m.parity !== null && m.parity !== cu.parity) return;
    if ((m.creditosReq || 0) > (R.accBefore[i] ?? 0)) return;
    const before = new Set(approved);
    R.items.slice(0, i).forEach((its) => its.forEach((x) => before.add(x.m.codigo)));
    if ((m.correlativas || []).some((c) => !before.has(c))) return;
    const cred = it.reduce((sum, x) => sum + (x.m.creditos || 0), 0);
    const capCred = PL.capCredByIdx.get(i) ?? PL.maxCred;
    const capMat = PL.capMatByIdx.get(i) ?? PL.maxMat;
    if (cred + (m.creditos || 0) > capCred || it.length + 1 > capMat) return;
    const { blocks } = computeCuatriBlocks(it);
    const { com, ok } = pickComision(m, blocks, fixedCom, PL.avoid);
    if (!ok) return;
    out.idx.add(i);
    if (com) {
      const color = PALETTE[it.length % PALETTE.length];
      const ghosts: WeekBlock[] = [];
      com.slots.forEach((slot) => {
        if (isAsync(slot) || !DAYS.includes(slot.dia)) return;
        ghosts.push({
          ...slot,
          abbr: m.abbr,
          nombre: m.nombre,
          codigo: m.codigo,
          color,
          preview: true,
          conf: blocks.some((b) => slotsConflict(b, slot)),
        });
      });
      out.ghosts.set(i, ghosts);
    }
  });
  return out;
}

/* ---------- resumen "Lun 14–16 · 101R" de la comisión que se usaría ---------- */
function comSummary(m: MateriaM, fixedCom: Map<string, string>): string | null {
  const coms = m.horario?.comisiones ?? [];
  if (!coms.length) return null;
  const fx = fixedCom.get(m.codigo);
  const com = coms.find((c) => c.comision === fx) ?? coms[0];
  const slots = com.slots.filter((s) => !isAsync(s));
  if (!slots.length) return "asincrónica";
  const parts = slots
    .slice(0, 2)
    .map((s) => `${s.dia.slice(0, 3)} ${s.desde}–${s.hasta}`);
  const room = salaLabel(slots[0]);
  return parts.join(" · ") + (slots.length > 2 ? " · …" : "") + (room ? " · " + room : "");
}

/* ---------- progreso de minors: aprobadas + ubicadas en el plan ---------- */
function computeMinorRows(
  used: { it: PlacedMateria[]; i: number }[],
  approved: Set<string>,
) {
  return MINORS.map((minor) => {
    let cr = 0;
    approved.forEach((c) => {
      const m = byId.get(c);
      if (m && m.tipo === "electiva" && (m.areas || []).includes(minor.id))
        cr += m.creditos || 0;
    });
    used.forEach(({ it }) =>
      it.forEach((x) => {
        if (x.m.tipo === "electiva" && (x.m.areas || []).includes(minor.id))
          cr += x.m.creditos || 0;
      }),
    );
    return { minor, cr, done: cr >= minor.req };
  });
}

/* ---------- carrusel de cuatrimestres ----------
 * Scroll nativo con snap (trackpad, rueda horizontal) + arrastre con mouse
 * sobre el fondo de las tarjetas; flechas que desplazan una tarjeta y se
 * ocultan en los extremos. No reinventa el scroll: sólo lo observa. */
export type CarouselHandle = {
  /** Desplaza la pista hasta que las tarjetas de estos cuatris queden a la vista
   *  (si ya lo están, no hace nada). */
  reveal: (idxs: number[]) => void;
};

function Carousel({
  count,
  cols = 2,
  children,
  handle,
  leadHidden = false,
}: {
  count: number;
  /** cuatrimestres a la vista a la vez (2, 3 o 4; uno en angosto vía CSS). */
  cols?: PlanCols;
  children: React.ReactNode;
  handle?: React.Ref<CarouselHandle>;
  /** la primera tarjeta (el cuatrimestre en curso) arranca fuera de vista, a
   *  la izquierda: se llega con la flecha «anterior» o scrolleando. */
  leadHidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const leadDone = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !leadHidden || leadDone.current) return;
    const lead = el.querySelector<HTMLElement>(".pv-sem--now");
    if (!lead) return;
    leadDone.current = true;
    el.scrollLeft = lead.offsetLeft + lead.offsetWidth + 16 - 2;
  }, [leadHidden, count]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 2);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, count]);

  const step = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".pv-sem");
    const w = card ? card.getBoundingClientRect().width + 16 : el.clientWidth;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  // Cuando una materia entra en un cuatri que no está a la vista (agregar,
  // fijar, soltar, mover), la pista se corre hasta mostrarlo. Si son varios,
  // intenta encuadrar el rango; si no entra, prioriza el primero.
  useImperativeHandle(
    handle,
    () => ({
      reveal: (idxs: number[]) => {
        const el = ref.current;
        if (!el || !idxs.length) return;
        const cards = idxs
          .map((i) => el.querySelector<HTMLElement>(`.pv-sem[data-cuatri-idx="${i}"]`))
          .filter((c): c is HTMLElement => !!c);
        if (!cards.length) return;
        // idxs[0] es el prioritario (adonde fue la materia que se tocó); el resto
        // son los cuatris que el optimizador reacomodó de paso.
        const primary = cards[0];
        const left = Math.min(...cards.map((c) => c.offsetLeft));
        const right = Math.max(...cards.map((c) => c.offsetLeft + c.offsetWidth));
        const viewL = el.scrollLeft;
        const viewR = viewL + el.clientWidth;
        if (left >= viewL && right <= viewR) return; // ya se ven todos
        let target: number;
        if (right - left <= el.clientWidth) {
          // el rango completo entra: se pega al borde más cercano
          target = left < viewL ? left - 2 : right - el.clientWidth + 2;
        } else {
          // no entra: se encuadra el prioritario (si ya se ve, no se mueve)
          const pL = primary.offsetLeft;
          const pR = pL + primary.offsetWidth;
          if (pL >= viewL && pR <= viewR) return;
          target = pL < viewL ? pL - 2 : pR - el.clientWidth + 2;
        }
        el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      },
    }),
    [],
  );

  // arrastre con mouse: sólo sobre el fondo (no sobre bloques, chips ni controles)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(
        "button, select, input, a, .cmbcal-blk, .async-chip, .pv-menu, .pv-confirm-pop",
      )
    )
      return;
    const el = ref.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      setScrolling(true);
    }
    el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    drag.current = null;
    setScrolling(false);
  };

  return (
    <div className="pv-carousel">
      <button
        type="button"
        className="pv-arrow pv-arrow--prev"
        aria-label="Cuatrimestre anterior"
        hidden={!canPrev}
        onClick={() => step(-1)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.5 6.5 9 12l5.5 5.5" />
        </svg>
      </button>
      <div
        ref={ref}
        className={"pv-track" + (scrolling ? " is-scrolling" : "")}
        style={{ "--pv-cols": cols } as React.CSSProperties}
        onScroll={update}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
      <button
        type="button"
        className="pv-arrow pv-arrow--next"
        aria-label="Cuatrimestre siguiente"
        hidden={!canNext}
        onClick={() => step(1)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />
        </svg>
      </button>
    </div>
  );
}

/* ---------- dot(s) de minor de una materia ---------- */
function MinorDots({ m }: { m: MateriaM }) {
  const minors = minorsOf(m.areas);
  if (!minors.length) return null;
  return (
    <span className="rmap-mat__minor">
      {minors.map((mn) => (
        <MinorBadge key={mn.id} minor={mn} variant="dot" />
      ))}
    </span>
  );
}

/* ---------- override compacto "máx. créditos / máx. materias" por cuatri ----
 * Usado en RoadmapStop (cerrado por default, no ensucia la tarjeta) con
 * fallback visual al valor global cuando no hay override. */
function CuatriCaps({
  i,
  idPrefix,
  globalCred,
  globalMat,
}: {
  i: number;
  idPrefix: string;
  globalCred: number;
  globalMat: number;
}) {
  const { state, dispatch } = usePlanner();
  const capCred = state.plan.capCredByIdx.get(i);
  const capMat = state.plan.capMatByIdx.get(i);
  const isCapped = capCred !== undefined || capMat !== undefined;

  return (
    <details className={"rmap-caps" + (isCapped ? " is-capped" : "")}>
      <summary className="rmap-caps__summary">
        <IconSliders size={11} />
        Límites de este cuatri
        {isCapped && <span className="rmap-caps__dot" aria-hidden="true" />}
      </summary>
      <div className="rmap-caps__body">
        <NumField
          id={`${idPrefix}CapCred${i}`}
          label="Máx. créditos"
          value={capCred ?? globalCred}
          min={3}
          max={40}
          stepper
          unit="cr"
          onCommit={(n) =>
            dispatch({ type: "SET_PLAN_CAP_CRED", idx: i, value: n })
          }
        />
        <NumField
          id={`${idPrefix}CapMat${i}`}
          label="Máx. materias"
          value={capMat ?? globalMat}
          min={1}
          max={9}
          stepper
          unit="mat."
          onCommit={(n) =>
            dispatch({ type: "SET_PLAN_CAP_MAT", idx: i, value: n })
          }
        />
        <button
          type="button"
          className="rmap-caps__auto"
          disabled={!isCapped}
          onClick={() => {
            dispatch({ type: "SET_PLAN_CAP_CRED", idx: i, value: null });
            dispatch({ type: "SET_PLAN_CAP_MAT", idx: i, value: null });
          }}
        >
          auto
        </button>
      </div>
    </details>
  );
}

/* ========================================================================= */
/* ---------- cuatrimestre nuevo: fantasma de vista previa y destino «+» ---------- */
// GhostCard: la materia previsualizada no entra en el plan actual y caería en
// un cuatrimestre nuevo; se dibuja ese cuatrimestre con sus bloques fantasma.
function GhostCard({
  idx,
  cu,
  ghosts,
  abbr,
}: {
  idx: number;
  cu: PlanStart;
  ghosts: WeekBlock[];
  abbr: string;
}) {
  return (
    <article className="pv-sem pv-sem--ghost is-preview" data-cuatri-idx={idx} aria-hidden="true">
      <div className="pv-sem__head">
        <div className="pv-sem__when">
          <span className="pv-sem__title">{cuatriName(cu)}</span>
          <span className="pv-sem__now-tag pv-sem__now-tag--new">nuevo</span>
        </div>
      </div>
      <div className="pv-sem__body">
        {ghosts.length ? (
          <CursadaCalendar blocks={ghosts} days={DAYS} compact />
        ) : (
          <p className="pv-sem__empty">{abbr} · sin grilla semanal</p>
        )}
      </div>
      <div className="pv-sem__foot">
        <div className="pv-load-meta">
          <span className="cr">vista previa · alarga la carrera</span>
        </div>
      </div>
    </article>
  );
}

// NewCard: destino «+» que aparece al final del carrusel mientras se arrastra
// una materia; soltarla ahí abre ese cuatrimestre y la fija en él.
function NewCard({
  idx,
  cu,
  drop,
}: {
  idx: number;
  cu: PlanStart;
  drop: "can" | "ok" | "warn" | "bad" | null;
}) {
  return (
    <article
      className={
        "pv-sem pv-sem--new" +
        (drop === "can" ? " is-drop-can" : "") +
        (drop === "ok" ? " is-drop-ok" : "") +
        (drop === "warn" ? " is-drop-warn" : "")
      }
      data-cuatri-idx={idx}
    >
      <div className="pv-sem__head">
        <div className="pv-sem__when">
          <span className="pv-sem__title">{cuatriName(cu)}</span>
          <span className="pv-sem__now-tag pv-sem__now-tag--new">nuevo</span>
        </div>
      </div>
      <div className="pv-sem__body pv-sem__newbody">
        <span className="pv-sem__plus" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="pv-sem__newtxt">
          Soltá acá para abrir este cuatrimestre
        </span>
        <span className="pv-sem__newsub">alarga la carrera un cuatrimestre</span>
      </div>
    </article>
  );
}

/* ---------- tarjeta del cuatrimestre en curso (solo lectura) ---------- */
// Lo que se está cursando hoy. No se optimiza, no recibe arrastres ni se
// finaliza: es el punto de partida del plan, a la izquierda del primer
// cuatrimestre planificado.
function NowCard({
  it,
  cu,
  drop,
}: {
  it: PlacedMateria[];
  cu: PlanStart;
  drop: "can" | "ok" | "warn" | "bad" | null;
}) {
  const { dispatch } = usePlanner();
  const { blocks, asyncs, campusDays } = useMemo(
    () => computeCuatriBlocks(it),
    [it],
  );
  const cred = it.reduce((s, x) => s + (x.m.creditos || 0), 0);
  return (
    <article
      className={"pv-sem pv-sem--now" + (drop === "bad" ? " is-drop-bad" : "")}
      data-cuatri-idx={-1}
    >
      <div className="pv-sem__head">
        <div className="pv-sem__when">
          <span className="pv-sem__title">{cuatriName(cu)}</span>
          <span className="pv-sem__now-tag">en curso</span>
        </div>
      </div>
      <div className="pv-sem__body">
        {blocks.length ? (
          <CursadaCalendar
            blocks={blocks}
            days={DAYS}
            compact
            onBlockClick={(code) => dispatch({ type: "OPEN_DRAWER", code })}
          />
        ) : (
          <ul className="pv-sem__nowlist">
            {it.map((x, k) => (
              <li key={x.m.codigo} style={{ "--blk": PALETTE[k % PALETTE.length] } as React.CSSProperties}>
                <button
                  type="button"
                  className="pv-sem__nowmat"
                  onClick={() => dispatch({ type: "OPEN_DRAWER", code: x.m.codigo })}
                >
                  <b>{x.m.abbr}</b>
                  <span>{x.m.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {blocks.length > 0 && <AsyncRow asyncs={asyncs} dragging={null} />}
      </div>
      <div className="pv-sem__foot">
        <div className="pv-load-meta">
          <span className="cr">
            {cred} cr · {it.length} {it.length === 1 ? "materia" : "mat."}
            {campusDays > 0 && (
              <>
                {" · "}
                {campusDays} {campusDays === 1 ? "día" : "días"}
              </>
            )}
          </span>
          <span className="aux">cursando</span>
        </div>
      </div>
    </article>
  );
}

/* ---------- tarjeta de cuatrimestre (tab Calendario) ---------- */
/* ---------- requisitos sin cursada (Inglés I/II) que tocan en este cuatri ----------
 * No son materias del cuatrimestre: una línea discreta, fuera del calendario y
 * de la cuenta de créditos, que dice que hay que tenerlos aprobados al llegar
 * acá. Al tocarla se abre el detalle; se marcan aprobados en «Materias». */
function ReqLine({ codes }: { codes: string[] }) {
  const { dispatch } = usePlanner();
  if (!codes.length) return null;
  return (
    <div className="pv-reqs">
      {codes.map((c) => {
        const m = byId.get(c);
        return (
          <Tooltip
            key={c}
            width={236}
            content={
              <>
                <b>{m?.nombre ?? c}</b> · requisito sin cursada
                <br />
                Hay que tenerlo aprobado al llegar a este cuatrimestre. Se
                marca en «Materias».
              </>
            }
          >
            <button
              type="button"
              className="pv-req"
              onClick={() => dispatch({ type: "OPEN_DRAWER", code: c })}
            >
              <span className="pv-req__box" aria-hidden="true" />
              <span className="pv-req__name">{m?.nombre ?? c}</span>
              <span className="pv-req__hint">aprobado para este cuatri</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SemCard({
  it,
  i,
  start,
  ghosts,
  isPreview,
  dragging,
  drop,
  onDragStart,
  maxCred,
  maxMat,
  locked,
  onFinalize,
  onUnlock,
  onDownload,
  reqs = EMPTY_CODES,
  orden = 0,
  fixRange = 14,
}: {
  it: PlacedMateria[];
  i: number;
  start: PlanStart;
  /** cuántos cuatrimestres ofrece el select «fijar en» (el plan puede extender
   *  el horizonte más allá de 14) */
  fixRange?: number;
  /** requisitos sin cursada (Inglés) que hay que tener aprobados al llegar acá */
  reqs?: string[];
  /** posición en la fila (escalona la entrada, motion.css) */
  orden?: number;
  /** bloques fantasma de la vista previa (hover sobre una materia de la lista) */
  ghosts: WeekBlock[];
  /** la materia previsualizada entra en este cuatri */
  isPreview: boolean;
  /** código de la materia que se está arrastrando (si es de este cuatri, se atenúa) */
  dragging: string | null;
  /** feedback de destino durante el arrastre */
  drop: "can" | "ok" | "warn" | "bad" | null;
  onDragStart: (code: string, e: React.PointerEvent) => void;
  maxCred: number;
  maxMat: number;
  locked: boolean;
  onFinalize: (idx: number) => void;
  onUnlock: (idx: number) => void;
  onDownload: (
    idx: number,
    scope: "cal" | "imagen" | "both" | "programa",
  ) => void;
}) {
  const { state, dispatch } = usePlanner();
  const cu = cuatriAt(start, i);
  const { blocks: own, asyncs, campusDays } = useMemo(
    () => computeCuatriBlocks(it),
    [it],
  );
  // Los fantasmas se SUMAN a los bloques propios: están posicionados en absoluto
  // dentro de la grilla, así que aparecen y desaparecen sin mover nada.
  const blocks = useMemo(
    () =>
      [
        ...own.map((b) => (dragging && b.codigo === dragging ? { ...b, dragging: true } : b)),
        ...ghosts,
      ],
    [own, ghosts, dragging],
  );
  const cred = it.reduce((s, x) => s + (x.m.creditos || 0), 0);
  const hasPreview = isPreview;
  const capCred = state.plan.capCredByIdx.get(i);
  const capMat = state.plan.capMatByIdx.get(i);
  const isCapped = capCred !== undefined || capMat !== undefined;
  const effCred = capCred ?? maxCred;
  const load = Math.min(100, Math.round((cred / Math.max(1, effCred)) * 100));

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  // Mover materias de cuatrimestre ya no vive acá: se hace en el Roadmap (drag +
  // select) y en el pool. El tab Calendario es sólo lectura de la grilla.

  useEffect(() => {
    if (!menuOpen && !confirmOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setConfirmOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, confirmOpen]);

  return (
    <article
      className={
        "pv-sem" +
        (hasPreview ? " is-preview" : "") +
        (drop === "can" ? " is-drop-can" : "") +
        (drop === "ok" ? " is-drop-ok" : "") +
        (drop === "warn" ? " is-drop-warn" : "") +
        (drop === "bad" ? " is-drop-bad" : "") +
        (isCapped ? " is-capped" : "") +
        (locked ? " is-locked" : "") +
        (menuOpen || confirmOpen ? " is-menu-open" : "")
      }
      data-cuatri-idx={i}
      style={{ "--i": orden } as React.CSSProperties}
    >
      <div className="pv-sem__head">
        <div className="pv-sem__when">
          <span className="pv-sem__title">{cuatriName(cu)}</span>
        </div>
        <div className="pv-sem__tools" ref={toolsRef}>
          {/* lock siempre visible, a la izquierda del ⋯: botón chico con texto.
              Sin lockear: "Finalizar" (candado abierto → abre el confirm).
              Lockeado: "Finalizado" (candado cerrado, acento → desbloquea directo). */}
          {locked ? (
            <button
              type="button"
              className="pv-lockbtn is-locked"
              aria-label="Desbloquear cuatrimestre"
              title="Desbloquear cuatrimestre"
              onClick={() => onUnlock(i)}
            >
              <IconLock size={13} /> Finalizado
            </button>
          ) : (
            <button
              type="button"
              className="pv-lockbtn"
              aria-label="Finalizar cuatrimestre — el optimizador deja de tocarlo"
              title="Finalizar cuatrimestre — el optimizador deja de tocarlo"
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
            >
              <IconUnlock size={13} /> Finalizar
            </button>
          )}
          <button
            type="button"
            className="pv-dotbtn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Opciones de ${cuatriName(cu)}`}
            onClick={() => {
              setConfirmOpen(false);
              setMenuOpen((v) => !v);
            }}
          >
            <IconDots size={16} />
          </button>

          {menuOpen && (
            <div className="pv-menu" role="menu">
              {!locked && (
                <>
                  <div className="pv-menu__sec">
                    <span className="pv-menu__lbl">
                      <IconSliders size={11} /> Límites de este cuatri
                    </span>
                    <div className="pv-menu__caps">
                      <NumField
                        id={`semCapCred${i}`}
                        label="Máx. créditos"
                        value={capCred ?? maxCred}
                        min={3}
                        max={40}
                        stepper
                        unit="cr"
                        onCommit={(n) =>
                          dispatch({
                            type: "SET_PLAN_CAP_CRED",
                            idx: i,
                            value: n,
                          })
                        }
                      />
                      <NumField
                        id={`semCapMat${i}`}
                        label="Máx. materias"
                        value={capMat ?? maxMat}
                        min={1}
                        max={9}
                        stepper
                        unit="mat."
                        onCommit={(n) =>
                          dispatch({
                            type: "SET_PLAN_CAP_MAT",
                            idx: i,
                            value: n,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="pv-menu__auto"
                        disabled={!isCapped}
                        onClick={() => {
                          dispatch({
                            type: "SET_PLAN_CAP_CRED",
                            idx: i,
                            value: null,
                          });
                          dispatch({
                            type: "SET_PLAN_CAP_MAT",
                            idx: i,
                            value: null,
                          });
                        }}
                      >
                        auto
                      </button>
                    </div>
                  </div>
                  <hr className="pv-menu__sep" />
                </>
              )}

              <div className="pv-menu__dl">
                <span className="pv-menu__lbl">
                  <IconDownload size={11} /> Descargar este calendario
                </span>
                <button
                  type="button"
                  role="menuitem"
                  className="pv-menu__item"
                  onClick={() => {
                    onDownload(i, "cal");
                    setMenuOpen(false);
                  }}
                >
                  <IconCalendar size={15} /> Solo calendario
                  <span className="sub">PDF · 1 hoja</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pv-menu__item"
                  onClick={() => {
                    onDownload(i, "imagen");
                    setMenuOpen(false);
                  }}
                >
                  <IconCompactPage size={15} /> Imagen
                  <span className="sub">.png · 1 hoja</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pv-menu__item"
                  onClick={() => {
                    onDownload(i, "both");
                    setMenuOpen(false);
                  }}
                >
                  <IconLayers size={15} /> Calendario + programa
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="pv-menu__item"
                  onClick={() => {
                    onDownload(i, "programa");
                    setMenuOpen(false);
                  }}
                >
                  <IconFileText size={15} /> Solo programa
                </button>
              </div>
            </div>
          )}

          {confirmOpen && !locked && (
            <div className="pv-confirm-pop" role="dialog" aria-label="Finalizar cuatrimestre">
              <p className="pv-confirm-pop__t">¿Finalizar {cuatriName(cu)}?</p>
              <p className="pv-confirm-pop__b">
                El optimizador dejará de tocar este cuatrimestre mientras iterás
                el resto. Podés desbloquearlo cuando quieras.
              </p>
              <div className="pv-confirm-pop__acts">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setConfirmOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--go btn--sm"
                  onClick={() => {
                    onFinalize(i);
                    setConfirmOpen(false);
                  }}
                >
                  Finalizar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pv-sem__cal">
        {blocks.length ? (
          <CursadaCalendar
            blocks={blocks}
            days={DAYS}
            compact
            onBlockClick={(code) => dispatch({ type: "OPEN_DRAWER", code })}
            onBlockPointerDown={locked ? undefined : onDragStart}
          />
        ) : (
          <p className="pv-sem__empty">Sólo materias sin grilla semanal.</p>
        )}
        <AsyncRow
          asyncs={asyncs}
          dragging={dragging}
          onChipPointerDown={locked ? undefined : onDragStart}
        />
      </div>

      <ReqLine codes={reqs} />

      <div className="pv-sem__foot">
        <div className="pv-loadbar" aria-hidden="true">
          <i style={{ width: `${load}%` }} />
        </div>
        <div className="pv-load-meta">
          <span className="cr">
            {cred} cr · {it.length} {it.length === 1 ? "materia" : "mat."}
            {campusDays > 0 && (
              <>
                {" · "}
                {campusDays} {campusDays === 1 ? "día" : "días"}
              </>
            )}
          </span>
          {!locked && <span className="aux">tope {effCred} cr</span>}
        </div>
        {locked && (
          <div className="pv-lockcap">
            <span className="pv-lockchip">
              <IconLock size={12} />
              <b>finalizado</b> · el optimizador no lo toca
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------- una parada del roadmap (editable, con drag & drop) ---------- */
function RoadmapStop({
  it,
  i,
  start,
  accBefore,
  maxCred,
  maxMat,
  previewCode,
  recOn,
  locked,
  onUnlock,
  reqs = EMPTY_CODES,
  orden = 0,
  fixRange = 14,
}: {
  it: PlacedMateria[];
  i: number;
  start: PlanStart;
  /** cuántos cuatrimestres ofrece el select «fijar en» (el plan puede extender
   *  el horizonte más allá de 14) */
  fixRange?: number;
  accBefore: number[];
  maxCred: number;
  maxMat: number;
  previewCode: string | null;
  recOn: boolean;
  locked: boolean;
  onUnlock: (idx: number) => void;
  /** requisitos sin cursada (Inglés) que hay que tener aprobados al llegar acá */
  reqs?: string[];
  /** posición en la grilla (escalona la entrada, motion.css) */
  orden?: number;
}) {
  const { state, dispatch } = usePlanner();
  const cu = cuatriAt(start, i);

  // Drag & drop para mover materias entre cuatrimestres. El código de la materia
  // arrastrada viaja por dataTransfer (cross-stop); el estado local sólo pinta
  // la materia en curso (is-dragging) y resalta este stop como destino (drop-over).
  const [draggingCode, setDraggingCode] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // sólo necesitamos los días de campus para el ledger; la grilla semanal
  // detallada vive en la pestaña "Calendario".
  const { campusDays } = useMemo(() => computeCuatriBlocks(it), [it]);

  const cred = it.reduce((s, x) => s + (x.m.creditos || 0), 0);
  const acc = accBefore[i] + cred;
  const load = Math.min(100, Math.round((cred / Math.max(1, maxCred)) * 100));
  const hasPreview = it.some((x) => x.m.codigo === previewCode);
  const isCapped =
    state.plan.capCredByIdx.has(i) || state.plan.capMatByIdx.has(i);

  return (
    <li
      className={
        "rmap-stop" +
        (hasPreview ? " has-preview" : "") +
        (dragOver ? " drop-over" : "") +
        (isCapped ? " is-capped" : "") +
        (locked ? " is-locked" : "")
      }
      style={{ "--i": orden } as React.CSSProperties}
    >
      <div
        className="rmap-stop__card"
        onDragOver={(e: React.DragEvent) => {
          // permite el drop y marca este cuatrimestre como destino activo;
          // un cuatri finalizado no es destino válido (el lock manda).
          if (locked) {
            e.dataTransfer.dropEffect = "none";
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e: React.DragEvent) => {
          // sólo apagamos el resalte al salir de la tarjeta (no en los hijos)
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          if (locked) return;
          const code = e.dataTransfer.getData("text/plain");
          if (code) dispatch({ type: "PLAN_SET_FIXED", code, idx: i });
        }}
      >
        <div className="rmap-stop__head">
          <div className="rmap-stop__when">
            <h3>{cuatriName(cu)}</h3>
          </div>
          {/* en el roadmap el lock sólo aparece finalizado: clic → desbloquea */}
          {locked && (
            <button
              type="button"
              className="pv-dotbtn pv-dotbtn--lock is-locked"
              aria-label="Desbloquear cuatrimestre"
              title="Desbloquear cuatrimestre"
              onClick={() => onUnlock(i)}
            >
              <IconLock size={15} />
            </button>
          )}
          <span className="rmap-stop__step" aria-hidden="true">
            {i + 1}
          </span>
        </div>

        <div className="rmap-stop__ledger">
          <span className="rmap-stop__metric">
            <b>{cred}</b> cr
          </span>
          <span className="rmap-stop__metric rmap-stop__metric--soft">
            <b>{it.length}</b> mat
          </span>
          {campusDays > 0 && (
            <span className="rmap-stop__metric rmap-stop__metric--soft">
              <b>{campusDays}</b> {campusDays === 1 ? "día" : "días"}
            </span>
          )}
        </div>

        {!locked && (
          <CuatriCaps
            i={i}
            idPrefix="rmap"
            globalCred={maxCred}
            globalMat={maxMat}
          />
        )}

        <div className="rmap-stop__load" aria-hidden="true">
          <i style={{ width: `${load}%` }} />
        </div>

        <div className="rmap-stop__mats">
          {it.map((x, k) => {
            const isPrev = x.m.codigo === previewCode;
            const fx = state.plan.fixed.get(x.m.codigo);
            return (
              <div
                key={x.m.codigo}
                className={
                  "rmap-mat" +
                  (isPrev ? " is-preview" : "") +
                  (draggingCode === x.m.codigo ? " is-dragging" : "")
                }
                style={
                  { "--blk": PALETTE[k % PALETTE.length] } as React.CSSProperties
                }
                title={`${x.m.codigo} · ${x.m.nombre}`}
              >
                <button
                  type="button"
                  className="rmap-mat__main"
                  draggable={!locked}
                  onDragStart={(e: React.DragEvent) => {
                    if (locked) return;
                    e.dataTransfer.setData("text/plain", x.m.codigo);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingCode(x.m.codigo);
                  }}
                  onDragEnd={() => setDraggingCode(null)}
                  onClick={() =>
                    dispatch({ type: "OPEN_DRAWER", code: x.m.codigo })
                  }
                >
                  {!locked && (
                    <span className="rmap-mat__grip" aria-hidden="true">
                      <IconGrip size={12} />
                    </span>
                  )}
                  <span className="rmap-mat__abbr">{x.m.abbr}</span>
                  <MinorDots m={x.m} />
                  <span className="rmap-mat__cr">{x.m.creditos}</span>
                  {/* tag "fijada": distingue lo que fijó el usuario (fx en un
                      cuatri editable) de lo que ubicó el optimizador. En cuatris
                      finalizados no aplica (el chip "finalizado" ya lo comunica). */}
                  {!locked && fx !== undefined && (
                    <span className="rmap-mat__fixed">fijada</span>
                  )}
                  {isRecTagged(x.m, recOn) && (
                    <span className="rmap-mat__rec">rec</span>
                  )}
                  {isPrev && <span className="rmap-mat__new">nueva</span>}
                </button>
                {!locked && (
                  <div
                    className="rmap-mat__tools"
                    draggable={false}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      className="rmap-mat__sel"
                      aria-label={`Fijar cuatrimestre de ${x.m.nombre}`}
                      value={fx === undefined ? "" : String(fx)}
                      onChange={(e) =>
                        dispatch({
                          type: "PLAN_SET_FIXED",
                          code: x.m.codigo,
                          idx: e.target.value === "" ? null : +e.target.value,
                        })
                      }
                    >
                      <option value="">auto</option>
                      {Array.from({ length: fixRange }, (_, ci) => (
                        <option value={String(ci)} key={ci}>
                          {cuatriLabel(cuatriAt(start, ci))}
                        </option>
                      ))}
                    </select>
                    {x.m.horario && x.m.horario.comisiones.length > 1 && (
                      <CommissionSelect
                        size="sm"
                        placeholder="com. auto"
                        aria-label={`Fijar comisión de ${x.m.nombre}`}
                        value={state.fixedCom.get(x.m.codigo) || ""}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_FIXED_COM",
                            code: x.m.codigo,
                            comision: e.target.value || null,
                          })
                        }
                        options={x.m.horario.comisiones.map((c) => ({
                          value: c.comision,
                          label: `com ${c.comision} · ${comModalidad(c)}`,
                        }))}
                      />
                    )}
                    <button
                      type="button"
                      className="rmap-mat__rm"
                      aria-label={`Quitar ${x.m.nombre} del plan`}
                      onClick={() =>
                        dispatch({ type: "PLAN_POOL_REMOVE", code: x.m.codigo })
                      }
                    >
                      <IconClose size={13} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <ReqLine codes={reqs} />

        <div className="rmap-stop__foot">
          <span className="rmap-stop__acc">
            acumulado <b>{acc}</b> cr
          </span>
        </div>

        {locked && (
          <div className="pv-lockcap">
            <span className="pv-lockchip">
              <IconLock size={12} />
              <b>finalizado</b> · el optimizador no lo toca
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/* ---------- panel de minors (tab Minors) ---------- */
function MinorsPanel({
  used,
  approved,
  onOpenDetail,
}: {
  used: { it: PlacedMateria[]; i: number }[];
  approved: Set<string>;
  onOpenDetail: () => void;
}) {
  const rows = useMemo(() => computeMinorRows(used, approved), [used, approved]);

  const completos = rows.filter((r) => r.done);

  return (
    <div className="pv-minors">
      {rows.map(({ minor, cr, done }) => {
        const pct = Math.min(100, Math.round((cr / minor.req) * 100));
        return (
          <div
            key={minor.id}
            className={"pv-minor-row" + (done ? " is-done" : "")}
            style={{ ["--minor-color" as string]: minor.color }}
          >
            <MinorBadge minor={minor} variant="pill" />
            <div className="pv-minor-name">
              {minor.name}
              <span>{minor.short}</span>
            </div>
            <div className="pv-minor-prog">
              <div className="pv-minor-track">
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className={"pv-minor-count" + (done ? " is-done" : "")}>
              {done && <IconCheck size={12} />}
              {cr} / {minor.req} cr
            </div>
          </div>
        );
      })}
      <div className="pv-minors__foot">
        <span className="pv-minors__note">
          {completos.length > 0 ? (
            <>
              Completás <b>{completos.length}</b>{" "}
              {completos.length === 1 ? "minor" : "minors"} con este plan:{" "}
              {completos.map((c) => c.minor.short).join(" · ")}.
            </>
          ) : (
            <>
              Ningún área llega a sus créditos todavía. Agregá electivas
              del área para completarla.
            </>
          )}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onOpenDetail}
        >
          <IconLayers size={13} /> Avance por cuatrimestre
        </button>
      </div>
    </div>
  );
}


/* ---------- recomendaciones de electivas ---------- */
function Recommendations({
  start,
  elecTotal,
  recs,
  onPreview,
  preview,
  onHide,
}: {
  start: PlanStart;
  elecTotal: number;
  recs: Recommendation[];
  onPreview: (code: string | null) => void;
  preview: string | null;
  onHide?: () => void;
}) {
  const ELEC_REQ = elecReq();
  const { dispatch } = usePlanner();

  if (!recs.length) return null;
  // Sin filtros ni texto de ayuda: el panel es la lista y una barra de progreso
  // de créditos electivos (cubiertos / requeridos). El resto va al hover.
  const faltan = Math.max(0, ELEC_REQ - elecTotal);
  const elecPct = Math.min(100, Math.round((elecTotal / ELEC_REQ) * 100));

  // 3 grupos: entran sin alargar el plan · lo alargan · no se pueden ubicar.
  const noExtiende = recs.filter((r) => !r.conflict && !r.addsCuatri);
  const extiende = recs.filter((r) => !r.conflict && r.addsCuatri);
  const noEntra = recs.filter((r) => r.conflict);

  // Chip "sin horario" — aparece en ambas ramas (con o sin conflicto).
  const sigNoHorario = (
    <RecSig
      tone="soft"
      title="Sin horario publicado — no se puede armar la cursada"
    >
      sin horario
    </RecSig>
  );

  // Una fila densa por electiva (RecRow compartida con el Combinador). Señales
  // mínimas para no robarle ancho al nombre: "alarga / no alarga" la da el
  // grupo; los días extra van al tooltip del chip de cuatrimestre.
  const row = (r: Recommendation) => (
    <RecRow
      key={r.m.codigo}
      m={r.m}
      active={preview === r.m.codigo}
      muted={r.conflict || r.noHorario}
      signals={
        r.conflict ? (
          <>
            <RecSig tone="bad">no entra</RecSig>
            {r.noHorario && sigNoHorario}
          </>
        ) : (
          <>
            <RecSig
              tone="when"
              title={
                cuatriName(cuatriAt(start, r.landingIdx)) +
                (r.newDays > 0
                  ? ` · suma ${r.newDays} ${r.newDays === 1 ? "día" : "días"} de campus`
                  : "")
              }
            >
              {cuatriLabel(cuatriAt(start, r.landingIdx))}
            </RecSig>
            {r.noHorario && sigNoHorario}
          </>
        )
      }
      addLabel={`Agregar ${r.m.nombre} al plan`}
      onAdd={() => {
        dispatch({ type: "PLAN_POOL_ADD", code: r.m.codigo });
        onPreview(null);
      }}
      onOpen={() => dispatch({ type: "OPEN_DRAWER", code: r.m.codigo })}
      onHoverStart={() => {
        if (!r.conflict) onPreview(r.m.codigo);
      }}
      onHoverEnd={() => onPreview(null)}
    />
  );

  // Con filas de una línea listar TODO el grupo es viable (el panel lateral ya
  // scrollea solo): se acabaron el corte HEAD y el "ver más".
  const group = (
    title: string,
    hint: string,
    items: Recommendation[],
    tone: "ok" | "warn" | "bad",
    open: boolean,
  ) =>
    items.length > 0 ? (
      <details className={"plan2-recgrp plan2-recgrp--" + tone} open={open}>
        <summary title={hint}>
          <span
            className={"plan2-recgrp__dot plan2-recgrp__dot--" + tone}
            aria-hidden="true"
          />
          <span className="plan2-recgrp__title">{title}</span>
          <span className="plan2-recgrp__count">{items.length}</span>
        </summary>
        <ul className="recrow-list">{items.map(row)}</ul>
      </details>
    ) : null;

  return (
    <div className="plan2-recs">
      <div className="plan2-recs__h">
        <div className="plan2-recs__hrow">
          <span className="plan2-recs__title">Recomendaciones de electivas</span>
          {onHide && (
            <button
              type="button"
              className="plan2-recs__collapse"
              aria-label="Ocultar recomendaciones de electivas"
              title="Ocultar electivas"
              onClick={onHide}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path
                  d="M9.5 6.5 15 12l-5.5 5.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
        <div
          className="plan2-recs__prog"
          role="progressbar"
          aria-label="Créditos electivos"
          aria-valuemin={0}
          aria-valuemax={ELEC_REQ}
          aria-valuenow={Math.min(ELEC_REQ, elecTotal)}
        >
          <span className="plan2-recs__progtxt">
            <b>{elecTotal}</b> / {ELEC_REQ} cr electivos
            {faltan > 0 ? <span> · faltan {faltan}</span> : <span> · cubiertos</span>}
          </span>
          <span className="plan2-recs__progbar" aria-hidden="true">
            <i style={{ width: `${elecPct}%` }} />
          </span>
        </div>
      </div>

      {group(
        "No alargan la carrera",
        "entran en los cuatrimestres del plan actual",
        noExtiende,
        "ok",
        true,
      )}
      {group(
        "Alargan la carrera",
        "suman al menos un cuatrimestre más",
        extiende,
        "warn",
        false,
      )}
      {group(
        "No se pueden ubicar",
        "correlativas, créditos o superposición horaria",
        noEntra,
        "bad",
        false,
      )}
    </div>
  );
}

/* ---------- editor del pool ---------- */
function PlanPool({
  start,
  preview,
  onPreview,
  onDragStart,
  dragging,
  onActed,
  fixRange = 14,
}: {
  start: PlanStart;
  /** cuántos cuatrimestres ofrece el select «fijar en» */
  fixRange?: number;
  preview: string | null;
  onPreview: (code: string | null) => void;
  onDragStart: (code: string, e: React.PointerEvent) => void;
  dragging: string | null;
  /** avisa qué materia tocó el usuario, para que el carrusel la siga */
  onActed: (code: string) => void;
}) {
  const { state, dispatch } = usePlanner();
  const [query, setQuery] = useState("");
  const [suggOpen, setSuggOpen] = useState(false);

  // aprobadas + cursando: ninguna de las dos se ubica en el plan
  const settled = useMemo(
    () => new Set([...state.approved, ...state.cursando]),
    [state.approved, state.cursando],
  );
  // obligatorias pendientes que el usuario quitó del plan: se pueden volver a poner
  const quitadas = useMemo(
    () =>
      remainingOblig(settled)
        .filter((c) => !state.plan.pool.has(c))
        .map((c) => byId.get(c)!)
        .filter(Boolean)
        .sort(planPriority),
    [state.plan.pool, settled],
  );
  const { obs, els } = useMemo(() => {
    const codes = [...state.plan.pool].filter((c) => !settled.has(c));
    const obs = codes
      .filter((c) => !isElectiva(c))
      .map((c) => byId.get(c)!)
      .filter(Boolean)
      .sort(planPriority);
    const els = codes
      .filter(isElectiva)
      .map((c) => byId.get(c)!)
      .filter(Boolean)
      .sort(planPriority);
    return { obs, els };
  }, [state.plan.pool, settled]);

  const cuatriOpts = () => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < fixRange; i++)
      opts.push({ value: String(i), label: cuatriLabel(cuatriAt(start, i)) });
    return opts;
  };

  const matches = useMemo(() => {
    const q = normalizar(query.trim());
    if (!q) return [];
    return PLAN.electivas
      .filter(
        (m) =>
          !state.plan.pool.has(m.codigo) &&
          !settled.has(m.codigo) &&
          normalizar(m.codigo + " " + m.nombre + " " + m.abbr).includes(q),
      )
      .slice(0, 12);
  }, [query, state.plan.pool, settled]);

  // Cada fila previsualiza en los calendarios al pasar el mouse y se arrastra a
  // un cuatrimestre para fijarla ahí (los controles de la fila no arrancan el
  // arrastre).
  const item = (m: MateriaM, removable: boolean) => {
    const fx = state.plan.fixed.get(m.codigo);
    return (
      <div
        className={
          "pool-item" +
          (fx !== undefined ? " is-fixed" : "") +
          (preview === m.codigo ? " is-previewing" : "") +
          (dragging === m.codigo ? " is-dragging" : "")
        }
        key={m.codigo}
        onMouseEnter={() => onPreview(m.codigo)}
        onMouseLeave={() => onPreview(null)}
        onPointerDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("button, select, input, a")) return;
          onDragStart(m.codigo, e);
        }}
      >
        <span className="pab">{m.abbr}</span>
        <span className="pn">
          {m.nombre}
          <span className="pc">{m.codigo}</span>
          {hasHorario(m.codigo) ? null : (
            <span className="pno-hor">sin horario</span>
          )}
        </span>
        {fx !== undefined && <span className="pfix">fijada</span>}
        {m.horario && m.horario.comisiones.length > 1 && (
          <CommissionSelect
            size="sm"
            placeholder="com. auto"
            aria-label={`Fijar comisión de ${m.nombre}`}
            value={state.fixedCom.get(m.codigo) || ""}
            onChange={(e) =>
              dispatch({
                type: "SET_FIXED_COM",
                code: m.codigo,
                comision: e.target.value || null,
              })
            }
            options={m.horario.comisiones.map((c) => ({
              value: c.comision,
              label: `com ${c.comision} · ${comModalidad(c)}`,
            }))}
          />
        )}
        <select
          aria-label={`Fijar cuatrimestre de ${m.nombre}`}
          value={fx === undefined ? "" : String(fx)}
          onChange={(e) => {
            onActed(m.codigo);
            dispatch({
              type: "PLAN_SET_FIXED",
              code: m.codigo,
              idx: e.target.value === "" ? null : +e.target.value,
            });
          }}
        >
          <option value="">auto</option>
          {cuatriOpts().map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {removable && (
          <button
            className="rm"
            aria-label={`Quitar ${m.nombre} del plan`}
            onClick={() =>
              dispatch({ type: "PLAN_POOL_REMOVE", code: m.codigo })
            }
          >
            <IconClose size={12} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="pool-cols">
      <div className="pool-col">
        <div className="pool-h">
          <span className="pool-h__dot pool-h__dot--ob" aria-hidden="true" />
          Obligatorias <i>{obs.length}</i>
        </div>
        <div className="pool-list">
          {obs.length ? (
            obs.map((m) => item(m, true))
          ) : (
            <p className="pool-none">Sin obligatorias pendientes.</p>
          )}
        </div>
        {quitadas.length > 0 && (
          <details className="pool-out">
            <summary className="pool-out__h">
              Quitadas del plan <i>{quitadas.length}</i>
              <button
                type="button"
                className="pool-out__all"
                onClick={(e) => {
                  e.preventDefault();
                  for (const m of quitadas) dispatch({ type: "PLAN_POOL_ADD", code: m.codigo });
                }}
              >
                restablecer todas
              </button>
            </summary>
            <div className="pool-list pool-list--out">
              {quitadas.map((m) => (
                <div className="pool-item pool-item--out" key={m.codigo}>
                  <span className="pab">{m.abbr}</span>
                  <span className="pn">
                    {m.nombre}
                    <span className="pc">{m.codigo}</span>
                  </span>
                  <Tooltip content="Volver a ponerla en el plan" width={150}>
                    <button
                      type="button"
                      className="pool-restore"
                      aria-label={`Restablecer ${m.nombre} en el plan`}
                      onClick={() => dispatch({ type: "PLAN_POOL_ADD", code: m.codigo })}
                    >
                      <IconRotateCcw size={12} /> restablecer
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="pool-col">
        <div className="pool-h">
          <span className="pool-h__dot pool-h__dot--el" aria-hidden="true" />
          Electivas <i>{els.length}</i>
        </div>
        <div className="pool-add">
          <svg className="pool-add__ic" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            type="text"
            id="planPoolSearch"
            placeholder="Agregar electiva por código o nombre…"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggOpen(!!e.target.value.trim());
            }}
            onFocus={() => setSuggOpen(!!query.trim())}
            onBlur={() => setTimeout(() => setSuggOpen(false), 200)}
          />
          {suggOpen && query.trim() && (
            <div className="pool-sugg">
              {matches.length ? (
                matches.map((m) => (
                  <div
                    key={m.codigo}
                    onMouseDown={() => {
                      onActed(m.codigo);
                      dispatch({ type: "PLAN_POOL_ADD", code: m.codigo });
                      setQuery("");
                      setSuggOpen(false);
                    }}
                    onMouseEnter={() => onPreview(m.codigo)}
                    onMouseLeave={() => onPreview(null)}
                  >
                    <span className="sc">{m.codigo}</span>
                    <span className="sn">
                      {m.abbr} — {m.nombre}
                    </span>
                    {hasHorario(m.codigo) ? null : (
                      <span className="muted" style={{ marginLeft: "auto" }}>
                        sin horario
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="muted" style={{ padding: "10px 12px" }}>
                  No hay electivas con «{query.trim()}».
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontSize: "11.5px",
                      color: "var(--faint)",
                    }}
                  >
                    Probá con el código (p. ej. 72.03) o revisá la ortografía.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="pool-list">
          {els.length ? (
            els.map((m) => item(m, true))
          ) : (
            <p className="pool-none">Ninguna electiva agregada todavía.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= */
type PlanTab = "cal" | "road" | "min";

export default function PlanView() {
  const { state, dispatch } = usePlanner();
  const PL = state.plan;
  const approved = state.approved;
  // Para planificar, lo que se está cursando ya está decidido: no se vuelve a
  // ubicar en un cuatrimestre ni cuenta contra los topes, y sus correlativas se
  // dan por cumplidas para lo que sigue. Los créditos acumulados (accNow) y el
  // % de avance siguen contando solo lo aprobado.
  const settled = useMemo(
    () => new Set([...state.approved, ...state.cursando]),
    [state.approved, state.cursando],
  );

  // Tarjeta «en curso»: lo marcado como cursando, con horarios. La comisión
  // es la que el usuario fijó (Combinador); si no fijó ninguna, la que no se
  // pisa con las demás. Va primera en el carrusel, escondida a la izquierda:
  // el plan arranca en el cuatrimestre siguiente y esto es contexto, no algo
  // que se optimice.
  const nowCard = useMemo<PlacedMateria[]>(() => {
    const mats = [...state.cursando]
      .map((code) => byId.get(code))
      .filter((m): m is MateriaM => !!m)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    return assignComs(mats, state.fixedCom);
  }, [state.cursando, state.fixedCom]);
  const [preview, setPreview] = useState<string | null>(null);
  const [minorsOpen, setMinorsOpen] = useState(false);
  const [recsHidden, setRecsHidden] = useState(false);
  // sin límite: el recomendador devuelve TODAS las electivas candidatas, ya
  // rankeadas. Recommendations las agrupa según si alargan o no la carrera.
  // Con el recomendador oculto no computamos nada: corre optimizePlan por
  // ~90 candidatas y nadie consume el resultado.
  //
  // Fuera del camino crítico del primer paint: el cómputo (optimizePlan × ~90)
  // corre sobre valores DIFERIDOS. En el primer render `dHidden` arranca en
  // `true` (initialValue) → recs=[] y el paint no paga la pasada; React reprograma
  // enseguida un render no-urgente con los valores reales y ahí sí computa. En
  // cada cambio de perilla del plan la misma pasada queda diferida (no bloquea la
  // interacción). El resultado es idéntico: mismos inputs, mismo `recommendElectives`.
  const dHidden = useDeferredValue(recsHidden, true);
  const dPL = useDeferredValue(PL);
  const dApproved = useDeferredValue(settled);
  const dFixedCom = useDeferredValue(state.fixedCom);
  const recs = useMemo(
    () =>
      dHidden
        ? []
        : recommendElectives(dPL, dApproved, Infinity, dFixedCom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dHidden,
      dPL.pool,
      dPL.fixed,
      dPL.start,
      dPL.maxCred,
      dPL.maxMat,
      dPL.avoid,
      dPL.method,
      dPL.capCredByIdx,
      dPL.capMatByIdx,
      dApproved,
      dFixedCom,
    ],
  );
  // El recomendador está encendido pero su resultado todavía no alcanzó a los
  // valores actuales (primer paint diferido o recálculo tras mover una perilla):
  // mostramos un placeholder sobrio en el lado en vez de que el panel aparezca de golpe.
  const recsPending =
    !recsHidden &&
    (dHidden !== recsHidden ||
      dPL !== PL ||
      dApproved !== settled ||
      dFixedCom !== state.fixedCom);

  const baseR = useMemo(
    () => optimizePlan(PL, settled, state.fixedCom),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      PL.pool,
      PL.fixed,
      PL.start,
      PL.maxCred,
      PL.maxMat,
      PL.avoid,
      PL.method,
      PL.capCredByIdx,
      PL.capMatByIdx,
      settled,
      state.fixedCom,
    ],
  );

  // La vista previa NO reoptimiza el plan (eso movía todas las tarjetas en cada
  // hover): se calcula dónde entra la materia hoy (`fitsOf`) y se dibujan
  // bloques fantasma en esos calendarios. El resultado efectivo es siempre el
  // comprometido.
  const R = baseR;

  // Con «Evitar superposiciones» encendido, el mismo plan permitiéndolas: si
  // termina antes, el resultado lo ofrece («Con superposiciones: 2.º cuat.
  // 2027 · 1 choque»), con el detalle de cada choque. Con «Evitar
  // superposiciones» apagado, los choques del plan actual.
  const altR = useMemo(
    () => (PL.avoid ? optimizePlan({ ...PL, avoid: false }, settled, state.fixedCom) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      PL.pool,
      PL.fixed,
      PL.start,
      PL.maxCred,
      PL.maxMat,
      PL.avoid,
      PL.method,
      PL.capCredByIdx,
      PL.capMatByIdx,
      settled,
      state.fixedCom,
    ],
  );
  const overlapsNow = useMemo<PlanOverlap[]>(() => (PL.avoid ? [] : planOverlaps(R.items)), [PL.avoid, R]);

  // El primer cuatrimestre que se puede planificar es el que SIGUE al que está
  // en curso (por fecha): lo que se cursa hoy ya está decidido y vive en la
  // tarjeta «en curso» del carrusel, no en el plan.
  const firstPlannable = useMemo(() => nextCuatri(), []);
  const startOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const c = cuatriAt(firstPlannable, i);
      opts.push({ value: c.parity + "-" + c.year, label: cuatriName(c) });
    }
    return opts;
  }, [firstPlannable]);
  // Un inicio guardado que quedó en el pasado (el usuario planificó en otro
  // cuatrimestre) se corre al primero planificable: el select ya no lo ofrece.
  useEffect(() => {
    if (!state.hydrated) return;
    if (compareCuatri(PL.start, firstPlannable) < 0)
      dispatch({ type: "SET_PLAN_START", start: firstPlannable });
  }, [state.hydrated, PL.start, firstPlannable, dispatch]);

  const used = useMemo(
    () => R.items.map((it, i) => ({ it, i })).filter((x) => x.it.length),
    [R],
  );

  // Requisitos sin cursada (Inglés I/II): no se planifican como materia; cada
  // uno se señala en el cuatri donde el plan ubica las obligatorias de su
  // misma etapa nominal (año y cuatrimestre del plan de estudios) — «al
  // llegar acá, tenelo aprobado». Si esa etapa ya quedó atrás, va al primer
  // cuatri planificado; sin ubicación en el plan, al último (para recibirse).
  const reqByIdx = useMemo(() => {
    const map = new Map<number, string[]>();
    if (!used.length) return map;
    const first = used[0].i;
    const last = used[used.length - 1].i;
    for (const code of REQUISITOS) {
      if (approved.has(code)) continue;
      const r = byId.get(code);
      if (!r) continue;
      let due = -1;
      if (r.anio != null) {
        R.items.forEach((its, i) => {
          if (
            its.some(
              (x) =>
                x.m.tipo === "obligatoria" &&
                x.m.anio === r.anio &&
                (r.cuatri == null || x.m.cuatri === r.cuatri),
            )
          )
            due = Math.max(due, i);
        });
        if (due < 0) due = first;
      } else due = last;
      map.set(due, [...(map.get(due) ?? []), code]);
    }
    return map;
  }, [R, used, approved]);

  const previewFit = useMemo(
    () =>
      preview ? fitsOf(preview, R, PL, settled, state.fixedCom, used) : null,
    [preview, R, PL, settled, state.fixedCom, used],
  );

  /* ---- drag & drop entre cuatrimestres (Pointer Events, sin dependencias) ----
   * Origen: un bloque del calendario, un chip asincrónico o una tarjeta de la
   * lista. Se activa recién tras mover 6px (así el click sigue abriendo la
   * ficha). Destino: la tarjeta de cuatri bajo el puntero (elementFromPoint +
   * data-cuatri-idx); válido si `fitsOf` lo admite. Soltar → fija la materia
   * en ese cuatri (y la suma al plan si no estaba). Esc cancela. */
  const [drag, setDrag] = useState<{
    code: string;
    abbr: string;
    color: string;
    x: number;
    y: number;
    over: number | null;
  } | null>(null);
  const dragFit = useMemo(
    () =>
      drag ? fitsOf(drag.code, R, PL, settled, state.fixedCom, used) : null,
    [drag?.code, R, PL, settled, state.fixedCom, used], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dragRef = useRef<{ code: string; x: number; y: number; active: boolean } | null>(null);

  const startDrag = useCallback((code: string, e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const m = byId.get(code);
    if (!m) return;
    const source = e.currentTarget as HTMLElement;
    dragRef.current = { code, x: e.clientX, y: e.clientY, active: false };
    // Autoscroll vertical de la página cerca de los bordes: la lista de materias
    // vive debajo de los calendarios y el arrastre tiene que poder subir hasta
    // ellos sin soltar.
    let last = { x: e.clientX, y: e.clientY };
    let ticker: ReturnType<typeof setInterval> | null = null;
    const hit = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cuatri-idx]");
      return el ? Number(el.dataset.cuatriIdx) : null;
    };
    // Mientras dura el arrastre la pista no encaja (scroll-snap): con snap,
    // cada avance programado volvía a la tarjeta más cercana y el carrusel
    // no recorría nada. La clase la saca `finish`/Escape.
    const trackEl = () => document.querySelector<HTMLElement>(".pv-track");
    const tick = () => {
      const edge = 72;
      const vh = window.innerHeight;
      if (last.y < edge) window.scrollBy(0, -Math.ceil((edge - last.y) / 4));
      else if (last.y > vh - edge) window.scrollBy(0, Math.ceil((last.y - (vh - edge)) / 4));
      // y el carrusel en X: cerca de sus bordes (o más allá) corre la pista de
      // forma continua, así se llega del primer cuatri al último pasando por
      // los del medio (y a la tarjeta «+» del final). La velocidad crece con
      // la cercanía al borde, hasta ~1.400 px/s.
      const track = trackEl();
      if (!track) return;
      const r = track.getBoundingClientRect();
      if (last.y < r.top || last.y > r.bottom) return;
      const side = 96;
      const max = 24;
      let dx = 0;
      if (last.x < r.left + side) dx = -Math.min(max, Math.ceil((r.left + side - last.x) / 4));
      else if (last.x > r.right - side) dx = Math.min(max, Math.ceil((last.x - (r.right - side)) / 4));
      if (!dx) return;
      const before = track.scrollLeft;
      track.scrollLeft = before + dx;
      if (track.scrollLeft === before) return; // tope de la pista
      // la pista se movió bajo el puntero quieto: el cuatri destino cambió
      // aunque no haya pointermove
      const over = hit(last.x, last.y);
      setDrag((d) => (d && d.over !== over ? { ...d, over } : d));
    };
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 6) return;
        d.active = true;
        try {
          source.setPointerCapture(ev.pointerId);
        } catch {
          /* el origen pudo desmontarse: seguimos con los listeners globales */
        }
        trackEl()?.classList.add("is-dragging");
        ticker = setInterval(tick, 16);
        // El click que sigue al pointerup de un arrastre NO es un click: sin
        // esto, soltar sobre un cuatri abría además la ficha de la materia.
        document.addEventListener("click", swallowClick, true);
      }
      ev.preventDefault();
      last = { x: ev.clientX, y: ev.clientY };
      const color =
        (source.style.getPropertyValue("--blk") || "").trim() || PALETTE[0];
      setDrag({
        code,
        abbr: m.abbr,
        color,
        x: ev.clientX,
        y: ev.clientY,
        over: hit(ev.clientX, ev.clientY),
      });
    };
    const stopTicker = () => {
      if (ticker) clearInterval(ticker);
      ticker = null;
      trackEl()?.classList.remove("is-dragging");
    };
    const swallowClick = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const unswallowSoon = () => {
      // el click sintético se despacha justo después del pointerup (misma
      // vuelta de eventos); al siguiente tick ya no hay nada que tragar.
      setTimeout(() => document.removeEventListener("click", swallowClick, true), 0);
    };
    const finish = (ev: PointerEvent, cancel: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      stopTicker();
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      if (!d || !d.active) return;
      unswallowSoon();
      const target = cancel ? null : hit(ev.clientX, ev.clientY);
      setDrag(null);
      // la tarjeta «en curso» (índice -1) no es un destino
      if (target === null || target < 0 || target >= MAX_PLAN_CUATRIS) return;
      // Soltar = fijar: el optimizador ubica una materia fijada "sí o sí" en ese
      // cuatri, así que solo un cuatri finalizado (o el mismo de origen) se
      // rechaza. Si no entra limpia (tope, choque, correlativa) igual se fija:
      // el feedback ámbar ya lo avisó y las observaciones lo detallan.
      if (PL.lockedIdx.has(target)) return;
      if (baseR.items[target]?.some((x) => x.m.codigo === code)) return;
      actedRef.current = code;
      if (!PL.pool.has(code)) dispatch({ type: "PLAN_POOL_ADD", code });
      dispatch({ type: "PLAN_SET_FIXED", code, idx: target });
    };
    const onUp = (ev: PointerEvent) => finish(ev, false);
    const onCancel = (ev: PointerEvent) => finish(ev, true);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        dragRef.current = null;
        stopTicker();
        unswallowSoon();
        setDrag(null);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseR, PL, settled, state.fixedCom, used, dispatch]);

  // Ubicación actual de cada materia (código → índice de cuatri). Cuando cambia
  // —una materia nueva, movida, fijada o soltada— el carrusel corre hasta los
  // cuatris afectados. La vista previa (hover) no toca baseR: no desplaza nada.
  const carouselRef = useRef<CarouselHandle | null>(null);
  const placement = useMemo(() => {
    const map = new Map<string, number>();
    baseR.items.forEach((it, i) => it.forEach((x) => map.set(x.m.codigo, i)));
    return map;
  }, [baseR]);
  const prevPlacement = useRef<Map<string, number> | null>(null);
  // Última materia que el usuario tocó (fijó, soltó, agregó): su cuatri de
  // destino es el prioritario al revelar; los demás cuatris afectados por el
  // reacomodo del optimizador van después.
  const actedRef = useRef<string | null>(null);
  const markActed = useCallback((code: string) => {
    actedRef.current = code;
  }, []);
  useEffect(() => {
    const prev = prevPlacement.current;
    prevPlacement.current = placement;
    if (!prev) return;
    const affected: number[] = [];
    const fresh: number[] = [];
    placement.forEach((idx, code) => {
      if (prev.get(code) === idx) return;
      affected.push(idx);
      if (!prev.has(code)) fresh.push(idx);
    });
    if (!affected.length) return;
    const acted = actedRef.current;
    actedRef.current = null;
    const actedIdx = acted !== null ? placement.get(acted) : undefined;
    const primary =
      actedIdx !== undefined && prev.get(acted!) !== actedIdx
        ? actedIdx
        : fresh.length
          ? Math.min(...fresh)
          : Math.min(...affected);
    const rest = [...new Set(affected)].filter((i) => i !== primary).sort((a, b) => a - b);
    const idxs = [primary, ...rest];
    // Si el cambio se hizo desde otra pestaña (Plan / Minors), el carrusel no
    // está montado: se guarda el pedido y se aplica al volver a Calendario.
    if (carouselRef.current) carouselRef.current.reveal(idxs);
    else pendingReveal.current = idxs;
  }, [placement]);
  const pendingReveal = useRef<number[] | null>(null);

  // Feedback de destino: verde = entra limpia · ámbar = se fija igual pero excede
  // el tope / se pisa / falta correlativa · rojo = finalizado o el mismo cuatri.
  // Índice del cuatrimestre NUEVO que se abre al arrastrar más allá del último:
  // aparece como tarjeta «+» al final del carrusel mientras dura el arrastre.
  const newIdx = (used.length ? used[used.length - 1].i : -1) + 1;
  const newFits = useMemo(() => {
    if (!drag) return false;
    const m = byId.get(drag.code);
    if (!m || newIdx >= MAX_PLAN_CUATRIS) return false;
    const cu = cuatriAt(PL.start, newIdx);
    if (m.parity !== null && m.parity !== cu.parity) return false;
    const before = new Set(settled);
    let acc = approvedCredits(settled);
    baseR.items.forEach((it) =>
      it.forEach((x) => {
        if (x.m.codigo === drag.code) return;
        before.add(x.m.codigo);
        acc += x.m.creditos || 0;
      }),
    );
    if ((m.creditosReq || 0) > acc) return false;
    return (m.correlativas || []).every((c) => before.has(c));
  }, [drag, newIdx, PL.start, settled, baseR]);

  const dropStateOf = (i: number): "can" | "ok" | "warn" | "bad" | null => {
    if (!drag || !dragFit) return null;
    if (i < 0) return drag.over === i ? "bad" : null; // «en curso» no recibe
    if (i === newIdx) {
      if (drag.over === i) return newFits ? "ok" : "warn";
      return newFits ? "can" : null;
    }
    const can = dragFit.idx.has(i);
    const blocked =
      PL.lockedIdx.has(i) || baseR.items[i]?.some((x) => x.m.codigo === drag.code);
    if (drag.over === i) return blocked ? "bad" : can ? "ok" : "warn";
    return can ? "can" : null;
  };

  // Con 0 aprobadas el plan es la carrera entera: no la hacemos protagonista.
  // Siempre se abre en el Calendario (también con la carrera recién empezada
  // y el plan largo): es la vista que muestra la cursada de verdad, y el
  // carrusel permite elegir cuántos cuatrimestres ver a la vez.
  const [tab, setTab] = useState<PlanTab>("cal");

  // Cuatrimestres a la vista en el carrusel (2 por default). Preferencia de
  // pantalla guardada aparte del progreso; se lee tras montar (localStorage).
  const [cols, setCols] = useState<PlanCols>(2);
  useEffect(() => {
    setCols(loadPlanCols());
  }, []);
  const elegirCols = (n: PlanCols) => {
    setCols(n);
    savePlanCols(n);
  };

  useEffect(() => {
    if (tab !== "cal" || !pendingReveal.current) return;
    const idxs = pendingReveal.current;
    pendingReveal.current = null;
    // tras el montaje: esperar un frame para que las tarjetas tengan medidas
    const id = requestAnimationFrame(() => carouselRef.current?.reveal(idxs));
    return () => cancelAnimationFrame(id);
  }, [tab]);



  const flat = R.items.flat();
  const accNow = approvedCredits(approved);
  const lastIdx = used.length ? used[used.length - 1].i : 0;
  const gradCu = cuatriAt(PL.start, lastIdx);
  // selects «fijar en»: hasta un cuatrimestre después del último usado (el
  // plan extiende su horizonte cuando hace falta; MAX_PLAN_CUATRIS es el tope)
  const fixRange = Math.min(MAX_PLAN_CUATRIS, Math.max(14, lastIdx + 2));
  // alternativa permitiendo superposiciones: sólo si termina antes (o ubica más)
  const altHint = useMemo(() => {
    if (!altR) return null;
    let altLast = -1;
    altR.items.forEach((it, i) => {
      if (it.length) altLast = i;
    });
    if (altLast < 0) return null;
    const mejora =
      altR.unplaced.length < R.unplaced.length ||
      (altR.unplaced.length === R.unplaced.length && altLast < lastIdx);
    if (!mejora) return null;
    return { last: altLast, overlaps: planOverlaps(altR.items) };
  }, [altR, R.unplaced.length, lastIdx]);
  // créditos electivos comprometidos (sin el preview) → para el panel de recos
  const elecCommitted =
    electiveCredits(settled) +
    baseR.items
      .flat()
      .filter((x) => x.m.tipo === "electiva")
      .reduce((s, x) => s + (x.m.creditos || 0), 0);
  const elecPlanPct = Math.min(100, Math.round((elecCommitted / elecReq()) * 100));

  // Si la materia previsualizada no entra en ningún cuatrimestre del plan, el
  // recomendador dice dónde caería si el plan se alarga (`landingIdx` más allá
  // del último): se dibuja ahí una tarjeta fantasma de cuatrimestre NUEVO con
  // sus bloques, para que se vea qué significa «alarga la carrera».
  const previewExt = useMemo(() => {
    if (!preview || !previewFit || previewFit.idx.size > 0) return null;
    const m = byId.get(preview);
    if (!m) return null;
    const last = used.length ? used[used.length - 1].i : -1;
    const rec = recs.find((r) => r.m.codigo === preview);
    const idx =
      rec && !rec.conflict && rec.landingIdx > last ? rec.landingIdx : null;
    if (idx === null) return null;
    const { com } = pickComision(m, [], state.fixedCom, PL.avoid);
    const ghosts: WeekBlock[] = [];
    com?.slots.forEach((slot) => {
      if (isAsync(slot) || !DAYS.includes(slot.dia)) return;
      ghosts.push({
        ...slot,
        abbr: m.abbr,
        nombre: m.nombre,
        codigo: m.codigo,
        color: PALETTE[0],
        preview: true,
      });
    });
    return { idx, m, ghosts };
  }, [preview, previewFit, used, recs, state.fixedCom, PL.avoid]);

  // info del preview para el renglón de vista previa: en qué cuatris entra
  const previewInfo = useMemo(() => {
    if (!preview || !previewFit) return null;
    const idxs = [...previewFit.idx].sort((a, b) => a - b);
    return { m: byId.get(preview) ?? null, idxs, ext: previewExt?.idx ?? null };
  }, [preview, previewFit, previewExt]);

  const minorRows = useMemo(() => computeMinorRows(used, settled), [used, settled]);

  // Al pasar el mouse por una materia, el carrusel muestra dónde está (si ya
  // está en el plan) y/o dónde entra. Solo cuando ninguno se ve.
  useEffect(() => {
    if (!preview || !previewFit) return;
    const actual = placement.get(preview);
    const idxs = [...previewFit.idx].sort((a, b) => a - b);
    if (previewExt) idxs.push(previewExt.idx);
    const lista = actual !== undefined ? [actual, ...idxs.filter((i) => i !== actual)] : idxs;
    if (!lista.length) return;
    const id = setTimeout(() => carouselRef.current?.reveal(lista), 120);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, previewFit, previewExt]);

  const warns: string[] = [];
  R.items.forEach((it, i) =>
    it.forEach((x) => {
      if ((x.m.creditosReq || 0) > R.accBefore[i])
        warns.push(
          `${x.m.abbr} · ${x.m.nombre}: requiere ${x.m.creditosReq} créditos pero al inicio de ${cuatriLabel(cuatriAt(PL.start, i))} tenés ${R.accBefore[i]}.`,
        );
      const cu = cuatriAt(PL.start, i);
      if (x.m.parity !== null && x.m.parity !== cu.parity)
        warns.push(
          `${x.m.abbr}: el plan la ubica en ${x.m.cuatri}.º cuatrimestre, pero la fijaste en ${cuatriLabel(cu)}.`,
        );
    }),
  );
  if (R.delayed && R.minLast != null) {
    const idxOf = new Map<string, number>();
    R.items.forEach((it, i) => it.forEach((x) => idxOf.set(x.m.codigo, i)));
    for (const [code, by] of R.delayed) {
      const i = idxOf.get(code);
      if (i === undefined || i <= R.minLast) continue;
      const m = byId.get(code);
      if (!m) continue;
      const donde = by
        .map((b) => `en ${cuatriLabel(cuatriAt(PL.start, b.idx))} con ${b.codes.map(abbrOf).join(", ")}`)
        .join(", ");
      warns.push(
        `${m.abbr} · ${m.nombre}: su comisión se pisa ${donde}; con «Evitar superposiciones» encendido queda en ${cuatriLabel(cuatriAt(PL.start, i))}.`,
      );
    }
  }
  R.unplaced.forEach((m) => {
    const why = R.unplacedWhy?.get(m.codigo);
    let motivo: string;
    if (why?.kind === "correlativa") {
      const fuera = why.codes.filter((c) => !byId.has(c));
      const enPlan = why.codes.filter((c) => byId.has(c) && PL.pool.has(c));
      const faltan = why.codes.filter((c) => byId.has(c) && !PL.pool.has(c));
      const partes: string[] = [];
      if (faltan.length)
        partes.push(
          faltan.length === 1
            ? `necesita ${abbrOf(faltan[0])}: marcala como aprobada o sumala a las materias del plan`
            : `necesita ${faltan.map(abbrOf).join(", ")}: marcalas como aprobadas o sumalas a las materias del plan`,
        );
      if (enPlan.length)
        partes.push(
          `depende de ${enPlan.map(abbrOf).join(", ")}, que tampoco ${enPlan.length === 1 ? "entra" : "entran"}`,
        );
      if (fuera.length)
        partes.push(
          `su correlativa ${fuera.join(", ")} no figura en este plan de estudios`,
        );
      motivo = partes.join("; ");
    } else if (why?.kind === "creditos") {
      motivo = `pide ${why.req} créditos y con lo marcado se juntan ${why.max}: agregá electivas`;
    } else {
      motivo = PL.avoid
        ? "no encontró cuatrimestre (superposiciones o topes): subí los máximos o apagá «Evitar superposiciones»"
        : "no encontró cuatrimestre con lugar: subí el máximo de materias o de créditos";
    }
    warns.push(`${m.abbr} · ${m.nombre}: ${motivo}.`);
  });

  // Los documentos exportados llevan el MISMO calendario que la tarjeta
  // (CursadaCalendar renderizado estático) con su CSS de impresión.
  const renderCalendar: CalendarRenderer = (blocks) =>
    renderStaticHTML(<CursadaCalendar blocks={blocks} days={DAYS} dense />);


  // descarga de UN cuatrimestre desde el menú 3-puntos: «solo calendario»
  // (PDF de una hoja A4, fondo blanco), «imagen» (la misma hoja como PNG),
  // «calendario + programa» y «solo programa» (documentos largos).
  const downloadCuatri = (
    idx: number,
    scope: "cal" | "imagen" | "both" | "programa",
  ) => {
    if (typeof window === "undefined") return;
    if (scope === "imagen") {
      void downloadCuatriPNG(idx);
      return;
    }
    const html = buildPlanHTML({
      result: baseR,
      start: PL.start,
      maxCred: PL.maxCred,
      maxMat: PL.maxMat,
      avoid: PL.avoid,
      approvedCreditsNow: accNow,
      generado: nowStr(),
      autoPrint: true,
      cuatris: [idx],
      includeCalendar: scope !== "programa",
      includeSpecs: scope !== "cal",
      compact: scope === "cal",
      method: PL.method,
      renderCalendar,
      calendarCSS: CURSADA_CALENDAR_PRINT_CSS,
    });
    openForPrint(html);
  };

  // Imagen PNG de un cuatrimestre: la hoja compacta rasterizada a 2x (A4
  // vertical, fondo blanco); si mide más que la página se escala para que
  // entre entera. Sin rasterizador (Safari) cae al PDF.
  const downloadCuatriPNG = async (idx: number) => {
    const placed = baseR.items[idx] ?? [];
    const periodo = cuatriName(cuatriAt(PL.start, idx));
    const { html, css } = buildCuatriSheet({
      placed,
      periodo,
      generado: nowStr(),
      renderCalendar,
      calendarCSS: CURSADA_CALENDAR_PRINT_CSS,
    });
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PLAN_SHEET_W}px;visibility:hidden`;
    probe.innerHTML = `<style>${css}</style>${html}`;
    document.body.appendChild(probe);
    const natural =
      probe.querySelector<HTMLElement>(".sheet")?.scrollHeight ?? PLAN_SHEET_H;
    probe.remove();
    const avail = PLAN_SHEET_H - PLAN_SHEET_PAD * 2;
    const k = Math.min(1, avail / Math.max(1, natural - PLAN_SHEET_PAD * 2));
    const wrapped =
      k < 1
        ? `<div style="transform:scale(${k});transform-origin:top left;width:${PLAN_SHEET_W}px">${html}</div>`
        : html;
    try {
      const blob = await htmlToPngBlob(wrapped, css, {
        width: PLAN_SHEET_W,
        height: PLAN_SHEET_H,
        scale: 2,
      });
      downloadBlob(blob, `plan-${periodo.replace(/[^\w]+/g, "-").toLowerCase()}-cuatris.png`);
    } catch (e) {
      console.warn("No se pudo generar la imagen; se abre el PDF.", e);
      downloadCuatri(idx, "cal");
    }
  };

  // Finalizar un cuatrimestre: `pinnedByLock` lleva los códigos ubicados hoy
  // en ese cuatri según baseR (la única fuente del resultado optimizado) que
  // NO estaban ya fijados por el usuario. El reducer los pinea y los registra
  // en plan.lockPins: al desbloquear libera solo esos, sin pisar los pines
  // manuales previos. No pre-pineamos con PLAN_SET_FIXED — el reducer
  // descartaría de lockPins todo lo ya fijado y el unlock no liberaría nada.
  const finalizeCuatri = (idx: number) => {
    const pinnedByLock = (baseR.items[idx] ?? [])
      .map((x) => x.m.codigo)
      .filter((code) => !PL.fixed.has(code));
    dispatch({ type: "PLAN_TOGGLE_LOCK", idx, pinnedByLock });
  };
  const unlockCuatri = (idx: number) =>
    dispatch({ type: "PLAN_TOGGLE_LOCK", idx });



  // Navegación por teclado del tablist (roving tabindex): flechas con wrap,
  // Home/End. Mueve la selección y el foco al tab elegido.
  const TAB_ORDER: PlanTab[] = ["cal", "road", "min"];
  // radiogroup «Objetivo»: roving tabindex (flechas / Home / End cambian el
  // objetivo y mueven el foco), como las pestañas.
  const onObjetivoKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = OPT_METHODS.map((m) => m.key);
    const cur = keys.indexOf(PL.method);
    let next: number;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (cur + keys.length - 1) % keys.length;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (cur + 1) % keys.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = keys.length - 1;
    else return;
    e.preventDefault();
    dispatch({ type: "SET_PLAN_METHOD", value: keys[next] });
    const radios = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios[next]?.focus();
  };

  const onTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    const cur = TAB_ORDER.indexOf(tab);
    if (e.key === "ArrowLeft") next = (cur + TAB_ORDER.length - 1) % TAB_ORDER.length;
    else if (e.key === "ArrowRight") next = (cur + 1) % TAB_ORDER.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TAB_ORDER.length - 1;
    else return;
    e.preventDefault();
    setTab(TAB_ORDER[next]);
    const tabs = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[next]?.focus();
  };


  const recOn = !recsHidden;

  // Aviso cuando el plan se quedó sin margen: ninguna electiva entra sin alargar
  // la carrera, o hay materias que no se pudieron ubicar. Se muestra abajo a la
  // derecha y se puede cerrar; vuelve si la situación cambia.
  const sinMargen = useMemo(() => {
    if (R.unplaced.length > 0) {
      const kinds = new Set([...(R.unplacedWhy?.values() ?? [])].map((w) => w.kind));
      const fix = kinds.has("sinLugar")
        ? PL.avoid
          ? "subí el máximo de materias o de créditos, o apagá «Evitar superposiciones»."
          : "subí el máximo de materias o de créditos."
        : kinds.has("creditos")
          ? "hacen falta más créditos: agregá electivas."
          : "faltan correlativas: mirá las observaciones.";
      return `${R.unplaced.length} ${R.unplaced.length === 1 ? "materia no entra" : "materias no entran"} en ningún cuatrimestre: ${fix}`;
    }
    if (recOn && !recsPending && recs.length > 0 && !recs.some((r) => !r.conflict && !r.addsCuatri))
      return "Ninguna electiva entra sin alargar la carrera: subí el máximo de materias o de créditos por cuatrimestre.";
    return null;
  }, [R.unplaced.length, R.unplacedWhy, PL.avoid, recOn, recsPending, recs]);
  const [avisoCerrado, setAvisoCerrado] = useState<string | null>(null);
  const aviso = sinMargen && avisoCerrado !== sinMargen ? sinMargen : null;
  const showSide = recOn && recs.length > 0 && tab !== "min";
  // Reserva el lado con un placeholder mientras el recomendador diferido computa
  // (evita el salto solo→split cuando llega el resultado del primer paint).
  const showSidePlaceholder =
    recOn && recsPending && recs.length === 0 && tab !== "min";
  const showPreviewSlot = used.length > 0 && tab !== "min";

  return (
    <section className="view-panel pv">
      {used.length > 0 && (
        <>
          {/* Configuración general: parámetros a la izquierda, resultado a la
              derecha, en un solo panel compacto. Contexto del calendario, no
              protagonista. */}
          <div className="pv-config">
            <div className="pv-bctl" role="group" aria-label="Parámetros del plan">
              <div className="pv-field">
                <label className="pv-field__lbl" htmlFor="pcStart">
                  Empiezo a cursar
                </label>
                <select
                  id="pcStart"
                  className="commission-select"
                  aria-label="Cuatrimestre de inicio"
                  value={PL.start.parity + "-" + PL.start.year}
                  onChange={(e) => {
                    const [p, y] = e.target.value.split("-").map(Number);
                    dispatch({
                      type: "SET_PLAN_START",
                      start: { parity: p, year: y },
                    });
                  }}
                >
                  {startOptions.map((o) => (
                    <option value={o.value} key={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pv-field pv-field--num">
                <NumField
                  id="pcMaxMat"
                  label="Máx. materias"
                  value={PL.maxMat}
                  min={1}
                  max={9}
                  stepper
                  unit="mat."
                  onCommit={(n) =>
                    dispatch({ type: "SET_PLAN_MAXMAT", value: n })
                  }
                />
              </div>

              <div className="pv-field pv-field--num">
                <NumField
                  id="pcMaxCred"
                  label="Máx. créditos"
                  value={PL.maxCred}
                  min={3}
                  max={40}
                  stepper
                  unit="cr"
                  onCommit={(n) =>
                    dispatch({ type: "SET_PLAN_MAXCRED", value: n })
                  }
                />
              </div>

              {/* Objetivo del plan: segmentado de tres, con el elegido
                  desplegado (icono + nombre) y los otros dos como icono con
                  tooltip. Un clic cambia; los tres terminan lo antes posible
                  (el egreso es el objetivo primario de cualquiera) y difieren
                  en cómo reparten la cursada. */}
              <div className="pv-field-group">
                <div className="pv-field pv-field--obj">
                  <span className="pv-field__lbl" id="pcObjLbl">
                    Objetivo
                  </span>
                  <div
                    className="pv-seg pv-seg--obj"
                    role="radiogroup"
                    aria-labelledby="pcObjLbl"
                    onKeyDown={onObjetivoKeyDown}
                  >
                    {OPT_METHODS.map((m: OptMethodMeta) => (
                      <Tooltip
                        key={m.key}
                        width={236}
                        content={
                          <>
                            <b>{m.label}</b> · {m.objetivo}
                          </>
                        }
                      >
                        <button
                          type="button"
                          role="radio"
                          aria-checked={PL.method === m.key}
                          aria-label={m.label}
                          tabIndex={PL.method === m.key ? 0 : -1}
                          className="pv-seg__opt pv-seg__opt--ic"
                          onClick={() =>
                            dispatch({ type: "SET_PLAN_METHOD", value: m.key })
                          }
                        >
                          <MethodIcon method={m.key} size={14} />
                          <span className="pv-seg__txt">{m.label}</span>
                        </button>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                <div className="pv-field pv-field--sw">
                  <Tooltip
                    width={220}
                    content="Con esto encendido, el plan no pone dos materias que se pisen en el mismo cuatrimestre."
                  >
                    <button
                      type="button"
                      className={"cmb-switch" + (PL.avoid ? " on" : "")}
                      role="switch"
                      aria-checked={PL.avoid}
                      onClick={() =>
                        dispatch({ type: "SET_PLAN_AVOID", value: !PL.avoid })
                      }
                    >
                      <span className="cmb-switch__track">
                        <span className="cmb-switch__knob" />
                      </span>
                      Evitar superposiciones
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>

            <div className="pv-result" role="group" aria-label="Resumen del plan">
              <div className="pv-result__grad">
                <IconGraduationCap size={18} />
                <div>
                  <span className="pv-result__lbl">Te recibís en</span>
                  <b className="pv-result__val">{cuatriName(gradCu)}</b>
                  <span className="pv-result__sub">
                    {used.length} {used.length === 1 ? "cuatrimestre" : "cuatrimestres"} ·{" "}
                    {flat.length} materias
                    {R.minLast != null && R.minLast === lastIdx && R.unplaced.length === 0 && (
                      <>
                        {" · "}
                        <Tooltip
                          width={250}
                          content="No hay plan más corto con estas correlativas, requisitos de créditos y topes por cuatrimestre: cualquier objetivo termina acá."
                        >
                          <span className="pv-result__min" tabIndex={0}>
                            mínimo posible
                          </span>
                        </Tooltip>
                      </>
                    )}
                    {overlapsNow.length > 0 && (
                      <>
                        {" · "}
                        <Tooltip
                          width={280}
                          content={
                            <>
                              {overlapsNow.map((o, k) => (
                                <span key={k} style={{ display: "block" }}>
                                  {cuatriLabel(cuatriAt(PL.start, o.idx))}: <b>{o.a.m.abbr}</b> y{" "}
                                  <b>{o.b.m.abbr}</b> ({o.cuando})
                                </span>
                              ))}
                            </>
                          }
                        >
                          <span className="pv-result__min pv-result__min--warn" tabIndex={0}>
                            {overlapsNow.length}{" "}
                            {overlapsNow.length === 1 ? "superposición" : "superposiciones"}
                          </span>
                        </Tooltip>
                      </>
                    )}
                  </span>
                  {altHint && (
                    <Tooltip
                      width={300}
                      content={
                        <>
                          Permitiendo superposiciones el plan termina en{" "}
                          <b>{cuatriName(cuatriAt(PL.start, altHint.last))}</b>:
                          {altHint.overlaps.map((o, k) => (
                            <span key={k} style={{ display: "block" }}>
                              {cuatriLabel(cuatriAt(PL.start, o.idx))}: <b>{o.a.m.abbr}</b> y{" "}
                              <b>{o.b.m.abbr}</b> ({o.cuando})
                            </span>
                          ))}
                          Clic para apagar «Evitar superposiciones».
                        </>
                      }
                    >
                      <button
                        type="button"
                        className="pv-result__alt"
                        onClick={() => dispatch({ type: "SET_PLAN_AVOID", value: false })}
                      >
                        Con superposiciones: <b>{cuatriLabel(cuatriAt(PL.start, altHint.last))}</b> ·{" "}
                        {altHint.overlaps.length}{" "}
                        {altHint.overlaps.length === 1 ? "choque" : "choques"}
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
              {/* Todo lo de este bloque es AL FINAL DEL PLAN (igual que «Te
                  recibís en»): créditos electivos que junta el plan sobre los
                  que pide el título, y los minors con lo aprobado más lo
                  planificado. El «hoy» vive en la barra de métricas de arriba. */}
              <div className="pv-result__cred">
                <span className="pv-strip__when">Al final del plan</span>
                <span className="pv-strip__item">
                  <span className="pv-strip__lbl" id="pvCredLbl">
                    Electivos
                  </span>
                  <span>
                    <b>{Math.min(elecCommitted, elecReq())}</b> / {elecReq()} cr
                  </span>
                  <span
                    className="pv-strip__bar"
                    role="progressbar"
                    aria-labelledby="pvCredLbl"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={elecPlanPct}
                  >
                    <i style={{ width: `${elecPlanPct}%` }} />
                  </span>
                  <span className={"pv-strip__pct" + (elecCommitted >= elecReq() ? " is-ok" : "")}>
                    {elecCommitted >= elecReq() ? "cubiertos" : `faltan ${elecReq() - elecCommitted}`}
                  </span>
                </span>
                <span className="pv-strip__minors" role="group" aria-label="Progreso de minors">
                  {minorRows.map(({ minor, cr, done }) => (
                    <Tooltip key={minor.id} width={200} content={`${minor.name}: ${cr} de ${minor.req} créditos`}>
                      <span
                        className={"pv-strip__minor" + (done ? " is-done" : "")}
                        style={{ ["--minor-color" as string]: minor.color }}
                        tabIndex={-1}
                      >
                        <MinorBadge minor={minor} variant="pill" />
                        <span className="pv-strip__mbar" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, (cr / minor.req) * 100)}%` }} />
                        </span>
                        {done ? <IconCheck size={11} /> : null}
                        {cr}/{minor.req}
                      </span>
                    </Tooltip>
                  ))}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {used.length > 0 && (
        <div className="pv-tabs">
          <div
            className="pv-tablist"
            role="tablist"
            aria-label="Vistas del plan"
            onKeyDown={onTablistKeyDown}
          >
            <button
              type="button"
              role="tab"
              className="pv-tab"
              aria-selected={tab === "cal"}
              tabIndex={tab === "cal" ? 0 : -1}
              onClick={() => setTab("cal")}
            >
              <IconCalendar size={15} /> Calendario
            </button>
            <button
              type="button"
              role="tab"
              className="pv-tab"
              aria-selected={tab === "road"}
              tabIndex={tab === "road" ? 0 : -1}
              onClick={() => setTab("road")}
            >
              <IconRoute size={15} /> Plan
            </button>
            <button
              type="button"
              role="tab"
              className="pv-tab"
              aria-selected={tab === "min"}
              tabIndex={tab === "min" ? 0 : -1}
              onClick={() => setTab("min")}
            >
              <IconLayers size={15} /> Minors
            </button>
          </div>

          {/* Vista previa (hover sobre una materia de la lista): va en la misma
              fila que las pestañas, en el hueco del medio, así no pisa la barra
              ni la primera tarjeta ni mueve el tablero. */}
          {showPreviewSlot && (
          <div
            className={
              "plan2-preview-slot" +
              (previewInfo && previewInfo.m ? " is-on" : "")
            }
            aria-live="polite"
          >
            <span className="plan2-preview-slot__hint" aria-hidden="true" />
            {previewInfo && previewInfo.m && (
              <span className="plan2-preview-slot__msg">
                <span className="plan2-preview-banner__dot" aria-hidden="true" />
                <span>
                  Vista previa: <b>{previewInfo.m.abbr}</b>{" "}
                  {previewInfo.idxs.length > 0 ? (
                    <>
                      entra en{" "}
                      <b>
                        {previewInfo.idxs
                          .map((i) => cuatriLabel(cuatriAt(PL.start, i)))
                          .join(" · ")}
                      </b>
                    </>
                  ) : previewInfo.ext !== null ? (
                    <>
                      no entra en el plan actual: abre un cuatrimestre nuevo en{" "}
                      <b>{cuatriLabel(cuatriAt(PL.start, previewInfo.ext))}</b>{" "}
                      (alarga la carrera)
                    </>
                  ) : (
                    "no entra en ningún cuatrimestre del plan (correlativas, créditos, tope o superposición)"
                  )}
                </span>
              </span>
            )}
          </div>
        )}

          <div className="pv-tabs__actions">
            {tab === "cal" && (
              <Tooltip content="Cuántos cuatrimestres se ven a la vez en el carrusel" width={190}>
                <div
                  className="pv-seg pv-seg--cols"
                  role="group"
                  aria-label="Cuatrimestres a la vista"
                >
                  {([2, 3, 4] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="pv-seg__opt"
                      aria-pressed={cols === n}
                      aria-label={`${n} cuatrimestres a la vista`}
                      onClick={() => elegirCols(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Tooltip>
            )}
            <button
              type="button"
              className="pv-rec-toggle"
              role="switch"
              aria-checked={recOn}
              aria-label="Recomendador de electivas"
              onClick={() => setRecsHidden((v) => !v)}
            >
              Recomendador
              <span className="pv-switch" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}


      {used.length === 0 ? (
        <div className="plan2-board">
          <div className="plan2-empty">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M12 3 2 8l10 5 10-5-10-5Z" />
              <path d="M6 10.5V16c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-5.5M22 8v5" />
            </svg>
            <p>Agregá materias al plan para ver tu camino a recibirte.</p>
          </div>
        </div>
      ) : (
        tab === "min" ? (
          <MinorsPanel
            used={used}
            approved={settled}
            onOpenDetail={() => setMinorsOpen(true)}
          />
        ) : (
          <div
            className={
              "plan2-split" +
              (!showSide && !showSidePlaceholder ? " plan2-split--solo" : "")
            }
          >
            <div className="plan2-split__main">
              {tab === "cal" && (
                <Carousel
                  count={
                    used.length +
                    (nowCard.length ? 1 : 0) +
                    (previewExt || drag ? 1 : 0)
                  }
                  cols={cols}
                  handle={carouselRef}
                  leadHidden={nowCard.length > 0}
                >
                  {nowCard.length > 0 && (
                    <NowCard it={nowCard} cu={currentCuatri()} drop={dropStateOf(-1)} />
                  )}
                  {used.map(({ it, i }, k) => (
                    <SemCard
                      key={i}
                      it={it}
                      i={i}
                      orden={k}
                      start={PL.start}
                      ghosts={previewFit?.ghosts.get(i) ?? EMPTY_BLOCKS}
                      isPreview={previewFit?.idx.has(i) ?? false}
                      dragging={drag?.code ?? null}
                      drop={dropStateOf(i)}
                      onDragStart={startDrag}
                      maxCred={PL.maxCred}
                      maxMat={PL.maxMat}
                      locked={PL.lockedIdx.has(i)}
                      onFinalize={finalizeCuatri}
                      onUnlock={unlockCuatri}
                      onDownload={downloadCuatri}
                      reqs={reqByIdx.get(i)}
                      fixRange={fixRange}
                    />
                  ))}
                  {previewExt && (
                    <GhostCard
                      idx={previewExt.idx}
                      cu={cuatriAt(PL.start, previewExt.idx)}
                      ghosts={previewExt.ghosts}
                      abbr={previewExt.m.abbr}
                    />
                  )}
                  {drag && !previewExt && (
                    <NewCard
                      idx={newIdx}
                      cu={cuatriAt(PL.start, newIdx)}
                      drop={dropStateOf(newIdx)}
                    />
                  )}
                </Carousel>
              )}

              {tab === "road" && (
                <ol className="rmap">
                  {used.map(({ it, i }, k) => (
                    <RoadmapStop
                      key={i}
                      it={it}
                      i={i}
                      orden={k}
                      start={PL.start}
                      accBefore={R.accBefore}
                      maxCred={PL.maxCred}
                      maxMat={PL.maxMat}
                      previewCode={preview}
                      recOn={recOn}
                      locked={PL.lockedIdx.has(i)}
                      onUnlock={unlockCuatri}
                      reqs={reqByIdx.get(i)}
                    />
                  ))}
                </ol>
              )}
            </div>

            {showSide ? (
              <aside className="plan2-split__side">
                <Recommendations
                  start={PL.start}
                  elecTotal={elecCommitted}
                  recs={recs}
                  onPreview={setPreview}
                  preview={preview}
                  onHide={() => setRecsHidden(true)}
                />
              </aside>
            ) : showSidePlaceholder ? (
              <aside className="plan2-split__side" aria-hidden="true">
                <div className="plan2-recs">
                  <div className="plan2-recs__h">
                    <span className="plan2-recs__title">
                      Recomendaciones de electivas
                    </span>
                  </div>
                  <span className="plan2-recs__sub">
                    Buscando las electivas que mejor encajan en tu plan…
                  </span>
                </div>
              </aside>
            ) : null}
          </div>
        )
      )}

      {/* "Cómo se armó este plan": la nota detallada del método, plegada y
          discreta (el objetivo se elige arriba, junto a los parámetros). */}
      {used.length > 0 && (
        <div className="plan2-opt">
          <details className="plan2-optnote-d">
            <summary>Cómo se armó este plan</summary>
            <p className="plan2-method">{methodText(R, PL, lastIdx)}</p>
          </details>
        </div>
      )}

      {/* Observaciones plegadas por default: el contador del summary ya dice
          cuántas hay; el detalle se abre a demanda. */}
      {warns.length > 0 && (
        <details className="plan2-warns">
          <summary className="plan2-warns__h">
            Observaciones <i>{warns.length}</i>
          </summary>
          {warns.map((w, i) => (
            <div className="plan2-warn" key={i}>
              {w}
            </div>
          ))}
        </details>
      )}

      <details className="plan2-pool" id="planPool" open>
        <summary>
          <span className="plan2-pool__title">Materias del plan</span>
        </summary>
        <PlanPool
          start={PL.start}
          preview={preview}
          onPreview={setPreview}
          onDragStart={startDrag}
          dragging={drag?.code ?? null}
          onActed={markActed}
          fixRange={fixRange}
        />
      </details>

      {/* portaleado en <body>: .view-panel lleva transform y rompería el fixed */}
      {aviso &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="planner pv-toast" role="status">
            <IconWarnTri size={16} />
            <span>{aviso}</span>
            <button
              type="button"
              className="pv-toast__x"
              aria-label="Cerrar el aviso"
              onClick={() => setAvisoCerrado(aviso)}
            >
              <IconClose size={12} />
            </button>
          </div>,
          document.body,
        )}

      {/* fantasma que sigue al puntero durante el arrastre */}
      {drag &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="planner pv-dragghost"
            style={
              {
                left: drag.x,
                top: drag.y,
                "--blk": drag.color,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            {drag.abbr}
          </div>,
          document.body,
        )}

      {minorsOpen && (
        <MinorsModal
          used={used}
          start={PL.start}
          approved={settled}
          onClose={() => setMinorsOpen(false)}
        />
      )}


    </section>
  );
}
