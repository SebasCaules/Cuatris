"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "../tokens";

const MoonIcon = (
  <svg
    className="ico-moon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

const SunIcon = (
  <svg
    className="ico-sun"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.6M19.4 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
  </svg>
);

/**
 * ThemeToggle — conmuta `[data-theme]` en `<html>` entre `dark`/`light`,
 * persiste la elección en `localStorage` (clave `THEME_STORAGE_KEY`) y
 * emite el evento `sv:themechange`. Se sincroniza con el valor que fijó
 * el script anti-flash. Variante `desktop` (íconos) o `mobile` (con label).
 *
 * @example
 *   <ThemeToggle />
 *   <ThemeToggle variant="mobile" />
 */
export interface ThemeToggleProps {
  variant?: "desktop" | "mobile";
}

export function ThemeToggle({ variant = "desktop" }: ThemeToggleProps) {
  const [isLight, setIsLight] = useState(false);

  // Sincronizar con el data-theme que fijó el script anti-flash.
  useEffect(() => {
    setIsLight(
      document.documentElement.getAttribute("data-theme") === "light",
    );
  }, []);

  function toggle() {
    const next =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "dark"
        : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    setIsLight(next === "light");
    window.dispatchEvent(
      new CustomEvent("sv:themechange", { detail: { theme: next } }),
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      aria-pressed={isLight}
      title={isLight ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      className={
        variant === "mobile"
          ? "theme-toggle theme-toggle--mobile"
          : "theme-toggle theme-toggle--desktop"
      }
    >
      {MoonIcon}
      {SunIcon}
      {variant === "mobile" && (
        <>
          <span className="lbl-dark">Tema claro</span>
          <span className="lbl-light">Tema oscuro</span>
        </>
      )}
    </button>
  );
}

export default ThemeToggle;
