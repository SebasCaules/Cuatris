"use client";

import "@/components/planner/combinador.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlanner } from "@/components/planner/state";
import {
  PLAN,
  byId,
  credOf,
  isElectiva,
  hasHorario,
  PALETTE,
  DAYS,
  DAYS6,
} from "@/lib/planner/model";
import { comModalidad, isAsync, slotsConflict, toMin } from "@/lib/planner/time";
import { generateCombos } from "@/lib/planner/combos";
import {
  optimizePlan,
  nextCuatriCodes,
  cuatriAt,
  cuatriLabel,
  cuatriName,
} from "@/lib/planner/optimize";
import { MAX_PLAN_CUATRIS } from "@/lib/planner/consts";
import { buildComboHTML } from "@/lib/planner/exportPlan";
import { openForPrint } from "@/lib/planner/download";
import { Legend } from "@/components/planner/WeekGrid";
import CursadaCalendar from "@/components/planner/CursadaCalendar";
import { RecRow, RecSig } from "@/components/planner/RecRow";
import {
  IconDownload,
  IconCalendar,
  IconFileText,
  IconLayers,
  IconCompactPage,
} from "@/components/planner/icons";
import { CommissionSelect } from "@studyvaults/ui";
import type { LegendEntry } from "@/components/planner/WeekGrid";
import type {
  Comision,
  Materia,
  MateriaM,
  PlacedMateria,
  Slot,
  WeekBlock,
} from "@/lib/planner/types";

interface AsyncChip extends Slot {
  abbr: string;
  color: string;
}

const MODAL_KEYS = ["Presencial", "Virtual", "Blended"] as const;
/** Período que se estampa en el documento exportado. */
const PERIODO = "2.º cuatrimestre 2026";
/** Tope de sugerencias que muestra el recomendador slim (panel angosto). */
const SUGGEST_LIMIT = 14;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Etiqueta del año de cursada (para sub-agrupar las obligatorias en el picker).
 *  Ordinales en español: 1.er / 3.er año; 2.º / 4.º / 5.º año. */
const anioLabel = (a: number) =>
  `${a === 1 || a === 3 ? `${a}.er` : `${a}.º`} año`;

/** Fecha legible para el pie del documento exportado. */
function nowStr(): string {
  try {
    return new Date().toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Tooltip nativo con el horario completo de una comisión (día · franja). */
function comTitle(c: Comision): string {
  const slots = c.slots
    .filter((s) => !isAsync(s))
    .map((s) => `${s.dia.slice(0, 3)} ${s.desde}–${s.hasta}`)
    .join(" · ");
  const mod = comModalidad(c);
  return [mod, slots].filter(Boolean).join(" — ") || `com ${c.comision}`;
}

/** Métricas de una cursada (combo): días con clase, franja, horas semanales.
 *  Se usan para ORDENAR las opciones (la más compacta primero) y para los
 *  stat-tiles de la opción activa. */
function comboMetrics(placed: PlacedMateria[]) {
  const days = new Set<string>();
  let totalMin = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const x of placed) {
    for (const s of x.com?.slots || []) {
      if (isAsync(s) || !DAYS.includes(s.dia)) continue;
      days.add(s.dia);
      totalMin += toMin(s.hasta) - toMin(s.desde);
      minStart = Math.min(minStart, toMin(s.desde));
      maxEnd = Math.max(maxEnd, toMin(s.hasta));
    }
  }
  return {
    dias: days.size,
    horas: Math.round((totalMin / 60) * 10) / 10,
    minStart: minStart === Infinity ? 0 : minStart,
    maxEnd: maxEnd === -Infinity ? 0 : maxEnd,
    rango: minStart === Infinity ? "—" : `${hhmm(minStart)}–${hhmm(maxEnd)}`,
  };
}

/** Info-tooltip inline (hover/focus): un botón "i" con una caja explicativa.
 *  CSS-only (visible con :hover / :focus-within) → static-export safe. */
function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <span className="cmb9-tip">
      <button
        type="button"
        className="cmb9-tip__btn"
        aria-label={label ?? "Más información"}
      >
        i
      </button>
      <span className="cmb9-tip__box" role="tooltip">
        {text}
      </span>
    </span>
  );
}

/**
 * Armá tu cuatrimestre — combinador con el rediseño del Módulo E: un header
 * compacto (chips de materia + preferencias de cursada) con el cluster de
 * acciones fijo a la derecha (Sugeridas · Descargar · Sumar a mi plan), y
 * el calendario semanal a todo el ancho como protagonista. El recomendador es
 * un panel slim, colapsable, pegado al borde derecho del calendario: sugiere
 * CUALQUIER materia (obligatoria o electiva) que todavía te entre en la semana,
 * en filas de una sola línea. Las opciones se ordenan de la más compacta (menos
 * días en el campus) a la menos, así la primera ya es una buena cursada.
 */
export default function CombinadorView() {
  const { state, dispatch } = usePlanner();
  const { combo, fixedCom, comboParams, comboSolo } = state;

  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(true);
  const [dlOpen, setDlOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  // confirmación liviana de la re-siembra (pisa la selección actual del combo)
  const [reseedAsk, setReseedAsk] = useState(false);
  // destino al guardar: null = sin tocar (defaultea al PRÓXIMO cuatrimestre —
  // la cursada que armás acá es para ese); "" = Auto elegido explícitamente.
  const [saveIdx, setSaveIdx] = useState<string | null>(null);
  const dlRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLDivElement>(null);
  // destino de "Ver semana" del resumen sticky: lleva la grilla al viewport
  // cuando el picker abierto la empujó bajo el pliegue.
  const bodyRef = useRef<HTMLDivElement>(null);

  // ---------- materias combinables ----------
  const pool = useMemo(() => {
    // «Solo combinar» ignora el progreso: ofrece también las ya aprobadas
    const ok = (m: Materia) =>
      hasHorario(m.codigo) &&
      (state.comboSolo || !state.approved.has(m.codigo));
    const obs = PLAN.obligatorias
      .filter(ok)
      .map((m) => byId.get(m.codigo)!)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    const els = PLAN.electivas
      .filter(ok)
      .map((m) => byId.get(m.codigo)!)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    return { obs, els };
  }, [state.approved, state.comboSolo]);

  const filtered = useMemo(() => {
    const needle = norm(q.trim());
    const match = (m: MateriaM) =>
      !needle || norm(`${m.codigo} ${m.nombre} ${m.abbr}`).includes(needle);
    return { obs: pool.obs.filter(match), els: pool.els.filter(match) };
  }, [pool, q]);

  // Obligatorias sub-agrupadas por (año, cuatrimestre): un sub-grupo por combo
  // año-cuatri, ordenados 1.º año→5.º y, dentro, 1.º cuatri→2.º. Las materias sin
  // año o sin cuatri caen a «Otras» al final. Sub-dividir por cuatri hace el
  // listado (~41 troncales con horario) escaneable como el Plan por cuatrimestre.
  const obsGroups = useMemo(() => {
    const groups = new Map<
      string,
      { anio: number; cuatri: number; mats: MateriaM[] }
    >();
    const otras: MateriaM[] = [];
    for (const m of filtered.obs) {
      if (m.anio == null || m.cuatri == null) {
        otras.push(m);
        continue;
      }
      const key = `${m.anio}-${m.cuatri}`;
      const g = groups.get(key);
      if (g) g.mats.push(m);
      else groups.set(key, { anio: m.anio, cuatri: m.cuatri, mats: [m] });
    }
    return {
      ordered: [...groups.values()].sort(
        (a, b) => a.anio - b.anio || a.cuatri - b.cuatri,
      ),
      otras,
    };
  }, [filtered.obs]);

  // Electivas ordenadas por NOMBRE (en un picker se busca por nombre, no por código).
  const elsByName = useMemo(
    () =>
      [...filtered.els].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [filtered.els],
  );

  // Aprobadas CON horario que hoy no aparecen en el picker (modo normal): alimenta
  // el hint de descubribilidad del switch «Ignorar mi progreso».
  const hiddenApproved = useMemo(
    () => [...state.approved].filter(hasHorario).length,
    [state.approved],
  );

  // Búsqueda honesta: materias DEL PLAN que matchean el texto pero todavía no
  // tienen horario cargado. No son combinables (van atenuadas y no-agregables),
  // pero se muestran para no dar la falsa señal de que no existen.
  const ghostMatches = useMemo(() => {
    const needle = norm(q.trim());
    if (!needle) return [];
    return [...PLAN.obligatorias, ...PLAN.electivas]
      .filter(
        (m) =>
          !hasHorario(m.codigo) &&
          (state.comboSolo || !state.approved.has(m.codigo)) &&
          norm(`${m.codigo} ${m.nombre} ${m.abbr}`).includes(needle),
      )
      .map((m) => byId.get(m.codigo)!)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [q, state.comboSolo, state.approved]);

  // Selección EFECTIVA del combo: en modo normal, las aprobadas que hayan
  // entrado vía «Solo combinar» quedan latentes (no se combinan, no se
  // muestran, no se guardan — así el guardado al plan nunca es parcial en
  // silencio) y reaparecen al reactivar el modo. No se borran del set.
  const comboEff = useMemo(
    () =>
      new Set(
        [...combo].filter((c) => comboSolo || !state.approved.has(c)),
      ),
    [combo, comboSolo, state.approved],
  );

  // selección, ordenada por código (igual que generateCombos → colores alineados)
  const selected = useMemo(
    () =>
      [...comboEff]
        .filter(hasHorario)
        .sort()
        .map((c) => byId.get(c)!),
    [comboEff],
  );
  const cred = selected.reduce((s, m) => s + (m.creditos || 0), 0);
  const elc = selected
    .filter((m) => isElectiva(m.codigo))
    .reduce((s, m) => s + credOf(m.codigo), 0);
  // ¿alguna materia elegida tiene más de una comisión? → hay selector de comisión
  // en juego, así que mostramos la nota "Comisión: Auto" con su tooltip.
  const hasComChoice = selected.some(
    (m) => (m.horario?.comisiones?.length || 0) > 1,
  );

  // ---------- generación automática ----------
  const result = useMemo(
    () =>
      comboEff.size ? generateCombos(comboEff, fixedCom, comboParams) : null,
    [comboEff, fixedCom, comboParams],
  );

  // Opciones ordenadas: menos días en el campus › termina más temprano › menos
  // horas › orden original. Así la opción 1 ya es una cursada compacta.
  const ranked = useMemo(() => {
    if (!result) return [];
    return result.combos
      .map((c, i) => ({ c, m: comboMetrics(c), i }))
      .sort(
        (a, b) =>
          a.m.dias - b.m.dias ||
          a.m.maxEnd - b.m.maxEnd ||
          a.m.horas - b.m.horas ||
          a.i - b.i,
      )
      .map((x) => x.c);
  }, [result]);

  useEffect(() => {
    setIdx(0);
  }, [ranked]);

  const total = ranked.length;
  const safeIdx = total ? Math.min(idx, total - 1) : 0;

  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + total) % total);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // cerrar los popovers del header (Descargar / Guardar) al click afuera o Escape
  useEffect(() => {
    if (!dlOpen && !saveOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (dlOpen && dlRef.current && !dlRef.current.contains(e.target as Node))
        setDlOpen(false);
      if (
        saveOpen &&
        saveRef.current &&
        !saveRef.current.contains(e.target as Node)
      )
        setSaveOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDlOpen(false);
        setSaveOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [dlOpen, saveOpen]);

  // ---------- grilla de la opción actual ----------
  const grid = useMemo(() => {
    const current = ranked[safeIdx];
    if (!current) return null;
    const blocks: WeekBlock[] = [];
    const asyncs: AsyncChip[] = [];
    const seenB = new Set<string>();
    const entries: LegendEntry[] = [];
    current.forEach((x, i) => {
      const color = PALETTE[i % PALETTE.length];
      const com = x.com;
      entries.push({
        abbr: x.m.abbr,
        nombre: `${x.m.nombre} (com ${com ? com.comision : "—"})`,
        color,
      });
      (com?.slots || []).forEach((s) => {
        const key = x.m.codigo + s.dia + s.desde + s.hasta;
        if (isAsync(s) || !DAYS6.includes(s.dia)) {
          asyncs.push({ ...s, abbr: x.m.abbr, color });
        } else {
          if (seenB.has(key)) return;
          seenB.add(key);
          // codigo permite que el bloque sea clickeable (abre el drawer de specs)
          blocks.push({
            ...s,
            abbr: x.m.abbr,
            nombre: x.m.nombre,
            color,
            codigo: x.m.codigo,
          });
        }
      });
    });
    blocks.forEach((a) => {
      a.conf = blocks.some((b) => b !== a && slotsConflict(a, b));
    });
    return { blocks, asyncs, entries };
  }, [ranked, safeIdx]);

  // ---------- insights de la cursada actual ----------
  const insights = useMemo(() => {
    const current = ranked[safeIdx];
    if (!current) return null;
    const m = comboMetrics(current);
    if (!grid || !grid.blocks.length) return null;
    return m;
  }, [ranked, safeIdx, grid]);

  // La opción 1 es, por el orden, la más compacta (menos días en el campus).
  const isCompact = total > 1 && insights != null && safeIdx === 0;

  // ---------- recomendador de CUALQUIER materia (obligatoria o electiva) ----------
  // Sugiere materias con horario que todavía no elegiste, priorizando las que
  // ENTRAN en tu semana actual sin pisarse con la opción activa. El "+" las suma
  // directo a tu cuatrimestre (combo). Barato: para cada candidata chequea si
  // alguna de sus comisiones no choca con los bloques de la opción en pantalla.
  const suggestions = useMemo(() => {
    const blocks = grid?.blocks ?? [];
    const cand = [...pool.obs, ...pool.els].filter((m) => !combo.has(m.codigo));
    const fits = (m: MateriaM): boolean => {
      const coms = m.horario?.comisiones ?? [];
      if (!coms.length || !blocks.length) return true;
      return coms.some((c) =>
        c.slots
          .filter((s) => !isAsync(s) && DAYS6.includes(s.dia))
          .every((s) => !blocks.some((b) => slotsConflict(s, b))),
      );
    };
    return cand
      .map((m) => ({ m, fit: fits(m) }))
      .sort(
        // entra en la semana › TRONCAL antes que electiva (lo obligatorio
        // manda) › más créditos › código.
        (a, b) =>
          (a.fit === b.fit ? 0 : a.fit ? -1 : 1) ||
          (a.m.tipo === b.m.tipo ? 0 : a.m.tipo === "obligatoria" ? -1 : 1) ||
          (b.m.creditos || 0) - (a.m.creditos || 0) ||
          a.m.codigo.localeCompare(b.m.codigo),
      )
      .slice(0, SUGGEST_LIMIT);
  }, [pool, combo, grid]);

  // Plan base (para poblar el dropdown de "Guardar en el cuatrimestre X"): sabe
  // cuántos cuatrimestres usa el plan hoy → ofrecemos esos + uno nuevo.
  const PL = state.plan;
  const cuatriOptions = useMemo(() => {
    const base = optimizePlan(PL, state.approved, state.fixedCom);
    let maxUsed = -1;
    base.items.forEach((it, i) => {
      if (it.length) maxUsed = i;
    });
    const upto = Math.min(Math.max(maxUsed + 1, 2), MAX_PLAN_CUATRIS - 1);
    const opts: { value: string; label: string; title: string }[] = [];
    for (let i = 0; i <= upto; i++) {
      // los cuatrimestres finalizados (candado en el Plan) no son destino válido
      if (PL.lockedIdx.has(i)) continue;
      const c = cuatriAt(PL.start, i);
      opts.push({ value: String(i), label: cuatriName(c), title: cuatriLabel(c) });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    PL.pool,
    PL.fixed,
    PL.start,
    PL.maxCred,
    PL.maxMat,
    PL.avoid,
    PL.method,
    PL.capCredByIdx,
    PL.capMatByIdx,
    PL.lockedIdx,
    state.approved,
    state.fixedCom,
  ]);

  // destino efectivo: lo elegido, si sigue ofreciéndose; sin tocar (o si el
  // elegido se lockeó en el Plan) cae al PRÓXIMO cuatrimestre disponible.
  // "Auto" ("") solo si el usuario lo eligió explícitamente — guardar con Auto
  // deja que el optimizador desparrame la combinación entre cuatrimestres, que
  // casi nunca es lo que se espera al guardar "esta cursada".
  const safeSaveIdx =
    saveIdx !== null &&
    (saveIdx === "" || cuatriOptions.some((o) => o.value === saveIdx))
      ? saveIdx
      : (cuatriOptions[0]?.value ?? "");

  // ---------- siembra del combinador desde el plan ----------
  // Códigos que el plan ubica en el PRÓXIMO cuatrimestre: la cursada que armás
  // acá es para ese cuatrimestre, así que la selección arranca desde ahí en vez
  // de vacía. Mismo dep-set que `cuatriOptions` (lo que lee optimizePlan).
  const nextSeed = useMemo(
    () => nextCuatriCodes(PL, state.approved, state.fixedCom),
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
      PL.lockedIdx,
      state.approved,
      state.fixedCom,
    ],
  );

  // Siembra automática una sola vez por montaje (post-hidratación, static-export
  // safe): si el combinador arranca vacío y el plan tiene materias, precargamos
  // el próximo cuatrimestre. El ref evita re-sembrar cuando el usuario vacía la
  // selección a propósito (Vaciar dejaría el combo vacío y re-dispararía).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!state.hydrated || seededRef.current) return;
    seededRef.current = true;
    if (combo.size === 0 && nextSeed.length > 0)
      dispatch({ type: "SEED_COMBO", codes: nextSeed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hydrated]);

  // Re-siembra a demanda: pisa la selección actual con el próximo cuatrimestre
  // del plan. Con materias ya elegidas pide confirmación liviana antes de pisar.
  const reseedFromPlan = () => {
    if (nextSeed.length > 0) dispatch({ type: "SEED_COMBO", codes: nextSeed });
    setReseedAsk(false);
  };

  const noResults =
    filtered.obs.length === 0 &&
    filtered.els.length === 0 &&
    ghostMatches.length === 0;
  const showPicker = pickerOpen || selected.length === 0;
  const canExport = total > 0 && Boolean(ranked[safeIdx]);

  // ---------- diagnóstico de "sin solución": ¿la culpa es la modalidad? ----------
  // Espejo del filtro de comisionesFor (comisión fija → modalidad) SIN su fallback:
  // si con las pills activas alguna materia elegida se queda sin ninguna comisión,
  // o si las 3 pills están apagadas, el nudo a desatar es la modalidad —no la
  // superposición— y hay que ofrecer re-encender modalidades, no permitir pisadas.
  const modalPass = (c: Comision) => {
    const cm = comModalidad(c);
    return (
      cm === "Asincrónico" ||
      comboParams.modal[cm as keyof typeof comboParams.modal] !== false
    );
  };
  const modalAllOff =
    !comboParams.modal.Presencial &&
    !comboParams.modal.Virtual &&
    !comboParams.modal.Blended;
  const modalityBlocks =
    modalAllOff ||
    selected.some((m) => {
      let coms = m.horario?.comisiones ?? [];
      const fx = fixedCom.get(m.codigo);
      if (fx) {
        const f = coms.filter((c) => c.comision === fx);
        if (f.length) coms = f;
      }
      return coms.length > 0 && !coms.some(modalPass);
    });

  // ---------- acciones del cluster derecho ----------
  const downloadCombo = (
    opts: {
      includeCalendar?: boolean;
      includeSpecs?: boolean;
      compact?: boolean;
    },
    filename: string,
  ) => {
    const placed = ranked[safeIdx];
    if (!placed) return;
    openForPrint(
      buildComboHTML({
        placed,
        generado: nowStr(),
        periodo: PERIODO,
        autoPrint: true,
        ...opts,
      }),
      filename,
    );
    setDlOpen(false);
  };

  // Sumar a mi plan: transfiere la combinación elegida al Plan de cursada,
  // fijándola en el cuatrimestre elegido (idx) o en "Auto" (el optimizador la
  // ubica). Además FIJA la comisión de cada materia tal como quedó en la opción
  // guardada: sin esto el plan re-elige comisiones y el calendario no reproduce
  // lo que el usuario armó acá ("guardé la cursada y no la veo").
  const savePreference = () => {
    const placed = ranked[safeIdx];
    if (!placed) return;
    const targetIdx = safeSaveIdx === "" ? undefined : Number(safeSaveIdx);
    for (const x of placed) {
      if (x.com)
        dispatch({
          type: "SET_FIXED_COM",
          code: x.m.codigo,
          comision: x.com.comision,
        });
    }
    dispatch({
      type: "PLAN_SAVE_PREFERENCE",
      codes: placed.map((x) => x.m.codigo),
      idx: targetIdx,
    });
    setSaveOpen(false);
  };

  // ---------- sub-render: fila del buscador ----------
  // UNA línea por materia: control · código (columna mono fija) · nombre · meta.
  // Con ~80 materias, la fila de 3 líneas (nombre + meta + chips de programa)
  // era ilegible: entraban 5 por pantalla y toda señal repetida por fila
  // (régimen, créditos duplicados) enterraba la elección. El detalle de cada
  // materia vive en el drawer/ficha, no acá.
  const row = (m: MateriaM) => {
    const added = combo.has(m.codigo);
    const coms = m.horario?.comisiones.length || 0;
    // Sólo aparecen con «Ignorar mi progreso» ON; el tag deja claro por qué está.
    const appr = state.approved.has(m.codigo);
    return (
      <button
        type="button"
        key={m.codigo}
        className={"cmb-row" + (added ? " is-added" : "")}
        onClick={() => dispatch({ type: "TOGGLE_COMBO", code: m.codigo })}
        title={`${m.codigo} · ${m.nombre} — ${added ? "quitar de" : "agregar a"} tu cuatrimestre`}
      >
        <span className="cmb-row__plus" aria-hidden="true">
          {added ? "✓" : "+"}
        </span>
        <span className="cmb-row__code">{m.codigo}</span>
        <span className="cmb-row__name">{m.nombre}</span>
        {appr && <span className="cmb9-oktag">✓ aprobada</span>}
        <span className="cmb-row__meta">
          {m.creditos} cr{coms > 1 ? ` · ${coms} com` : ""}
        </span>
      </button>
    );
  };

  // ---------- sub-render: celda de materia elegida (grilla uniforme) ----------
  // Anatomía FIJA (grid interno auto 1fr auto auto auto): barra de color · abbr ·
  // nombre (elide) · créditos · selector de comisión (si hay >1; si no la columna
  // queda vacía) · ×. El nombre truncado y el `title` completo evitan que el chip
  // aislado quede como un acrónimo críptico ('AMI') al revisar o quitar la
  // selección. El × va anclado a la última columna → alineado en todas las filas.
  const chip = (m: MateriaM, i: number) => {
    const coms = m.horario?.comisiones || [];
    const fx = fixedCom.get(m.codigo);
    return (
      <span
        className="cmb9-mchip"
        key={m.codigo}
        title={`${m.codigo} · ${m.nombre}`}
        style={{ "--chip-c": PALETTE[i % PALETTE.length] } as React.CSSProperties}
      >
        <span className="cmb9-mchip__abbr">{m.abbr}</span>
        <span className="cmb9-mchip__name">{m.nombre}</span>
        <span className="cmb9-mchip__cr">{m.creditos}cr</span>
        {coms.length > 1 && (
          <CommissionSelect
            size="sm"
            className="cmb9-mchip__com"
            placeholder="Auto"
            title="Auto: el combinador elige la comisión que arma la semana más compacta. Fijá una para forzarla."
            aria-label={`Comisión de ${m.nombre}`}
            value={fx || ""}
            options={coms.map((c) => ({
              value: c.comision,
              label: `com ${c.comision} · ${comModalidad(c)}`,
              title: comTitle(c),
            }))}
            onChange={(e) =>
              dispatch({
                type: "SET_FIXED_COM",
                code: m.codigo,
                comision: e.target.value || null,
              })
            }
          />
        )}
        <button
          type="button"
          className="cmb9-mchip__x"
          aria-label={`Quitar ${m.abbr}`}
          onClick={() => dispatch({ type: "TOGGLE_COMBO", code: m.codigo })}
        >
          ×
        </button>
      </span>
    );
  };

  // ---------- sub-render: header en filas (título · grilla · preferencias) ----------
  const header = (
    <header className="cmb9-header">
      {/* Fila 1: label + contador + Vaciar a la izquierda; acciones a la derecha */}
      <div className="cmb9-hrow">
        <div className="cmb9-mats">
          <span className="cmb9-mats__lbl">Materias</span>
          {selected.length > 0 && (
            <>
              <span className="cmb9-mats__count">· {selected.length}</span>
              <button
                type="button"
                className="cmb9-clear"
                onClick={() => dispatch({ type: "RESET_COMBO" })}
              >
                Vaciar
              </button>
            </>
          )}
          {/* Re-sembrar la selección con el próximo cuatrimestre del plan. Con
              materias ya elegidas, pisa la selección → confirmación liviana. */}
          {nextSeed.length > 0 &&
            (reseedAsk ? (
              <span className="cmb9-mats__count">
                ¿Reemplazar por tu próximo cuatrimestre?
                <button
                  type="button"
                  className="cmb9-clear"
                  onClick={reseedFromPlan}
                >
                  Sí
                </button>
                <button
                  type="button"
                  className="cmb9-clear"
                  onClick={() => setReseedAsk(false)}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="cmb9-clear"
                title="Sembrá el combinador con las materias del próximo cuatrimestre de tu plan"
                onClick={() =>
                  selected.length > 0 ? setReseedAsk(true) : reseedFromPlan()
                }
              >
                Usar mi próximo cuatrimestre
              </button>
            ))}
        </div>

        {/* Cluster de acciones — SIEMPRE montado: el switch de modo tiene que
            estar visible aun sin materias elegidas. Cada acción conserva su gate;
            el switch «Ignorar mi progreso» no tiene ninguno. */}
        <div className="cmb9-header__right">
          {/* «Ignorar mi progreso»: para quien no usa el avance real y solo quiere
              combinar horarios. ON ⇒ el pool ofrece TODAS las materias con horario,
              también las aprobadas (armado puro, no se guarda al plan). Siempre
              visible — no depende de tener materias elegidas ni aprobadas. El
              InfoTip va como HERMANO del switch (ambos son <button>, no anidar). */}
          <span className="cmb9-solowrap">
            <button
              type="button"
              className={"cmb-switch cmb9-solo" + (comboSolo ? " on" : "")}
              role="switch"
              aria-checked={comboSolo}
              title={
                comboSolo
                  ? "Ignorando tu progreso: se ofrecen todas las materias con horario, incluidas las aprobadas"
                  : "Combiná solo lo que te falta; activá para incluir todas las materias con horario"
              }
              onClick={() => {
                setSaveOpen(false);
                dispatch({ type: "SET_COMBO_SOLO", value: !comboSolo });
              }}
            >
              <span className="cmb-switch__track">
                <span className="cmb-switch__knob" />
              </span>
              Ignorar mi progreso
            </button>
            <InfoTip
              label="Qué hace «Ignorar mi progreso»"
              text="Activado: el combinador ofrece todas las materias con horario, incluidas las que ya aprobaste — puro armado de horarios, sin guardar la cursada en tu plan. Desactivado: solo las materias que te faltan."
            />
          </span>

          {/* Sugeridas: solo tiene sentido cuando hay combos que llenar; en estado
              vacío era un control muerto con un contador engañoso. */}
          {total > 0 && (
            <button
              type="button"
              className={"cmb9-hbtn" + (recOpen ? " is-on" : "")}
              aria-pressed={recOpen}
              title={
                recOpen
                  ? "Ocultar el recomendador de materias"
                  : "Mostrar el recomendador de materias"
              }
              onClick={() => setRecOpen((o) => !o)}
            >
              <IconLayers size={13} />
              Sugeridas{" "}
              <span className="cmb9-hbtn__count">· {suggestions.length}</span>
            </button>
          )}

          {/* Descargar / Guardar se MONTAN solo cuando hay una cursada exportable
              (canExport) — nunca en estado disabled. */}
          {canExport && (
          <div className="cmb9-dl" ref={dlRef}>
            <button
              type="button"
              className="cmb9-hbtn"
              aria-haspopup="menu"
              aria-expanded={dlOpen}
              onClick={() => {
                setSaveOpen(false);
                setDlOpen((o) => !o);
              }}
            >
              <IconDownload size={13} />
              Descargar
            </button>
            {dlOpen && (
              <div className="cmb9-dlmenu" role="menu" aria-label="Opciones de descarga">
                <button
                  type="button"
                  role="menuitem"
                  className="cmb9-dlitem"
                  onClick={() =>
                    downloadCombo({ includeSpecs: false }, "cursada-calendario.html")
                  }
                >
                  <IconCalendar size={16} />
                  <span>
                    Solo calendario
                    <small>Grilla semanal, sin listado</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cmb9-dlitem"
                  onClick={() =>
                    downloadCombo(
                      { includeSpecs: false, compact: true },
                      "cursada-compacta.html",
                    )
                  }
                >
                  <IconCompactPage size={16} />
                  <span>
                    Compacto · 1 carilla
                    <small>Grilla, materias y evaluaciones en una página</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cmb9-dlitem"
                  onClick={() => downloadCombo({}, "cursada-completa.html")}
                >
                  <IconLayers size={16} />
                  <span>
                    Calendario + programa
                    <small>Grilla y detalle de materias/comisiones</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cmb9-dlitem"
                  onClick={() =>
                    downloadCombo({ includeCalendar: false }, "cursada-programa.html")
                  }
                >
                  <IconFileText size={16} />
                  <span>
                    Solo programa
                    <small>Listado: créditos, comisión, horario</small>
                  </span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* «Sumar a mi plan» alimenta el Plan de cursada; en modo libre
              (comboSolo) la combinación puede incluir aprobadas → no se ofrece. */}
          {canExport && !comboSolo && (
            <div className="cmb9-save" ref={saveRef}>
              <button
                type="button"
                className="cmb9-hbtn cmb9-hbtn--primary"
                aria-haspopup="menu"
                aria-expanded={saveOpen}
                title="Sumá estas materias y comisiones a tu Plan de cursada"
                onClick={() => {
                  setDlOpen(false);
                  setSaveOpen((o) => !o);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M5 4h11l3 3v13H5V4Z" />
                  <path d="M8 4v6h8V4M8 14h8" />
                </svg>
                Sumar a mi plan
              </button>
              {saveOpen && (
                <div
                  className="cmb9-savemenu"
                  role="menu"
                  aria-label="Sumar esta cursada a tu plan"
                >
                  <p className="cmb9-savemenu__lead">
                    Sumá esta cursada a tu <b>Plan de cursada</b>, con estas
                    comisiones. Se fija en el cuatrimestre elegido y el
                    optimizador re-arma el resto alrededor.
                  </p>
                  <label className="cmb9-savemenu__field">
                    <span className="cmb9-savemenu__lbl">
                      Fijar en el cuatrimestre
                      <InfoTip
                        label="Qué hace Auto al sumar"
                        text="«Auto» deja que el plan la ubique en el mejor cuatrimestre según tu método. O fijala vos en uno puntual. Los cuatrimestres finalizados (candado) no se ofrecen."
                      />
                    </span>
                    <CommissionSelect
                      size="sm"
                      className="cmb9-savemenu__sel"
                      placeholder="Auto — que el plan la ubique"
                      aria-label="Cuatrimestre donde fijar la cursada"
                      value={safeSaveIdx}
                      options={cuatriOptions}
                      onChange={(e) => setSaveIdx(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="cmb9-savemenu__go"
                    onClick={savePreference}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M5 4h11l3 3v13H5V4Z" />
                      <path d="M8 4v6h8V4M8 14h8" />
                    </svg>
                    {safeSaveIdx === ""
                      ? "Sumar a mi plan"
                      : `Sumar y fijar en ${
                          cuatriOptions.find((o) => o.value === safeSaveIdx)
                            ?.label ?? "el cuatrimestre"
                        }`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: grilla uniforme de materias + celda fantasma "Agregar" al final.
          Sin selección, la celda es la invitación y ocupa toda la fila. */}
      <div className="cmb9-matgrid">
        {selected.map(chip)}
        <button
          type="button"
          className={
            "cmb9-addcell" +
            (selected.length > 0 && showPicker ? " is-open" : "") +
            (selected.length === 0 ? " cmb9-addcell--lead" : "")
          }
          onClick={() => setPickerOpen((o) => !o)}
        >
          {selected.length === 0
            ? "＋ Elegí las materias a cursar"
            : showPicker
              ? "Listo"
              : "＋ Agregar"}
        </button>
      </div>

      {/* Fila 3: preferencias de cursada (solo con selección) */}
      {selected.length > 0 && (
        <div className="cmb9-prefs">
          {/* Label + tooltip: qué hace "Auto" en los selectores de comisión */}
          {hasComChoice && (
            <span className="cmb9-cominfo">
              Comisión: <b>Auto</b>
              <InfoTip
                label="Qué hace Auto en las comisiones"
                text="Cada materia con más de una comisión tiene su selector. Dejá «Auto» y el combinador elige la comisión que arma la semana más compacta; o fijá una vos."
              />
            </span>
          )}
          <div className="cmb-prefs__modal" title="Modalidad de cursada">
            {MODAL_KEYS.map((k) => (
              <button
                type="button"
                key={k}
                className={"cmb-pill" + (comboParams.modal[k] ? " on" : "")}
                aria-pressed={comboParams.modal[k]}
                onClick={() =>
                  dispatch({
                    type: "SET_MODAL",
                    key: k,
                    value: !comboParams.modal[k],
                  })
                }
              >
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={"cmb-switch" + (comboParams.allowOverlap ? " on" : "")}
            role="switch"
            aria-checked={comboParams.allowOverlap}
            title="Permitir cursadas que se superponen"
            onClick={() =>
              dispatch({
                type: "SET_ALLOW_OVERLAP",
                value: !comboParams.allowOverlap,
              })
            }
          >
            <span className="cmb-switch__track">
              <span className="cmb-switch__knob" />
            </span>
            Superponer
          </button>
        </div>
      )}
    </header>
  );

  // ---------- sub-render: buscador desplegable ----------
  const picker = showPicker && (
    <div className="cmbx-picker">
      <div className="cmb-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.2-3.2" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá una materia (código o nombre)…"
          autoComplete="off"
        />
        {q && (
          <button
            type="button"
            className="cmb-search__clear"
            aria-label="Limpiar búsqueda"
            onClick={() => setQ("")}
          >
            ×
          </button>
        )}
      </div>
      {/* Hint de descubribilidad: en modo normal, avisa que las aprobadas están
          ocultas y ofrece encender el switch sin ir a buscarlo al header. */}
      {!comboSolo && hiddenApproved > 0 && (
        <p className="cmb9-hiddenhint">
          {hiddenApproved === 1
            ? "Tu materia aprobada no aparece"
            : `Tus ${hiddenApproved} aprobadas no aparecen`}{" "}
          ·{" "}
          <button
            type="button"
            className="cmb9-hiddenhint__btn"
            onClick={() => dispatch({ type: "SET_COMBO_SOLO", value: true })}
          >
            {hiddenApproved === 1 ? "mostrarla igual" : "mostrarlas igual"}
          </button>
        </p>
      )}
      <div className="cmb-list cmb9-picklist">
        {/* Dos columnas en desktop: Obligatorias (por año·cuatri) | Electivas. */}
        <div className="cmb9-pickcols">
          {filtered.obs.length > 0 && (
            <div className="cmb-group cmb9-pickcol">
              <div className="cmb-grouph">
                <span className="dot dot--ob" /> Obligatorias
                <i>{filtered.obs.length}</i>
              </div>
              {/* sub-agrupadas por (año, cuatri): 1.º año→5.º y, dentro, 1.º→2.º cuatri */}
              {obsGroups.ordered.map((g) => (
                <div className="cmb9-subgroup" key={`${g.anio}-${g.cuatri}`}>
                  <div className="cmb9-subh">
                    <b>{anioLabel(g.anio)}</b>
                    <span className="cmb9-subh__cu">· {g.cuatri}.º cuatri</span>
                    <i>{g.mats.length}</i>
                  </div>
                  {g.mats.map(row)}
                </div>
              ))}
              {obsGroups.otras.length > 0 && (
                <div className="cmb9-subgroup">
                  <div className="cmb9-subh">
                    Otras<i>{obsGroups.otras.length}</i>
                  </div>
                  {obsGroups.otras.map(row)}
                </div>
              )}
            </div>
          )}
          {filtered.els.length > 0 && (
            <div className="cmb-group cmb9-pickcol">
              <div className="cmb-grouph">
                <span className="dot dot--el" /> Electivas
                <i>{filtered.els.length}</i>
              </div>
              {elsByName.map(row)}
            </div>
          )}
        </div>
        {/* Búsqueda honesta: materias del plan que matchean pero aún no tienen
            horario cargado — atenuadas y no-agregables, a lo ancho bajo las columnas. */}
        {ghostMatches.length > 0 && (
          <div className="cmb-group cmb9-pickghost">
            <div className="cmb-grouph">
              <span className="dot dot--ghost" /> Sin horario cargado
              <i>{ghostMatches.length}</i>
            </div>
            {ghostMatches.map((m) => (
              <div
                className="cmb9-ghost"
                key={m.codigo}
                title={`${m.codigo} · ${m.nombre} — sin horario cargado todavía`}
              >
                <span className="cmb-row__code">{m.codigo}</span>
                <span className="cmb9-ghost__name">{m.nombre}</span>
                <span className="cmb9-ghost__note">sin horario cargado</span>
              </div>
            ))}
          </div>
        )}
        {noResults && (
          <div className="cmb-noresults">
            No hay materias con “{q}”.
            <span
              style={{
                display: "block",
                marginTop: 6,
                fontSize: "12px",
                color: "var(--faint)",
              }}
            >
              Probá con el código (p. ej. 72.03) o revisá la ortografía.
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // ---------- sub-render: resumen sticky «en vivo» sobre el picker ----------
  // Con el picker abierto, la barra de resultado y el calendario caen bajo el
  // pliegue (el picker de ~80 materias los empuja). Esta tira compacta —pineada
  // al tope— trae el resultado en vivo (cuántas cursadas entran + créditos/días)
  // arriba del picker: el conteo se actualiza al togglear una materia sin
  // scrollear (feedback en mobile), y «Ver semana» salta a la grilla en desktop.
  // Solo aparece con el picker abierto y materias elegidas (si no, la grilla ya
  // está a la vista y este resumen sería redundante).
  const pickerSummary = showPicker && selected.length > 0 && (
    <div className="cmb9-pickersum" role="status" aria-live="polite">
      {result && total > 0 ? (
        <>
          <span className="cmb9-pickersum__lead">
            <b className={comboParams.allowOverlap ? "warn" : "ok"}>
              {total}
              {result.truncated ? "+" : ""}
            </b>
            <span className="cmb9-pickersum__txt">
              {comboParams.allowOverlap
                ? total === 1
                  ? "combinación posible"
                  : "combinaciones posibles"
                : total === 1
                  ? "cursada sin superponerse"
                  : "cursadas sin superponerse"}
            </span>
            <span className="cmb9-pickersum__meta">
              · {cred} cr
              {insights
                ? ` · ${insights.dias} ${insights.dias === 1 ? "día" : "días"}`
                : ""}
            </span>
          </span>
          <button
            type="button"
            className="cmb9-pickersum__see"
            onClick={() =>
              bodyRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            Ver semana
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                d="M12 5v13M6 12l6 6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      ) : (
        <span className="cmb9-pickersum__lead">
          <b className="warn">0</b>
          <span className="cmb9-pickersum__txt">
            por ahora no entran sin pisarse — ajustá las opciones abajo
          </span>
        </span>
      )}
    </div>
  );

  // ---------- sub-render: recomendador slim (cualquier materia) ----------
  const recSide = recOpen && (
    <aside
      className="cmb9-recside"
      aria-label="Materias sugeridas para tu cuatrimestre"
    >
      <div className="cmb9-rechead">
        <span className="cmb9-rechead__title">Sugeridas</span>
        <span className="cmb9-rechead__count">
          {suggestions.length} para sumar
        </span>
      </div>
      {suggestions.length === 0 ? (
        <p className="cmb9-recempty">No quedan materias para sugerir ahora.</p>
      ) : (
        <ul className="recrow-list">
          {suggestions.map(({ m, fit }) => (
            <RecRow
              key={m.codigo}
              m={m}
              muted={!fit}
              signals={fit ? undefined : <RecSig tone="bad">se pisa</RecSig>}
              title={
                fit
                  ? undefined
                  : `${m.nombre} — se superpone con tu semana actual; activá «Superponer» o fijá otra comisión`
              }
              addLabel={`Agregar ${m.nombre} a tu cuatrimestre`}
              onAdd={() => dispatch({ type: "TOGGLE_COMBO", code: m.codigo })}
              onOpen={() => dispatch({ type: "OPEN_DRAWER", code: m.codigo })}
            />
          ))}
        </ul>
      )}
    </aside>
  );

  // ---------- sub-render: cuerpo (empty / resultado / sin solución) ----------
  const body =
    selected.length === 0 ? (
      <div className="cmb2-empty">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M8 2.5v4M16 2.5v4" />
          <path d="M7 13h3M13.5 13h3.5M7 16.5h3" strokeWidth="1.5" />
        </svg>
        <p>
          Elegí materias y acá vas a ver tu semana armada, con todas las cursadas
          que entran sin pisarse.
        </p>
      </div>
    ) : result && total > 0 && grid ? (
      <>
        <div className="cmbx-resultbar">
          <div className="cmbx-resultbar__lead">
            <div
              className={"cmbx-rcount" + (comboParams.allowOverlap ? " warn" : " ok")}
            >
              <b>
                {total}
                {result.truncated ? "+" : ""}
              </b>
              <span>
                {comboParams.allowOverlap
                  ? total === 1
                    ? "combinación posible"
                    : "combinaciones posibles"
                  : total === 1
                    ? "cursada sin superponerse"
                    : "cursadas sin superponerse"}
              </span>
            </div>
            {isCompact && <span className="cmbx-tag">la más compacta</span>}
          </div>

          {insights && (
            <div className="cmbx-statstrip">
              <span className="cmbx-statstrip__cred">
                <b>{cred}</b> créditos{elc > 0 ? ` · ${elc} elec.` : ""}
              </span>
              <span>
                <b>{insights.dias}</b>{" "}
                {insights.dias === 1 ? "día con clase" : "días con clase"}
              </span>
              <span>
                <b>{insights.horas}</b> h/sem
              </span>
              <span className="cmbx-statstrip__range">{insights.rango}</span>
            </div>
          )}

          {total > 1 && (
            <div className="cmbx-pager" title="Recorré las opciones con ← →">
              <button
                type="button"
                className="cmbx-pager__btn"
                aria-label="Opción anterior"
                onClick={() => setIdx((i) => (i - 1 + total) % total)}
              >
                ‹
              </button>
              <span className="cmbx-pager__txt" aria-live="polite" aria-atomic="true">
                Opción <b>{safeIdx + 1}</b>
                <i>de {total}{result.truncated ? "+" : ""}</i>
              </span>
              <button
                type="button"
                className="cmbx-pager__btn"
                aria-label="Opción siguiente"
                onClick={() => setIdx((i) => (i + 1) % total)}
              >
                ›
              </button>
            </div>
          )}
        </div>

        <div className="cmb9-row">
          <div className="cmb9-cal cmbcal-wrap" key={safeIdx}>
            <CursadaCalendar
              blocks={grid.blocks}
              days={DAYS6}
              dense
              onBlockClick={(code) => dispatch({ type: "OPEN_DRAWER", code })}
            />
            {grid.asyncs.length > 0 && (
              <div className="async-row">
                <span className="lbl">Asincrónico / otros</span>
                {grid.asyncs.map((a, i) => (
                  <span
                    className="async-chip"
                    style={{ borderLeft: `3px solid ${a.color}` }}
                    key={i}
                  >
                    {a.abbr} · {a.dia} {a.desde}–{a.hasta}
                    {a.sala ? " · " + a.sala : ""}
                  </span>
                ))}
              </div>
            )}
            <Legend entries={grid.entries} />
          </div>

          {recSide}
        </div>
      </>
    ) : (
      <div className="cmb-nosol">
        <div className="cmb-nosol__icon" aria-hidden="true">
          ⚠
        </div>
        {modalityBlocks ? (
          // Causa = filtro de modalidad: la superposición no es el problema, así
          // que ofrecemos re-encender modalidades en vez del CTA de pisadas.
          <>
            <h4>Con la modalidad elegida no queda ninguna comisión</h4>
            <p>Activá otra modalidad para volver a ver cursadas.</p>
            <button
              type="button"
              className="cmb-nosol__cta"
              onClick={() =>
                MODAL_KEYS.forEach((k) =>
                  dispatch({ type: "SET_MODAL", key: k, value: true }),
                )
              }
            >
              Activar modalidades
            </button>
          </>
        ) : (
          <>
            <h4>No entra ninguna cursada sin que se pisen</h4>
            <p>
              Probá permitir que se superpongan, fijar otra comisión o sacar
              alguna materia.
            </p>
            {!comboParams.allowOverlap && (
              <button
                type="button"
                className="cmb-nosol__cta"
                onClick={() =>
                  dispatch({ type: "SET_ALLOW_OVERLAP", value: true })
                }
              >
                Permitir que se superpongan
              </button>
            )}
            {result && result.conflictPairs.length > 0 && (
              <div className="cmb-conflicts">
                <span className="cmb-conflicts__h">Se pisan entre sí</span>
                {result.conflictPairs.map(([a, b], i) => {
                  // Botón de acción: quitar la materia menos esencial del par
                  // (la electiva si hay una; si no, la segunda) para desatarlo.
                  const drop =
                    a.tipo === b.tipo ? b : a.tipo === "electiva" ? a : b;
                  return (
                    <div className="cmb-conflict" key={i}>
                      <b>{a.abbr}</b> {a.nombre}
                      <span className="cmb-conflict__x">⨯</span>
                      <b>{b.abbr}</b> {b.nombre}
                      <button
                        type="button"
                        className="cmb-conflict__rm"
                        title={`Quitar ${drop.nombre} de tu cuatrimestre`}
                        onClick={() =>
                          dispatch({ type: "TOGGLE_COMBO", code: drop.codigo })
                        }
                      >
                        Quitar {drop.abbr}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );

  return (
    <section className="view-panel" id="panel-combo">
      <div className="panel-head">
        <h2>Armá tu cuatrimestre</h2>
        <p>
          Elegí materias, ajustá cómo querés cursar y mirá —en vivo— todas las
          cursadas que entran sin pisarse. Lo que sumás acá queda en tu plan de
          cursada.
        </p>
      </div>

      <div className="cmb9">
        {header}
        {pickerSummary}
        {picker}
        <div className="cmb9-body" ref={bodyRef}>
          {body}
        </div>
      </div>
    </section>
  );
}
