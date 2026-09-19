// ============================================================================
// csv.mjs — lectura de las planillas oficiales de finales (finales-<año>-<mes>.csv)
// ----------------------------------------------------------------------------
// Compartido por el validador (scripts/datos/finales.mjs) y los generadores
// (scripts/build-mesas-finales-data.mjs, scripts/build-finales-flags-data.mjs):
// una sola lectura de la planilla, para que lo que el gate acepta sea
// exactamente lo que el build consume.
// ============================================================================

import { ARCHIVO_FINALES_RE, CODIGO_RE } from "./vocabulario.mjs";

export const MESES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export const pad2 = (n) => String(n).padStart(2, "0");
export const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Mes calendario (1-12) → período de finales, o null si no es mes de mesas. */
export function mesAPeriodo(mes) {
  if (mes === 7) return "julio";
  if (mes === 12) return "diciembre";
  if (mes === 2 || mes === 3) return "febrero";
  return null;
}

/**
 * Tokenizer CSV mínimo (RFC 4180-ish): comillas, comas dentro de comillas,
 * `""` escapadas, LF/CRLF, BOM. Mismo comportamiento que `parseCsv` de
 * lib/planner/finales/parseFinales.ts (no importable desde un .mjs por ser TS).
 */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;
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
        } else inQuotes = false;
      } else field += c;
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
      if (text[i + 1] !== "\n") endRow();
    } else {
      field += c;
      sawAny = true;
    }
  }
  if (sawAny || field !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * Fecha en español largo → ISO `YYYY-MM-DD`.
 *   "lunes, 14 de diciembre de 2026" → "2026-12-14"
 * El `\b` tras el año es deliberado: la planilla real trae typos tipo "12026"
 * que sin él matchearían como 1202.
 */
export function parseFechaEs(raw) {
  if (!raw) return null;
  const s = stripAccents(String(raw).toLowerCase()).trim();
  if (!s || s === "-" || s === "a confirmar" || s === "s/f") return null;
  const m = s.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/);
  if (m) {
    const mes = MESES[m[2]];
    if (!mes) return null;
    return `${m[3]}-${pad2(mes)}-${pad2(Number(m[1]))}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
  return null;
}

/**
 * Hora de la planilla → `HH:MM`. Normaliza los dos defectos reales del sheet:
 * el formato de un solo dígito ("8:00" → "08:00", 191 celdas — como string
 * ordenaba DESPUÉS de "19:00") y el separador roto ("13_00" → "13:00").
 * Devuelve null si la celda está vacía o es irreconocible.
 */
export function parseHora(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/[_.;]/, ":");
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${pad2(h)}:${pad2(mi)}`;
}

/**
 * Mapea las columnas de la planilla. Tolera dos formas, porque la universidad
 * publicó las dos: CON fila de encabezado ("Cód,Materia,Primer llamado,…") y
 * SIN encabezado (la publicación web nueva sale con `headers=false`). En el
 * segundo caso el orden posicional es el único contrato: código, materia y
 * después pares (fecha, hora). Devuelve `{ headerIdx, cols }` o null.
 */
export function mapearColumnas(rows) {
  const norm = (h) => stripAccents((h ?? "").toLowerCase()).trim();
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r++) {
    const cells = rows[r].map(norm);
    const codigo = cells.findIndex((c) => /^cod/.test(c));
    const materia = cells.findIndex((c) => /materia|asignatura|nombre/.test(c));
    if (codigo < 0 || materia < 0) continue;
    const llamados = [];
    for (let i = 0; i < cells.length; i++) {
      if (/llamado|fecha|mesa/.test(cells[i])) {
        let horaCol = -1;
        for (let j = i + 1; j < cells.length; j++) {
          if (/hora/.test(cells[j])) {
            horaCol = j;
            break;
          }
          if (/llamado|fecha|mesa/.test(cells[j])) break;
        }
        llamados.push({ fechaCol: i, horaCol });
      }
    }
    if (llamados.length) return { headerIdx: r, cols: { codigo, materia, llamados } };
  }

  // Sin encabezado: la primera fila que arranca con un código manda el layout.
  const dataIdx = rows.findIndex((r) => CODIGO_RE.test((r[0] ?? "").trim()));
  if (dataIdx < 0) return null;
  const fila = rows[dataIdx];
  const llamados = [];
  for (let i = 2; i < fila.length; i += 2) {
    if (parseFechaEs(fila[i])) llamados.push({ fechaCol: i, horaCol: i + 1 });
  }
  if (!llamados.length) return null;
  return { headerIdx: dataIdx - 1, cols: { codigo: 0, materia: 1, llamados } };
}

/**
 * Nombre de archivo → período y año LECTIVO declarados.
 *   "finales-2026-diciembre.csv" → { periodo: "diciembre", anio: 2026 }
 *   "finales-2027-febrero.csv"   → { periodo: "febrero",   anio: 2026 }
 * El año del nombre es el CALENDARIO de las mesas; el que se devuelve es el
 * lectivo (Febrero resta uno). Devuelve null si el nombre no declara período.
 */
export function periodoDeArchivo(nombre) {
  const m = nombre.match(ARCHIVO_FINALES_RE);
  if (!m) return null;
  const anioCal = Number(m[1]);
  const mes = MESES[stripAccents(m[2].toLowerCase())];
  const periodo = mes ? mesAPeriodo(mes) : null;
  if (!periodo) return null;
  return { periodo, anio: periodo === "febrero" ? anioCal - 1 : anioCal, anioCal, mes };
}
