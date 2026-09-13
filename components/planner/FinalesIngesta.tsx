"use client";

// Ingesta de la planilla oficial de finales → autocompleta las fechas de mesa
// del combinador. Tres vías: traer del link oficial (fetch con CORS abierto),
// subir un archivo (CSV o el HTML de la planilla publicada), o pegar el texto.
// El ruteo CSV/HTML lo resuelve `parseFinalesInput`; el parseo puro vive en
// lib/planner/finales/parseFinales.ts; la I/O en lib/planner/finales/source.ts.
//
// Multi-período / ambos llamados: una misma planilla puede traer varios períodos
// (típico: Diciembre + Febrero suben JUNTOS) y siempre trae los dos llamados de
// cada uno. Por eso la ingesta ya NO importa "un" llamado global: `bucketizarFinales`
// reparte todo en buckets (período × año lectivo × llamado) y `setMesasOficialesBulk`
// los carga de una en el store reactivo de lib/planner/finalesData.ts (que
// mesaOficial() consulta ANTES que las mesas horneadas en el sitio). La elección
// de llamado POR materia la hace el usuario en el combinador — acá no hay toggle.
//
// El sitio ya trae el cronograma publicado horneado, así que esta ingesta dejó
// de ser un paso obligatorio: sirve para traer una planilla más nueva o
// corregida sin esperar a que se regenere el sitio.
//
// Static-export safe: fetch/FileReader corren solo en handlers del cliente.

import { useMemo, useRef, useState } from "react";
import { usePlanner } from "@/components/planner/state";
import { byId } from "@/lib/planner/model";
import {
  bucketizarFinales,
  type FinalMateriaRow,
  type FinalesBucket,
  type FinalesParseResult,
} from "@/lib/planner/finales/parseFinales";
import {
  fetchFinalesOficial,
  readFinalesFile,
  parseFinalesInput,
  FINALES_PUB_HTML_URL,
} from "@/lib/planner/finales/source";
import {
  setMesasOficialesBulk,
  clearMesasOficiales,
  PERIODO_LABEL,
  periodoAnioReal,
} from "@/lib/planner/finalesData";
import type { FinalPeriodo } from "@/lib/planner/types";
import {
  IconArrowUpRight,
  IconCheck,
  IconDownload,
  IconInfo,
  IconTrash,
  IconUpload,
} from "@/components/planner/icons";

type Status = "idle" | "loading" | "ok" | "error";

/** Resumen de un período ingestado (para los chips + para saber qué limpiar).
 *  `anio` es el año LECTIVO (Febrero cae en el año siguiente al mostrarlo).
 *  `nPrimer`/`nSegundo` = cantidad de materias con mesa en cada llamado (0 si
 *  ese llamado no vino en la planilla). */
interface PeriodoResumen {
  periodo: FinalPeriodo;
  anio: number;
  nPrimer: number;
  nSegundo: number;
}

/** Colapsa los buckets (período × año × llamado) a un resumen por período/año.
 *  Los buckets ya vienen ordenados (año lectivo, luego jul/dic/feb, primer antes
 *  que segundo), así que el Map preserva ese orden para los chips. */
function resumenDeBuckets(buckets: FinalesBucket[]): PeriodoResumen[] {
  const map = new Map<string, PeriodoResumen>();
  for (const b of buckets) {
    const k = `${b.periodo}|${b.anio}`;
    let r = map.get(k);
    if (!r) map.set(k, (r = { periodo: b.periodo, anio: b.anio, nPrimer: 0, nSegundo: 0 }));
    if (b.llamado === "primer") r.nPrimer = b.entries.length;
    else r.nSegundo = b.entries.length;
  }
  return [...map.values()];
}

export default function FinalesIngesta() {
  const { state, dispatch } = usePlanner();
  const { periodo, anio } = state.finales;

  const [rows, setRows] = useState<FinalMateriaRow[] | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoResumen[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // cuántos de tus finales pendientes quedaron con fecha oficial (en cualquier
  // período de la planilla: alcanza con que la materia figure en `rows`).
  const matched = useMemo(() => {
    if (!rows) return 0;
    const codes = new Set(rows.map((r) => r.codigo));
    let n = 0;
    for (const c of state.approved)
      if (!state.finalDone.has(c) && byId.has(c) && codes.has(c)) n++;
    return n;
  }, [rows, state.approved, state.finalDone]);

  // ---- pipeline: parsea → bucketiza → carga TODOS los buckets de una ----
  const aplicar = (res: FinalesParseResult): boolean => {
    const { buckets, warnings: bWarn } = bucketizarFinales(res.rows);

    if (buckets.length === 0) {
      setStatus("error");
      setError(
        res.warnings[0] ??
          bWarn[0] ??
          "No se encontraron mesas con fecha en la planilla.",
      );
      return false;
    }

    // carga bulk (limpia por período/año y emite un solo cambio).
    setMesasOficialesBulk(buckets);

    // salto de vista al PRIMER bucket — salvo que el período visible actual ya
    // esté entre los ingestados (en ese caso no molestamos al usuario moviéndolo).
    const yaVisible = buckets.some((b) => b.periodo === periodo && b.anio === anio);
    if (!yaVisible) {
      dispatch({ type: "SET_FINALES_PERIODO", periodo: buckets[0].periodo });
      dispatch({ type: "SET_FINALES_ANIO", anio: buckets[0].anio });
    }

    setRows(res.rows);
    setPeriodos(resumenDeBuckets(buckets));
    const nWarn = res.warnings.length + bWarn.length;
    setError(nWarn ? `${nWarn} aviso(s) al leer la planilla.` : "");
    setStatus("ok");
    return true;
  };

  const ingest = async (text: string): Promise<boolean> =>
    aplicar(await parseFinalesInput(text));

  const traer = async () => {
    setStatus("loading");
    setError("");
    try {
      // El cronograma vive en varias pestañas (un llamado cada una): se traen
      // y se fusionan todas, no solo la primera.
      aplicar(await fetchFinalesOficial());
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "No se pudo traer la planilla.");
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setStatus("loading");
    setError("");
    try {
      const text = await readFinalesFile(f);
      await ingest(text);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const procesarPegado = async () => {
    if (!pasteText.trim()) return;
    setStatus("loading");
    setError("");
    if (await ingest(pasteText)) setPasteOpen(false);
  };

  // salta a un período ingestado desde su chip (año LECTIVO del bucket).
  const irAPeriodo = (per: FinalPeriodo, an: number) => {
    dispatch({ type: "SET_FINALES_PERIODO", periodo: per });
    dispatch({ type: "SET_FINALES_ANIO", anio: an });
  };

  const quitar = () => {
    // limpia TODO el store, no solo los períodos de ESTA ingesta: el botón
    // promete volver a las fechas que trae el sitio, y una ingesta anterior de
    // otro período (p. ej. Julio antes de Dic+Feb) no debe quedar huérfana.
    clearMesasOficiales();
    setRows(null);
    setPeriodos([]);
    setStatus("idle");
    setError("");
    setPasteText("");
  };

  const loaded = status === "ok" && rows && periodos.length > 0;

  return (
    <section className="fin__ing" aria-label="Cargar fechas oficiales de mesas">
      <div className="fin__ing-bar">
        <span className="fin__ing-ico" aria-hidden="true">
          <IconDownload size={14} />
        </span>
        <h3
          className="fin__ing-title"
          title="El sitio ya trae el calendario oficial publicado. Usá esto para traer una planilla más nueva o corregida: todo se procesa en tu navegador — no se sube nada."
        >
          Actualizar las fechas de mesas
        </h3>

        {!loaded && (
          <div className="fin__ing-actions">
            <button
              type="button"
              className="fin__hbtn is-primary"
              onClick={traer}
              disabled={status === "loading"}
            >
              <IconDownload size={13} />
              {status === "loading" ? "Trayendo…" : "Traer la última del link oficial"}
            </button>

            <label className="fin__ing-file">
              <IconUpload size={13} />
              <span>Subir CSV o HTML</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.html,.htm,text/csv,text/html,text/plain"
                onChange={onFile}
                disabled={status === "loading"}
              />
            </label>

            <button
              type="button"
              className="fin__ing-link"
              onClick={() => setPasteOpen((v) => !v)}
              aria-expanded={pasteOpen}
            >
              {pasteOpen ? "cancelar" : "o pegá el texto"}
            </button>

            <a
              className="fin__ing-open"
              href={FINALES_PUB_HTML_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              ver la planilla <IconArrowUpRight size={12} />
            </a>
          </div>
        )}
      </div>

      {!loaded && pasteOpen && (
        <div className="fin__ing-paste">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={
              "Pegá acá el contenido del CSV\nCód,Materia,Primer llamado,Hora,Segundo llamado,Hora\n10.01,…"
            }
            rows={4}
            spellCheck={false}
          />
          <button
            type="button"
            className="fin__hbtn is-primary"
            onClick={procesarPegado}
            disabled={!pasteText.trim()}
          >
            <IconCheck size={13} /> Procesar
          </button>
        </div>
      )}

      {status === "error" && (
        <p className="fin__ing-error" role="alert">
          <IconInfo size={13} /> {error}
        </p>
      )}

      {loaded && (
        <div className="fin__ing-loaded">
          <div className="fin__ing-badge">
            <IconCheck size={13} />
            <b>{rows!.length}</b> materias
            {matched > 0 && (
              <span className="fin__ing-match">
                · {matched} de tus finales pendientes con fecha
              </span>
            )}
          </div>

          {/* un chip por período ingestado — salta a ese período (año lectivo) y
              marca is-active el que estás mirando. Reusa el segmentado (fin__seg). */}
          <div
            className="fin__seg"
            role="group"
            aria-label="Períodos cargados de la planilla"
          >
            {periodos.map((p) => {
              const activo = p.periodo === periodo && p.anio === anio;
              const nMesas = Math.max(p.nPrimer, p.nSegundo);
              const sufijo =
                p.nPrimer && p.nSegundo
                  ? "1º y 2º"
                  : p.nSegundo
                    ? "solo 2º"
                    : "solo 1º";
              return (
                <button
                  key={`${p.periodo}|${p.anio}`}
                  type="button"
                  className={"fin__seg-b" + (activo ? " is-active" : "")}
                  aria-pressed={activo}
                  onClick={() => irAPeriodo(p.periodo, p.anio)}
                >
                  {PERIODO_LABEL[p.periodo]} {periodoAnioReal(p.periodo, p.anio)} ·{" "}
                  {nMesas} mesas · {sufijo}
                </button>
              );
            })}
          </div>

          <div className="fin__ing-loaded-actions">
            <button type="button" className="fin__ing-quitar" onClick={quitar}>
              <IconTrash size={12} /> Quitar y volver a las fechas del sitio
            </button>
            {error && <span className="fin__ing-warn">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
