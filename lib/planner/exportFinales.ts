// Export del calendario de FINALES de un período (Julio / Diciembre / Febrero):
// una «hoja» A4 vertical, fondo blanco, todo en una página (calendario del
// mes + lista de mesas), que sirve tanto para imprimir / guardar como PDF
// (buildFinalesHTML → documento completo) como para bajar como imagen
// (buildFinalesSheet → fragmento + CSS que rasteriza exportImage.ts).
//
// El calendario NO se arma acá: llega ya renderizado (`calendarHTML`) desde el
// componente compartido MonthCalendar, así lo que se exporta es exactamente lo
// que se ve en pantalla. Sin DOM ni dependencias; colores literales (rgba,
// nunca color-mix) para que imprima igual en cualquier visor; tipografía
// serif/mono del sistema (la imagen no puede cargar fuentes externas).

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

/** dd/mm a partir de "YYYY-MM-DD" (fallback al string crudo si no parsea). */
function ddmm(fecha: string): string {
  const d = parseISO(fecha);
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` : esc(fecha);
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

// ---- hoja A4 ----------------------------------------------------------------

/** A4 vertical a 96 dpi: 210 × 297 mm. Márgenes de 10 mm. */
export const SHEET_W = 794;
export const SHEET_H = 1123;
export const SHEET_PAD = 38;

// Tokens y tipografía calcados de exportPlan.ts (mismo lenguaje visual).
const SHEET_CSS = `
  .sheet{box-sizing:border-box;width:${SHEET_W}px;min-height:${SHEET_H}px;padding:${SHEET_PAD}px;background:#fff;color:#2b211c;font-family:Georgia,"Times New Roman",serif;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet *{box-sizing:border-box}
  .sheet .mono{font-family:"SFMono-Regular",Menlo,Consolas,monospace}
  .sheet header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;border-bottom:2px solid #2b211c;padding-bottom:10px;margin-bottom:14px}
  .sheet .kick{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#d2754f;margin:0 0 4px}
  .sheet h1{font-size:24px;line-height:1.1;margin:0;letter-spacing:-.01em}
  .sheet .hmeta{text-align:right;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:10px;line-height:1.6;color:#8a7d73;white-space:nowrap}
  .sheet .hmeta b{display:block;font-family:Georgia,"Times New Roman",serif;font-size:15px;color:#2b211c;letter-spacing:0}
  .sheet h2{font-size:12px;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#5a4d45;margin:16px 0 8px}
  /* lista de mesas: compacta, una línea por mesa, hueco de repaso entre medio */
  .fc-list{width:100%;border-collapse:collapse;font-size:11.5px}
  .fc-list thead th{text-align:left;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#8a7d73;padding:0 8px 5px;border-bottom:1px solid #d9d2ca}
  .fc-row{border-bottom:1px solid #e9e3dc}
  .fc-list td{padding:5px 8px;vertical-align:middle}
  .fc-r__date{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:11px;font-weight:600;white-space:nowrap;width:56px}
  .fc-r__time{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:10.5px;color:#5a4d45;white-space:nowrap;width:52px}
  .fc-r__mat{width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0}
  .fc-r__dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin-right:7px;vertical-align:middle}
  .fc-r__mat b{font-size:11.5px}
  .fc-r__mat span{color:#5a4d45;font-size:11px}
  .fc-r__call{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:10px;color:#5a4d45;white-space:nowrap}
  .fc-r__call.is-manual{color:#8a7d73;font-style:italic}
  .fc-gap td{padding:1px 8px 1px 24px;border:none}
  .fc-gap__line{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9px;letter-spacing:.02em;color:#8a7d73}
  .fc-gap__line::before{content:"↕ ";opacity:.6}
  .fc-gap.is-alert .fc-gap__line{color:#9c3b2e}
  .fc-empty{font-size:12px;color:#8a7d73;font-style:italic;margin:6px 0 0}
  .sheet footer{margin-top:14px;border-top:1px solid #d9d2ca;padding-top:8px;color:#8a7d73;font-size:9.5px;font-family:"SFMono-Regular",Menlo,Consolas,monospace;line-height:1.5}
`;

export interface FinalesSheetArgs {
  periodoLabel: string; // "Julio" | "Diciembre" | "Febrero"
  anioReal: number; // año real del período (para el título)
  mesLabel: string; // "Diciembre 2026" (mes calendario mostrado)
  rows: FinalesExportRow[]; // solo mesas del período, YA ordenadas por fecha+hora
  margenDias: number; // margen de repaso configurado
  generado: string; // fecha legible de generación
  calendarHTML: string; // MonthCalendar renderizado (renderStaticHTML)
  calendarCSS: string; // MONTH_CALENDAR_PRINT_CSS
}

/** La hoja (fragmento HTML + CSS): cabecera, calendario, mesas y pie. */
export function buildFinalesSheet(a: FinalesSheetArgs): { html: string; css: string } {
  const n = a.rows.length;
  const margenTxt = `${a.margenDias} día${a.margenDias === 1 ? "" : "s"}`;
  const html = `<div class="sheet">
  <header>
    <div>
      <p class="kick">Cuatris · ITBA</p>
      <h1>Finales — ${esc(a.periodoLabel)} ${esc(String(a.anioReal))}</h1>
    </div>
    <div class="hmeta"><b>${n} final${n === 1 ? "" : "es"}</b>margen de repaso: ${esc(
      margenTxt,
    )}<br/>generado el ${esc(a.generado)}</div>
  </header>
  <h2>${esc(a.mesLabel)}</h2>
  ${a.calendarHTML}
  <h2>Mesas del período</h2>
  ${mesaListHTML(a.rows, a.margenDias)}
  <footer>Fechas sujetas a confirmación de la cátedra — verificá siempre con el/la docente. Este documento no es la fuente oficial.</footer>
</div>`;
  return { html, css: a.calendarCSS + SHEET_CSS };
}

// ---- documento imprimible -----------------------------------------------------

/** Documento HTML completo: la hoja centrada, @page A4 y, al imprimir, un
 *  ajuste de escala para que TODO entre en una sola página aunque el mes
 *  tenga 7 semanas o haya muchas mesas. */
export function buildFinalesHTML(
  a: FinalesSheetArgs & { autoPrint: boolean },
): string {
  const { html, css } = buildFinalesSheet(a);
  const title = `Finales — ${a.periodoLabel} ${a.anioReal}`;
  const avail = SHEET_H - SHEET_PAD * 2;
  // Escala a una página: si la hoja mide más que el alto útil, se reduce con
  // `zoom` (afecta al layout, así no queda una segunda página en blanco).
  const fitScript = `<script>(function(){function fit(){var s=document.querySelector('.sheet');if(!s)return;s.style.zoom='';var h=s.scrollHeight-${SHEET_PAD * 2};if(h>${avail}){s.style.zoom=String(${avail}/h);}}window.addEventListener('load',fit);window.addEventListener('beforeprint',fit);${
    a.autoPrint
      ? "window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},250);});"
      : ""
  }})();</script>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ITBA</title>
<style>
  html,body{margin:0;padding:0;background:#e9e4de}
  .page{display:flex;justify-content:center;padding:24px 12px}
  .sheet{box-shadow:0 10px 40px rgba(0,0,0,.18)}
  ${css}
  @page{size:A4 portrait;margin:0}
  @media print{
    html,body{background:#fff}
    .page{padding:0;display:block}
    .sheet{box-shadow:none;min-height:0;page-break-inside:avoid;break-inside:avoid}
  }
</style>
${fitScript}
</head>
<body>
<div class="page">${html}</div>
</body>
</html>`;
}
