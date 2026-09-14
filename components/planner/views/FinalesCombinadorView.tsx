"use client";

// Combinación de finales — pestaña nueva del planner (feature nueva).
// Spec visual: _design-review/module-f-combinador.html.
//
// Lee el estado global `state.finales` (types.ts / state.tsx) y las acciones
// SET_FINALES_PERIODO / SET_FINALES_ANIO / SET_MESA / SET_FINAL_ASIGNACION /
// SET_FINALES_REMINDER / SET_FINALES_MARGEN / FINALES_EXTRA_ADD /
// FINALES_EXTRA_REMOVE. Los datos de mesas y correlativas de final salen de
// lib/planner/finalesData.ts (DATA DE EJEMPLO, a reemplazar).
//
// Regla de negocio (contrato del overseer):
//   · la lista de pendientes es la unión de dos orígenes:
//     - derivados del progreso (con «Mi progreso» activo, `usaProgreso`):
//       tieneFinal(code) && (approved.has(code) || cursando.has(code)) &&
//       !finalDone.has(code). Lo que estás CURSANDO también cuenta como
//       pendiente (pedido del autor): al terminar el cuatrimestre ese final
//       hay que rendirlo, y el combinador planifica justamente los llamados
//       que vienen. Se marca con «cursando».
//     - agregados a mano (`finales.extra`), sumados con el buscador: con «Mi
//       progreso» activo entran sujetos a las mismas correlativas (what-if);
//       con el switch apagado (o sin progreso marcado) la lista es SOLO
//       `extra`, sin correlativas y sin excluir los finales ya aprobados.
//     Los derivados no se pueden sacar de la lista (reflejan el progreso);
//     los agregados a mano sí, con el × de su fila.
//   · las materias que NO rinden final (promocionables / sin mesa) nunca son
//     pendientes: su cursada aprobada SE TOMA COMO FINAL APROBADO — también
//     para las correlativas de final (ver finalesAprobados en lib/planner/estado).
//   · con «Mi progreso» activo, para rendir un final necesitás sus
//     correlativas de FINAL aprobadas; si falta alguna, el final queda
//     bloqueado (candado). Sin progreso (modo libre) no hay correlativas.
//   · cada período (Julio/Dic/Feb) publica DOS llamados (1.º y 2.º mesa). Cada
//     final se ASIGNA a un período + un llamado: state.finales.seleccion es un
//     Map<code, {periodo, llamado}>. Un final asignado a OTRO período no cuenta
//     como elegido en el llamado visible (así se planifican Dic+Feb juntos sin
//     duplicar finales); en el panel aparece con un chip «en <período>» que lo
//     mueve al llamado visible (re-asigna con el llamado por defecto).
//   · mesa efectiva de una fila ELEGIDA: manual ?? oficial[llamado] (el override
//     manual pisa siempre). Para las filas del panel sin elegir se muestra la
//     mesa de display: manual ?? 1.º llamado ?? 2.º llamado.
//
// Static-export safe: el .ics se arma client-side (Blob + createObjectURL)
// detrás de un guard `typeof window !== "undefined"`.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { usePlanner } from "@/components/planner/state";
import { finalesAprobados, tieneFinal } from "@/lib/planner/estado";
import { byId, credOf, PALETTE, PLAN } from "@/lib/planner/model";
import ProgresoSwitch, { usaProgreso } from "@/components/planner/ProgresoSwitch";
import MateriaPicker from "@/components/planner/MateriaPicker";
import { Tooltip } from "@/components/planner/Tooltip";
import {
  PERIODOS,
  PERIODO_LABEL,
  periodoMesAnio,
  periodoAnioReal,
  mesasOficialesDe,
  finalHabilitado,
  subscribeMesasOficiales,
  mesasOficialesVersion,
  fuenteDeMesas,
} from "@/lib/planner/finalesData";
import FinalesIngesta from "@/components/planner/FinalesIngesta";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconDownload,
  IconInfo,
  IconLock,
  IconPlus,
  IconPrinter,
  IconTrash,
} from "@/components/planner/icons";
import { openForPrint } from "@/lib/planner/download";
import {
  buildFinalesHTML,
  buildFinalesSheet,
  SHEET_H,
  SHEET_PAD,
  SHEET_W,
  type FinalesExportRow,
} from "@/lib/planner/exportFinales";
import { downloadBlob, htmlToPngBlob } from "@/lib/planner/exportImage";
import {
  buildMonthWeeks,
  mcalCellHeight,
  MonthCalendar,
  MonthCalendarEvent,
  MONTH_CALENDAR_PRINT_CSS,
} from "@/components/planner/MonthCalendar";
import { renderStaticHTML } from "@/components/planner/renderStatic";
import type {
  FinalAsignacion,
  FinalLlamado,
  FinalPeriodo,
  MesaFinal,
} from "@/lib/planner/types";
import "../month-calendar.css";
import "../finales.css";

/** Alto fijo de un bloque de mesa en pantalla (px): nombre a dos líneas +
 *  hora / etiqueta / segmentado. Todas las celdas del mes miden para el máximo
 *  de bloques posibles en un día, así la grilla nunca cambia de tamaño. */
const EV_H = 58;
/** Alto del bloque en la hoja exportada (px). */
const EV_H_PRINT = 44;

/* ============================ helpers puros ============================ */

const MES_NOMBRE = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Duración asumida de una mesa de final para detectar superposición (min). */
const EXAM_DUR_MIN = 180;

const pad2 = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = (s: string) => {
  const [y, mo, d] = s.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1);
};
/** DD/MM legible a partir de "YYYY-MM-DD". */
const ddmm = (iso: string) => {
  const [, mo, d] = iso.split("-");
  return `${d}/${mo}`;
};
/** Días calendario entre dos fechas ISO (b - a). */
const dayDiff = (a: string, b: string) =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
/** ¿Se superponen dos mesas? (misma fecha + ventanas horarias que se cruzan). */
function mesasPisan(a: MesaFinal, b: MesaFinal): boolean {
  if (a.fecha !== b.fecha) return false;
  const as = toMin(a.hora);
  const bs = toMin(b.hora);
  return as < bs + EXAM_DUR_MIN && bs < as + EXAM_DUR_MIN;
}
/** Escape RFC 5545 (backslash, coma, punto y coma, saltos de línea). */
const icsEsc = (s: string) =>
  String(s).replace(/([\\,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** Zona horaria de las mesas. Argentina es UTC-3 fijo todo el año (sin DST):
 *  alcanza con un único bloque STANDARD en el VTIMEZONE. */
const ICS_TZID = "America/Argentina/Buenos_Aires";

/** Octetos UTF-8 de un code point (para plegar sin partir caracteres). */
const cpOctets = (cp: number) =>
  cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;

/** Plegado de líneas RFC 5545 §3.1: máximo 75 octetos por línea física; la
 *  continuación arranca con CRLF + un espacio (el espacio cuenta en el tope). */
function icsFold(line: string): string {
  let out = "";
  let len = 0;
  for (const ch of line) {
    const n = cpOctets(ch.codePointAt(0)!);
    if (len + n > 75) {
      out += "\r\n ";
      len = 1;
    }
    out += ch;
    len += n;
  }
  return out;
}

/** Objeto style con una custom property CSS (tipado seguro para tsc). */
const cvar = (name: string, value: string): CSSProperties =>
  ({ [name]: value } as CSSProperties);

/** Fecha legible es-AR para el pie del PDF («generado el …»). Guardado en
 *  try/catch como el `nowStr()` del Plan de cursada: en entornos sin Intl no
 *  rompe el export, solo devuelve "". */
function nowStr(): string {
  try {
    return new Date().toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** ¿La mesa cae dentro del período visible? Julio/Diciembre = su mes exacto.
 *  Febrero ABARCA TAMBIÉN MARZO (del año siguiente al lectivo): el llamado real
 *  se extiende de fin de febrero a principios de marzo, y `mesAPeriodo` del
 *  parser clasifica igual — si acá se exigiera solo el mes 2, esas mesas se
 *  cargarían pero quedarían invisibles y fuera del .ics. */
const mesaEnPeriodo = (
  m: MesaFinal,
  periodo: FinalPeriodo,
  anio: number,
): boolean => {
  const d = parseISO(m.fecha);
  const { month, year } = periodoMesAnio(periodo, anio);
  if (d.getFullYear() !== year) return false;
  if (periodo === "febrero") return d.getMonth() === 1 || d.getMonth() === 2;
  return d.getMonth() === month - 1;
};

/** Etiqueta corta del período para el chip «en <período>» del panel. */
const PERIODO_SHORT: Record<FinalPeriodo, string> = {
  julio: "Julio",
  diciembre: "Dic",
  febrero: "Feb",
};

/** Ordinal del llamado para el badge chico «1º»/«2º». */
const LLAMADO_ORD: Record<FinalLlamado, string> = { primer: "1º", segundo: "2º" };
/** Etiqueta larga del llamado (para tooltips y el .ics). */
const LLAMADO_LABEL: Record<FinalLlamado, string> = {
  primer: "1.º llamado",
  segundo: "2.º llamado",
};

type Source = "oficial" | "manual" | "none";

/** Una opción de mesa candidata a rendir en el período visible (para «sugerir»). */
interface Opcion {
  mesa: MesaFinal;
  llamado: FinalLlamado;
}

/** Una mesa disponible que NO está mostrada como elegida, dibujada como chip
 *  fantasma en el calendario cuando el toggle «Otras fechas» está activo.
 *  `key` es único por (final + llamado) para el React key y el mapa por fecha. */
interface Ghost {
  key: string;
  code: string;
  nombre: string;
  color: string;
  fecha: string;
  hora: string;
  llamado: FinalLlamado;
  /** nace del hover sobre esa materia (resaltado), no del toggle «Otras fechas». */
  hover: boolean;
}

interface FinalRow {
  code: string;
  nombre: string;
  abbr: string;
  creditos: number;
  anio: number;
  cuatri: number;
  color: string;
  blocked: boolean;
  faltan: string[];
  /** mesa efectiva: para la fila ELEGIDA es manual ?? oficial[llamado]; para las
   *  no elegidas (display del panel) es manual ?? 1.º ?? 2.º. */
  mesa: MesaFinal | null;
  source: Source;
  /** llamado de la mesa oficial efectiva (para el badge «1º»/«2º»); null si manual/sin fecha. */
  llamado: FinalLlamado | null;
  /** la mesa efectiva cae dentro del mes/año del llamado mostrado. */
  inPeriod: boolean;
  /** elegida EN el período visible (asig.periodo === periodo). */
  selected: boolean;
  /** asignación actual de la materia (en cualquier período), o null si no tiene. */
  asig: FinalAsignacion | null;
  /** si está asignada a OTRO período, cuál (para el chip «en <período>»). */
  assignedElsewhere: FinalPeriodo | null;
  /** ambos llamados oficiales del período visible (para la mesa efectiva y el toggle 1º/2º). */
  oficiales: { primer?: MesaFinal; segundo?: MesaFinal };
  /** override manual de mesa (pisa a las oficiales), o null. */
  manual: MesaFinal | null;
  /** ¿tiene los DOS llamados oficiales? (habilita el mini segmentado 1º|2º). */
  hasBoth: boolean;
  /** opciones de mesa del período visible, en orden (manual sola; oficial 1.º→2.º). */
  opciones: Opcion[];
  /** la materia se está cursando: el final queda pendiente para cuando termine. */
  cursando: boolean;
  /** agregado a mano (no sale del progreso): se puede quitar de la lista con
   *  su ×. (Nombrado distinto de `manual`, el override de mesa, para no
   *  pisarlo.) */
  agregadoManual: boolean;
}

/* ============================ componente ============================ */

export default function FinalesCombinadorView() {
  const { state, dispatch } = usePlanner();
  const { approved, finalDone, cursando } = state;
  const { periodo, anio, mesas, seleccion, extra, reminderHs, margenDias } =
    state.finales;
  const conProgreso = usaProgreso(state);

  const [panelOpen, setPanelOpen] = useState(true);
  // P1 — la ingesta arranca abierta solo si NO hay mesas reales cargadas; una vez
  // que el usuario la toca respetamos su elección (null = todavía sin decidir).
  const [ingestaOpen, setIngestaOpen] = useState<boolean | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  // menú «Descargar» (popover local) + toggle «Otras fechas» (chips fantasma).
  const [dlOpen, setDlOpen] = useState(false);
  const [ghostsOn, setGhostsOn] = useState(false);
  // buscador de finales: abierto a pedido («+ Agregar») o forzado con la
  // lista vacía (empty state integrado, sin pantalla aparte).
  const [pickerOpen, setPickerOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement | null>(null);
  // Materia bajo el cursor (bloque del calendario, fila del panel o del editor):
  // sus otras mesas del período aparecen como chips fantasma resaltados. La
  // salida se demora un poco para poder llegar con el puntero al chip y hacer
  // clic sin que desaparezca en el camino.
  const [hoverCode, setHoverCode] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverIn = (code: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHoverCode(code);
  };
  const hoverOut = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverCode(null), 400);
  };
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  // Cierre del menú de descarga por click-fuera / Escape (patrón del menú ⋯ de
  // PlanView). El effect solo corre client-side → static-export safe.
  useEffect(() => {
    if (!dlOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (dlRef.current && !dlRef.current.contains(e.target as Node))
        setDlOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDlOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [dlOpen]);

  // Re-render cuando el store de mesas oficiales cambia (carga del parser de la
  // planilla). SSR-safe: en el server el snapshot es siempre 0.
  const mesasVersion = useSyncExternalStore(
    subscribeMesasOficiales,
    mesasOficialesVersion,
    () => 0,
  );

  const { month, year } = periodoMesAnio(periodo, anio);
  const anioReal = periodoAnioReal(periodo, anio);
  // De dónde salen las fechas de este llamado: las que trae el sitio
  // ("publicada"), las que subió el usuario ("ingesta") o ninguna todavía.
  // Las dos primeras son oficiales — el badge y el pie no deben distinguirlas.
  const fuenteMesas = fuenteDeMesas(periodo, anio);
  const conMesasReales = fuenteMesas !== "ninguna";

  // ----- universo de finales pendientes (approved && !finalDone) -----
  // Las materias que NO rinden final (promocionables / sin mesa) no entran:
  // su cursada aprobada cuenta como final aprobado — ni son pendientes ni
  // bloquean; para las correlativas de final se computan en `finalesOk`.
  const rows: FinalRow[] = useMemo(() => {
    const finalesOk = finalesAprobados(approved, finalDone);
    // derivados del progreso: cursada aprobada sin final + lo que se está
    // cursando (disjuntos por invariante). Sin «Mi progreso» no se derivan.
    const derivados = new Set<string>();
    if (conProgreso)
      for (const c of [...approved, ...cursando])
        if (!finalDone.has(c) && byId.has(c) && tieneFinal(c)) derivados.add(c);
    // + los agregados a mano: con «Mi progreso» son un what-if (sujetos a las
    // mismas correlativas más abajo); sin progreso son la lista entera y no
    // se excluyen los finales ya aprobados.
    const codes = new Set(derivados);
    for (const c of extra)
      if (byId.has(c) && tieneFinal(c) && !(conProgreso && finalDone.has(c)))
        codes.add(c);
    // orden estable: por año/cuatri/nombre (para color y listado)
    const ordered = [...codes].sort((a, b) => {
      const ma = byId.get(a)!;
      const mb = byId.get(b)!;
      return (
        (ma.anio ?? 99) - (mb.anio ?? 99) ||
        (ma.cuatri ?? 9) - (mb.cuatri ?? 9) ||
        ma.nombre.localeCompare(mb.nombre)
      );
    });
    return ordered.map((code, i): FinalRow => {
      const m = byId.get(code)!;
      // año calendario del llamado (febrero cae en el siguiente): una
      // correlativa nueva con excepciones vigentes ese año no bloquea
      // (correlativasVigencia.ts). Sin «Mi progreso» no hay correlativas.
      const { ok, faltan } = conProgreso
        ? finalHabilitado(code, finalesOk, year)
        : { ok: true, faltan: [] as string[] };
      const manual = mesas.get(code) ?? null;
      const oficiales = mesasOficialesDe(code, periodo, anio);
      const asig = seleccion.get(code) ?? null;
      const selected = asig?.periodo === periodo; // elegida EN el período visible
      const assignedElsewhere =
        asig && asig.periodo !== periodo ? asig.periodo : null;

      // Mesa efectiva + fuente + llamado. Para la fila elegida la mesa depende
      // del llamado asignado; para las no elegidas es solo display (1.º ?? 2.º).
      let mesa: MesaFinal | null;
      let source: Source;
      let llamado: FinalLlamado | null;
      if (selected) {
        if (manual) {
          mesa = manual;
          source = "manual";
          llamado = null;
        } else {
          const om = oficiales[asig!.llamado];
          if (om) {
            mesa = om;
            source = "oficial";
            llamado = asig!.llamado;
          } else {
            // asignada a un llamado sin mesa publicada (p. ej. período sin mesas).
            mesa = null;
            source = "none";
            llamado = null;
          }
        }
      } else if (manual) {
        mesa = manual;
        source = "manual";
        llamado = null;
      } else if (oficiales.primer) {
        mesa = oficiales.primer;
        source = "oficial";
        llamado = "primer";
      } else if (oficiales.segundo) {
        mesa = oficiales.segundo;
        source = "oficial";
        llamado = "segundo";
      } else {
        mesa = null;
        source = "none";
        llamado = null;
      }

      const inPeriod = mesa ? mesaEnPeriodo(mesa, periodo, anio) : false;

      // Opciones de mesa del período visible, en orden (para «sugerir»): el
      // override manual anula a las oficiales (solo esa opción); si no, 1.º y
      // después 2.º llamado. Solo las que caen dentro del período.
      const opciones: Opcion[] = [];
      if (manual) {
        if (mesaEnPeriodo(manual, periodo, anio))
          opciones.push({ mesa: manual, llamado: "primer" });
      } else {
        if (oficiales.primer && mesaEnPeriodo(oficiales.primer, periodo, anio))
          opciones.push({ mesa: oficiales.primer, llamado: "primer" });
        if (oficiales.segundo && mesaEnPeriodo(oficiales.segundo, periodo, anio))
          opciones.push({ mesa: oficiales.segundo, llamado: "segundo" });
      }

      return {
        code,
        nombre: m.nombre,
        abbr: m.abbr,
        creditos: credOf(code),
        anio: m.anio ?? 99,
        cuatri: m.cuatri ?? 9,
        color: PALETTE[i % PALETTE.length],
        blocked: !ok,
        faltan,
        mesa,
        source,
        llamado,
        inPeriod,
        selected,
        asig,
        assignedElsewhere,
        oficiales,
        manual,
        hasBoth: !!oficiales.primer && !!oficiales.segundo,
        opciones,
        // sin «Mi progreso» el marcador de cursando es progreso y no se muestra
        cursando: conProgreso && cursando.has(code),
        agregadoManual: !derivados.has(code),
      };
    });
    // mesasVersion: recomputa cuando el parser carga/limpia mesas oficiales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved, finalDone, cursando, mesas, seleccion, periodo, anio, month, year, mesasVersion, extra, conProgreso]);

  // buscador forzado abierto con la lista vacía (empty state integrado).
  const showPicker = pickerOpen || rows.length === 0;

  // Todas las materias del plan activo (el árbol se remonta al cambiar de
  // carrera, así que no hace falta más dependencias).
  const todas = useMemo(
    () => [...PLAN.obligatorias, ...PLAN.electivas].map((m) => byId.get(m.codigo)!),
    [],
  );
  // Los derivados del progreso no se ofrecen (ya están en la lista y no se
  // quitan); los agregados a mano sí, marcados con ✓ para poder quitarlos
  // desde el mismo buscador (como en el combinador de horarios).
  const derivadosEnLista = useMemo(
    () => new Set(rows.filter((r) => !r.agregadoManual).map((r) => r.code)),
    [rows],
  );
  // Agregables: rinden final y no salen del progreso; con «Mi progreso» los
  // finales ya aprobados no se ofrecen (el hint del buscador avisa cuántos hay).
  const candidatos = useMemo(
    () =>
      todas.filter(
        (m) =>
          tieneFinal(m.codigo) &&
          !derivadosEnLista.has(m.codigo) &&
          !(conProgreso && finalDone.has(m.codigo)),
      ),
    [todas, derivadosEnLista, conProgreso, finalDone],
  );
  // Búsqueda honesta: las que no rinden final se muestran atenuadas, no agregables.
  const sinFinal = useMemo(() => todas.filter((m) => !tieneFinal(m.codigo)), [todas]);
  const ocultosDone = conProgreso
    ? todas.filter((m) => tieneFinal(m.codigo) && finalDone.has(m.codigo)).length
    : 0;

  const eligibles = useMemo(() => rows.filter((r) => !r.blocked), [rows]);
  const blocked = useMemo(() => rows.filter((r) => r.blocked), [rows]);
  const selectedRows = useMemo(
    () => eligibles.filter((r) => r.selected),
    [eligibles],
  );
  const selectedInPeriod = useMemo(
    () => selectedRows.filter((r) => r.inPeriod && r.mesa),
    [selectedRows],
  );
  // P1 — elegidos SIN mesa cargada (source "none"): no aparecen en el calendario;
  // se cuentan para el nudge y para el titular «rendís N (M con fecha)».
  const sinFecha = useMemo(
    () => selectedRows.filter((r) => !r.mesa),
    [selectedRows],
  );

  // nombre corto por código para tooltips de correlativa
  const nombreDe = (code: string) => byId.get(code)?.nombre ?? code;

  // ----- cruces entre los seleccionados con fecha en el período: los pares
  // que se superponen se marcan en el calendario («se pisan»). -----
  const pisanCodes = useMemo(() => {
    const pisan = new Set<string>();
    const withMesa = selectedInPeriod;
    for (let i = 0; i < withMesa.length; i++) {
      for (let j = i + 1; j < withMesa.length; j++) {
        if (mesasPisan(withMesa[i].mesa!, withMesa[j].mesa!)) {
          pisan.add(withMesa[i].code);
          pisan.add(withMesa[j].code);
        }
      }
    }
    return pisan;
  }, [selectedInPeriod]);

  // ----- ¿agregar un pendiente pisaría lo ya elegido? (aviso en el panel) -----
  const wouldPisar = (r: FinalRow): boolean => {
    if (!r.inPeriod || !r.mesa || r.selected) return false;
    return selectedInPeriod.some((s) => mesasPisan(s.mesa!, r.mesa!));
  };

  // ----- mesas fantasma (toggle «Otras fechas» o hover sobre una materia) -----
  // Para cada final elegible (no bloqueado y no asignado a OTRO período) tomamos
  // sus opciones de mesa del período visible EXCLUYENDO la que ya se ve pintada:
  // si la fila está elegida acá, se excluye su mesa activa (misma fecha+hora);
  // si no está elegida, van todas sus opciones. Cada una es un chip fantasma
  // clickeable que asigna/mueve ese final a ese llamado. Con el toggle apagado,
  // solo entran las de la materia bajo el cursor (resaltadas).
  const ghosts = useMemo<Ghost[]>(() => {
    if (!ghostsOn && !hoverCode) return [];
    const out: Ghost[] = [];
    for (const r of rows) {
      if (r.blocked || r.assignedElsewhere) continue;
      const hover = r.code === hoverCode;
      if (!ghostsOn && !hover) continue;
      for (const opt of r.opciones) {
        if (
          r.selected &&
          r.mesa &&
          opt.mesa.fecha === r.mesa.fecha &&
          opt.mesa.hora === r.mesa.hora
        )
          continue; // esa mesa ya está pintada como elegida
        out.push({
          key: `${r.code}-${opt.llamado}`,
          code: r.code,
          nombre: r.nombre,
          color: r.color,
          fecha: opt.mesa.fecha,
          hora: opt.mesa.hora,
          llamado: opt.llamado,
          hover,
        });
      }
    }
    return out;
  }, [ghostsOn, hoverCode, rows]);

  // ----- calendario del mes del llamado (grilla compartida MonthCalendar) -----
  // Mesas y fantasmas indexados por fecha; las semanas se arman con
  // buildMonthWeeks, extendidas para cubrir TODAS las mesas disponibles (no
  // solo las visibles) así la grilla no cambia de alto al prender el toggle ni
  // al pasar el cursor por una materia (Febrero → primeros días de marzo).
  const byDate = useMemo(() => {
    const m = new Map<string, FinalRow[]>();
    for (const r of selectedInPeriod) {
      const k = r.mesa!.fecha;
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return m;
  }, [selectedInPeriod]);
  const ghostsByDate = useMemo(() => {
    const m = new Map<string, Ghost[]>();
    for (const g of ghosts) {
      const arr = m.get(g.fecha);
      if (arr) arr.push(g);
      else m.set(g.fecha, [g]);
    }
    return m;
  }, [ghosts]);
  // Todas las opciones de mesa de los finales elegibles fijan la extensión de
  // la grilla. El alto uniforme de las celdas sale del máximo de mesas
  // ELEGIDAS en un día más un lugar para el fantasma del hover: no depende
  // de lo que se muestre en cada momento. Con «Otras fechas» prendido, una
  // celda con más chips que lugares se desplaza por dentro (no crece).
  const allOptionDates = useMemo(() => {
    const dates: string[] = [];
    for (const r of rows) {
      if (r.blocked || r.assignedElsewhere) continue;
      for (const opt of r.opciones) dates.push(opt.mesa.fecha);
    }
    for (const r of selectedInPeriod) dates.push(r.mesa!.fecha);
    return dates;
  }, [rows, selectedInPeriod]);
  const maxPerDay = useMemo(() => {
    let max = 0;
    byDate.forEach((l) => {
      if (l.length > max) max = l.length;
    });
    return max + 1;
  }, [byDate]);
  const weeks = useMemo(
    () => buildMonthWeeks(month, year, allOptionDates),
    [month, year, allOptionDates],
  );
  const cellHeight = mcalCellHeight(maxPerDay, EV_H);
  // semanas sin mesas elegidas ni fantasmas del toggle → atenuadas (los
  // fantasmas del hover no cuentan: la semana no debe prenderse y apagarse)
  const weekActive = useMemo(() => {
    const on = new Set<number>();
    weeks.forEach((wk, wi) => {
      const active = wk.some(
        (d) =>
          (byDate.get(d.iso)?.length ?? 0) > 0 ||
          (ghostsOn && (ghostsByDate.get(d.iso)?.length ?? 0) > 0),
      );
      if (active) on.add(wi);
    });
    return on;
  }, [weeks, byDate, ghostsByDate, ghostsOn]);
  const weekOf = useMemo(() => {
    const m = new Map<string, number>();
    weeks.forEach((wk, wi) => wk.forEach((d) => m.set(d.iso, wi)));
    return m;
  }, [weeks]);

  // finales elegidos sin fecha cargada (para el editor "Fechas de mesa")
  const editorRows = selectedRows; // todos los elegidos, con o sin mesa

  // ----- acciones -----
  const setPeriodo = (p: FinalPeriodo) =>
    dispatch({ type: "SET_FINALES_PERIODO", periodo: p });
  const asignar = (code: string, asignacion: FinalAsignacion | null) =>
    dispatch({ type: "SET_FINAL_ASIGNACION", code, asignacion });
  const setMesa = (code: string, mesa: MesaFinal | null) =>
    dispatch({ type: "SET_MESA", code, mesa });
  // P1 — siembra una mesa manual por defecto (día 15 del mes visible, 09:00).
  // Mismo seed que usa el editor «Fechas de mesa» y el botón «＋ fecha» del panel.
  const seedMesa = (code: string) =>
    setMesa(code, { fecha: isoOf(new Date(year, month - 1, 15)), hora: "09:00" });

  // Llamado por defecto al agregar/mover un final al período visible: 1.º si hay
  // 1.ª mesa oficial (o un override manual, que pisa igual); si no, 2.º.
  const defLlamado = (r: FinalRow): FinalLlamado =>
    r.oficiales.primer || r.manual ? "primer" : "segundo";
  const agregarAca = (r: FinalRow) =>
    asignar(r.code, { periodo, llamado: defLlamado(r) });

  // × de una fila agregada a mano (sale de `finales.extra`, no del progreso):
  // la saca de la lista. Reutilizado en los tres grupos del panel.
  const quitarBtn = (r: FinalRow) =>
    r.agregadoManual ? (
      <Tooltip content="Quitar de la lista" width={130}>
        <button
          type="button"
          className="fin__srow-x"
          aria-label={`Quitar ${r.nombre} de la lista`}
          onClick={() => dispatch({ type: "FINALES_EXTRA_REMOVE", code: r.code })}
        >
          ×
        </button>
      </Tooltip>
    ) : null;

  // Alterna 1.º↔2.º llamado de una mesa oficial con ambos llamados (usado por el
  // badge-botón del chip del calendario). Mismo dispatch que el segmentado.
  const toggleLlamado = (r: FinalRow) => {
    if (!r.hasBoth || !r.llamado) return;
    const otro: FinalLlamado = r.llamado === "primer" ? "segundo" : "primer";
    asignar(r.code, { periodo, llamado: otro });
  };

  // Candidatos de «sugerir»: elegibles con alguna mesa (opción) en el período
  // visible y que NO estén ya asignados a OTRO período (esos no se tocan). Se
  // ordenan por (fecha de la 1.ª opción, hora, código) — determinista.
  const sugCandidatos = useMemo(
    () =>
      eligibles
        .filter((r) => r.opciones.length > 0 && !r.assignedElsewhere)
        .sort(
          (a, b) =>
            a.opciones[0].mesa.fecha.localeCompare(b.opciones[0].mesa.fecha) ||
            toMin(a.opciones[0].mesa.hora) - toMin(b.opciones[0].mesa.hora) ||
            a.code.localeCompare(b.code),
        ),
    [eligibles],
  );

  // "Sugerir combinación" (determinista): recorre los candidatos ordenados y,
  // para cada uno, prueba sus opciones en orden (manual sola; oficial 1.º→2.º),
  // aceptando la PRIMERA que ni se pise ni viole el margen contra las ya
  // aceptadas. Aplica {período visible, llamado aceptado} a los aceptados y
  // limpia (asignación null) a los candidatos que quedaron afuera — sin tocar
  // asignaciones de otros períodos (esos ni siquiera son candidatos).
  const sugerir = () => {
    const aceptadas: Opcion[] = [];
    const llamadoDe = new Map<string, FinalLlamado>();
    for (const c of sugCandidatos) {
      let elegida: Opcion | null = null;
      for (const opt of c.opciones) {
        const choca = aceptadas.some((a) => {
          if (mesasPisan(a.mesa, opt.mesa)) return true;
          const dd = Math.abs(dayDiff(a.mesa.fecha, opt.mesa.fecha));
          return dd === 0 || dd - 1 < margenDias;
        });
        if (!choca) {
          elegida = opt;
          break;
        }
      }
      if (elegida) {
        aceptadas.push(elegida);
        llamadoDe.set(c.code, elegida.llamado);
      }
    }
    for (const c of sugCandidatos) {
      const ll = llamadoDe.get(c.code);
      if (ll) {
        // solo re-despacho si cambia (evita renders inútiles)
        if (!c.selected || c.asig?.llamado !== ll)
          asignar(c.code, { periodo, llamado: ll });
      } else if (c.selected) {
        asignar(c.code, null);
      }
    }
  };

  // ----- .ics (client-side, guardado) -----
  const includables = selectedInPeriod; // elegidos, elegibles, con fecha en el período
  const buildICS = (): string => {
    const stamp =
      new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const out = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//StudyVaults ITBA//Combinador de finales//ES",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${icsEsc(`Finales — ${PERIODO_LABEL[periodo]} ${anioReal} (StudyVaults)`)}`,
      // Hora local con zona explícita: sin TZID los clientes interpretan la
      // hora "flotante" según la zona del dispositivo que abre el .ics.
      "BEGIN:VTIMEZONE",
      `TZID:${ICS_TZID}`,
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:-0300",
      "TZOFFSETTO:-0300",
      "TZNAME:-03",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];
    for (const r of includables) {
      const { fecha, hora } = r.mesa!;
      const mins = toMin(hora);
      const start = parseISO(fecha);
      start.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      const end = new Date(start.getTime() + EXAM_DUR_MIN * 60000);
      const fmt = (d: Date) =>
        `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
      out.push(
        "BEGIN:VEVENT",
        // UID estable por materia + período (SIN la fecha ni el llamado): si
        // corregís la fecha o cambiás de llamado y re-importás, el evento se
        // actualiza en vez de duplicarse en el calendario.
        `UID:sv-final-${r.code}-${periodo}-${anioReal}@studyvaults.itba`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${ICS_TZID}:${fmt(start)}`,
        `DTEND;TZID=${ICS_TZID}:${fmt(end)}`,
        `SUMMARY:${icsEsc(`Final: ${r.nombre}`)}`,
        `LOCATION:${icsEsc("ITBA — sede a confirmar")}`,
        `DESCRIPTION:${icsEsc(
          `Mesa de final (${
            r.source === "manual"
              ? "fecha cargada a mano"
              : `oficial · ${LLAMADO_LABEL[r.llamado ?? "primer"]}`
          }). ` +
            "Fechas sujetas a confirmación de la cátedra — revisá con el/la docente. " +
            "El .ics es una ayuda, no la fuente oficial.",
        )}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${reminderHs}H`,
        `DESCRIPTION:${icsEsc(`Anotate a la mesa de ${r.nombre} — cierra la inscripción`)}`,
        "END:VALARM",
        "END:VEVENT",
      );
    }
    out.push("END:VCALENDAR");
    // plegado RFC 5545 sobre TODAS las líneas (DESCRIPTION suele pasar los 75).
    return out.map(icsFold).join("\r\n");
  };

  const exportarICS = () => {
    if (typeof window === "undefined" || includables.length === 0) return;
    const text = buildICS();
    const nombreArch = `finales-${periodo}-${anioReal}-studyvaults.ics`;
    const a = document.createElement("a");
    let url: string | null = null;
    try {
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      url = URL.createObjectURL(blob);
      a.href = url;
    } catch {
      a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
    }
    a.download = nombreArch;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (url) window.setTimeout(() => URL.revokeObjectURL(url!), 1500);
    setExportMsg(
      `${includables.length} final${includables.length === 1 ? "" : "es"} · aviso ${reminderHs} hs antes`,
    );
    setDlOpen(false);
  };

  // ----- hoja exportable (PDF / imagen): el MISMO MonthCalendar de la vista,
  // renderizado estático con bloques sin interacción, más la lista de mesas.
  const mesLabel =
    MES_NOMBRE[month - 1].charAt(0).toUpperCase() +
    MES_NOMBRE[month - 1].slice(1) +
    " " +
    year;
  const buildSheetArgs = () => {
    // filas ordenadas por fecha+hora; `llamado` legible solo para las oficiales.
    const exportRows: FinalesExportRow[] = includables
      .slice()
      .sort(
        (a, b) =>
          a.mesa!.fecha.localeCompare(b.mesa!.fecha) ||
          toMin(a.mesa!.hora) - toMin(b.mesa!.hora),
      )
      .map((r) => ({
        nombre: r.nombre,
        abbr: r.abbr,
        fecha: r.mesa!.fecha,
        hora: r.mesa!.hora,
        llamado:
          r.source === "oficial" && r.llamado ? LLAMADO_LABEL[r.llamado] : null,
        source: r.source === "oficial" ? "oficial" : "manual",
        color: r.color,
      }));
    // el calendario impreso solo lleva las mesas elegidas: celdas para el
    // máximo de mesas elegidas en un día, sin extender por fantasmas.
    const printByDate = new Map<string, FinalesExportRow[]>();
    for (const r of exportRows) {
      const arr = printByDate.get(r.fecha);
      if (arr) arr.push(r);
      else printByDate.set(r.fecha, [r]);
    }
    let printMax = 1;
    printByDate.forEach((l) => {
      if (l.length > printMax) printMax = l.length;
    });
    const printWeeks = buildMonthWeeks(
      month,
      year,
      exportRows.map((r) => r.fecha),
    );
    const calendarHTML = renderStaticHTML(
      <MonthCalendar
        weeks={printWeeks}
        cellHeight={mcalCellHeight(printMax, EV_H_PRINT)}
        style={{ ["--mcal-ev" as string]: `${EV_H_PRINT}px` }}
        showNum={(d) => (printByDate.get(d.iso)?.length ?? 0) > 0}
        dayClass={(d) => (printByDate.has(d.iso) ? "has-ev" : "")}
        renderDay={(d) =>
          (printByDate.get(d.iso) ?? []).map((r) => (
            <MonthCalendarEvent
              key={r.abbr + r.fecha}
              name={r.nombre}
              time={r.hora}
              tag={r.llamado ? r.llamado.replace(/\.º llamado/, "º") : "manual"}
              color={r.color}
              dashed={r.source === "manual"}
            />
          ))
        }
      />,
    );
    return {
      periodoLabel: PERIODO_LABEL[periodo],
      anioReal,
      mesLabel,
      rows: exportRows,
      margenDias,
      generado: nowStr(),
      calendarHTML,
      calendarCSS: MONTH_CALENDAR_PRINT_CSS,
    };
  };

  // PDF / imprimir: abre el documento (A4, una página, fondo blanco) y dispara print.
  const exportarPDF = () => {
    if (includables.length === 0) return;
    openForPrint(
      buildFinalesHTML({ ...buildSheetArgs(), autoPrint: true }),
      `finales-${periodo}-${anioReal}-cuatris.html`,
    );
    setDlOpen(false);
  };

  // Imagen PNG: la misma hoja rasterizada a 2x (A4 vertical, fondo blanco).
  // Si la hoja mide más que la página, se escala para que entre completa.
  const exportarPNG = async () => {
    if (includables.length === 0) return;
    setDlOpen(false);
    const { html, css } = buildFinalesSheet(buildSheetArgs());
    // medir la hoja para escalarla a una página
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:-10000px;top:0;width:${SHEET_W}px;visibility:hidden`;
    probe.innerHTML = `<style>${css}</style>${html}`;
    document.body.appendChild(probe);
    const natural = probe.querySelector<HTMLElement>(".sheet")?.scrollHeight ?? SHEET_H;
    probe.remove();
    const avail = SHEET_H - SHEET_PAD * 2;
    const k = Math.min(1, avail / Math.max(1, natural - SHEET_PAD * 2));
    const wrapped =
      k < 1
        ? `<div style="transform:scale(${k});transform-origin:top left;width:${SHEET_W}px">${html}</div>`
        : html;
    try {
      const blob = await htmlToPngBlob(wrapped, css, {
        width: SHEET_W,
        height: SHEET_H,
        scale: 2,
      });
      downloadBlob(blob, `finales-${periodo}-${anioReal}-cuatris.png`);
      setExportMsg("Imagen descargada (A4, fondo blanco)");
    } catch (e) {
      // navegadores que no rasterizan foreignObject (Safari): versión imprimible
      console.warn("No se pudo generar la imagen; se abre el PDF.", e);
      openForPrint(
        buildFinalesHTML({ ...buildSheetArgs(), autoPrint: false }),
        `finales-${periodo}-${anioReal}-cuatris.html`,
      );
    }
  };

  // click en un chip fantasma: asigna/mueve ese final a ese llamado del período.
  const rendirFantasma = (g: Ghost) =>
    asignar(g.code, { periodo, llamado: g.llamado });

  // ----- textos de resumen (rows.length puede ser 0: la vista ya no corta
  // temprano — buscador y panel cubren el estado vacío) -----
  const nSel = selectedRows.length;
  // desglose por llamado de los elegidos en el período visible (solo si hay 2.º).
  const nSegundo = selectedRows.filter(
    (r) => r.asig?.llamado === "segundo",
  ).length;
  const nPrimer = nSel - nSegundo;
  const desglose =
    nSegundo > 0 ? ` (${nPrimer} en 1.º llamado · ${nSegundo} en 2.º)` : "";
  // "te quedan N para los otros llamados": elegibles sin asignar en NINGÚN período.
  const nSinAsignar = eligibles.filter((r) => !r.asig).length;
  // P1 5c — cuando hay elegidos sin fecha, el titular aclara cuántos tienen mesa.
  const nConFecha = nSel - sinFecha.length;
  const rendisTxt =
    nConFecha < nSel
      ? `rendís ${nSel} (${nConFecha} con fecha)`
      : `rendís ${nSel} final${nSel === 1 ? "" : "es"}`;
  const resumenMain = `En ${PERIODO_LABEL[periodo]} ${rendisTxt}${desglose} · te queda${nSinAsignar === 1 ? "" : "n"} ${nSinAsignar} para los otros llamados.`;
  const resumenSub =
    [
      blocked.length > 0
        ? `${blocked.length} bloqueado${blocked.length === 1 ? "" : "s"} por correlativa de final`
        : null,
      pisanCodes.size > 0 ? "revisá los cruces marcados" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "sin conflictos detectados en la selección actual";

  const yearOpts = Array.from(new Set([2025, 2026, 2027, 2028, anio])).sort(
    (a, b) => a - b,
  );

  // hint del calendario cuando no hay mesas elegidas: con «Otras fechas» activo
  // guía hacia los fantasmas (o avisa que no hay fechas publicadas).
  const calHint =
    rows.length === 0
      ? "agregá finales con el buscador para verlos en su mesa"
      : selectedInPeriod.length > 0
        ? null
        : ghostsOn
          ? ghosts.length > 0
            ? "tocá una fecha fantasma para sumar ese final"
            : "no hay otras fechas publicadas para este período"
          : "sumá finales del panel para verlos en su mesa";

  /* ============================ render ============================ */

  return (
    <section className="view-panel fin" aria-label="Combinación de finales">
      {/* ---- barra: período + año (decisión principal) · panel + sugerir ---- */}
      <div className="fin__bar">
        <div className="fin__bar-left">
          <span className="fin__lbl">Período</span>
          <div
            className="fin__seg"
            role="group"
            aria-label="Período de finales"
          >
            {PERIODOS.map((p) => (
              <button
                key={p}
                type="button"
                className={"fin__seg-b" + (p === periodo ? " is-active" : "")}
                aria-pressed={p === periodo}
                onClick={() => setPeriodo(p)}
              >
                {PERIODO_LABEL[p]}
              </button>
            ))}
          </div>
          <label className="fin__year">
            <span className="sr-only">Año del período</span>
            <select
              value={anio}
              onChange={(e) =>
                dispatch({
                  type: "SET_FINALES_ANIO",
                  anio: Number(e.target.value),
                })
              }
            >
              {yearOpts.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="fin__bar-right">
          <ProgresoSwitch vista="finales" />
          <button
            type="button"
            className="fin__hbtn"
            aria-pressed={panelOpen}
            onClick={() => setPanelOpen((v) => !v)}
          >
            <IconCalendar size={13} />
            {panelOpen ? "Ocultar lista" : "Mostrar lista"}
          </button>
          <button
            type="button"
            className="fin__hbtn is-primary"
            onClick={sugerir}
            disabled={sugCandidatos.length === 0}
            title={
              sugCandidatos.length === 0
                ? "Agregá finales con fecha para sugerir una combinación."
                : "Ubica automáticamente tus finales sin superponerlos y con margen de repaso."
            }
          >
            <IconCheck size={13} />
            Sugerir combinación
          </button>
        </div>
      </div>

      {/* ---- buscador de finales: abierto a pedido o forzado con la lista
          vacía (mismo picker compartido con el combinador de horarios) ---- */}
      {showPicker && (
        <div className="fin__picker">
          <MateriaPicker
            candidatos={candidatos}
            fantasmas={sinFinal}
            fantasmaNota="no rinde final"
            added={(code) => extra.has(code)}
            onToggle={(code) => {
              // con la lista vacía el buscador está abierto a la fuerza; al
              // sumar el primer final queda abierto a pedido (no se cierra solo)
              if (rows.length === 0) setPickerOpen(true);
              dispatch(
                extra.has(code)
                  ? { type: "FINALES_EXTRA_REMOVE", code }
                  : { type: "FINALES_EXTRA_ADD", code },
              );
            }}
            meta={(m) => `${m.creditos} cr`}
            tag={(m) =>
              !conProgreso && finalDone.has(m.codigo) ? (
                <span className="cmb9-oktag">✓ final aprobado</span>
              ) : null
            }
            rowTitle={(m, added) =>
              `${m.codigo} · ${m.nombre} — ${added ? "quitar de" : "sumar a"} tus finales pendientes`
            }
            placeholder="Buscá un final (código o nombre)…"
            hint={
              ocultosDone > 0
                ? {
                    text:
                      ocultosDone === 1
                        ? "Tu final aprobado no aparece"
                        : `Tus ${ocultosDone} finales aprobados no aparecen`,
                    action: ocultosDone === 1 ? "mostrarlo igual" : "mostrarlos igual",
                    onAction: () => dispatch({ type: "SET_COMBO_SOLO", value: true }),
                  }
                : null
            }
          />
        </div>
      )}

      {/* ---- calendario + panel de pendientes (protagonista) ---- */}
      <div className="fin__row">
        <div className="fin__cal-wrap">
          <div className="fin__cal-head">
            <span className="fin__cal-title">
              {MES_NOMBRE[month - 1].charAt(0).toUpperCase() +
                MES_NOMBRE[month - 1].slice(1)}{" "}
              {year}
            </span>
            {calHint && <span className="fin__cal-hint">{calHint}</span>}

            {/* controles del calendario: fantasmas + descargar (.ics / PDF) */}
            <div className="fin__cal-controls">
              <button
                type="button"
                className="fin__hbtn"
                aria-pressed={ghostsOn}
                aria-label="Mostrar como fantasmas las otras fechas de mesa disponibles de tus finales"
                title="Ver las otras fechas de mesa disponibles (más tenues, en el calendario)"
                onClick={() => setGhostsOn((v) => !v)}
              >
                <IconClock size={13} />
                Otras fechas
              </button>

              {exportMsg && (
                <span className="fin__dl-ok" role="status">
                  <IconCheck size={13} /> {exportMsg}
                </span>
              )}

              <div className="fin__dl" ref={dlRef}>
                <button
                  type="button"
                  className="fin__hbtn"
                  aria-haspopup="menu"
                  aria-expanded={dlOpen}
                  onClick={() => setDlOpen((v) => !v)}
                >
                  <IconDownload size={13} />
                  Descargar
                </button>

                {dlOpen && (
                  <div className="fin__dl-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="fin__dl-item"
                      disabled={includables.length === 0}
                      title={
                        includables.length === 0
                          ? "Elegí finales con fecha primero"
                          : undefined
                      }
                      onClick={exportarICS}
                    >
                      <IconCalendar size={15} /> Calendario (.ics)
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="fin__dl-item"
                      disabled={includables.length === 0}
                      title={
                        includables.length === 0
                          ? "Elegí finales con fecha primero"
                          : undefined
                      }
                      onClick={exportarPDF}
                    >
                      <IconPrinter size={15} /> PDF / imprimir
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="fin__dl-item"
                      disabled={includables.length === 0}
                      title={
                        includables.length === 0
                          ? "Elegí finales con fecha primero"
                          : undefined
                      }
                      onClick={exportarPNG}
                    >
                      <IconImage size={15} /> Imagen (.png)
                    </button>
                    <hr className="fin__dl-sep" />
                    {/* ajustes de planificación, fuera de la barra primaria */}
                    <label className="fin__dl-aviso">
                      <span>Margen</span>
                      <select
                        value={margenDias}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_FINALES_MARGEN",
                            dias: Number(e.target.value),
                          })
                        }
                      >
                        {[1, 2, 3, 4].map((d) => (
                          <option key={d} value={d}>
                            {d} día{d === 1 ? "" : "s"} de repaso
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="fin__dl-aviso">
                      <span>Aviso</span>
                      <select
                        value={reminderHs}
                        onChange={(e) =>
                          dispatch({
                            type: "SET_FINALES_REMINDER",
                            hs: Number(e.target.value),
                          })
                        }
                      >
                        {[48, 72, 96].map((h) => (
                          <option key={h} value={h}>
                            {h} hs antes
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* P1 5b — nudge: elegidos sin mesa no entran al calendario. */}
          {sinFecha.length > 0 && (
            <p className="fin__nudge">
              {sinFecha.length} sin fecha — cargales fecha para verlas en el
              calendario.
            </p>
          )}

          <div className="fin__cal-scroll">
            <MonthCalendar
              className="fin__agenda"
              label={`Calendario de mesas — ${MES_NOMBRE[month - 1]} ${year}`}
              weeks={weeks}
              cellHeight={cellHeight}
              style={{ ["--fin-ev" as string]: `${EV_H}px` }}
              showNum={(d) =>
                (byDate.get(d.iso)?.length ?? 0) > 0 ||
                (ghostsByDate.get(d.iso)?.length ?? 0) > 0
              }
              dayClass={(d) =>
                d.inMonth && !weekActive.has(weekOf.get(d.iso) ?? -1)
                  ? "is-dim"
                  : ""
              }
              renderDay={(d) => (
                <FinalesDay
                  exams={byDate.get(d.iso) ?? []}
                  ghosts={ghostsByDate.get(d.iso) ?? []}
                  pisanCodes={pisanCodes}
                  conMesasReales={conMesasReales}
                  onToggleLlamado={toggleLlamado}
                  onGhost={rendirFantasma}
                  onHoverIn={hoverIn}
                  onHoverOut={hoverOut}
                />
              )}
            />
          </div>

          {/* ---- resumen: DEBAJO del calendario (el llamado a la acción queda
              lo más arriba posible). Los cruces se marcan en el calendario.
              Sin finales en la lista no hay nada que resumir. ---- */}
          {rows.length > 0 && (
            <div className="fin__resumen">
              <span className="fin__resumen-ico" aria-hidden="true">
                <IconGraduation />
              </span>
              <div className="fin__resumen-body">
                <div className="fin__resumen-main">{resumenMain}</div>
                <div className="fin__resumen-sub">{resumenSub}</div>
              </div>
            </div>
          )}

          {/* editor de fechas de mesa (híbrido: oficial / manual / sin fecha) */}
          {editorRows.length > 0 && (
            <div className="fin__mesas">
              <div className="fin__mesas-head">
                <IconClock size={13} />
                <span>Fechas de mesa</span>
              </div>
              <ul className="fin__mesas-list">
                {editorRows.map((r) => (
                  <li
                    key={r.code}
                    className="fin__mesa-row"
                    onPointerEnter={() => hoverIn(r.code)}
                    onPointerLeave={hoverOut}
                  >
                    <span
                      className="fin__mesa-dot"
                      style={cvar("--c-color", r.color)}
                    />
                    <span className="fin__mesa-name">{r.nombre}</span>
                    {r.source === "none" ? (
                      <button
                        type="button"
                        className="fin__addfecha"
                        onClick={() => seedMesa(r.code)}
                      >
                        <IconPlus size={12} /> agregar fecha
                      </button>
                    ) : r.source === "manual" ? (
                      <span className="fin__mesa-edit">
                        <input
                          type="date"
                          value={r.mesa!.fecha}
                          aria-label={`Fecha de mesa de ${r.nombre}`}
                          onChange={(e) =>
                            setMesa(r.code, {
                              fecha: e.target.value || r.mesa!.fecha,
                              hora: r.mesa!.hora,
                            })
                          }
                        />
                        <input
                          type="time"
                          value={r.mesa!.hora}
                          aria-label={`Hora de mesa de ${r.nombre}`}
                          onChange={(e) =>
                            setMesa(r.code, {
                              fecha: r.mesa!.fecha,
                              hora: e.target.value || r.mesa!.hora,
                            })
                          }
                        />
                        <span className="fin__badge is-manual">manual</span>
                        <button
                          type="button"
                          className="fin__mesa-clear"
                          aria-label={`Quitar la fecha manual de ${r.nombre}`}
                          title="Quitar fecha manual"
                          onClick={() => setMesa(r.code, null)}
                        >
                          <IconTrash size={12} />
                        </button>
                      </span>
                    ) : (
                      <span className="fin__mesa-edit">
                        {r.hasBoth ? (
                          // ambos llamados oficiales → elegí 1.º o 2.º mesa
                          <span
                            className="fin__llseg"
                            role="group"
                            aria-label={`Llamado de ${r.nombre}`}
                          >
                            {(["primer", "segundo"] as FinalLlamado[]).map(
                              (l) => (
                                <button
                                  key={l}
                                  type="button"
                                  className={
                                    "fin__llseg-b" +
                                    (r.asig?.llamado === l ? " is-active" : "")
                                  }
                                  aria-pressed={r.asig?.llamado === l}
                                  aria-label={`${r.nombre}: ${LLAMADO_LABEL[l]}`}
                                  title={LLAMADO_LABEL[l]}
                                  onClick={() =>
                                    asignar(r.code, { periodo, llamado: l })
                                  }
                                >
                                  {LLAMADO_ORD[l]}
                                </button>
                              ),
                            )}
                          </span>
                        ) : null}
                        <span className="fin__mesa-oficial">
                          {ddmm(r.mesa!.fecha)} · {r.mesa!.hora}
                        </span>
                        {/* Sin mesas para el llamado, la fecha es una estimación del usuario. */}
                        <span
                          className={
                            "fin__badge " +
                            (conMesasReales ? "is-oficial" : "is-ejemplo")
                          }
                        >
                          {conMesasReales ? "oficial" : "ejemplo"}
                        </span>
                        {!r.hasBoth && r.llamado && (
                          <span className="fin__badge is-llamado">
                            {LLAMADO_ORD[r.llamado]}
                          </span>
                        )}
                        <button
                          type="button"
                          className="fin__mesa-clear"
                          aria-label={`Editar la fecha de ${r.nombre} (pasar a manual)`}
                          title="Editar (pasar a manual)"
                          onClick={() => setMesa(r.code, { ...r.mesa! })}
                        >
                          <IconPencil />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {panelOpen && (
          <aside className="fin__side" aria-label="Finales pendientes">
            <div className="fin__side-head">
              <span className="fin__side-title">Finales pendientes</span>
              <span className="fin__side-count">
                {eligibles.length}
                {blocked.length > 0 ? ` + ${blocked.length} bloqueados` : ""}
              </span>
              {rows.length > 0 && (
                <Tooltip
                  content={
                    showPicker
                      ? "Cerrar el buscador"
                      : "Sumá finales a la lista: cualquier materia, esté o no en tu progreso"
                  }
                  width={220}
                >
                  <button
                    type="button"
                    className={"fin__add" + (showPicker ? " is-open" : "")}
                    aria-expanded={showPicker}
                    onClick={() => setPickerOpen((o) => !o)}
                  >
                    {showPicker ? (
                      "Listo"
                    ) : (
                      <>
                        <IconPlus size={11} /> Agregar
                      </>
                    )}
                  </button>
                </Tooltip>
              )}
            </div>

            {rows.length === 0 ? (
              <button
                type="button"
                className="fin__add-lead"
                onClick={() => setPickerOpen(true)}
              >
                ＋ Elegí los finales a combinar
              </button>
            ) : (
            <>
                <div
                  className="fin__group"
                  style={cvar("--tone", "var(--status-go)")}
                >
                  <div className="fin__group-head">
                    <span className="fin__g-dot" />
                    <span className="fin__group-title">
                      {conProgreso
                        ? `Se pueden rendir — ${PERIODO_LABEL[periodo]}`
                        : `Para combinar — ${PERIODO_LABEL[periodo]}`}
                    </span>
                    <span className="fin__group-n">{eligibles.length}</span>
                  </div>
                  <ul className="fin__list">
                    {eligibles.map((r) => {
                      const pisa = wouldPisar(r) || pisanCodes.has(r.code);
                      const short = r.selected
                        ? "en el período"
                        : pisa
                          ? "se pisa"
                          : r.source === "manual"
                            ? "manual"
                            : r.source === "oficial"
                              ? "oficial"
                              : "sin fecha";
                      // asignado a OTRO período: chip «en <período>» que lo mueve
                      // al llamado visible (en lugar del botón «+»).
                      const elsewhere = r.assignedElsewhere;
                      return (
                        <li
                          key={r.code}
                          className="fin__srow"
                          tabIndex={0}
                          onPointerEnter={() => hoverIn(r.code)}
                          onPointerLeave={hoverOut}
                        >
                          <span
                            className="fin__fin-dot"
                            style={cvar("--c-color", r.color)}
                          />
                          <span className="fin__srow-name">{r.nombre}</span>
                          {r.cursando && (
                            <span
                              className="fin__srow-cursando"
                              title="La estás cursando: el final queda para cuando termine el cuatrimestre"
                            >
                              cursando
                            </span>
                          )}
                          <span className="fin__srow-cr">{r.creditos} cr</span>
                          {elsewhere ? (
                            <>
                              <button
                                type="button"
                                className="fin__movehere"
                                aria-label={`${r.nombre}: asignado al llamado de ${PERIODO_LABEL[elsewhere]} — mover a ${PERIODO_LABEL[periodo]}`}
                                title={`Está en ${PERIODO_LABEL[elsewhere]} — clic para moverlo a ${PERIODO_LABEL[periodo]}`}
                                onClick={() => agregarAca(r)}
                              >
                                en {PERIODO_SHORT[elsewhere]}
                              </button>
                              {quitarBtn(r)}
                              <span className="fin__tip" role="note">
                                Ya lo asignaste al llamado de{" "}
                                {PERIODO_LABEL[elsewhere]}. Clic en «en{" "}
                                {PERIODO_SHORT[elsewhere]}» para moverlo a{" "}
                                {PERIODO_LABEL[periodo]}.
                              </span>
                            </>
                          ) : (
                            <>
                              {r.selected && r.hasBoth && !r.manual ? (
                                // elegido con ambos llamados oficiales → elegí
                                // 1.º/2.º acá mismo (mismo dispatch que el editor).
                                <span
                                  className="fin__llseg"
                                  role="group"
                                  aria-label={`Llamado de ${r.nombre}`}
                                >
                                  {(["primer", "segundo"] as FinalLlamado[]).map(
                                    (l) => (
                                      <button
                                        key={l}
                                        type="button"
                                        className={
                                          "fin__llseg-b" +
                                          (r.asig?.llamado === l
                                            ? " is-active"
                                            : "")
                                        }
                                        aria-pressed={r.asig?.llamado === l}
                                        aria-label={`${r.nombre}: ${LLAMADO_LABEL[l]}`}
                                        title={LLAMADO_LABEL[l]}
                                        onClick={() =>
                                          asignar(r.code, { periodo, llamado: l })
                                        }
                                      >
                                        {LLAMADO_ORD[l]}
                                      </button>
                                    ),
                                  )}
                                </span>
                              ) : r.source === "none" && !r.selected ? (
                                // P1 5a — sin fecha: botón que siembra la mesa
                                // (mismo seed que el editor) en vez de una label pasiva.
                                <button
                                  type="button"
                                  className="fin__addfecha is-sm"
                                  onClick={() => seedMesa(r.code)}
                                >
                                  <IconPlus size={11} /> fecha
                                </button>
                              ) : (
                                <span
                                  className={
                                    "fin__short" +
                                    (pisa && !r.selected ? " is-pisa" : "")
                                  }
                                >
                                  {short}
                                </span>
                              )}
                              <button
                                type="button"
                                className="fin__toggle"
                                aria-pressed={r.selected}
                                aria-label={
                                  r.selected
                                    ? `${r.nombre}: en el período (quitar)`
                                    : `${r.nombre}: agregar al período`
                                }
                                onClick={() =>
                                  r.selected
                                    ? asignar(r.code, null)
                                    : agregarAca(r)
                                }
                              >
                                {r.selected ? (
                                  <IconCheck size={11} />
                                ) : (
                                  <IconPlus size={11} />
                                )}
                              </button>
                              {quitarBtn(r)}
                              <span className="fin__tip" role="note">
                                {r.mesa
                                  ? `Mesa ${ddmm(r.mesa.fecha)} · ${r.mesa.hora}${r.source === "manual" ? " — fecha cargada a mano (editable)" : ` (oficial · ${LLAMADO_LABEL[r.llamado ?? "primer"]})`}`
                                  : "Sin mesa publicada — cargá la fecha en «Fechas de mesa»."}
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                    {eligibles.length === 0 && (
                      <li className="fin__srow-empty">
                        Todos tus finales pendientes están bloqueados por
                        correlativa.
                      </li>
                    )}
                  </ul>
                </div>

                {blocked.length > 0 && (
                  <div
                    className="fin__group is-muted"
                    style={cvar("--tone", "var(--status-caution)")}
                  >
                    <div className="fin__group-head">
                      <span className="fin__g-dot" />
                      <span className="fin__group-title">
                        Bloqueados por correlativa
                      </span>
                      <span className="fin__group-n">{blocked.length}</span>
                    </div>
                    <ul className="fin__list">
                      {blocked.map((r) => (
                        <li key={r.code} className="fin__srow" tabIndex={0}>
                          <span className="fin__lock" aria-hidden="true">
                            <IconLock size={13} strokeWidth={1.8} />
                          </span>
                          <span className="fin__srow-name is-muted">
                            {r.nombre}
                          </span>
                          <span className="fin__srow-cr">{r.creditos} cr</span>
                          <button
                            type="button"
                            className="fin__toggle"
                            disabled
                            aria-label={`${r.nombre}: bloqueado por correlativa de final`}
                          >
                            <IconPlus size={11} />
                          </button>
                          {quitarBtn(r)}
                          <span className="fin__tip" role="note">
                            Requiere el final de{" "}
                            {r.faltan.map(nombreDe).join(", ")} aprobado.
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </>
            )}
          </aside>
        )}
      </div>

      {/* Ingesta de la planilla oficial: vive DEBAJO del área de trabajo,
          colapsada tras un summary discreto. Con las mesas ya horneadas en el
          sitio queda cerrada por defecto — es la vía para traer una planilla
          más nueva o corregida, no un paso obligatorio. */}
      <details
        className="fin__ing-wrap"
        open={ingestaOpen ?? !conMesasReales}
        onToggle={(e) => setIngestaOpen(e.currentTarget.open)}
      >
        <summary className="fin__ing-summary">Actualizar fechas oficiales</summary>
        <FinalesIngesta />
      </details>

      <p className="fin__foot">
        <IconInfo size={13} />
        <span>
          {fuenteMesas === "ingesta"
            ? "Mesas cargadas de la planilla oficial que subiste — verificá siempre con la cátedra. Las correlativas de final son un modelo de referencia."
            : fuenteMesas === "publicada"
              ? "Fechas de la planilla oficial de la universidad — verificá siempre con la cátedra. Las correlativas de final son un modelo de referencia."
              : "Este llamado todavía no tiene mesas publicadas — cargá las fechas a mano o traé la planilla oficial arriba. Las correlativas de final son un modelo de referencia."}
        </span>
      </p>
    </section>
  );
}

/* ---- contenido de una celda del calendario (mesas elegidas + fantasmas) ---- */
function FinalesDay({
  exams,
  ghosts,
  pisanCodes,
  conMesasReales,
  onToggleLlamado,
  onGhost,
  onHoverIn,
  onHoverOut,
}: {
  exams: FinalRow[];
  ghosts: Ghost[];
  pisanCodes: Set<string>;
  conMesasReales: boolean;
  onToggleLlamado: (r: FinalRow) => void;
  onGhost: (g: Ghost) => void;
  onHoverIn: (code: string) => void;
  onHoverOut: () => void;
}) {
  const conflictDay = exams.some((e) => pisanCodes.has(e.code));
  return (
    <>
      {conflictDay && (
        <span className="fin__day-conflict">
          <IconAlert /> se pisan
        </span>
      )}
      {exams.map((e) => (
        <div
          key={e.code}
          className={
            "fin__exam" + (pisanCodes.has(e.code) ? " is-conflict" : "")
          }
          style={cvar("--c-color", e.color)}
          onPointerEnter={() => onHoverIn(e.code)}
          onPointerLeave={onHoverOut}
        >
          <span className="fin__exam-name">{e.nombre}</span>
          <span className="fin__exam-meta">
            {e.mesa!.hora}
            {/* «oficial» es lo normal y no se rotula (lo dice el editor);
                sí se marca la fecha manual y la de ejemplo (sin planilla). */}
            {e.source === "manual" ? (
              <span className="fin__badge is-manual">manual</span>
            ) : !conMesasReales ? (
              <span className="fin__badge is-ejemplo" title="Fecha de ejemplo (sin planilla oficial)">
                ej.
              </span>
            ) : null}
            {e.source === "oficial" &&
              e.llamado &&
              (e.hasBoth ? (
                // ambos llamados oficiales → el mismo segmentado 1º|2º
                // del panel y del editor (elige la mesa).
                <span
                  className="fin__llseg fin__llseg--sm"
                  role="group"
                  aria-label={`Llamado de ${e.nombre}`}
                >
                  {(["primer", "segundo"] as FinalLlamado[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      className={
                        "fin__llseg-b" + (e.llamado === l ? " is-active" : "")
                      }
                      aria-pressed={e.llamado === l}
                      aria-label={`${e.nombre}: ${LLAMADO_LABEL[l]}`}
                      title={LLAMADO_LABEL[l]}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (e.llamado !== l) onToggleLlamado(e);
                      }}
                    >
                      {LLAMADO_ORD[l]}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="fin__badge is-llamado">
                  {LLAMADO_ORD[e.llamado]}
                </span>
              ))}
          </span>
        </div>
      ))}
      {ghosts.map((g) => (
        <button
          key={g.key}
          type="button"
          className={"fin__exam is-ghost" + (g.hover ? " is-hover" : "")}
          style={cvar("--c-color", g.color)}
          aria-label={`Rendir ${g.nombre} el ${ddmm(g.fecha)} (${LLAMADO_LABEL[g.llamado]})`}
          title={`Agregar ${g.nombre} — ${LLAMADO_LABEL[g.llamado]}`}
          onClick={() => onGhost(g)}
          onPointerEnter={() => onHoverIn(g.code)}
          onPointerLeave={onHoverOut}
        >
          <span className="fin__exam-name">{g.nombre}</span>
          <span className="fin__exam-meta">
            {g.hora}
            <span className="fin__badge is-llamado">
              {LLAMADO_ORD[g.llamado]}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}

/* ---- íconos locales que no están en icons.tsx ---- */
function IconImage({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 16.5 15 11l-7 8" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17.5h.01" />
    </svg>
  );
}
function IconPencil() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 5.5 18.5 10 8 20.5H3.5V16L14 5.5Z" />
      <path d="M13 6.5 17.5 11" />
    </svg>
  );
}
function IconGraduation() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4 2.5 9 12 14l9.5-5L12 4Z" />
      <path d="M6.5 11v4.2c0 1.2 2.5 2.3 5.5 2.3s5.5-1.1 5.5-2.3V11" />
      <path d="M21.5 9v4.5" />
    </svg>
  );
}
