// ============================================================================
// Parser de la planilla oficial de finales del ITBA
// ----------------------------------------------------------------------------
// La cátedra publica el calendario de mesas como un Google Sheet "Publicado en
// la web". Ese sheet se puede bajar en CSV/XLSX (ver `source.ts`) con este
// formato (verificado sobre "Planificación de finales Julio 2026", 471 filas):
//
//   Cód,Materia,Primer llamado,Hora,Segundo llamado,Hora
//   10.01,Proyecto Final...,"lunes, 13 de julio de 2026",19:00,"lunes, 20 de julio de 2026",19:00
//
// Este módulo es PURO (sin acceso a `window`/`fetch`/`FileReader`): recibe el
// texto CSV ya leído y devuelve datos tipados. La lectura del archivo/URL vive
// en `source.ts`; el puente al modelo del planner (`MesaFinal`) vive abajo en
// `bucketizarFinales` (buckets por período × año lectivo × llamado).
//
// Robustez buscada:
//   · tokenizer CSV real (comillas, comas dentro de comillas, "" escapadas,
//     CRLF/LF, BOM) — no un `split(",")`.
//   · header tolerante: mapea columnas por nombre normalizado (sin acentos,
//     minúsculas), así aguanta reordenamientos o columnas extra.
//   · fecha en español larga → ISO ("lunes, 13 de julio de 2026" → 2026-07-13),
//     con fallback a ISO y DD/MM/YYYY.
//   · filas basura (separadores de sección, códigos vacíos) se descartan y se
//     reportan en `warnings`.
// ============================================================================

import type { FinalLlamado, FinalPeriodo, MesaFinal } from "../types";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Quita tildes/diacríticos para comparaciones tolerantes. */
const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ---------------------------------------------------------------------------
// 1. Tokenizer CSV (RFC 4180-ish)
// ---------------------------------------------------------------------------

/**
 * Parsea texto CSV a una matriz de celdas. Soporta:
 *   · campos entre comillas con comas y saltos de línea adentro,
 *   · comillas escapadas como `""`,
 *   · finales de línea LF, CRLF y CR sueltos,
 *   · BOM UTF-8 inicial.
 * No infiere tipos: todas las celdas son strings (sin `.trim()` — eso es
 * responsabilidad del consumidor).
 */
export function parseCsv(text: string): string[][] {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false; // ¿la fila/campo actual tiene algo? (para no emitir filas fantasma)

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    sawAny = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (c === ",") {
      endField();
      sawAny = true;
    } else if (c === "\n") {
      endRow();
    } else if (c === "\r") {
      // CRLF → dejamos que el \n cierre la fila; CR suelto la cierra acá.
      if (text[i + 1] !== "\n") endRow();
    } else {
      field += c;
      sawAny = true;
    }
  }
  // último campo/fila si el archivo no termina en newline (o quedó contenido).
  if (sawAny || field !== "" || row.length > 0) endRow();

  return rows;
}

// ---------------------------------------------------------------------------
// 2. Parsers de fecha y hora (español)
// ---------------------------------------------------------------------------

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9, // variante rioplatense
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/**
 * Convierte una fecha en español larga a ISO `YYYY-MM-DD`.
 *   "lunes, 13 de julio de 2026"  → "2026-07-13"
 * Tolera el día de la semana, mayúsculas, acentos y espacios extra. Fallbacks:
 * ISO `YYYY-MM-DD` y `DD/MM/YYYY`. Devuelve `null` si no reconoce nada.
 */
export function parseFechaEs(raw: string): string | null {
  if (!raw) return null;
  const s = stripAccents(raw.toLowerCase()).trim();
  if (!s || s === "-" || s === "a confirmar" || s === "s/f") return null;

  // "13 de julio de 2026" — el año exige límite de palabra: la planilla real
  // trae typos tipo "12026" que sin \b matchearían como año 1202.
  const m = s.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
  if (m) {
    const d = Number(m[1]);
    const mes = MESES[m[2]];
    const y = Number(m[3]);
    if (mes && d >= 1 && d <= 31) return `${y}-${pad2(mes)}-${pad2(d)}`;
    return null;
  }
  // ISO ya normalizada
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(+iso[2])}-${pad2(+iso[3])}`;
  // DD/MM/YYYY
  const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${pad2(+dmy[2])}-${pad2(+dmy[1])}`;

  return null;
}

/**
 * Normaliza una hora a `HH:MM` (24h) con zero-pad.
 *   "9:00"  → "09:00" · "13:15" → "13:15"
 * Devuelve `null` si no reconoce una hora válida.
 */
export function parseHora(raw: string): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad2(h)}:${pad2(mi)}`;
}

// ---------------------------------------------------------------------------
// 3. Modelo de salida
// ---------------------------------------------------------------------------

/** Un llamado (mesa) con su fecha ISO y hora normalizada. */
export interface LlamadoFecha {
  fecha: string; // "YYYY-MM-DD"
  hora: string; // "HH:MM" ("" si la planilla no traía hora)
}

/** Una materia de la planilla con sus dos llamados (primer/segundo). */
export interface FinalMateriaRow {
  codigo: string; // "10.01"
  materia: string; // "Proyecto Final de Ingeniería Industrial"
  primer: LlamadoFecha | null;
  segundo: LlamadoFecha | null;
  /** llamados 3.º+ si la planilla tuviera más de dos (normalmente vacío). */
  extra: LlamadoFecha[];
}

/** Resultado del parseo de la planilla completa. */
export interface FinalesParseResult {
  rows: FinalMateriaRow[];
  /** filas/valores descartados o dudosos (para mostrar al usuario). */
  warnings: string[];
  /** período detectado a partir del mes más frecuente (julio/diciembre/febrero). */
  periodoDetectado: FinalPeriodo | null;
  /**
   * año LECTIVO detectado. Ojo: para Febrero, la mesa cae en el verano del año
   * SIGUIENTE al lectivo — acá se devuelve el año lectivo (calendario − 1),
   * consistente con `periodoMesAnio` de finalesData.ts.
   */
  anioDetectado: number | null;
}

// ---------------------------------------------------------------------------
// 4. Mapeo de columnas (header tolerante)
// ---------------------------------------------------------------------------

interface ColMap {
  codigo: number;
  materia: number;
  /** columnas de llamado en orden, cada una con su columna de hora (o -1). */
  llamados: { fechaCol: number; horaCol: number }[];
}

const norm = (h: string) => stripAccents((h ?? "").toLowerCase()).trim();

/**
 * Detecta la fila de encabezado y mapea las columnas por nombre. Devuelve el
 * índice de la fila de header y el mapa, o `null` si no encuentra un header
 * plausible en las primeras filas.
 */
function findHeader(
  rows: string[][],
): { headerIdx: number; cols: ColMap } | null {
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const cells = rows[r].map(norm);
    const codigo = cells.findIndex((c) => /^cod/.test(c)); // cód / codigo / código
    const materia = cells.findIndex((c) =>
      /materia|asignatura|nombre/.test(c),
    );
    if (codigo < 0 || materia < 0) continue;

    // columnas de llamado: cualquier celda con "llamado" o "fecha".
    const llamados: { fechaCol: number; horaCol: number }[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (/llamado|fecha|mesa/.test(cells[i])) {
        // la primera columna "hora" a la derecha es su hora.
        let horaCol = -1;
        for (let j = i + 1; j < cells.length; j++) {
          if (/hora/.test(cells[j])) {
            horaCol = j;
            break;
          }
          // si aparece otro llamado antes que una hora, este no tiene hora.
          if (/llamado|fecha|mesa/.test(cells[j])) break;
        }
        llamados.push({ fechaCol: i, horaCol });
      }
    }
    if (llamados.length === 0) continue;
    return { headerIdx: r, cols: { codigo, materia, llamados } };
  }

  // Sin encabezado. La publicación web del cronograma vigente sale con
  // `headers=false`, así que la primera fila YA es data y el orden posicional
  // es el único contrato: código, materia y después pares (fecha, hora).
  // La columna del código NO se asume 0: la tabla HTML de un Google Sheet
  // publicado antepone un `th` con el número de fila, así que se busca la
  // primera celda que sea un código de materia y todo se mide desde ahí.
  // Solo cuentan como llamado las columnas cuyo valor parsee como fecha, para
  // que una planilla de un único llamado no invente una segunda columna.
  for (let r = 0; r < rows.length; r++) {
    const fila = rows[r];
    const codigo = fila.findIndex((c) => CODE_RE.test((c ?? "").trim()));
    if (codigo < 0) continue;
    const llamados: { fechaCol: number; horaCol: number }[] = [];
    for (let i = codigo + 2; i < fila.length; i += 2) {
      if (parseFechaEs(fila[i] ?? "")) llamados.push({ fechaCol: i, horaCol: i + 1 });
    }
    if (llamados.length === 0) continue;
    // headerIdx es la fila ANTERIOR a la primera de datos: el llamador arranca
    // a recorrer en headerIdx + 1, así que esta fila también se procesa.
    return { headerIdx: r - 1, cols: { codigo, materia: codigo + 1, llamados } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Parseo de la planilla completa
// ---------------------------------------------------------------------------

const CODE_RE = /^\d{1,3}\.\d{1,3}$/; // "10.01", "93.58"

/**
 * Parsea el texto CSV de la planilla de finales a datos tipados. No tira: las
 * filas problemáticas se descartan y se acumulan en `warnings`.
 */
export function parseFinalesCsv(csv: string): FinalesParseResult {
  return parseFinalesTable(parseCsv(csv));
}

/**
 * Igual que `parseFinalesCsv` pero desde una tabla ya tokenizada (`string[][]`).
 * Así el mismo pipeline sirve para CSV (`parseCsv`) y para HTML (`htmlToTables`
 * en `source.ts`): ambos producen una matriz de celdas y `findHeader` mapea las
 * columnas por nombre, tolerando un offset constante (p. ej. el row-header
 * numérico que trae la tabla de un Google Sheet publicado).
 */
export function parseFinalesTable(table: string[][]): FinalesParseResult {
  const warnings: string[] = [];
  if (table.length === 0) {
    return { rows: [], warnings: ["El archivo está vacío."], periodoDetectado: null, anioDetectado: null };
  }

  const header = findHeader(table);
  if (!header) {
    return {
      rows: [],
      warnings: [
        "No se reconoció el encabezado. Se esperan columnas tipo «Cód», «Materia» y «Primer/Segundo llamado».",
      ],
      periodoDetectado: null,
      anioDetectado: null,
    };
  }

  const { headerIdx, cols } = header;
  const rows: FinalMateriaRow[] = [];

  for (let r = headerIdx + 1; r < table.length; r++) {
    const cells = table[r];
    const codigo = (cells[cols.codigo] ?? "").trim();
    if (!codigo) continue; // fila vacía / separador
    if (!CODE_RE.test(codigo)) {
      // no es un código de materia: probablemente un título de sección.
      warnings.push(`Fila ${r + 1}: código no reconocido «${codigo}» (descartada).`);
      continue;
    }
    const materia = (cells[cols.materia] ?? "").trim();

    const parsed: (LlamadoFecha | null)[] = cols.llamados.map(
      ({ fechaCol, horaCol }) => {
        const fecha = parseFechaEs(cells[fechaCol] ?? "");
        if (!fecha) return null;
        const hora = horaCol >= 0 ? parseHora(cells[horaCol] ?? "") : null;
        return { fecha, hora: hora ?? "" };
      },
    );

    rows.push({
      codigo,
      materia,
      primer: parsed[0] ?? null,
      segundo: parsed[1] ?? null,
      extra: parsed.slice(2).filter((x): x is LlamadoFecha => x !== null),
    });
  }

  const { periodoDetectado, anioDetectado } = detectarPeriodo(rows);
  return { rows, warnings, periodoDetectado, anioDetectado };
}

// ---------------------------------------------------------------------------
// 6. Detección de período/año a partir de las fechas
// ---------------------------------------------------------------------------

/**
 * Infiere el llamado (julio/diciembre/febrero) y el AÑO LECTIVO a partir del
 * mes más frecuente entre los primeros llamados. Febrero cae en el verano del
 * año siguiente, así que su año lectivo es el año de calendario − 1.
 */
export function detectarPeriodo(rows: FinalMateriaRow[]): {
  periodoDetectado: FinalPeriodo | null;
  anioDetectado: number | null;
} {
  const counts = new Map<string, number>(); // "mes|anioCalendario" → n
  for (const r of rows) {
    const f = r.primer ?? r.segundo ?? r.extra[0] ?? null;
    if (!f) continue;
    const [y, mo] = f.fecha.split("-").map(Number);
    const k = `${mo}|${y}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (counts.size === 0) return { periodoDetectado: null, anioDetectado: null };

  let bestKey = "";
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n;
      bestKey = k;
    }
  }
  const [mo, y] = bestKey.split("|").map(Number);
  const periodo: FinalPeriodo | null =
    mo === 7
      ? "julio"
      : mo === 12
        ? "diciembre"
        : mo === 2 || mo === 3
          ? "febrero"
          : null;
  const anioLectivo = mo === 2 || mo === 3 ? y - 1 : y;
  return {
    periodoDetectado: periodo,
    anioDetectado: periodo ? anioLectivo : null,
  };
}

// ---------------------------------------------------------------------------
// 7. Puente al modelo del planner — bucketización multi-período
// ---------------------------------------------------------------------------

/** Alias de compatibilidad (la definición canónica vive en ../types). */
export type Llamado = FinalLlamado;

/** Mesas de una ingesta agrupadas por período/año lectivo y llamado, listas
 *  para `setMesasOficialesBulk`. Una planilla de dic+feb combinada produce
 *  hasta 4 buckets (dic 1º, dic 2º, feb 1º, feb 2º). */
export interface FinalesBucket {
  periodo: FinalPeriodo;
  /** año LECTIVO (para Febrero: año calendario − 1, ver `detectarPeriodo`). */
  anio: number;
  llamado: FinalLlamado;
  entries: [string, MesaFinal][];
}

/** Período que corresponde a un mes calendario de mesa, o null si no es mes
 *  de finales (las planillas reales solo traen jul / dic / feb-mar). */
export function mesAPeriodo(mes: number): FinalPeriodo | null {
  if (mes === 7) return "julio";
  if (mes === 12) return "diciembre";
  if (mes === 2 || mes === 3) return "febrero";
  return null;
}

/**
 * Reparte los llamados parseados en buckets por período y llamado, mirando la
 * FECHA de cada mesa (no la columna de origen): el período sale del mes y el
 * llamado del orden cronológico dentro del período para esa materia. Así una
 * misma subida cubre tanto la planilla de un período (Julio: 2 columnas → 1º y
 * 2º llamado) como la combinada de Diciembre+Febrero, sin importar si viene en
 * 2 columnas (dic, feb) o 4 (dic 1º/2º, feb 1º/2º).
 *
 * Si la planilla no traía hora se usa 09:00 como marcador editable. Fechas en
 * meses que no son de finales se descartan con warning; una materia con más de
 * dos fechas en el mismo período conserva las dos primeras (warning).
 */
export function bucketizarFinales(rows: FinalMateriaRow[]): {
  buckets: FinalesBucket[];
  warnings: string[];
} {
  const warnings: string[] = [];
  // (periodo|anioLectivo) → código → fechas ordenables
  const porPeriodo = new Map<string, Map<string, LlamadoFecha[]>>();

  for (const r of rows) {
    if (!r.codigo) continue;
    const fechas = [r.primer, r.segundo, ...r.extra].filter(
      (x): x is LlamadoFecha => x !== null,
    );
    for (const f of fechas) {
      const [y, mo] = f.fecha.split("-").map(Number);
      // guard de sanidad: typos de la planilla real ("12026") no deben crear
      // buckets fantasma en años absurdos.
      if (y < 2000 || y > 2100) {
        warnings.push(
          `${r.codigo}: mesa con año ${y} (typo de la planilla — descartada).`,
        );
        continue;
      }
      const periodo = mesAPeriodo(mo);
      if (!periodo) {
        warnings.push(
          `${r.codigo}: mesa ${f.fecha} en un mes sin llamado (descartada).`,
        );
        continue;
      }
      const anioLectivo = periodo === "febrero" ? y - 1 : y;
      const k = `${periodo}|${anioLectivo}`;
      let mats = porPeriodo.get(k);
      if (!mats) porPeriodo.set(k, (mats = new Map()));
      let arr = mats.get(r.codigo);
      if (!arr) mats.set(r.codigo, (arr = []));
      arr.push(f);
    }
  }

  const buckets: FinalesBucket[] = [];
  const ORDEN: FinalPeriodo[] = ["julio", "diciembre", "febrero"];
  const keys = [...porPeriodo.keys()].sort((a, b) => {
    const [pa, ya] = a.split("|");
    const [pb, yb] = b.split("|");
    return (
      Number(ya) - Number(yb) ||
      ORDEN.indexOf(pa as FinalPeriodo) - ORDEN.indexOf(pb as FinalPeriodo)
    );
  });

  for (const k of keys) {
    const [periodo, anio] = k.split("|") as [FinalPeriodo, string];
    const primer: [string, MesaFinal][] = [];
    const segundo: [string, MesaFinal][] = [];
    for (const [code, arr] of porPeriodo.get(k)!) {
      arr.sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) ||
          (a.hora || "").localeCompare(b.hora || ""),
      );
      if (arr.length > 2) {
        warnings.push(
          `${code}: ${arr.length} fechas en ${periodo} — se usan las dos primeras.`,
        );
      }
      const mesa = (f: LlamadoFecha): MesaFinal => ({
        fecha: f.fecha,
        hora: f.hora || "09:00",
      });
      primer.push([code, mesa(arr[0])]);
      if (arr[1]) segundo.push([code, mesa(arr[1])]);
    }
    primer.sort((a, b) => a[0].localeCompare(b[0]));
    segundo.sort((a, b) => a[0].localeCompare(b[0]));
    buckets.push({ periodo, anio: Number(anio), llamado: "primer", entries: primer });
    if (segundo.length) {
      buckets.push({ periodo, anio: Number(anio), llamado: "segundo", entries: segundo });
    }
  }

  return { buckets, warnings };
}
