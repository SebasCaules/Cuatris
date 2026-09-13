// ============================================================================
// build-mesas-finales-data.mjs — mesas de final publicadas por la universidad
// ----------------------------------------------------------------------------
// Lee las planillas oficiales archivadas en `data/plan/finales-*.csv` (export
// CSV del Google Sheet "Cronograma de finales" que publica la universidad; se
// archivan a mano, una por pestaña/llamado) y emite
// `lib/planner/mesasFinales.ts`: fecha + hora de CADA mesa, indexada por
// período × año lectivo × llamado × código de materia.
//
// Ese módulo reemplaza a las tablas MOCK que tenía `lib/planner/finalesData.ts`
// (calcadas del mockup del combinador): a partir de acá el planner abre con las
// fechas reales sin que el usuario tenga que subir nada. La ingesta manual
// (components/planner/FinalesIngesta.tsx) sigue existiendo y PISA lo horneado
// para el período que traiga — sirve para una planilla más nueva o corregida.
//
// CONVENCIONES QUE ESTE SCRIPT RESPETA (las fija el resto del planner):
//   · AÑO LECTIVO, no calendario: el llamado de Febrero cae en el verano
//     SIGUIENTE, así que "febrero de 2027" se indexa como anio = 2026
//     (ver `periodoMesAnio` en lib/planner/finalesData.ts).
//   · `MesaFinal` = { fecha: "YYYY-MM-DD", hora: "HH:MM" } — ningún campo
//     opcional (lib/planner/types.ts).
//   · llamado = orden CRONOLÓGICO dentro del período, no columna de origen
//     (misma regla que `bucketizarFinales` en lib/planner/finales/parseFinales.ts).
//
// NOMBRE DE ARCHIVO = FUENTE DE VERDAD DEL PERÍODO. `finales-<AÑO>-<mes>.csv`
// declara qué llamado contiene; las filas con fecha de otro mes se descartan.
// Es la defensa contra un defecto real de la planilla oficial: la pestaña de
// Febrero 2027 arrastra 3 filas con fecha de diciembre de 2026 (copy-paste de
// la pestaña anterior) que, sin este filtro, contaminarían el llamado de
// Diciembre con una tercera fecha fantasma.
//
// Modo A de studyvault-data: se corre A MANO y el .ts emitido se commitea.
//   node scripts/build-mesas-finales-data.mjs        (cwd = raíz del repo)
// ============================================================================

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SRC_DIR = path.join(process.cwd(), "data", "plan");
const OUT = path.join(process.cwd(), "lib", "planner", "mesasFinales.ts");

/** Código de materia tipo "10.01" / "93.58" (mismo regex que finales/parseFinales.ts). */
const CODE_RE = /^\d{1,3}\.\d{1,3}$/;

/** Hora por defecto cuando la planilla no trae ninguna (igual que bucketizarFinales). */
const HORA_FALLBACK = "09:00";

const MESES = {
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

const pad2 = (n) => String(n).padStart(2, "0");
const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Mes calendario (1-12) → período de finales, o null si no es mes de mesas. */
function mesAPeriodo(mes) {
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
function parseCsv(text) {
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
function parseFechaEs(raw) {
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
function parseHora(raw) {
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
 * después pares (fecha, hora).
 */
function mapearColumnas(rows) {
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
  const dataIdx = rows.findIndex((r) => CODE_RE.test((r[0] ?? "").trim()));
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
function periodoDeArchivo(nombre) {
  const m = nombre.match(/^finales-(\d{4})-([a-z]+)\.csv$/i);
  if (!m) return null;
  const anioCal = Number(m[1]);
  const mes = MESES[stripAccents(m[2].toLowerCase())];
  const periodo = mes ? mesAPeriodo(mes) : null;
  if (!periodo) return null;
  return { periodo, anio: periodo === "febrero" ? anioCal - 1 : anioCal, anioCal };
}

// ---------------------------------------------------------------------------
// Lectura de todas las planillas archivadas
// ---------------------------------------------------------------------------

const archivos = readdirSync(SRC_DIR)
  .filter((f) => /^finales-.*\.csv$/i.test(f))
  .sort();

if (archivos.length === 0) {
  console.error(`✗ No hay planillas en ${SRC_DIR}/finales-*.csv`);
  process.exit(1);
}

const avisos = [];
/** (periodo|anio) → código → { materia, fechas: [{fecha, hora}] } */
const porPeriodo = new Map();
/** (periodo|anio) → metadatos de la fuente, para el header del módulo. */
const fuentes = new Map();
/** código → hora vista en cualquier planilla, para rellenar celdas vacías. */
const horaConocida = new Map();

for (const archivo of archivos) {
  const declarado = periodoDeArchivo(archivo);
  if (!declarado) {
    avisos.push(`${archivo}: el nombre no declara período — archivo ignorado.`);
    continue;
  }
  const { periodo, anio } = declarado;
  const tabla = parseCsv(readFileSync(path.join(SRC_DIR, archivo), "utf8"));
  const mapa = mapearColumnas(tabla);
  if (!mapa) {
    avisos.push(`${archivo}: no se reconocieron las columnas — archivo ignorado.`);
    continue;
  }

  const clave = `${periodo}|${anio}`;
  let materias = porPeriodo.get(clave);
  if (!materias) porPeriodo.set(clave, (materias = new Map()));
  fuentes.set(clave, { archivo, periodo, anio });

  let filas = 0;
  let fueraDePeriodo = 0;

  for (let r = mapa.headerIdx + 1; r < tabla.length; r++) {
    const celdas = tabla[r];
    const codigo = (celdas[mapa.cols.codigo] ?? "").trim();
    if (!codigo) continue;
    if (!CODE_RE.test(codigo)) {
      avisos.push(`${archivo} fila ${r + 1}: código no reconocido «${codigo}».`);
      continue;
    }
    const materia = (celdas[mapa.cols.materia] ?? "").trim();

    for (const { fechaCol, horaCol } of mapa.cols.llamados) {
      const fecha = parseFechaEs(celdas[fechaCol] ?? "");
      if (!fecha) continue;
      const [y, mo] = fecha.split("-").map(Number);
      if (y < 2000 || y > 2100) {
        avisos.push(`${archivo} · ${codigo}: año ${y} imposible — mesa descartada.`);
        continue;
      }
      // El nombre del archivo manda: una fecha de otro llamado es arrastre de
      // copy-paste de la planilla, no una mesa real de este período.
      const periodoFecha = mesAPeriodo(mo);
      if (periodoFecha !== periodo) {
        fueraDePeriodo++;
        avisos.push(
          `${archivo} · ${codigo} «${materia}»: mesa ${fecha} cae en ` +
            `${periodoFecha ?? "un mes sin llamado"} y el archivo es de ${periodo} — descartada.`,
        );
        continue;
      }

      const hora = horaCol >= 0 ? parseHora(celdas[horaCol] ?? "") : null;
      if (hora) horaConocida.set(codigo, hora);

      let entrada = materias.get(codigo);
      if (!entrada) materias.set(codigo, (entrada = { materia, fechas: [] }));
      entrada.fechas.push({ fecha, hora });
      filas++;
    }
  }

  console.log(
    `  · ${archivo}: ${materias.size} materias, ${filas} mesas` +
      (fueraDePeriodo ? ` (${fueraDePeriodo} fuera de período descartadas)` : ""),
  );
}

// ---------------------------------------------------------------------------
// Bucketización: dentro de cada período, el llamado sale del orden cronológico
// ---------------------------------------------------------------------------

/** periodo → anio → llamado → codigo → { fecha, hora } */
const salida = {};
let totalMesas = 0;

const ORDEN_PERIODO = ["julio", "diciembre", "febrero"];
const claves = [...porPeriodo.keys()].sort((a, b) => {
  const [pa, ya] = a.split("|");
  const [pb, yb] = b.split("|");
  return (
    Number(ya) - Number(yb) ||
    ORDEN_PERIODO.indexOf(pa) - ORDEN_PERIODO.indexOf(pb)
  );
});

for (const clave of claves) {
  const [periodo, anioStr] = clave.split("|");
  const anio = Number(anioStr);
  const primer = {};
  const segundo = {};

  for (const [codigo, { materia, fechas }] of [...porPeriodo.get(clave)].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    // Dedup por FECHA, no por (fecha, hora). El código NO es clave primaria en
    // la planilla: 61.12 y 81.20 traen dos comisiones (español 13:00 / inglés
    // 13:15) y 16.27 aparece repetido igual. Agrupar por fecha evita el error
    // de tomar la comisión en inglés del 1.er llamado como si fuera el 2.º:
    // de cada día queda la mesa más temprana, y los llamados salen de días
    // distintos, que es lo que el planner modela.
    const porFecha = new Map();
    for (const f of fechas) {
      const previa = porFecha.get(f.fecha);
      if (!previa || (f.hora ?? "").localeCompare(previa.hora ?? "") < 0) {
        porFecha.set(f.fecha, f);
      }
    }
    const unicas = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (fechas.length > unicas.length * 1.5 || unicas.length > 2) {
      avisos.push(
        `${periodo} ${anio} · ${codigo} «${materia}»: ${fechas.length} filas → ` +
          `${unicas.length} día(s) distinto(s)` +
          (unicas.length > 2 ? " — se usan los dos primeros." : " (comisiones agrupadas)."),
      );
    }
    const mesa = (f) => {
      const hora = f.hora ?? horaConocida.get(codigo) ?? HORA_FALLBACK;
      if (!f.hora) {
        avisos.push(
          `${periodo} ${anio} · ${codigo} «${materia}»: la planilla no trae hora ` +
            `para el ${f.fecha} — se usa ${hora}.`,
        );
      }
      return { fecha: f.fecha, hora };
    };
    if (unicas[0]) {
      primer[codigo] = mesa(unicas[0]);
      totalMesas++;
    }
    if (unicas[1]) {
      segundo[codigo] = mesa(unicas[1]);
      totalMesas++;
    }
  }

  salida[periodo] ??= {};
  salida[periodo][anio] = {};
  if (Object.keys(primer).length) salida[periodo][anio].primer = primer;
  // Febrero trae un solo llamado: la clave `segundo` queda AUSENTE, no vacía
  // (`llamadoTieneMesas` y la vista distinguen ausencia de bloque vacío).
  if (Object.keys(segundo).length) salida[periodo][anio].segundo = segundo;
}

// ---------------------------------------------------------------------------
// Emisión del módulo TypeScript
// ---------------------------------------------------------------------------

const LABEL_PERIODO = { julio: "Julio", diciembre: "Diciembre", febrero: "Febrero" };

const lineasFuente = claves.map((clave) => {
  const { archivo, periodo, anio } = fuentes.get(clave);
  const bloque = salida[periodo][anio];
  const nLlamados = Object.keys(bloque).length;
  const nMaterias = Object.keys(bloque.primer ?? {}).length;
  // Se muestran los dos años porque no coinciden en Febrero: la mesa cae en el
  // verano siguiente (feb 2027) pero se indexa por el año lectivo (2026).
  const anioCal = periodo === "febrero" ? anio + 1 : anio;
  return (
    `//   · ${LABEL_PERIODO[periodo]} ${anioCal} (año lectivo ${anio}) — ` +
    `${nMaterias} materias, ${nLlamados} llamado(s) — ${archivo}`
  );
});

const cuerpo = claves
  .map((clave) => {
    const [periodo, anioStr] = clave.split("|");
    const anio = Number(anioStr);
    return { periodo, anio };
  })
  .reduce((acc, { periodo, anio }) => {
    (acc[periodo] ??= []).push(anio);
    return acc;
  }, {});

const renderMesas = (mesas, indent) => {
  const pad = " ".repeat(indent);
  return Object.entries(mesas)
    .map(([code, m]) => `${pad}"${code}": { fecha: "${m.fecha}", hora: "${m.hora}" },`)
    .join("\n");
};

let ts = `// AUTO-GENERADO por scripts/build-mesas-finales-data.mjs — NO editar a mano.
// Mesas de final publicadas por la universidad, horneadas en el sitio para que
// el combinador de finales abra con las fechas reales sin subir nada.
//
// Fuentes (planillas archivadas en Electivas/finales-*.csv):
${lineasFuente.join("\n")}
//
// Convenciones (las fija el resto del planner, ver lib/planner/finalesData.ts):
//   · la clave numérica es el AÑO LECTIVO — el llamado de Febrero cae en el
//     verano siguiente, así que las mesas de febrero de 2027 viven en 2026;
//   · el llamado ("primer"/"segundo") es el orden CRONOLÓGICO dentro del
//     período, no la columna de origen de la planilla;
//   · un período con un solo llamado (Febrero) OMITE la clave "segundo".
//
// La ingesta manual del planner (components/planner/FinalesIngesta.tsx) pisa
// estos datos para el período que traiga: sirve para una planilla corregida o
// más nueva sin tener que regenerar el sitio.
//
// Regenerar (tras archivar una planilla nueva en Electivas/finales-*.csv):
//   node scripts/build-mesas-finales-data.mjs

import type { FinalLlamado, FinalPeriodo, MesaFinal } from "./types";

/** Mesas por período × año lectivo × llamado × código de materia. */
export const MESAS_PUBLICADAS: Partial<
  Record<FinalPeriodo, Record<number, Partial<Record<FinalLlamado, Record<string, MesaFinal>>>>>
> = {
`;

for (const periodo of ORDEN_PERIODO) {
  if (!cuerpo[periodo]) continue;
  ts += `  ${periodo}: {\n`;
  for (const anio of cuerpo[periodo].sort((a, b) => a - b)) {
    ts += `    ${anio}: {\n`;
    for (const llamado of ["primer", "segundo"]) {
      const mesas = salida[periodo][anio][llamado];
      if (!mesas) continue;
      ts += `      ${llamado}: {\n${renderMesas(mesas, 8)}\n      },\n`;
    }
    ts += `    },\n`;
  }
  ts += `  },\n`;
}

ts += `};

/** Nombre del archivo de origen de cada bloque horneado (para atribución). */
export const FUENTE_MESAS: Partial<Record<FinalPeriodo, Record<number, string>>> = {
`;
for (const periodo of ORDEN_PERIODO) {
  if (!cuerpo[periodo]) continue;
  ts += `  ${periodo}: {\n`;
  for (const anio of cuerpo[periodo].sort((a, b) => a - b)) {
    ts += `    ${anio}: "${fuentes.get(`${periodo}|${anio}`).archivo}",\n`;
  }
  ts += `  },\n`;
}
ts += `};
`;

writeFileSync(OUT, ts, "utf8");

console.log(`\n✓ ${path.relative(process.cwd(), OUT)}`);
console.log(`  ${claves.length} bloques período×año · ${totalMesas} mesas`);
for (const clave of claves) {
  const [periodo, anioStr] = clave.split("|");
  const anio = Number(anioStr);
  const bloque = salida[periodo][anio];
  const detalle = Object.entries(bloque)
    .map(([llamado, mesas]) => `${llamado} ${Object.keys(mesas).length}`)
    .join(" · ");
  const anioCal = periodo === "febrero" ? anio + 1 : anio;
  console.log(`  ${LABEL_PERIODO[periodo]} ${anioCal} (lectivo ${anio}): ${detalle}`);
}
if (avisos.length) {
  console.log(`\n⚠ ${avisos.length} aviso(s):`);
  for (const a of avisos) console.log(`  · ${a}`);
}
