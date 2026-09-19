// ============================================================================
// carreras.mjs — reglas de data/plan/carreras.json y data/plan/carreras/<CODIGO>.json
// ----------------------------------------------------------------------------
// Es la forma que emite scripts/build-carreras-data.mjs a partir del HTML del SGA
// (Académica → Carreras → plan de estudios) y que consume build-planner-data.mjs
// (`armarPlan`). Un plan cambia una o dos veces por década: acá lo que importa
// es que lo que llega no rompa al planificador: códigos únicos, correlativas
// que existen y no forman ciclos (un ciclo cuelga al planificador: es «tirar
// todo abajo» en su forma literal), créditos que no son negativos.
// ============================================================================

import { revisarCampos, revisarEnum, revisarPatron, revisarStrings } from "./estructura.mjs";
import { aviso, error } from "./reporte.mjs";
import { CODIGO_CARRERA_RE, CODIGO_RE, PLAN_RE, TIPOS_DE_BLOQUE } from "./vocabulario.mjs";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const ESQUEMA_INDICE = { requeridos: { fuente: "object", carreras: "array" } };
const ESQUEMA_FUENTE = { requeridos: { sistema: "string", nivel: "string", capturado: "string" } };
const ESQUEMA_ENTRADA = {
  requeridos: {
    codigo: "string",
    nombre: "string",
    escuela: "string",
    nivel: "string",
    plan: ["string", "null"],
    vacio: ["boolean", "null"],
  },
};
const ESQUEMA_PLAN = {
  requeridos: {
    carrera: "object",
    plan: "string",
    planes: "array",
    vacio: "boolean",
    capturado: "string",
    bloques: "array",
    titulos: "array",
  },
};
const ESQUEMA_CARRERA = { requeridos: { codigo: "string", nombre: "string", escuela: "string", nivel: "string" } };
const ESQUEMA_VERSION = {
  requeridos: { nombre: "string", version: "string", desde: "string", hasta: "string", elegido: "boolean" },
};
const ESQUEMA_BLOQUE = {
  requeridos: {
    nombre: "string",
    tituloOtorgado: ["string", "null"],
    requisito: "string",
    creditos: "integer",
    tipo: "string",
    secciones: "array",
  },
};
const ESQUEMA_SECCION = {
  requeridos: { nombre: ["string", "null"], anio: ["integer", "null"], cuatri: ["integer", "null"], materias: "array" },
};
const ESQUEMA_MATERIA = {
  requeridos: { codigo: "string", nombre: "string", creditos: "integer", creditosReq: "integer", correlativas: "array" },
};
const ESQUEMA_TITULO = { requeridos: { tipo: "string", titulo: "string", requisitos: "string", creditos: "integer" } };

// ---- carreras.json ------------------------------------------------------------

/** Valida el índice de carreras. Devuelve los hallazgos. */
export function revisarIndiceDeCarreras(datos, archivo) {
  const h = [];
  if (!revisarCampos(datos, "(raíz)", archivo, ESQUEMA_INDICE, h)) return h;
  if (revisarCampos(datos.fuente, "fuente", archivo, ESQUEMA_FUENTE, h)) {
    revisarPatron(datos.fuente.capturado, FECHA_RE, "fuente.capturado", archivo, h, "una fecha AAAA-MM-DD");
  }
  const vistos = new Set();
  datos.carreras.forEach((c, i) => {
    const ruta = `carreras[${i}]`;
    if (!revisarCampos(c, ruta, archivo, ESQUEMA_ENTRADA, h)) return;
    revisarPatron(c.codigo, CODIGO_CARRERA_RE, `${ruta}.codigo`, archivo, h, "un código de carrera (letras mayúsculas)");
    if (!c.nombre) h.push(error("valor-invalido", archivo, `${ruta}.nombre: está vacío`));
    if (c.plan !== null) revisarPatron(c.plan, PLAN_RE, `${ruta}.plan`, archivo, h, "un nombre de plan de estudios");
    if (vistos.has(c.codigo)) h.push(error("carrera-duplicada", archivo, `la carrera «${c.codigo}» aparece dos veces en el índice`));
    vistos.add(c.codigo);
  });
  if (datos.carreras.length === 0) h.push(error("sin-carreras", archivo, "el índice no lista ninguna carrera"));
  return h;
}

// ---- carreras/<CODIGO>.json ---------------------------------------------------

function revisarFormaDelPlan(datos, archivo, h) {
  if (!revisarCampos(datos, "(raíz)", archivo, ESQUEMA_PLAN, h)) return false;
  let ok = true;
  if (revisarCampos(datos.carrera, "carrera", archivo, ESQUEMA_CARRERA, h)) {
    ok = revisarPatron(datos.carrera.codigo, CODIGO_CARRERA_RE, "carrera.codigo", archivo, h, "un código de carrera (letras mayúsculas)") && ok;
    if (!datos.carrera.nombre) {
      h.push(error("valor-invalido", archivo, "carrera.nombre: está vacío"));
      ok = false;
    }
  } else ok = false;
  ok = revisarPatron(datos.plan, PLAN_RE, "plan", archivo, h, "un nombre de plan de estudios") && ok;
  ok = revisarPatron(datos.capturado, FECHA_RE, "capturado", archivo, h, "una fecha AAAA-MM-DD") && ok;
  datos.planes.forEach((p, i) => {
    ok = revisarCampos(p, `planes[${i}]`, archivo, ESQUEMA_VERSION, h) && ok;
  });
  datos.titulos.forEach((t, i) => {
    const ruta = `titulos[${i}]`;
    if (!revisarCampos(t, ruta, archivo, ESQUEMA_TITULO, h)) {
      ok = false;
      return;
    }
    if (t.creditos < 0) {
      h.push(error("valor-invalido", archivo, `${ruta}.creditos: es negativo`));
      ok = false;
    }
  });
  datos.bloques.forEach((b, i) => {
    const ruta = `bloques[${i}]`;
    if (!revisarCampos(b, ruta, archivo, ESQUEMA_BLOQUE, h)) {
      ok = false;
      return;
    }
    ok = revisarEnum(b.tipo, TIPOS_DE_BLOQUE, `${ruta}.tipo`, archivo, h, "un tipo de bloque") && ok;
    if (b.creditos < 0) {
      h.push(error("valor-invalido", archivo, `${ruta}.creditos: es negativo`));
      ok = false;
    }
    b.secciones.forEach((s, j) => {
      const rutaS = `${ruta}.secciones[${j}]`;
      if (!revisarCampos(s, rutaS, archivo, ESQUEMA_SECCION, h)) {
        ok = false;
        return;
      }
      if (s.anio !== null && (s.anio < 1 || s.anio > 8)) {
        h.push(error("valor-invalido", archivo, `${rutaS}.anio: ${s.anio} está fuera de 1-8`));
        ok = false;
      }
      if (s.cuatri !== null && (s.cuatri < 1 || s.cuatri > 2)) {
        h.push(error("valor-invalido", archivo, `${rutaS}.cuatri: ${s.cuatri} no es 1 ni 2`));
        ok = false;
      }
      s.materias.forEach((m, k) => {
        const rutaM = `${rutaS}.materias[${k}]`;
        if (!revisarCampos(m, rutaM, archivo, ESQUEMA_MATERIA, h)) {
          ok = false;
          return;
        }
        ok = revisarPatron(m.codigo, CODIGO_RE, `${rutaM}.codigo`, archivo, h, "un código de materia") && ok;
        if (!m.nombre) {
          h.push(error("valor-invalido", archivo, `${rutaM}.nombre: está vacío`));
          ok = false;
        }
        if (m.creditos < 0 || m.creditosReq < 0) {
          h.push(error("valor-invalido", archivo, `${rutaM}: los créditos no pueden ser negativos`));
          ok = false;
        }
        ok = revisarStrings(m.correlativas, `${rutaM}.correlativas`, archivo, h, "un código de materia") && ok;
        m.correlativas.forEach((c, l) => {
          ok = revisarPatron(c, CODIGO_RE, `${rutaM}.correlativas[${l}]`, archivo, h, "un código de materia") && ok;
        });
      });
    });
  });
  return ok;
}

/** Un ciclo del grafo de correlativas (lista de códigos), o null si es acíclico. */
export function cicloDeCorrelativas(grafo) {
  const estado = new Map();
  const pila = [];
  const visitar = (nodo) => {
    estado.set(nodo, 1);
    pila.push(nodo);
    for (const vecino of grafo.get(nodo) ?? []) {
      const e = estado.get(vecino);
      if (e === 1) return pila.slice(pila.indexOf(vecino)).concat(vecino);
      if (e === undefined && grafo.has(vecino)) {
        const ciclo = visitar(vecino);
        if (ciclo) return ciclo;
      }
    }
    pila.pop();
    estado.set(nodo, 2);
    return null;
  };
  for (const nodo of [...grafo.keys()].sort()) {
    if (!estado.has(nodo)) {
      const ciclo = visitar(nodo);
      if (ciclo) return ciclo;
    }
  }
  return null;
}

/**
 * Valida el plan de una carrera. `contexto`: { nombreDeArchivo?: string }.
 */
export function revisarPlanDeCarrera(datos, archivo, contexto = {}) {
  const h = [];
  if (!revisarFormaDelPlan(datos, archivo, h)) return h;
  const codigo = datos.carrera.codigo;
  if (contexto.nombreDeArchivo && contexto.nombreDeArchivo !== `${codigo}.json`) {
    h.push(error("carrera-archivo", archivo, `el archivo se llama «${contexto.nombreDeArchivo}» y declara la carrera «${codigo}»`));
  }
  const elegidos = datos.planes.filter((p) => p.elegido);
  if (elegidos.length !== 1 || elegidos[0].nombre !== datos.plan) {
    h.push(error("plan-elegido", archivo, `«plan: ${datos.plan}» tiene que ser exactamente el elegido en «planes» (marcados: ${elegidos.map((p) => p.nombre).join(", ") || "ninguno"})`));
  }
  const materias = datos.bloques.flatMap((b) => b.secciones.flatMap((s) => s.materias));
  if (!datos.vacio && materias.length === 0) {
    h.push(error("plan-vacio", archivo, "el plan no declara «vacio» y no tiene ninguna materia"));
  }
  const grafo = new Map();
  const vistos = new Set();
  for (const m of materias) {
    if (vistos.has(m.codigo)) h.push(error("materia-duplicada", archivo, `la materia «${m.codigo}» aparece en más de un bloque o sección`));
    vistos.add(m.codigo);
    if (!grafo.has(m.codigo)) grafo.set(m.codigo, []);
    for (const c of m.correlativas) {
      if (c === m.codigo) {
        h.push(error("correlativa-propia", archivo, `la materia «${m.codigo}» se declara correlativa de sí misma`));
        continue;
      }
      grafo.get(m.codigo).push(c);
    }
  }
  const fuera = new Set();
  for (const m of materias) for (const c of m.correlativas) if (!vistos.has(c)) fuera.add(`${c} (de ${m.codigo})`);
  if (fuera.size) {
    h.push(aviso("correlativa-inexistente", archivo, `${fuera.size} correlativa(s) no son materias del plan: ${[...fuera].slice(0, 6).join(", ")}${fuera.size > 6 ? ", …" : ""}; el planner no puede exigirlas`));
  }
  const ciclo = cicloDeCorrelativas(grafo);
  if (ciclo) h.push(error("correlativas-ciclicas", archivo, `las correlativas forman un ciclo: ${ciclo.join(" → ")}`));
  return h;
}

/**
 * Coherencia entre el índice y los archivos: toda carrera con plan y no vacía
 * tiene su archivo; todo archivo está en el índice con el mismo plan.
 * `planes` es Map<codigo, datos del archivo>.
 */
export function revisarCoherenciaDeCarreras(indice, planes, archivoIndice) {
  const h = [];
  const enIndice = new Map(indice.carreras.map((c) => [c.codigo, c]));
  for (const c of indice.carreras) {
    if (c.plan && c.vacio === false && !planes.has(c.codigo)) {
      h.push(error("plan-faltante", archivoIndice, `la carrera «${c.codigo}» tiene plan «${c.plan}» pero no existe carreras/${c.codigo}.json`));
    }
  }
  for (const [codigo, datos] of planes) {
    const entrada = enIndice.get(codigo);
    const archivo = `carreras/${codigo}.json`;
    if (!entrada) {
      h.push(error("carrera-fuera-del-indice", archivo, `la carrera «${codigo}» no está en carreras.json`));
      continue;
    }
    if (entrada.plan !== datos.plan) {
      h.push(error("plan-incoherente", archivo, `el índice dice «plan: ${entrada.plan}» y el archivo «plan: ${datos.plan}»`));
    }
  }
  return h;
}

/** Códigos de materia de todos los planes cargados (para cruzar con los horarios). */
export function codigosDeLosPlanes(planes) {
  const out = new Set();
  for (const datos of planes.values()) {
    for (const b of datos.bloques ?? []) for (const s of b.secciones ?? []) for (const m of s.materias ?? []) out.add(m.codigo);
  }
  return out;
}
