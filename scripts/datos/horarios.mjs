// ============================================================================
// horarios.mjs — reglas de data/plan/horarios/<AAAA>-<n>C.json (contrato 1.1.0)
// ----------------------------------------------------------------------------
// C2 (la forma: deprecated/schemas/v1/horarios.schema.json) y C3 (las
// invariantes que ningún schema puede expresar: deprecated/tools/cuatris/validar/
// invariantes.py), portadas regla por regla. Cada decisión de forma responde a
// un caso real del SGA (ver deprecated/docs/contrato.md, «Los siete casos reales»):
//   · `aulas` es array: 93.18 com. B da miércoles 10-12 en 003T y 004T a la vez.
//   · `sede` y `modalidad` van en el bloque: 93.18 com. A cambia de sede entre días.
//   · `desde`/`hasta` van en el curso: 15.09 va del 18/09 al 16/10.
//   · `id` de comisión es un string opaco: existen A-H y K; 72.44 usa «S».
//   · `codigo` es la única identidad: 23.05 y 25.66 comparten nombre.
//   · `sede: null` vale con cualquier modalidad: es lo que publica el SGA cuando
//     un bloque no tiene aula asignada.
//   · `dictado_conjunto` exime a dos códigos de la colisión de aula.
//
// ERROR es lo que rompe al planificador o describe algo imposible; AVISO lo raro
// pero real (colisión de docente, sobrecupo, curso intensivo en un aula ocupada).
// ============================================================================

import { revisarCampos, revisarEnum, revisarPatron, revisarStrings } from "./estructura.mjs";
import { aviso, error } from "./reporte.mjs";
import {
  ARCHIVO_HORARIOS_RE,
  CODIGO_HORARIOS_RE,
  DIA,
  MODALIDAD,
  MODALIDADES_CON_AULA,
  SEDE,
} from "./vocabulario.mjs";

/** Major del contrato que entiende scripts/build-planner-data.mjs. */
export const MAJOR_CONTRATO = 1;
export const HORA_MINIMA = "07:00";
export const HORA_MAXIMA = "23:00";
export const DURACION_MAXIMA_MINUTOS = 8 * 60;
/** Solapamiento de fechas (en días) hasta el cual una colisión de aula es aviso:
 *  el SGA publica cursos intensivos de una semana en aulas ocupadas todo el
 *  cuatrimestre (74.61 en 201R y 204R, corrida real del 2026-09-13). */
export const COLISION_BREVE_DIAS = 7;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const CONTRATO_RE = /^(\d+)\.\d+\.\d+$/;
const TEXTO_CORTO_RE = /^\S(?:.{0,38}\S)?$/;
const SEDE_RE = /^[a-z0-9_]+$/;

const DIAS = Object.keys(DIA);
const MODALIDADES = Object.keys(MODALIDAD);
const SEDES = Object.keys(SEDE);

const minutos = (hhmm) => {
  const m = hhmm.match(HORA_RE);
  return m ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null;
};
const seSolapan = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const seSolapanFechas = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;
const dia = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const diasEnComun = (a1, a2, b1, b2) => {
  const desde = a1 > b1 ? a1 : b1;
  const hasta = a2 < b2 ? a2 : b2;
  return Math.max(0, Math.round((dia(hasta) - dia(desde)) / 86400000) + 1);
};

// ---- C2: forma ----------------------------------------------------------------

const ESQUEMA_RAIZ = {
  requeridos: { contrato: "string", periodo: "object", fuente: "object", cursos: "array" },
};
const ESQUEMA_PERIODO = {
  requeridos: { id: "string", anio: "integer", cuatrimestre: "string", desde: "string", hasta: "string" },
};
const ESQUEMA_FUENTE = { requeridos: { sistema: "string", capturado: "string" } };
const ESQUEMA_CURSO = {
  requeridos: {
    codigo: "string",
    nombre: "string",
    desde: "string",
    hasta: "string",
    dictado_conjunto: "array",
    comisiones: "array",
  },
  opcionales: { departamento: "string" },
};
const ESQUEMA_COMISION = {
  requeridos: { id: "string", docentes: "array", bloques: "array" },
  opcionales: { cupo: "object", ocupacion: "object", desde: "string", hasta: "string" },
};
const ESQUEMA_CUPO = { requeridos: { capacidad: "integer" } };
const ESQUEMA_OCUPACION = { requeridos: { inscriptos: "integer", al: "string" } };
const ESQUEMA_BLOQUE = {
  requeridos: {
    dia: "string",
    desde: "string",
    hasta: "string",
    sede: ["string", "null"],
    modalidad: "string",
    aulas: "array",
  },
};

function revisarForma(datos, archivo, h) {
  if (!revisarCampos(datos, "(raíz)", archivo, ESQUEMA_RAIZ, h)) return false;
  let ok = true;
  const contrato = datos.contrato.match(CONTRATO_RE);
  if (!contrato) {
    ok = revisarPatron(datos.contrato, CONTRATO_RE, "contrato", archivo, h, "una versión SemVer");
  } else if (Number(contrato[1]) !== MAJOR_CONTRATO) {
    h.push(
      error(
        "contrato-incompatible",
        archivo,
        `el archivo declara «contrato: ${datos.contrato}» y este validador y el build solo entienden el major ${MAJOR_CONTRATO}`,
      ),
    );
    ok = false;
  }
  if (revisarCampos(datos.periodo, "periodo", archivo, ESQUEMA_PERIODO, h)) {
    const p = datos.periodo;
    ok = revisarPatron(p.id, /^\d{4}-[12]C$/, "periodo.id", archivo, h, "un id de período (AAAA-1C / AAAA-2C)") && ok;
    ok = revisarEnum(p.cuatrimestre, ["1C", "2C"], "periodo.cuatrimestre", archivo, h, "un cuatrimestre") && ok;
    if (p.anio < 2000 || p.anio > 2100) {
      h.push(error("valor-invalido", archivo, `periodo.anio: ${p.anio} está fuera de 2000-2100`));
      ok = false;
    }
    ok = revisarPatron(p.desde, FECHA_RE, "periodo.desde", archivo, h, "una fecha AAAA-MM-DD") && ok;
    ok = revisarPatron(p.hasta, FECHA_RE, "periodo.hasta", archivo, h, "una fecha AAAA-MM-DD") && ok;
  } else ok = false;
  if (revisarCampos(datos.fuente, "fuente", archivo, ESQUEMA_FUENTE, h)) {
    ok = revisarEnum(datos.fuente.sistema, ["sga", "manual"], "fuente.sistema", archivo, h, "un origen") && ok;
    ok = revisarPatron(datos.fuente.capturado, FECHA_RE, "fuente.capturado", archivo, h, "una fecha AAAA-MM-DD") && ok;
  } else ok = false;
  datos.cursos.forEach((curso, i) => {
    ok = revisarCurso(curso, `cursos[${i}]`, archivo, h) && ok;
  });
  return ok;
}

function revisarCurso(curso, ruta, archivo, h) {
  if (!revisarCampos(curso, ruta, archivo, ESQUEMA_CURSO, h)) return false;
  let ok = revisarPatron(curso.codigo, CODIGO_HORARIOS_RE, `${ruta}.codigo`, archivo, h, "un código de materia (NN.NN)");
  if (curso.nombre.length === 0) {
    h.push(error("valor-invalido", archivo, `${ruta}.nombre: está vacío`));
    ok = false;
  }
  ok = revisarPatron(curso.desde, FECHA_RE, `${ruta}.desde`, archivo, h, "una fecha AAAA-MM-DD") && ok;
  ok = revisarPatron(curso.hasta, FECHA_RE, `${ruta}.hasta`, archivo, h, "una fecha AAAA-MM-DD") && ok;
  if (curso.departamento !== undefined && curso.departamento.length === 0) {
    h.push(error("valor-invalido", archivo, `${ruta}.departamento: está vacío`));
    ok = false;
  }
  curso.dictado_conjunto.forEach((c, i) => {
    ok = revisarPatron(c, CODIGO_HORARIOS_RE, `${ruta}.dictado_conjunto[${i}]`, archivo, h, "un código de materia (NN.NN)") && ok;
  });
  curso.comisiones.forEach((com, i) => {
    ok = revisarComision(com, `${ruta}.comisiones[${i}]`, archivo, h) && ok;
  });
  return ok;
}

function revisarComision(com, ruta, archivo, h) {
  if (!revisarCampos(com, ruta, archivo, ESQUEMA_COMISION, h)) return false;
  let ok = revisarPatron(com.id, TEXTO_CORTO_RE, `${ruta}.id`, archivo, h, "un id de comisión (1 a 40 caracteres, sin espacios en los bordes)");
  ok = revisarStrings(com.docentes, `${ruta}.docentes`, archivo, h, "un nombre de docente") && ok;
  if (com.cupo !== undefined && revisarCampos(com.cupo, `${ruta}.cupo`, archivo, ESQUEMA_CUPO, h)) {
    if (com.cupo.capacidad < 0) {
      h.push(error("valor-invalido", archivo, `${ruta}.cupo.capacidad: es negativa`));
      ok = false;
    }
  }
  if (com.ocupacion !== undefined && revisarCampos(com.ocupacion, `${ruta}.ocupacion`, archivo, ESQUEMA_OCUPACION, h)) {
    if (com.ocupacion.inscriptos < 0) {
      h.push(error("valor-invalido", archivo, `${ruta}.ocupacion.inscriptos: es negativo`));
      ok = false;
    }
    ok = revisarPatron(com.ocupacion.al, FECHA_RE, `${ruta}.ocupacion.al`, archivo, h, "una fecha AAAA-MM-DD") && ok;
  }
  if (com.desde !== undefined) ok = revisarPatron(com.desde, FECHA_RE, `${ruta}.desde`, archivo, h, "una fecha AAAA-MM-DD") && ok;
  if (com.hasta !== undefined) ok = revisarPatron(com.hasta, FECHA_RE, `${ruta}.hasta`, archivo, h, "una fecha AAAA-MM-DD") && ok;
  com.bloques.forEach((b, i) => {
    ok = revisarBloque(b, `${ruta}.bloques[${i}]`, archivo, h) && ok;
  });
  return ok;
}

function revisarBloque(b, ruta, archivo, h) {
  if (!revisarCampos(b, ruta, archivo, ESQUEMA_BLOQUE, h)) return false;
  let ok = revisarEnum(b.dia, DIAS, `${ruta}.dia`, archivo, h, "un día");
  ok = revisarPatron(b.desde, HORA_RE, `${ruta}.desde`, archivo, h, "una hora HH:MM") && ok;
  ok = revisarPatron(b.hasta, HORA_RE, `${ruta}.hasta`, archivo, h, "una hora HH:MM") && ok;
  ok = revisarEnum(b.modalidad, MODALIDADES, `${ruta}.modalidad`, archivo, h, "una modalidad") && ok;
  if (b.sede !== null) ok = revisarPatron(b.sede, SEDE_RE, `${ruta}.sede`, archivo, h, "un id de sede (minúsculas, dígitos y _)") && ok;
  b.aulas.forEach((a, i) => {
    ok = revisarPatron(a, TEXTO_CORTO_RE, `${ruta}.aulas[${i}]`, archivo, h, "un código de aula (1 a 40 caracteres)") && ok;
  });
  return ok;
}

// ---- C3: invariantes ---------------------------------------------------------

/** Aplana comisiones y bloques de un curso en registros comparables. La vigencia
 *  del bloque es la de su comisión cuando tiene fechas propias (dos ediciones de
 *  un seminario, agosto y octubre, no chocan con todo lo que haya entre una y otra). */
function bloquesDelCurso(curso) {
  const out = [];
  for (const com of curso.comisiones) {
    const vDesde = com.desde ?? curso.desde;
    const vHasta = com.hasta ?? curso.hasta;
    for (const b of com.bloques) {
      out.push({
        codigo: curso.codigo,
        comision: com.id,
        etiqueta: `${curso.codigo} com. ${com.id}`,
        dia: b.dia,
        desde: minutos(b.desde),
        hasta: minutos(b.hasta),
        franja: `${b.desde}-${b.hasta}`,
        sede: b.sede,
        modalidad: b.modalidad,
        aulas: b.aulas,
        docentes: com.docentes,
        vDesde,
        vHasta,
      });
    }
  }
  return out;
}

function revisarPeriodo(datos, archivo, nombreDeArchivo, h) {
  const p = datos.periodo;
  const esperado = `${p.anio}-${p.cuatrimestre}`;
  if (p.id !== esperado) {
    h.push(error("periodo-incoherente", archivo, `el período declara «id: ${p.id}» con «anio: ${p.anio}» y «cuatrimestre: ${p.cuatrimestre}»; el id de ese cuatrimestre es «${esperado}»`));
  }
  if (p.desde > p.hasta) {
    h.push(error("periodo-invertido", archivo, `el período empieza el ${p.desde} y termina el ${p.hasta}`));
  }
  if (nombreDeArchivo) {
    const m = nombreDeArchivo.match(ARCHIVO_HORARIOS_RE);
    if (!m) {
      h.push(error("periodo-archivo", archivo, `el archivo se llama «${nombreDeArchivo}» y los horarios van en «<AAAA>-<1|2>C.json»`));
    } else if (`${m[1]}-${m[2]}C` !== p.id) {
      h.push(error("periodo-archivo", archivo, `el archivo se llama «${nombreDeArchivo}» y declara el período «${p.id}»`));
    }
  }
}

function revisarIdentidades(cursos, archivo, h) {
  const vistos = new Set();
  for (const curso of cursos) {
    if (vistos.has(curso.codigo)) {
      h.push(error("codigo-duplicado", archivo, `el código «${curso.codigo}» aparece en más de un curso; la identidad de un curso es su código, nunca su nombre`));
    }
    vistos.add(curso.codigo);
    const comisiones = new Set();
    for (const com of curso.comisiones) {
      if (comisiones.has(com.id)) h.push(error("comision-duplicada", archivo, `el curso «${curso.codigo}» repite la comisión «${com.id}»`));
      comisiones.add(com.id);
    }
  }
}

function revisarFechasDeCursos(cursos, periodo, archivo, h) {
  const periodoValido = periodo.desde <= periodo.hasta;
  for (const curso of cursos) {
    if (curso.desde > curso.hasta) {
      h.push(error("curso-invertido", archivo, `el curso «${curso.codigo}» empieza el ${curso.desde} y termina el ${curso.hasta}`));
      continue;
    }
    // Con el período invertido ya hay un error; no se repite curso por curso.
    if (periodoValido && (curso.desde < periodo.desde || curso.hasta > periodo.hasta)) {
      h.push(error("curso-fuera-del-periodo", archivo, `el curso «${curso.codigo}» va del ${curso.desde} al ${curso.hasta} y el período va del ${periodo.desde} al ${periodo.hasta}`));
    }
  }
}

function revisarFechasDeComisiones(cursos, archivo, h) {
  for (const curso of cursos) {
    for (const com of curso.comisiones) {
      const etiqueta = `${curso.codigo} com. ${com.id}`;
      if (com.desde === undefined && com.hasta === undefined) continue;
      if (com.desde === undefined || com.hasta === undefined) {
        h.push(error("comision-fecha-incompleta", archivo, `${etiqueta}: «desde» y «hasta» de la comisión van juntos o no van`));
        continue;
      }
      if (com.desde > com.hasta) {
        h.push(error("comision-invertida", archivo, `${etiqueta}: empieza el ${com.desde} y termina el ${com.hasta}`));
        continue;
      }
      if (com.desde < curso.desde || com.hasta > curso.hasta) {
        h.push(error("comision-fuera-del-curso", archivo, `${etiqueta}: va del ${com.desde} al ${com.hasta} y el curso va del ${curso.desde} al ${curso.hasta}`));
      }
    }
  }
}

function revisarDictadoConjunto(cursos, archivo, h) {
  const presentes = new Set(cursos.map((c) => c.codigo));
  const vistos = new Set();
  for (const curso of cursos) {
    for (const otro of curso.dictado_conjunto) {
      const clave = `${curso.codigo}>${otro}`;
      if (presentes.has(otro) || vistos.has(clave)) continue;
      vistos.add(clave);
      h.push(aviso("dictado-conjunto-inexistente", archivo, `el curso «${curso.codigo}» se dicta en conjunto con «${otro}», que no es un curso de este archivo; «colision-de-aula» no revisa ese par`));
    }
  }
}

function revisarFranjas(bloques, archivo, h) {
  const minimo = minutos(HORA_MINIMA);
  const maximo = minutos(HORA_MAXIMA);
  for (const b of bloques) {
    if (b.desde >= b.hasta) {
      h.push(error("bloque-invertido", archivo, `${b.etiqueta}: el bloque del ${b.dia} va de ${b.franja.replace("-", " a ")}`));
      continue;
    }
    if (b.desde < minimo || b.hasta > maximo) {
      h.push(error("franja-fuera-de-rango", archivo, `${b.etiqueta}: el bloque del ${b.dia} (${b.franja}) cae fuera de ${HORA_MINIMA}-${HORA_MAXIMA}`));
      continue;
    }
    if (b.hasta - b.desde > DURACION_MAXIMA_MINUTOS) {
      h.push(error("bloque-demasiado-largo", archivo, `${b.etiqueta}: el bloque del ${b.dia} (${b.franja}) dura ${(b.hasta - b.desde) / 60} h y el máximo es ${DURACION_MAXIMA_MINUTOS / 60} h`));
    }
  }
}

function revisarSedes(bloques, archivo, h) {
  const desconocidas = new Set();
  for (const b of bloques) {
    if (b.sede === null || SEDES.includes(b.sede) || desconocidas.has(b.sede)) continue;
    desconocidas.add(b.sede);
    h.push(aviso("sede-desconocida", archivo, `${b.etiqueta}: la sede «${b.sede}» no está en el vocabulario (scripts/datos/vocabulario.mjs); el planner la mostrará en mayúsculas`));
  }
}

function dictadoConjunto(cursos) {
  const conjunto = new Map();
  const agregar = (a, b) => {
    if (!conjunto.has(a)) conjunto.set(a, new Set());
    conjunto.get(a).add(b);
  };
  for (const curso of cursos) {
    for (const otro of curso.dictado_conjunto) {
      agregar(curso.codigo, otro);
      agregar(otro, curso.codigo);
    }
  }
  return conjunto;
}

const porClave = (b) => `${b.codigo} ${b.comision} ${b.desde} ${b.hasta}`;

function revisarColisionesDeAula(bloques, cursos, archivo, h) {
  const conjunto = dictadoConjunto(cursos);
  const porAula = new Map();
  for (const b of bloques) {
    if (!MODALIDADES_CON_AULA.includes(b.modalidad) || b.sede === null) continue;
    for (const aula of b.aulas) {
      const clave = `${b.sede} ${aula} ${b.dia}`;
      if (!porAula.has(clave)) porAula.set(clave, []);
      porAula.get(clave).push(b);
    }
  }
  for (const clave of [...porAula.keys()].sort()) {
    const [sede, aula, dia] = clave.split(" ");
    const lista = porAula.get(clave).sort((a, b) => (porClave(a) < porClave(b) ? -1 : 1));
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const uno = lista[i];
        const otro = lista[j];
        if (uno.codigo === otro.codigo) continue;
        if (conjunto.get(uno.codigo)?.has(otro.codigo)) continue;
        if (!seSolapan(uno.desde, uno.hasta, otro.desde, otro.hasta)) continue;
        if (!seSolapanFechas(uno.vDesde, uno.vHasta, otro.vDesde, otro.vHasta)) continue;
        const dias = diasEnComun(uno.vDesde, uno.vHasta, otro.vDesde, otro.vHasta);
        if (dias <= COLISION_BREVE_DIAS) {
          h.push(aviso("colision-de-aula-breve", archivo, `${uno.etiqueta} (${uno.franja}) y ${otro.etiqueta} (${otro.franja}) ocupan el aula «${aula}» de «${sede}» el mismo ${dia} durante ${dias} día(s) de calendario en común: así lo publica el SGA para un curso intensivo; se avisa, no se rechaza`));
          continue;
        }
        h.push(error("colision-de-aula", archivo, `${uno.etiqueta} (${uno.franja}) y ${otro.etiqueta} (${otro.franja}) ocupan el aula «${aula}» de «${sede}» el mismo ${dia}`));
      }
    }
  }
}

/** Un docente en dos cursos distintos a la misma hora: un solo aviso por archivo.
 *  Los homónimos y los titulares nominales de decenas de comisiones son reales
 *  (2026-2C: 133 docentes, 786 pares), así que ni es error ni vale la pena
 *  listarlos uno por uno. */
function revisarColisionesDeDocente(bloques, archivo, h) {
  const porDocente = new Map();
  for (const b of bloques) {
    for (const docente of b.docentes) {
      const clave = `${docente} ${b.dia}`;
      if (!porDocente.has(clave)) porDocente.set(clave, []);
      porDocente.get(clave).push(b);
    }
  }
  const pares = new Map();
  for (const clave of [...porDocente.keys()].sort()) {
    const [docente, dia] = clave.split(" ");
    const lista = porDocente.get(clave).sort((a, b) => (porClave(a) < porClave(b) ? -1 : 1));
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const uno = lista[i];
        const otro = lista[j];
        if (uno.codigo === otro.codigo) continue;
        if (!seSolapan(uno.desde, uno.hasta, otro.desde, otro.hasta)) continue;
        if (!seSolapanFechas(uno.vDesde, uno.vHasta, otro.vDesde, otro.vHasta)) continue;
        if (!pares.has(docente)) pares.set(docente, []);
        pares.get(docente).push(`${dia} ${uno.etiqueta} (${uno.franja}) y ${otro.etiqueta} (${otro.franja})`);
      }
    }
  }
  if (!pares.size) return;
  const total = [...pares.values()].reduce((n, l) => n + l.length, 0);
  const [docente, ejemplos] = [...pares.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  h.push(aviso("colision-de-docente", archivo, `${pares.size} docente(s) figuran a la misma hora en cursos distintos (${total} par(es); p. ej. «${docente}»: ${ejemplos[0]}); homónimos y titulares nominales son reales`));
}

function revisarOcupacion(cursos, archivo, h) {
  for (const curso of cursos) {
    for (const com of curso.comisiones) {
      if (!com.cupo || !com.ocupacion) continue;
      if (com.ocupacion.inscriptos > com.cupo.capacidad) {
        h.push(aviso("sobrecupo", archivo, `${curso.codigo} com. ${com.id}: ${com.ocupacion.inscriptos} inscriptos para una capacidad de ${com.cupo.capacidad}`));
      }
    }
  }
}

function revisarCodigosContraLosPlanes(cursos, archivo, codigosDePlanes, h) {
  if (!codigosDePlanes) return;
  const fuera = cursos.map((c) => c.codigo).filter((c) => !codigosDePlanes.has(c));
  if (!fuera.length) return;
  const muestra = fuera.slice(0, 8).join(", ") + (fuera.length > 8 ? ", …" : "");
  h.push(aviso("codigo-fuera-del-plan", archivo, `${fuera.length} curso(s) no figuran en ningún plan de estudios de data/plan/carreras/ (${muestra}); el planner los ignora`));
}

/**
 * Valida un archivo de horarios ya cargado (C1 aprobado). `contexto`:
 *   { nombreDeArchivo?: string, codigosDePlanes?: Set<string> | null }
 */
export function revisarHorarios(datos, archivo, contexto = {}) {
  const h = [];
  if (!revisarForma(datos, archivo, h)) return h;
  const cursos = datos.cursos;
  if (cursos.length === 0) h.push(error("sin-cursos", archivo, "el archivo no trae ningún curso"));
  revisarPeriodo(datos, archivo, contexto.nombreDeArchivo, h);
  revisarIdentidades(cursos, archivo, h);
  revisarFechasDeCursos(cursos, datos.periodo, archivo, h);
  revisarFechasDeComisiones(cursos, archivo, h);
  revisarDictadoConjunto(cursos, archivo, h);
  const bloques = cursos.flatMap(bloquesDelCurso);
  revisarFranjas(bloques, archivo, h);
  revisarSedes(bloques, archivo, h);
  revisarColisionesDeAula(bloques, cursos, archivo, h);
  revisarColisionesDeDocente(bloques, archivo, h);
  revisarOcupacion(cursos, archivo, h);
  revisarCodigosContraLosPlanes(cursos, archivo, contexto.codigosDePlanes ?? null, h);
  return h;
}
