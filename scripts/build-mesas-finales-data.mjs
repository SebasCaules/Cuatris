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

import { mapearColumnas, mesAPeriodo, parseCsv, parseFechaEs, parseHora, periodoDeArchivo } from "./datos/csv.mjs";
import { CODIGO_RE } from "./datos/vocabulario.mjs";

const SRC_DIR = path.join(process.cwd(), "data", "plan");
const OUT = path.join(process.cwd(), "lib", "planner", "mesasFinales.ts");

/** Código de materia (misma regla que el validador y el resto de los pipelines). */
const CODE_RE = CODIGO_RE;

/** Hora por defecto cuando la planilla no trae ninguna (igual que bucketizarFinales). */
const HORA_FALLBACK = "09:00";

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
