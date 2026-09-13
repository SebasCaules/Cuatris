// ============================================================================
// Fuentes de la planilla de finales — traer del link oficial o leer un archivo
// ----------------------------------------------------------------------------
// La parte con I/O del parser (el parseo puro vive en `parseFinales.ts`).
//
// El link oficial es un Google Sheet "Publicado en la web". Su endpoint
// `.../pub?output=csv` responde con CORS abierto (`access-control-allow-origin`
// hace echo de cualquier origen en el redirect y `*` en el CSV final), así que
// se puede traer con `fetch()` directo desde el sitio estático en GitHub Pages
// (verificado para localhost y sebascaules.github.io). El archivo subido es el
// fallback: sirve para una planilla propia o si el link está caído.
//
// Además del CSV, se acepta subir/pegar el **HTML** de la planilla (la página
// "Publicar en la web → pubhtml" de Google Sheets, guardada con «Guardar como →
// Página web completa»). Ese HTML trae la grilla como un `<table>` con las
// mismas columnas que el CSV, así que se extrae con `DOMParser` y se reusa el
// mismo parser. Si el HTML es solo el *marco* de Sheets (la data vive aparte en
// `…_files/sheet.html`), se detecta la URL publicada embebida y se trae su CSV.
// ============================================================================

import {
  parseFinalesCsv,
  parseFinalesTable,
  type FinalMateriaRow,
  type FinalesParseResult,
} from "./parseFinales";

/**
 * Id de la publicación en la web del Google Sheet de la universidad. Cambiá
 * esta constante cuando publiquen un cronograma nuevo: sale de "Archivo →
 * Compartir → Publicar en la web" (es el tramo `/d/e/<id>/pub` de la URL).
 * Vigente: "Cronograma finales DIC 26 / FEB 27".
 */
const FINALES_PUB_ID =
  "2PACX-1vTbew8lvCvKfCSnLyCpHrGAS_o-i4AnKloheKOE5w1jmA_E-PW_3ZWF422fenKwajHb64l9icN5oA7T";

/**
 * Pestañas publicadas del cronograma, en orden cronológico. Cada llamado vive
 * en su propia pestaña (`gid`) y con su propia forma: Diciembre trae dos
 * llamados por materia (6 columnas) y Febrero uno solo (4), así que NO se
 * pueden concatenar como texto — se traen y se parsean por separado.
 * El `gid` de una pestaña se lee en la URL de su vista publicada.
 */
export const FINALES_PUB_TABS: readonly { gid: string; label: string }[] = [
  { gid: "0", label: "Diciembre 2026" },
  { gid: "1794840210", label: "Febrero 2027" },
];

/** Endpoint CSV de una pestaña publicada (o de la primera si no se indica gid). */
export const finalesPubCsvUrl = (gid?: string): string =>
  `https://docs.google.com/spreadsheets/d/e/${FINALES_PUB_ID}/pub?output=csv` +
  (gid ? `&single=true&gid=${gid}` : "");

/** Endpoint CSV de la primera pestaña — default histórico de `fetchFinalesCsv`. */
export const FINALES_PUB_CSV_URL = finalesPubCsvUrl();

/** Link legible (pubhtml) para que el usuario abra la planilla en el navegador. */
export const FINALES_PUB_HTML_URL =
  `https://docs.google.com/spreadsheets/d/e/${FINALES_PUB_ID}/pubhtml`;

/**
 * Trae el CSV de la planilla oficial (o de otra URL `pub?output=csv`). Corre
 * en el cliente (usa `fetch`). Lanza un error legible si la red falla o el
 * servidor no responde 2xx.
 */
export async function fetchFinalesCsv(
  url: string = FINALES_PUB_CSV_URL,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", cache: "no-store" });
  } catch (e) {
    throw new Error(
      "No se pudo conectar con la planilla. Revisá tu conexión o subí el CSV a mano. " +
        (e instanceof Error ? e.message : ""),
    );
  }
  if (!res.ok) {
    throw new Error(`La planilla respondió ${res.status}. Probá subir el CSV a mano.`);
  }
  const text = await res.text();
  if (looksLikeHtml(text)) {
    throw new Error(
      "El link no devolvió un CSV (parece una página HTML). Verificá que sea el enlace de «Publicar en la web» en formato CSV.",
    );
  }
  return text;
}

/**
 * Trae el cronograma oficial COMPLETO: una pasada por cada pestaña publicada
 * (`FINALES_PUB_TABS`), parseando cada una por separado y fusionando las filas.
 * Es necesario porque las pestañas no comparten forma — Diciembre trae dos
 * llamados por materia y Febrero uno — así que concatenar los CSV crudos
 * rompería el mapeo de columnas.
 *
 * Una materia aparece en varias pestañas: sus fechas se acumulan en la misma
 * fila (`extra`), y `bucketizarFinales` las reparte después por el MES de cada
 * fecha, así que no hace falta decidir acá a qué llamado pertenece cada una.
 *
 * Si una pestaña falla se sigue con las demás y el problema queda como warning:
 * mejor traer Diciembre solo que no traer nada.
 */
export async function fetchFinalesOficial(): Promise<FinalesParseResult> {
  const porCodigo = new Map<string, FinalMateriaRow>();
  const warnings: string[] = [];
  let periodoDetectado: FinalesParseResult["periodoDetectado"] = null;
  let anioDetectado: FinalesParseResult["anioDetectado"] = null;

  for (const tab of FINALES_PUB_TABS) {
    let res: FinalesParseResult;
    try {
      res = parseFinalesCsv(await fetchFinalesCsv(finalesPubCsvUrl(tab.gid)));
    } catch (e) {
      warnings.push(
        `${tab.label}: no se pudo traer la pestaña. ` +
          (e instanceof Error ? e.message : ""),
      );
      continue;
    }
    warnings.push(...res.warnings.map((w) => `${tab.label}: ${w}`));
    periodoDetectado ??= res.periodoDetectado;
    anioDetectado ??= res.anioDetectado;

    for (const row of res.rows) {
      const previa = porCodigo.get(row.codigo);
      if (!previa) {
        porCodigo.set(row.codigo, row);
        continue;
      }
      // Misma materia en otra pestaña: sus fechas se suman como llamados extra.
      for (const f of [row.primer, row.segundo, ...row.extra]) {
        if (f) previa.extra.push(f);
      }
    }
  }

  const rows = [...porCodigo.values()];
  if (rows.length === 0 && warnings.length === 0) {
    warnings.push("La planilla oficial no devolvió ninguna fila.");
  }
  return { rows, warnings, periodoDetectado, anioDetectado };
}

/**
 * Lee un archivo subido como texto UTF-8. Acepta `.csv` (o texto pegado). Los
 * `.xlsx` son un ZIP binario y NO se parsean acá: se detectan y se rechaza con
 * un mensaje que pide bajar la planilla como CSV (Google Sheets → Archivo →
 * Descargar → CSV), evitando arrastrar una dependencia pesada tipo SheetJS.
 */
export function readFinalesFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const nombre = file.name.toLowerCase();
    if (/\.(xlsx|xls|ods)$/.test(nombre)) {
      reject(
        new Error(
          "Los archivos de Excel (.xlsx) no se leen directamente. En Google Sheets usá «Archivo → Descargar → Valores separados por comas (.csv)» y subí ese archivo.",
        ),
      );
      return;
    }
    if (typeof FileReader === "undefined") {
      reject(new Error("Tu navegador no permite leer archivos."));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const text = String(fr.result ?? "");
      // .xlsx renombrado a .csv → arranca con la firma ZIP "PK".
      if (text.startsWith("PK")) {
        reject(
          new Error(
            "El archivo parece un Excel (.xlsx) con otra extensión. Descargalo como CSV desde Google Sheets y subí ese.",
          ),
        );
        return;
      }
      resolve(text);
    };
    fr.onerror = () =>
      reject(fr.error ?? new Error("No se pudo leer el archivo."));
    fr.readAsText(file, "utf-8");
  });
}

/** Heurística mínima: ¿el texto es una página HTML en vez de un CSV? */
function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 400).trimStart().toLowerCase();
  return (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<table") ||
    head.startsWith("<tr") ||
    /<table[\s>]/.test(head)
  );
}

/**
 * Extrae todas las tablas de un HTML como matrices de celdas (`string[][]`),
 * usando el parser del navegador (`DOMParser`) — decodifica entidades y aplana
 * el markup de cada celda sin ejecutar scripts. Incluye celdas `td` y `th`: el
 * `th` de encabezado de fila (el número de fila que agrega Google Sheets) queda
 * como columna 0, pero `findHeader` mapea por nombre y el offset es constante en
 * todas las filas, así que no afecta el alineado. Browser-only: llamalo desde
 * handlers del cliente (hay guard para SSR/export).
 */
export function htmlToTables(html: string): string[][][] {
  if (typeof DOMParser === "undefined") {
    throw new Error("Tu navegador no permite leer archivos HTML.");
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[][][] = [];
  doc.querySelectorAll("table").forEach((tbl) => {
    const rows: string[][] = [];
    tbl.querySelectorAll("tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("td,th").forEach((c) =>
        cells.push((c.textContent ?? "").replace(/\s+/g, " ").trim()),
      );
      if (cells.length) rows.push(cells);
    });
    if (rows.length) out.push(rows);
  });
  return out;
}

/**
 * Si el HTML es una publicación de Google Sheets (pubhtml), devuelve la URL de
 * su export CSV (`…/pub?output=csv`) derivada del id publicado embebido. Sirve
 * para el caso en que el archivo subido es solo el *marco* de Sheets y la grilla
 * vive en un archivo aparte: en vez de pedirla, se trae el CSV en vivo.
 */
export function extractPubCsvUrl(html: string): string | null {
  const m = html.match(/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pub/);
  return m ? `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv` : null;
}

/**
 * Punto de entrada único para texto pegado o archivos leídos: detecta si es CSV
 * o HTML y devuelve las filas parseadas.
 *   · CSV/texto → `parseFinalesCsv`.
 *   · HTML con la tabla adentro (p. ej. `sheet.html`) → se extrae y se parsea
 *     100% local, sin red.
 *   · HTML que es solo el marco pubhtml → se trae su CSV publicado (`fetch`).
 * Es async porque el último caso puede necesitar red; los otros resuelven ya.
 */
export async function parseFinalesInput(text: string): Promise<FinalesParseResult> {
  if (!looksLikeHtml(text)) return parseFinalesCsv(text);

  let tables: string[][][] = [];
  try {
    tables = htmlToTables(text);
  } catch {
    /* sin DOMParser (SSR) — cae al fallback de red si hay URL */
  }
  for (const t of tables) {
    const res = parseFinalesTable(t);
    if (res.rows.length > 0) return res;
  }

  const csvUrl = extractPubCsvUrl(text);
  if (csvUrl) return parseFinalesCsv(await fetchFinalesCsv(csvUrl));

  return {
    rows: [],
    warnings: [
      "El HTML no contenía la tabla de finales. Si lo guardaste desde Google " +
        "Sheets, subí el archivo «sheet.html» de la carpeta «…_files», o usá " +
        "«Traer del link oficial».",
    ],
    periodoDetectado: null,
    anioDetectado: null,
  };
}
