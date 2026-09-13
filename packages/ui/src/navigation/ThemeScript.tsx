import { THEME_STORAGE_KEY, type Theme } from "../tokens";

/**
 * ThemeScript — script anti-flash: fija `data-theme` en `<html>` antes de
 * pintar, leyendo la elección guardada (`storageKey`) y, si no hay, el
 * preferido del sistema; cae a `defaultTheme` ante cualquier error.
 * Server component (devuelve un `<script>` inline) para ir en `<head>`/`<body>`.
 *
 * @example
 *   <ThemeScript />
 *   <ThemeScript storageKey="app-theme" defaultTheme="light" />
 */
export interface ThemeScriptProps {
  /** Clave de `localStorage`. Por defecto `THEME_STORAGE_KEY`. */
  storageKey?: string;
  /** Tema de fallback (ante error o sin soporte de matchMedia). Por defecto `"dark"`. */
  defaultTheme?: Theme;
}

export function ThemeScript({
  storageKey = THEME_STORAGE_KEY,
  defaultTheme = "dark",
}: ThemeScriptProps) {
  const key = JSON.stringify(storageKey);
  const fallback = JSON.stringify(defaultTheme);
  const sysPreferred = defaultTheme === "light" ? "dark" : "light";
  const sysQuery = `(prefers-color-scheme: ${sysPreferred})`;
  const script = `(function(){try{var s=localStorage.getItem(${key});var t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('${sysQuery}').matches?${JSON.stringify(sysPreferred)}:${fallback});document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme',${fallback});}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default ThemeScript;
