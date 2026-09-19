// ============================================================================
// build-finales-flags-data.mjs — códigos de materia que RINDEN examen final
// ----------------------------------------------------------------------------
// Lee las planillas oficiales de finales archivadas en `data/plan/finales-*.csv`
// (export CSV del Google Sheet "Planificación de finales" que publica la
// universidad; se archivan a mano, una por llamado) y emite
// `lib/planner/finalesFlags.ts` con la UNIÓN de los códigos con mesa.
//
// Semántica del dato (la consume lib/planner/estado.ts + programa.ts):
//   · una materia presente en alguna planilla TIENE mesa oficial ⇒ rinde final,
//     aunque su ficha no lo mencione o describa "promoción" (en esos casos la
//     promoción es a un final reducido — NO exime del final);
//   · la ausencia solo es concluyente para OBLIGATORIAS (se dictan todas, sus
//     mesas siempre se publican). Una electiva ausente puede simplemente no
//     dictarse este ciclo — para ellas decide la ficha (heurística).
//
// Modo A de studyvault-data: se corre A MANO y el .ts emitido se commitea.
//   node scripts/build-finales-flags-data.mjs        (cwd = raíz del repo)
// ============================================================================

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseCsv } from "./datos/csv.mjs";
import { CODIGO_RE } from "./datos/vocabulario.mjs";

const SRC_DIR = path.join(process.cwd(), "data", "plan");
const OUT = path.join(process.cwd(), "lib", "planner", "finalesFlags.ts");

/** Código de materia (misma regla que el validador y el resto de los pipelines). */
const CODE_RE = CODIGO_RE;

// ---- unión de códigos sobre todas las planillas archivadas -----------------

const planillas = readdirSync(SRC_DIR)
  .filter((f) => /^finales-.*\.csv$/.test(f))
  .sort(); // orden estable → output determinista

if (planillas.length === 0) {
  throw new Error(
    `No hay planillas de finales archivadas en ${SRC_DIR} (esperado: finales-<año>-<llamado>.csv). ` +
      "Bajá el CSV del Google Sheet oficial y archivalo ahí antes de correr este script.",
  );
}

const codigos = new Set();
const porPlanilla = [];
for (const f of planillas) {
  const rows = parseCsv(readFileSync(path.join(SRC_DIR, f), "utf8"));
  let n = 0;
  for (const r of rows) {
    const code = (r[0] ?? "").trim();
    if (CODE_RE.test(code)) {
      codigos.add(code);
      n++;
    }
  }
  if (n === 0) {
    throw new Error(
      `${f}: 0 códigos de materia reconocidos — ¿el archivo es realmente el CSV de la planilla?`,
    );
  }
  porPlanilla.push({ f, n });
}

const sorted = [...codigos].sort();

// ---- emisión ---------------------------------------------------------------

const fuentes = planillas.map((f) => `data/plan/${f}`).join(", ");
const lines = [
  "// AUTO-GENERADO por scripts/build-finales-flags-data.mjs — NO editar a mano.",
  `// Fuente: ${fuentes} (planilla oficial "Planificación de`,
  "// finales" + '"' + " — Google Sheet publicado por la universidad).",
  "// Una materia presente acá tiene mesa oficial ⇒ RINDE examen final (aunque su",
  "// ficha hable de promoción: esa promoción es a un final reducido, no lo exime).",
  "// La ausencia solo es concluyente para obligatorias (ver lib/planner/estado.ts).",
  "// Regenerar (tras archivar una planilla nueva en data/plan/finales-*.csv):",
  "//   node scripts/build-finales-flags-data.mjs",
  "",
  "/** Códigos de materia con mesa en la(s) planilla(s) oficial(es) de finales. */",
  "export const CODIGOS_CON_FINAL: ReadonlySet<string> = new Set([",
  ...sorted.map((c) => `  ${JSON.stringify(c)},`),
  "]);",
  "",
];
writeFileSync(OUT, lines.join("\n"), "utf8");

// ---- resumen ---------------------------------------------------------------
for (const { f, n } of porPlanilla) console.log(`  ${f}: ${n} materias con mesa`);
console.log(`→ ${path.relative(process.cwd(), OUT)}: ${sorted.length} códigos únicos`);
