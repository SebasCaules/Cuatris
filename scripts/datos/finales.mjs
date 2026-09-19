// ============================================================================
// finales.mjs — reglas de data/plan/finales-<AAAA>-<mes>.csv
// ----------------------------------------------------------------------------
// La planilla oficial de finales (Google Sheet de la universidad) se archiva
// tal cual se exporta, una por llamado. El nombre del archivo es la fuente de
// verdad del período (build-mesas-finales-data.mjs descarta las filas de otro
// mes: la pestaña de Febrero 2027 arrastra fechas de diciembre por copy-paste).
// El validador lee la planilla con las mismas funciones que el build (csv.mjs):
// lo que acá pasa, el build lo consume.
//
// Como es un export de una hoja de cálculo, casi todo es aviso: celdas vacías,
// horas raras y filas sin código existen en las planillas reales. Error solo
// cuando el archivo no es una planilla de finales (sin columnas reconocibles,
// sin ninguna mesa, o con la mayoría de las fechas en otro llamado: el nombre
// está mal) o trae datos personales.
// ============================================================================

import { mapearColumnas, mesAPeriodo, parseCsv, parseFechaEs, parseHora, periodoDeArchivo } from "./csv.mjs";
import { existeLaFecha, revisarCadena } from "./forma.mjs";
import { aviso, error } from "./reporte.mjs";
import { CODIGO_RE } from "./vocabulario.mjs";

/** Menos filas con mesa que esto y la planilla es sospechosa (las reales traen ~470). */
export const FILAS_MINIMAS = 100;
/** Más fechas fuera del llamado del nombre que esta fracción y el nombre está mal. */
export const FRACCION_FUERA_DE_PERIODO = 0.2;

/**
 * Valida una planilla. `crudo` es el Buffer del archivo; `nombreDeArchivo`, su
 * nombre (`finales-2026-diciembre.csv`); `archivo`, la ruta para los mensajes.
 */
export function revisarFinales(crudo, nombreDeArchivo, archivo, tamanoMaximo) {
  const h = [];
  if (crudo.length > tamanoMaximo) {
    h.push(error("tamano", archivo, `el archivo pesa ${crudo.length} bytes y el máximo es ${tamanoMaximo}`));
    return h;
  }
  const declarado = periodoDeArchivo(nombreDeArchivo);
  if (!declarado) {
    h.push(error("finales-archivo", archivo, `el archivo se llama «${nombreDeArchivo}» y las planillas van en «finales-<AAAA>-<julio|diciembre|febrero>.csv»`));
    return h;
  }
  if (crudo.length >= 3 && crudo[0] === 0xef && crudo[1] === 0xbb && crudo[2] === 0xbf) {
    h.push(aviso("bom", archivo, "el archivo empieza con BOM; se lee igual, pero conviene guardarlo en UTF-8 sin BOM"));
  }
  if (crudo.includes(0x0d)) {
    h.push(aviso("crlf", archivo, "el archivo tiene finales de línea CRLF; se lee igual, pero conviene guardarlo con LF"));
  }
  const tabla = parseCsv(crudo.toString("utf8"));
  const mapa = mapearColumnas(tabla);
  if (!mapa) {
    h.push(error("finales-columnas", archivo, "no se reconocen las columnas (se esperaba «Cód, Materia, Primer llamado, Hora, …»)"));
    return h;
  }
  let conMesa = 0;
  let fechas = 0;
  let fueraDePeriodo = 0;
  const sinCodigo = [];
  const fechasRaras = [];
  const horasRaras = [];
  const inexistentes = [];
  for (let r = mapa.headerIdx + 1; r < tabla.length; r++) {
    const celdas = tabla[r];
    celdas.forEach((celda, c) => revisarCadena(celda, `fila ${r + 1}, columna ${c + 1}`, archivo, h));
    const codigo = (celdas[mapa.cols.codigo] ?? "").trim();
    if (!codigo) continue;
    if (!CODIGO_RE.test(codigo)) {
      sinCodigo.push(`fila ${r + 1} «${codigo}»`);
      continue;
    }
    let mesas = 0;
    for (const { fechaCol, horaCol } of mapa.cols.llamados) {
      const celda = (celdas[fechaCol] ?? "").trim();
      if (!celda) continue;
      const fecha = parseFechaEs(celda);
      if (!fecha) {
        fechasRaras.push(`fila ${r + 1} «${celda}»`);
        continue;
      }
      if (!existeLaFecha(fecha)) {
        inexistentes.push(`fila ${r + 1} «${celda}»`);
        continue;
      }
      fechas++;
      if (mesAPeriodo(Number(fecha.slice(5, 7))) !== declarado.periodo || Number(fecha.slice(0, 4)) !== declarado.anioCal) {
        fueraDePeriodo++;
        continue;
      }
      mesas++;
      const hora = (celdas[horaCol] ?? "").trim();
      if (horaCol >= 0 && hora && !parseHora(hora)) horasRaras.push(`fila ${r + 1} «${hora}»`);
    }
    if (mesas) conMesa++;
  }
  const lista = (l) => l.slice(0, 5).join(", ") + (l.length > 5 ? ", …" : "");
  if (conMesa === 0) {
    h.push(error("finales-sin-mesas", archivo, `ninguna fila trae una mesa de ${declarado.periodo} de ${declarado.anioCal}; ¿es la planilla correcta y el nombre declara el llamado correcto?`));
    return h;
  }
  if (fechas && fueraDePeriodo / fechas > FRACCION_FUERA_DE_PERIODO) {
    h.push(error("finales-periodo", archivo, `${fueraDePeriodo} de ${fechas} fechas caen fuera de ${declarado.periodo} de ${declarado.anioCal}: el nombre del archivo no describe la planilla`));
  } else if (fueraDePeriodo) {
    h.push(aviso("finales-periodo", archivo, `${fueraDePeriodo} fecha(s) caen fuera de ${declarado.periodo} de ${declarado.anioCal} y el build las descarta (arrastre de la planilla)`));
  }
  if (conMesa < FILAS_MINIMAS) h.push(aviso("finales-pocas-filas", archivo, `solo ${conMesa} materias con mesa; las planillas oficiales traen unas 470`));
  if (sinCodigo.length) h.push(aviso("finales-codigo", archivo, `${sinCodigo.length} fila(s) sin código de materia reconocible, ignoradas: ${lista(sinCodigo)}`));
  if (fechasRaras.length) h.push(aviso("finales-fecha", archivo, `${fechasRaras.length} fecha(s) ilegibles, ignoradas: ${lista(fechasRaras)}`));
  if (inexistentes.length) h.push(error("fecha-invalida", archivo, `${inexistentes.length} fecha(s) que no existen en el calendario: ${lista(inexistentes)}`));
  if (horasRaras.length) h.push(aviso("finales-hora", archivo, `${horasRaras.length} hora(s) ilegibles (el build usa 09:00): ${lista(horasRaras)}`));
  return h;
}
