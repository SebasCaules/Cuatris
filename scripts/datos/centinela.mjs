#!/usr/bin/env node
// ============================================================================
// centinela.mjs — qué dato falta hoy (lo que el repositorio pide a la comunidad)
// ----------------------------------------------------------------------------
//   node scripts/datos/centinela.mjs [--hoy AAAA-MM-DD] [--dir data/plan]
//
// Imprime un JSON con los datos que deberían existir a esta altura del año y no
// están en el directorio: el archivo de horarios del cuatrimestre en curso y la
// planilla del próximo llamado de finales. Lo corre centinela.yml cada seis
// horas y abre (una sola vez) un issue por cada faltante, con la receta para
// cargarlo. Sin fecha, usa la de hoy; con `--hoy` se puede simular.
//
// Calendario (el del ITBA, a grandes rasgos): el 1.º cuatrimestre arranca en
// marzo y sus horarios se publican en febrero; el 2.º arranca en agosto y se
// publica en julio. Los llamados de finales son julio, diciembre y febrero, y
// sus planillas salen un par de meses antes.
// ============================================================================

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TITULOS = {
  horarios: (id) => `Faltan los horarios de ${id.slice(5)} ${id.slice(0, 4)}`,
  finales: (mes, anio) => `Falta la planilla de finales de ${mes} de ${anio}`,
};

/**
 * Datos esperados para una fecha `AAAA-MM-DD`: `[{ tipo, archivo, titulo, cuerpo }]`.
 * Solo lo vigente: nada de reclamar cuatrimestres viejos.
 */
export function datosEsperados(hoy) {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const out = [];
  const horarios = (id) =>
    out.push({
      tipo: "horarios",
      archivo: `horarios/${id}.json`,
      titulo: TITULOS.horarios(id),
      cuerpo: [
        `No hay un archivo \`data/plan/horarios/${id}.json\` y a esta altura del año el SGA ya publicó (o está por publicar) la oferta de ese cuatrimestre.`,
        "",
        "Para cargarlo hace falta una cuenta del SGA y unos minutos: la receta «Cargar un cuatrimestre nuevo» de `CONTRIBUTING.md` explica cómo bajar los horarios con el scraper de `tools/` y abrir el PR. El PR se valida y se mergea solo.",
        "",
        "Si el SGA todavía no publicó la oferta, este issue puede esperar: se cierra solo cuando el archivo exista.",
      ].join("\n"),
    });
  const finales = (nombreMes, anioPlanilla) =>
    out.push({
      tipo: "finales",
      archivo: `finales-${anioPlanilla}-${nombreMes}.csv`,
      titulo: TITULOS.finales(nombreMes, anioPlanilla),
      cuerpo: [
        `No hay un archivo \`data/plan/finales-${anioPlanilla}-${nombreMes}.csv\` y la universidad suele publicar la planilla de ese llamado a esta altura.`,
        "",
        "Para cargarla no hace falta cuenta de nada: la receta «Archivar una planilla de finales» de `CONTRIBUTING.md` explica cómo exportar el Google Sheet oficial a CSV y abrir el PR. El PR se valida y se mergea solo.",
        "",
        "Si la universidad todavía no publicó la planilla, este issue puede esperar: se cierra solo cuando el archivo exista.",
      ].join("\n"),
    });
  if (mes >= 2 && mes <= 7) horarios(`${anio}-1C`);
  if (mes >= 7) horarios(`${anio}-2C`);
  if (mes >= 5 && mes <= 7) finales("julio", anio);
  if (mes >= 10) finales("diciembre", anio);
  if (mes === 12) finales("febrero", anio + 1);
  if (mes <= 2) finales("febrero", anio);
  return out;
}

/** Los esperados que no existen en `dir`. */
export function queFalta(hoy, dir) {
  return datosEsperados(hoy).filter((d) => !existsSync(path.join(dir, d.archivo)));
}

/** Títulos de issues que este centinela puede haber abierto y ya no aplican. */
export function titulosVigentes(hoy) {
  return datosEsperados(hoy).map((d) => d.titulo);
}

function main(argv) {
  let hoy = new Date().toISOString().slice(0, 10);
  let dir = path.join(process.cwd(), "data", "plan");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--hoy" && argv[i + 1]) hoy = argv[++i];
    else if (argv[i] === "--dir" && argv[i + 1]) dir = path.resolve(argv[++i]);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) {
    console.error(`fecha inválida: ${hoy}`);
    return 2;
  }
  process.stdout.write(JSON.stringify({ hoy, faltan: queFalta(hoy, dir), vigentes: titulosVigentes(hoy) }, null, 2) + "\n");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
