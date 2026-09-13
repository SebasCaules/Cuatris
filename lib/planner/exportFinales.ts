// Export del calendario de FINALES de un período (Julio / Diciembre / Febrero) a
// un documento HTML autocontenido e imprimible (→ PDF). Mismo espíritu que
// exportPlan.ts: sin DOM ni dependencias, devuelve un string; los colores son
// literales (rgba, nunca color-mix) para que imprima bien en cualquier visor;
// tipografía serif/mono del mismo estándar. Todo se deriva de los argumentos —
// no hay Date.now(): las fechas ISO se parsean como locales con new Date(y,m-1,d).

/** Una mesa de final ya resuelta por la vista (fecha + hora + color de materia). */
export interface FinalesExportRow {
  nombre: string;
  abbr: string;
  fecha: string;   // "YYYY-MM-DD"
  hora: string;    // "HH:MM"
  llamado: string | null; // "1.º llamado" | "2.º llamado" | null (fecha manual)
  source: "oficial" | "manual";
  color: string;   // hex de la paleta del planner
}

// Escape HTML robusto para cualquier texto que venga de datos (nombres, horas…).
const esc = (s: unknown): string =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

// Tinte literal (rgba sobre papel claro) a partir del hex de la materia. No
// usamos color-mix para que imprima bien en cualquier visor (idéntico a exportPlan).
function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Parsea "YYYY-MM-DD" como fecha LOCAL a medianoche (sin corrimientos de TZ). */
function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Clave de día canónica "YYYY-MM-DD" a partir de una fecha (para indexar mesas). */
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Siguiente día (fecha local, sin horas → estable ante DST). */
const nextDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

/** dd/mm a partir de "YYYY-MM-DD" (fallback al string crudo si no parsea). */
function ddmm(fecha: string): string {
  const d = parseISO(fecha);
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` : esc(fecha);
}

// Etiquetas de columnas del calendario: Lunes..Sábado (SIN domingo, como la
// vista). Se inlinean acá para mantener el módulo sin dependencias.
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Índice de columna de una fecha en la grilla Lu..Sá (Lun=0 … Sáb=5; Dom=-1 → se omite). */
const colOf = (d: Date): number => {
  const wd = d.getDay(); // 0=Dom, 1=Lun, … 6=Sáb
  return wd === 0 ? -1 : wd - 1;
};

/** Badge del llamado derivado del string: "1º"/"2º"; "manual" si es fecha manual. */
function llamadoBadge(r: FinalesExportRow): string {
  if (!r.llamado) return "manual";
  const m = /(\d)/.exec(r.llamado);
  return m ? `${m[1]}º` : "manual";
}

// ---- grilla mensual ---------------------------------------------------------

/** Bloque de una mesa dentro de una celda del calendario (acento = color materia). */
function mesaBlockHTML(r: FinalesExportRow): string {
  const manual = r.source === "manual" || !r.llamado;
  return `<div class="fc-blk${manual ? " is-manual" : ""}" style="background:${tint(
    r.color,
    0.16,
  )};border-color:${tint(r.color, 0.5)};border-left-color:${r.color}">
        <span class="fc-blk__name">${esc(r.nombre)}</span>
        <span class="fc-blk__meta"><span class="fc-blk__h">${esc(
          r.hora,
        )}</span><span class="fc-blk__badge">${esc(llamadoBadge(r))}</span></span>
      </div>`;
}

/** Grilla mensual Lu..Sá con el offset del día 1 respecto del lunes. El mes se
 *  EXTIENDE si alguna mesa cae después del último día (caso Febrero → primeros
 *  días de marzo): se agregan las semanas necesarias y esas celdas van atenuadas. */
function monthGridHTML(
  month: number,
  year: number,
  rows: FinalesExportRow[],
): string {
  const first = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0); // día 0 del mes siguiente = último del actual

  // Índice de mesas por día (una lista por fecha) + fecha máxima a cubrir.
  const byDay = new Map<string, FinalesExportRow[]>();
  let endTime = lastOfMonth.getTime();
  for (const r of rows) {
    const d = parseISO(r.fecha);
    if (!d) continue;
    const k = dayKey(d);
    const list = byDay.get(k);
    if (list) list.push(r);
    else byDay.set(k, [r]);
    if (d.getTime() > endTime) endTime = d.getTime();
  }
  const endDate = new Date(endTime);

  const cells: string[] = [];

  // Offset inicial: cuántas celdas vacías van antes del día 1 (según su columna).
  // Si el día 1 cae domingo, se omite (como la vista) y arranca el lunes en col 0.
  let cursor = new Date(first);
  let firstCol = colOf(first);
  if (firstCol < 0) {
    cursor = nextDay(first); // saltar el domingo
    firstCol = 0;
  }
  for (let i = 0; i < firstCol; i++) cells.push(`<div class="fc-cell is-blank"></div>`);

  // Recorrido día a día hasta cubrir la última mesa; los domingos se saltan
  // (no hay columna), así el flujo Sáb→Lun mantiene la alineación de columnas.
  while (cursor.getTime() <= endDate.getTime()) {
    if (cursor.getDay() === 0) {
      cursor = nextDay(cursor);
      continue;
    }
    const inMonth =
      cursor.getMonth() === month - 1 && cursor.getFullYear() === year;
    const mesas = byDay.get(dayKey(cursor)) ?? [];
    const blocks = mesas.map(mesaBlockHTML).join("");
    cells.push(
      `<div class="fc-cell${inMonth ? "" : " is-out"}${
        mesas.length ? " has-mesa" : ""
      }"><span class="fc-num">${cursor.getDate()}</span>${blocks}</div>`,
    );
    cursor = nextDay(cursor);
  }

  // Completar la última fila (múltiplo de 6) para que la grilla cierre prolija.
  while (cells.length % 6 !== 0) cells.push(`<div class="fc-cell is-blank"></div>`);

  const head = WEEKDAYS.map((d) => `<div class="fc-h">${esc(d)}</div>`).join("");
  return `<div class="fc">
    <div class="fc-head">${head}</div>
    <div class="fc-grid">${cells.join("")}</div>
  </div>`;
}

// ---- lista de mesas ---------------------------------------------------------

/** Texto del hueco de preparación entre dos mesas consecutivas: días completos
 *  entre medio (diferencia − 1). Alerta si es menor que el margen configurado. */
function gapRowHTML(
  a: FinalesExportRow,
  b: FinalesExportRow,
  margenDias: number,
): string {
  const da = parseISO(a.fecha);
  const db = parseISO(b.fecha);
  if (!da || !db) return "";
  const diff = Math.round((db.getTime() - da.getTime()) / 86400000);
  const full = diff - 1; // días completos de repaso entre una mesa y la siguiente
  const alert = full < margenDias;
  const txt =
    full < 0
      ? "sin días de repaso (mismo día)"
      : `${full} día${full === 1 ? "" : "s"} de repaso entre medio`;
  return `<tr class="fc-gap${alert ? " is-alert" : ""}"><td colspan="4"><span class="fc-gap__line">${esc(
    txt,
  )}</span></td></tr>`;
}

/** Fila de la tabla de mesas: fecha (dd/mm) · hora · materia · llamado/manual. */
function mesaRowHTML(r: FinalesExportRow): string {
  const tipo = r.llamado ? esc(r.llamado) : "fecha manual";
  return `<tr class="fc-row">
      <td class="fc-r__date">${ddmm(r.fecha)}</td>
      <td class="fc-r__time">${esc(r.hora)}</td>
      <td class="fc-r__mat"><span class="fc-r__dot" style="background:${esc(
        r.color,
      )}"></span><b>${esc(r.abbr)}</b> <span>${esc(r.nombre)}</span></td>
      <td class="fc-r__call${r.llamado ? "" : " is-manual"}">${tipo}</td>
    </tr>`;
}

/** Tabla de mesas en el orden recibido, con los huecos de repaso intercalados. */
function mesaListHTML(rows: FinalesExportRow[], margenDias: number): string {
  if (!rows.length) {
    return `<p class="fc-empty">No hay mesas de final cargadas para este período.</p>`;
  }
  const body: string[] = [];
  rows.forEach((r, i) => {
    body.push(mesaRowHTML(r));
    const next = rows[i + 1];
    if (next) {
      const gap = gapRowHTML(r, next, margenDias);
      if (gap) body.push(gap);
    }
  });
  return `<table class="fc-list">
      <thead><tr><th>Fecha</th><th>Hora</th><th>Materia</th><th>Llamado</th></tr></thead>
      <tbody>${body.join("")}</tbody>
    </table>`;
}

// ---- estilos ----------------------------------------------------------------

// Tokens y tipografía calcados de exportPlan.ts (mismo lenguaje visual).
const CSS = `
  :root{
    --ink:#2b211c; --soft:#5a4d45; --muted:#8a7d73; --line:#e3d9cf;
    --paper:#fbf8f4; --panel:#fff; --coral:#d2754f; --slate:#5b7290;
    --alert:#9c3b2e;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:var(--paper); color:var(--ink);
    font-family:Georgia,"Times New Roman",serif; line-height:1.5;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .wrap{max-width:920px;margin:0 auto;padding:40px 32px 56px}
  .mono{font-family:"SFMono-Regular",Menlo,Consolas,monospace}
  .muted{color:var(--muted)}
  header.doc{border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:18px}
  header.doc .kick{font-family:"SFMono-Regular",Menlo,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--coral);margin:0 0 6px}
  header.doc h1{font-size:26px;margin:0 0 6px;letter-spacing:-.01em}
  header.doc .sub{color:var(--soft);font-size:12.5px;margin:0 0 3px;line-height:1.5}
  header.doc .gen{color:var(--muted);font-size:12px;font-family:"SFMono-Regular",Menlo,monospace;margin:0}
  /* resumen (cantidad de finales · período · margen) */
  .summary{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:16px;background:var(--panel)}
  .summary .s{flex:1;min-width:140px;padding:11px 16px;border-right:1px solid var(--line)}
  .summary .s:last-child{border-right:none}
  .summary .s b{display:block;font-size:21px;line-height:1.1}
  .summary .s span{display:block;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:5px;font-family:"SFMono-Regular",Menlo,monospace}
  .summary .s.accent b{color:var(--coral)}
  h2.sec{font-size:17px;margin:22px 0 12px;padding-bottom:7px;border-bottom:2px solid var(--ink)}
  /* ---- grilla mensual Lu..Sá ---- */
  .fc{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel);page-break-inside:avoid;break-inside:avoid}
  .fc-head{display:grid;grid-template-columns:repeat(6,1fr);border-bottom:1px solid var(--line);background:#f6efe7}
  .fc-h{padding:7px 5px;text-align:center;font-family:"SFMono-Regular",Menlo,monospace;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);border-right:1px solid var(--line)}
  .fc-h:last-child{border-right:none}
  .fc-grid{display:grid;grid-template-columns:repeat(6,1fr)}
  .fc-cell{min-height:64px;padding:4px 5px 6px;border-right:1px solid var(--line);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:3px}
  .fc-cell:nth-child(6n){border-right:none}
  .fc-num{font-family:"SFMono-Regular",Menlo,monospace;font-size:10px;color:var(--muted);line-height:1}
  .fc-cell.has-mesa .fc-num{color:var(--ink);font-weight:600}
  .fc-cell.is-out{background:repeating-linear-gradient(135deg,transparent,transparent 9px,#f1e9de 9px,#f1e9de 10px)}
  .fc-cell.is-out .fc-num{color:var(--muted);opacity:.7}
  .fc-cell.is-blank{background:#f8f2ea}
  .fc-blk{border:1px solid;border-left-width:3px;border-radius:5px;padding:3px 5px;display:flex;flex-direction:column;gap:1px;overflow:hidden}
  .fc-blk.is-manual{border-left-style:dashed}
  .fc-blk__name{font-family:Georgia,"Times New Roman",serif;font-weight:bold;font-size:10.5px;line-height:1.12;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .fc-blk__meta{display:flex;align-items:center;justify-content:space-between;gap:5px}
  .fc-blk__h{font-family:"SFMono-Regular",Menlo,monospace;font-size:9px;color:var(--soft)}
  .fc-blk__badge{font-family:"SFMono-Regular",Menlo,monospace;font-size:8px;font-weight:600;letter-spacing:.02em;color:#fff;background:var(--coral);border-radius:999px;padding:1px 5px;line-height:1.3}
  .fc-blk.is-manual .fc-blk__badge{background:var(--slate)}
  /* ---- tabla de mesas ---- */
  .fc-list{width:100%;border-collapse:collapse;font-size:12px;margin-top:2px}
  .fc-list thead th{text-align:left;font-family:"SFMono-Regular",Menlo,monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:0 10px 6px;border-bottom:1px solid var(--line)}
  .fc-row{border-bottom:1px solid var(--line);page-break-inside:avoid;break-inside:avoid}
  .fc-list td{padding:8px 10px;vertical-align:middle}
  .fc-r__date{font-family:"SFMono-Regular",Menlo,monospace;font-size:12px;font-weight:600;white-space:nowrap;min-width:52px}
  .fc-r__time{font-family:"SFMono-Regular",Menlo,monospace;font-size:11px;color:var(--soft);white-space:nowrap}
  .fc-r__mat{width:100%}
  .fc-r__dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin-right:7px;vertical-align:middle}
  .fc-r__mat b{font-size:12.5px}
  .fc-r__mat span{color:var(--soft);font-size:11.5px}
  .fc-r__call{font-family:"SFMono-Regular",Menlo,monospace;font-size:10.5px;color:var(--soft);white-space:nowrap}
  .fc-r__call.is-manual{color:var(--muted);font-style:italic}
  /* hueco de repaso entre dos mesas consecutivas */
  .fc-gap td{padding:3px 10px 3px 27px;border:none}
  .fc-gap__line{font-family:"SFMono-Regular",Menlo,monospace;font-size:9.5px;letter-spacing:.02em;color:var(--muted)}
  .fc-gap__line::before{content:"↕ ";opacity:.6}
  .fc-gap.is-alert .fc-gap__line{color:var(--alert)}
  .fc-empty{font-size:12.5px;color:var(--muted);font-style:italic;margin:6px 0 0}
  footer.doc{margin-top:26px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:11px;font-family:"SFMono-Regular",Menlo,monospace;line-height:1.55}
  @page{size:A4;margin:14mm}
  @media print{
    .wrap{padding:0;max-width:none}
    body{background:#fff}
    .no-print{display:none !important}
    h2.sec,.fc-head{page-break-after:avoid}
    .fc,.fc-row{page-break-inside:avoid}
  }
`;

// ---- documento --------------------------------------------------------------

export function buildFinalesHTML(a: {
  periodoLabel: string;  // "Julio" | "Diciembre" | "Febrero"
  anioReal: number;      // año real del período (para el título)
  month: number;         // 1..12 — mes calendario del período
  year: number;          // año calendario de ese mes
  rows: FinalesExportRow[]; // solo mesas del período, YA ordenadas por fecha+hora
  margenDias: number;    // margen de repaso configurado
  generado: string;      // fecha legible de generación
  autoPrint: boolean;    // true → window.print() al cargar
}): string {
  const n = a.rows.length;
  const margenTxt = `${a.margenDias} día${a.margenDias === 1 ? "" : "s"}`;
  const title = `Finales — ${a.periodoLabel} ${a.anioReal}`;

  // Script de autoimpresión: mismo patrón que exportPlan (focus + print onload).
  const autoPrintScript = a.autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},250);});</script>`
    : "";

  const inner = `<header class="doc">
    <p class="kick">StudyVaults · ITBA</p>
    <h1>${esc(title)}</h1>
    <p class="sub">${n} final${n === 1 ? "" : "es"} en este período · margen de repaso configurado: ${esc(
      margenTxt,
    )}</p>
    <p class="gen">Generado el ${esc(a.generado)}</p>
  </header>

  <div class="summary">
    <div class="s accent"><b>${n}</b><span>final${n === 1 ? "" : "es"}</span></div>
    <div class="s"><b>${esc(a.periodoLabel)}</b><span>${esc(String(a.anioReal))}</span></div>
    <div class="s"><b>${esc(margenTxt)}</b><span>margen de repaso</span></div>
  </div>

  <h2 class="sec">Calendario</h2>
  ${monthGridHTML(a.month, a.year, a.rows)}

  <h2 class="sec">Mesas del período</h2>
  ${mesaListHTML(a.rows, a.margenDias)}

  <footer class="doc">Fechas sujetas a confirmación de la cátedra — verificá siempre con el/la docente. Este documento no es la fuente oficial.</footer>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ITBA</title>
<style>${CSS}</style>
${autoPrintScript}
</head>
<body>
<div class="wrap">
${inner}
</div>
</body>
</html>`;
}
