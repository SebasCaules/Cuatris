"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";

/**
 * Tabs — barra de pestañas (`.vtool-tabs` con botones `.vtool-tab`; la
 * activa lleva `.is-active`), igual que el segmented control del toolkit.
 * Funciona controlado (`value` + `onChange`) o no controlado
 * (`defaultValue`, con estado interno). Navegación por teclado con flechas
 * / Home / End y wiring ARIA (tablist/tab/tabpanel + roving tabindex). Si se
 * pasa `panels`, renderiza debajo de la barra el panel de la pestaña activa.
 *
 * @example
 *   <Tabs
 *     tabs={[{ id: "a", label: "Uno" }, { id: "b", label: "Dos" }]}
 *     defaultValue="a"
 *     panels={{ a: <PanelUno />, b: <PanelDos /> }}
 *   />
 *   <Tabs tabs={tabs} value={tab} onChange={setTab} />
 */
export interface TabsProps {
  tabs: { id: string; label: ReactNode }[];
  /** Pestaña activa (modo controlado). */
  value?: string;
  /** Pestaña activa inicial (modo no controlado). */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Contenido por pestaña; si se pasa, renderiza el panel activo. */
  panels?: Record<string, ReactNode>;
  className?: string;
}

export function Tabs({
  tabs,
  value,
  defaultValue,
  onChange,
  panels,
  className,
}: TabsProps) {
  const base = useId();
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id);
  const isControlled = value !== undefined;
  const active = isControlled ? value : internal;

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  const select = (id: string) => {
    if (!isControlled) setInternal(id);
    onChange?.(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === active);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const nt = tabs[next];
    select(nt.id);
    document.getElementById(tabId(nt.id))?.focus();
  };

  return (
    <div className={cn(className)}>
      <div className="vtool-tabs" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panels ? panelId(t.id) : undefined}
              tabIndex={isActive ? 0 : -1}
              className={cn("vtool-tab", isActive && "is-active")}
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {panels && active !== undefined && (
        <div
          id={panelId(active)}
          role="tabpanel"
          aria-labelledby={tabId(active)}
          tabIndex={0}
        >
          {panels[active]}
        </div>
      )}
    </div>
  );
}

export default Tabs;
