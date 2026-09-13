"use client";

import { toMin } from "@/lib/planner/time";
import type { WeekBlock } from "@/lib/planner/types";

/**
 * Timetable diseñado de una cursada: calendario semanal con bloques del color
 * de la materia, días libres marcados y ensamblado escalonado. Compartido por
 * el Combinador y el Plan de cursada. `compact` achica la escala para tarjetas.
 */
export default function CursadaCalendar({
  blocks,
  days,
  compact = false,
  dense = false,
  onBlockClick,
  onBlockPointerDown,
}: {
  blocks: WeekBlock[];
  days: string[];
  compact?: boolean;
  // `dense`: escala intermedia, más "deszoomeada" que la completa pero con rango
  // horario y aula (para el calendario full-width del Combinador).
  dense?: boolean;
  // Click en un bloque con código → abre la materia (drawer/ficha) en el caller.
  onBlockClick?: (code: string) => void;
  // pointerdown en un bloque con código → el caller decide si arranca un
  // arrastre (Plan de cursada: mover la materia a otro cuatrimestre).
  onBlockPointerDown?: (code: string, e: React.PointerEvent) => void;
}) {
  const PX = compact ? 0.44 : dense ? 0.56 : 0.82;
  let minM = 8 * 60;
  let maxM = 22 * 60;
  blocks.forEach((b) => {
    minM = Math.min(minM, toMin(b.desde));
    maxM = Math.max(maxM, toMin(b.hasta));
  });
  minM = Math.floor(minM / 60) * 60;
  maxM = Math.ceil(maxM / 60) * 60;
  const hours: number[] = [];
  for (let t = minM; t < maxM; t += 60) hours.push(t);
  const bodyH = (maxM - minM) * PX;
  const cols = `${compact ? 32 : dense ? 42 : 46}px repeat(${days.length}, minmax(0, 1fr))`;
  let order = 0;

  return (
    <div
      className={
        "cmbcal" +
        (compact ? " cmbcal--compact" : "") +
        (dense ? " cmbcal--dense" : "")
      }
    >
      <div className="cmbcal__head" style={{ gridTemplateColumns: cols }}>
        <span className="cmbcal__corner" />
        {days.map((d) => {
          const n = blocks.filter((b) => b.dia === d).length;
          return (
            <div
              className={"cmbcal__day" + (n === 0 ? " is-free" : "")}
              key={d}
            >
              {d.slice(0, 3)}
              {n > 0 && <i>{n}</i>}
            </div>
          );
        })}
      </div>
      <div
        className="cmbcal__body"
        style={{ gridTemplateColumns: cols, height: bodyH }}
      >
        <div className="cmbcal__gutter">
          {hours.map((t) => (
            <div className="cmbcal__hour" style={{ height: 60 * PX }} key={t}>
              <span>{String(t / 60).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayBlocks = blocks.filter((b) => b.dia === d);
          return (
            <div
              className={"cmbcal__col" + (dayBlocks.length === 0 ? " is-free" : "")}
              key={d}
            >
              {hours.map((t) => (
                <div className="cmbcal__cell" style={{ height: 60 * PX }} key={t} />
              ))}
              {dayBlocks.length === 0 && (
                <span className="cmbcal__freelbl">libre</span>
              )}
              {dayBlocks.map((b, i) => {
                const top = (toMin(b.desde) - minM) * PX;
                const h = (toMin(b.hasta) - toMin(b.desde)) * PX;
                const idx = order++;
                // Cuántas líneas de la abreviatura caben sin agrandar el bloque:
                // descontamos el padding vertical y la fila de rango horario (solo
                // fuera de compacto), y dividimos por el alto de línea de la escala.
                // El CSS envuelve por palabra y clampa con … a este número.
                const pad = compact ? 4 : dense ? 6 : 10;
                const extras = compact ? 0 : dense ? 12 : 14;
                const lh = compact ? 11.5 : dense ? 13 : 15;
                const abbrLines = Math.max(
                  1,
                  Math.min(3, Math.floor((h - pad - extras) / lh)),
                );
                // Interactivo solo si hay código y el caller pasó handler.
                // Un fantasma de vista previa nunca es interactivo.
                const clickable = Boolean(b.codigo && onBlockClick && !b.preview);
                const draggable = Boolean(b.codigo && onBlockPointerDown && !b.preview);
                return (
                  <div
                    key={i}
                    className={
                      "cmbcal-blk" +
                      (b.conf ? " is-conf" : "") +
                      (b.preview ? " is-preview" : "") +
                      (b.dragging ? " is-dragging" : "") +
                      (clickable ? " is-clickable" : "")
                    }
                    style={
                      {
                        top,
                        height: h,
                        "--blk": b.color,
                        "--i": idx,
                      } as React.CSSProperties
                    }
                    title={`${b.nombre}${b.sala ? " · " + b.sala : ""}${b.modalidad ? " · " + b.modalidad : ""}`}
                    {...(draggable
                      ? { onPointerDown: (e: React.PointerEvent) => onBlockPointerDown!(b.codigo!, e) }
                      : {})}
                    {...(clickable
                      ? {
                          role: "button",
                          tabIndex: 0,
                          onClick: () => onBlockClick!(b.codigo!),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              if (e.key === " ") e.preventDefault();
                              onBlockClick!(b.codigo!);
                            }
                          },
                        }
                      : {})}
                  >
                    <span
                      className="cmbcal-blk__abbr"
                      style={
                        { "--abbr-lines": abbrLines } as React.CSSProperties
                      }
                    >
                      {b.abbr}
                    </span>
                    {/* En compacto omitimos el rango horario: ya lo da el eje de
                        la izquierda. Liberamos altura y destacamos el aula. */}
                    {!compact && (
                      <span className="cmbcal-blk__time">
                        {b.desde}–{b.hasta}
                      </span>
                    )}
                    {b.sala && h > (compact ? 18 : dense ? 30 : 38) && (
                      <span className="cmbcal-blk__room">{b.sala}</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
