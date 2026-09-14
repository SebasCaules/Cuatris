"use client";

// Selector de carrera de la barra superior: un botón con la carrera activa y
// un menú propio (sin <select> nativo) con todas las carreras de grado del
// ITBA. Las que no tienen plan cargado en el SGA se ven pero no se eligen.
import { useEffect, useId, useRef, useState } from "react";
import { CARRERAS, carreraInfo, nombreCorto } from "@/lib/planner/carreras";
import { useCarrera } from "./carreraContext";
import { Tooltip } from "./Tooltip";
import { IconChevronDown } from "./icons";

export default function CarreraSwitch() {
  const { codigo, cargando, cambiar } = useCarrera();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const activa = codigo ? carreraInfo(codigo) : undefined;

  // cerrar con clic afuera / Escape; al abrir, foco en la carrera activa
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    listRef.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="carrera" ref={rootRef}>
      <Tooltip content="Cambiar de carrera: cada una guarda su propio progreso" width={220} placement="bottom">
        <button
          type="button"
          className={"carrera__btn" + (open ? " is-open" : "")}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-busy={cargando != null}
          onClick={() => setOpen((v) => !v)}
        >
          {(cargando ?? codigo) && <span className="carrera__code">{cargando ?? codigo}</span>}
          <span className={"carrera__name" + (codigo || cargando ? "" : " is-empty")}>
            {cargando ? "Cargando…" : codigo ? nombreCorto(activa?.nombre ?? codigo) : "Elegí tu carrera"}
          </span>
          <IconChevronDown size={14} />
        </button>
      </Tooltip>
      {open && (
        <div
          className="carrera__menu"
          id={menuId}
          role="menu"
          aria-label="Carreras"
          ref={listRef}
          onKeyDown={onListKey}
        >
          {CARRERAS.map((c) => {
            const item = (
              <button
                key={c.codigo}
                type="button"
                role="menuitemradio"
                aria-checked={c.codigo === codigo}
                className={"carrera__item" + (c.codigo === codigo ? " is-active" : "")}
                disabled={!c.disponible}
                onClick={() => {
                  setOpen(false);
                  void cambiar(c.codigo);
                }}
              >
                <span className="carrera__item-code">{c.codigo}</span>
                <span className="carrera__item-name">{c.nombre}</span>
                <span className="carrera__item-plan">{c.plan ?? "—"}</span>
              </button>
            );
            return c.disponible ? (
              item
            ) : (
              <Tooltip
                key={c.codigo}
                content={c.plan ? "El SGA no tiene cargadas las materias de este plan" : "Sin plan de estudios"}
                width={200}
                placement="bottom"
              >
                {item}
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
