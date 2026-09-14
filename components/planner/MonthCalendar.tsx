// Calendario mensual (Lu..Sá) compartido: una sola grilla para la pantalla y
// para los documentos exportados (PDF / imagen), así lo que se imprime es
// exactamente lo que se ve. Es puro (sin estado ni hooks): recibe las semanas
// ya armadas (buildMonthWeeks) y un `renderDay` con el contenido de cada
// celda; en pantalla las celdas llevan bloques interactivos, en el export
// bloques estáticos (MonthCalendarEvent).
//
// Tamaños fijos: todas las celdas miden lo mismo (`cellHeight`, calculado por
// el consumidor a partir del máximo de ítems posibles en un día), así la grilla
// no se agranda ni se achica al pasar el cursor o al prender «Otras fechas».
//
// Estilos: month-calendar.css (pantalla, tokens del planner) y
// MONTH_CALENDAR_PRINT_CSS (documento exportado, colores literales). Mismas
// clases `mcal*` en los dos.
import type { CSSProperties, ReactNode } from "react";

export const MCAL_DOW = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá"] as const;

export interface MonthCalDay {
  iso: string; // YYYY-MM-DD (fecha local)
  dayNum: number;
  inMonth: boolean;
}

export const mcalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export const mcalParse = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Semanas Lu..Sá del mes (sin domingo). Si alguna fecha de `extendTo` cae
 *  después de fin de mes (Febrero → primeros días de marzo), se agregan las
 *  semanas necesarias; esas celdas quedan `inMonth: false`. */
export function buildMonthWeeks(
  month: number,
  year: number,
  extendTo: readonly string[] = [],
): MonthCalDay[][] {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = (first.getDay() + 6) % 7; // Lu=0 … Do=6
  let lastDay = daysInMonth;
  for (const iso of extendTo) {
    const d = mcalParse(iso);
    if (d.getFullYear() > year || (d.getFullYear() === year && d.getMonth() > month - 1))
      lastDay = Math.max(lastDay, daysInMonth + d.getDate());
  }
  const numWeeks = Math.ceil((startOffset + lastDay) / 7);
  const weeks: MonthCalDay[][] = [];
  for (let w = 0; w < numWeeks; w++) {
    const days: MonthCalDay[] = [];
    for (let dow = 0; dow < 6; dow++) {
      const offset = w * 7 + dow - startOffset;
      const d = new Date(year, month - 1, 1 + offset);
      days.push({
        iso: mcalIso(d),
        dayNum: d.getDate(),
        inMonth: d.getMonth() === month - 1,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

export interface MonthCalendarProps {
  weeks: MonthCalDay[][];
  /** contenido de la celda (bloques del día), después del número. */
  renderDay: (day: MonthCalDay) => ReactNode;
  /** clases extra por celda (`is-dim`, etc.). */
  dayClass?: (day: MonthCalDay) => string;
  /** alto fijo de cada celda en px (todas iguales). */
  cellHeight: number;
  /** días en los que el número se muestra aunque la celda esté fuera del mes. */
  showNum?: (day: MonthCalDay) => boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function MonthCalendar({
  weeks,
  renderDay,
  dayClass,
  cellHeight,
  showNum,
  label,
  className,
  style,
}: MonthCalendarProps) {
  return (
    <div
      className={"mcal" + (className ? " " + className : "")}
      role="grid"
      aria-label={label}
      style={{ ...style, ["--mcal-cell" as string]: `${cellHeight}px` }}
    >
      {MCAL_DOW.map((d) => (
        <div key={d} className="mcal__dow">
          {d}
        </div>
      ))}
      {weeks.map((wk, wi) =>
        wk.map((day, di) => {
          const extra = dayClass?.(day) ?? "";
          const num = day.inMonth || (showNum ? showNum(day) : false);
          return (
            <div
              key={`${wi}-${di}`}
              className={
                "mcal__day" +
                (day.inMonth ? "" : " is-out") +
                (extra ? " " + extra : "")
              }
              role="gridcell"
            >
              {num && <span className="mcal__num">{day.dayNum}</span>}
              {renderDay(day)}
            </div>
          );
        }),
      )}
    </div>
  );
}

/** Bloque estático de un evento (export / vista previa): nombre, hora y una
 *  etiqueta corta (1º / 2º / manual). El color de la materia acentúa el
 *  borde izquierdo y tiñe el fondo (rgba literal: imprime en cualquier visor). */
export function MonthCalendarEvent({
  name,
  time,
  tag,
  color,
  dashed = false,
}: {
  name: string;
  time: string;
  tag?: string | null;
  color: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={"mcal__ev" + (dashed ? " is-dashed" : "")}
      style={{
        background: tint(color, 0.14),
        borderColor: tint(color, 0.45),
        borderLeftColor: color,
      }}
    >
      <span className="mcal__ev-name">{name}</span>
      <span className="mcal__ev-meta">
        <span className="mcal__ev-time">{time}</span>
        {tag && <span className="mcal__ev-tag">{tag}</span>}
      </span>
    </div>
  );
}

/** rgba a partir del hex de la paleta (sin color-mix: imprime igual en todos lados). */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Alto de celda para que entren `n` bloques de `evH` px (mínimo 1 bloque). */
export const mcalCellHeight = (n: number, evH: number, gap = 4): number => {
  const k = Math.max(1, n);
  return 22 + k * evH + (k - 1) * gap + 6;
};

/* ---------------------------------------------------------------------------
   CSS del documento exportado (PDF / imagen). Mismas clases que en pantalla,
   colores literales, tamaños en px pensados para una hoja A4 vertical.
   --------------------------------------------------------------------------- */
export const MONTH_CALENDAR_PRINT_CSS = `
  .mcal{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border:1px solid #d9d2ca;border-radius:8px;overflow:hidden;background:#fff;--mcal-cell:96px}
  .mcal__dow{padding:6px 4px;text-align:center;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6b5f56;background:#f4f1ec;border-bottom:1px solid #d9d2ca;border-left:1px solid #d9d2ca}
  .mcal__day{height:var(--mcal-cell);box-sizing:border-box;overflow:hidden;padding:4px 5px 5px;border-top:1px solid #d9d2ca;border-left:1px solid #d9d2ca;display:flex;flex-direction:column;gap:4px;background:#fff}
  .mcal__dow:nth-child(6n+1),.mcal__day:nth-child(6n+1){border-left:0}
  .mcal__day.is-out{background:repeating-linear-gradient(135deg,transparent,transparent 9px,#f1ece5 9px,#f1ece5 10px)}
  .mcal__num{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:10px;line-height:1.2;color:#8a7d73}
  .mcal__day.has-ev .mcal__num{color:#2b211c;font-weight:600}
  .mcal__ev{box-sizing:border-box;height:var(--mcal-ev,44px);border:1px solid;border-left-width:3px;border-radius:5px;padding:3px 5px;display:flex;flex-direction:column;justify-content:space-between;gap:1px;overflow:hidden}
  .mcal__ev.is-dashed{border-left-style:dashed}
  .mcal__ev-name{font-family:Georgia,"Times New Roman",serif;font-weight:bold;font-size:10px;line-height:1.15;color:#2b211c;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .mcal__ev-meta{display:flex;align-items:center;justify-content:space-between;gap:4px}
  .mcal__ev-time{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9px;color:#5a4d45}
  .mcal__ev-tag{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:8px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8a7d73}
`;
