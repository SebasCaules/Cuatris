// Tests del validador de datos (node --test). Cada fixture negativa dispara la
// regla que lleva por nombre —y solo esa, entre los errores—; las que deben pasar
// pasan sin errores. Las reglas se citan por su id (scripts/datos/*.mjs), no se
// reformulan acá.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { revisarIndiceDeCarreras, revisarPlanDeCarrera } from "../carreras.mjs";
import { revisarFinales } from "../finales.mjs";
import { cargarJson, claveDuplicada, profundidadDelTexto, serializar } from "../forma.mjs";
import { revisarHorarios } from "../horarios.mjs";
import { ERROR, hayErrores } from "../reporte.mjs";
import { POLITICA, listarDatos, tipoDeArchivo, validar } from "../validar.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const errores = (h) => [...new Set(h.filter((x) => x.nivel === ERROR).map((x) => x.regla))];
const avisos = (h) => [...new Set(h.filter((x) => x.nivel !== ERROR).map((x) => x.regla))];
const listar = (sub) => readdirSync(path.join(FIXTURES, sub)).sort();
const reglaDe = (nombre) => nombre.replace(/\.(json|csv)$/, "");

/** Valida un archivo de horarios como lo haría `validar()`: C1 y después las reglas. */
function horarios(ruta, nombreDeArchivo = "2026-2C.json") {
  const { hallazgos, datos } = cargarJson(ruta, path.basename(ruta), POLITICA.tamanos.horarios);
  if (!datos || hayErrores(hallazgos)) return hallazgos;
  return hallazgos.concat(revisarHorarios(datos, path.basename(ruta), { nombreDeArchivo }));
}

function carrera(ruta, nombreDeArchivo = "S.json") {
  const { hallazgos, datos } = cargarJson(ruta, path.basename(ruta), POLITICA.tamanos.carreras);
  if (!datos || hayErrores(hallazgos)) return hallazgos;
  return hallazgos.concat(revisarPlanDeCarrera(datos, path.basename(ruta), { nombreDeArchivo }));
}

// ---- forma canónica (C1) ----------------------------------------------------------

test("serializar: claves ordenadas, dos espacios, acentos sin escapar, salto final", () => {
  assert.equal(serializar({ b: [1, { z: "é", a: null }], a: "x" }), '{\n  "a": "x",\n  "b": [\n    1,\n    {\n      "a": null,\n      "z": "é"\n    }\n  ]\n}\n');
  assert.equal(serializar(JSON.parse(serializar({ b: 1, a: 2 }))), serializar({ a: 2, b: 1 }));
});

test("los datos reales del repositorio están en forma canónica", () => {
  const dir = path.join(FIXTURES, "..", "..", "..", "..", "data", "plan");
  for (const relativa of listarDatos(dir).filter((r) => r.endsWith(".json"))) {
    const texto = readFileSync(path.join(dir, relativa), "utf8");
    assert.equal(texto, serializar(JSON.parse(texto)), `${relativa} no está canónico`);
  }
});

test("claveDuplicada: ve la repetida en el objeto correcto, con escapes, y no en hermanos", () => {
  assert.deepEqual(claveDuplicada('{"a":{"x":1,"y":[{"k":1,"k":2}]}}'), { clave: "k", ruta: "a.y[0]" });
  assert.deepEqual(claveDuplicada('{"a":1,"b":{"a":2},"a":3}'), { clave: "a", ruta: "(raíz)" });
  assert.deepEqual(claveDuplicada('{"a\\u0062":1,"ab":2}'), { clave: "ab", ruta: "(raíz)" });
  assert.equal(claveDuplicada('{"a":1,"b":{"a":2},"c":["a","a"]}'), null);
});

test("profundidadDelTexto: cuenta como el objeto parseado, sin parsear", () => {
  assert.equal(profundidadDelTexto("1"), 0);
  assert.equal(profundidadDelTexto('{"a":[{"b":"]"}]}'), 3);
  assert.equal(profundidadDelTexto("[".repeat(14) + "]".repeat(14)), 13);
});

// ---- horarios ------------------------------------------------------------------------

test("horarios: los casos reales pasan sin errores", () => {
  for (const nombre of listar("horarios/deben-pasar")) {
    const h = horarios(path.join(FIXTURES, "horarios/deben-pasar", nombre));
    assert.deepEqual(errores(h), [], `${nombre}: ${JSON.stringify(h)}`);
  }
});

test("horarios: los casos raros validan sin ningún aviso", () => {
  for (const nombre of ["casos-raros.json", "domingo-virtual.json", "laboratorio-ediciones.json", "dictado-conjunto.json"]) {
    const h = horarios(path.join(FIXTURES, "horarios/deben-pasar", nombre));
    assert.deepEqual(h, [], nombre);
  }
});

test("horarios: cada fixture negativa dispara exactamente la regla de su nombre", () => {
  for (const nombre of listar("horarios/deben-fallar")) {
    const h = horarios(path.join(FIXTURES, "horarios/deben-fallar", nombre));
    assert.deepEqual(errores(h), [reglaDe(nombre)], `${nombre}: ${JSON.stringify(h)}`);
  }
});

test("horarios: los avisos avisan y no bloquean", () => {
  for (const nombre of listar("horarios/avisos")) {
    const h = horarios(path.join(FIXTURES, "horarios/avisos", nombre));
    assert.deepEqual(errores(h), [], nombre);
    assert.ok(avisos(h).includes(reglaDe(nombre)), `${nombre}: ${JSON.stringify(h)}`);
  }
  const docente = horarios(path.join(FIXTURES, "horarios/deben-pasar/docente-repetido.json"));
  assert.deepEqual(avisos(docente), ["colision-de-docente"]);
  const intensivo = horarios(path.join(FIXTURES, "horarios/deben-pasar/intensivo-en-aula-ocupada.json"));
  assert.deepEqual(avisos(intensivo), ["colision-de-aula-breve"]);
});

test("horarios: el nombre del archivo tiene que ser el período que declara", () => {
  const ruta = path.join(FIXTURES, "horarios/deben-pasar/casos-raros.json");
  assert.deepEqual(errores(horarios(ruta, "2027-1C.json")), ["periodo-archivo"]);
  assert.deepEqual(errores(horarios(ruta, "horarios.json")), ["periodo-archivo"]);
  assert.deepEqual(errores(horarios(ruta, "2026-2C.json")), []);
});

test("horarios: los códigos que no están en ningún plan son un aviso agregado", () => {
  const { datos } = cargarJson(path.join(FIXTURES, "horarios/deben-pasar/casos-raros.json"), "x", 1e6);
  const h = revisarHorarios(datos, "x", { codigosDePlanes: new Set(["93.18"]) });
  assert.deepEqual(avisos(h), ["codigo-fuera-del-plan"]);
  assert.equal(h.length, 1);
});

// ---- carreras ------------------------------------------------------------------------

test("carreras: el plan de ejemplo y los 17 reales pasan sin errores", () => {
  assert.deepEqual(carrera(path.join(FIXTURES, "carreras/deben-pasar/S.json")), []);
  const dir = path.join(FIXTURES, "..", "..", "..", "..", "data", "plan", "carreras");
  for (const nombre of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    assert.deepEqual(errores(carrera(path.join(dir, nombre), nombre)), [], nombre);
  }
});

test("carreras: cada fixture negativa dispara la regla de su nombre", () => {
  const esperadas = { "creditos-negativos.json": "valor-invalido" };
  for (const nombre of listar("carreras/deben-fallar")) {
    const h = carrera(path.join(FIXTURES, "carreras/deben-fallar", nombre));
    assert.deepEqual(errores(h), [esperadas[nombre] ?? reglaDe(nombre)], `${nombre}: ${JSON.stringify(h)}`);
  }
  assert.deepEqual(errores(carrera(path.join(FIXTURES, "carreras/deben-pasar/S.json"), "I.json")), ["carrera-archivo"]);
});

test("carreras: una correlativa que no es materia del plan es aviso", () => {
  const h = carrera(path.join(FIXTURES, "carreras/avisos/correlativa-inexistente.json"));
  assert.deepEqual(errores(h), []);
  assert.deepEqual(avisos(h), ["correlativa-inexistente"]);
});

test("carreras.json: índice válido y carrera duplicada", () => {
  const ok = cargarJson(path.join(FIXTURES, "carreras/indice/carreras.json"), "carreras.json", 1e5);
  assert.deepEqual(revisarIndiceDeCarreras(ok.datos, "carreras.json"), []);
  const dup = cargarJson(path.join(FIXTURES, "carreras/indice/carrera-duplicada.json"), "carreras.json", 1e5);
  assert.deepEqual(errores(revisarIndiceDeCarreras(dup.datos, "carreras.json")), ["carrera-duplicada"]);
});

// ---- finales ---------------------------------------------------------------------------

/** Las fixtures que se llaman como una planilla real (`finales-<año>-<mes>.csv`)
 *  prueban el nombre; las demás llevan la regla en el nombre y se validan como
 *  si fueran la planilla de diciembre de 2026. */
const finales = (sub, nombre) => {
  const nombreDeArchivo = /^finales-\d{4}-/.test(nombre) ? nombre : "finales-2026-diciembre.csv";
  return revisarFinales(readFileSync(path.join(FIXTURES, sub, nombre)), nombreDeArchivo, nombre, POLITICA.tamanos.finales);
};

test("finales: la planilla de ejemplo pasa (pocas filas es solo aviso)", () => {
  const h = finales("finales/deben-pasar", "finales-2026-diciembre.csv");
  assert.deepEqual(errores(h), []);
  assert.deepEqual(avisos(h), ["finales-pocas-filas"]);
});

test("finales: cada fixture negativa dispara la regla de su nombre", () => {
  const esperadas = { "finales-2026-julio.csv": "finales-periodo", "finales-2026-abril.csv": "finales-archivo" };
  for (const nombre of listar("finales/deben-fallar")) {
    const h = finales("finales/deben-fallar", nombre);
    assert.deepEqual(errores(h), [esperadas[nombre] ?? reglaDe(nombre)], `${nombre}: ${JSON.stringify(h)}`);
  }
});

test("finales: CRLF, fecha ilegible y hora ilegible son avisos", () => {
  const h = finales("finales/avisos", "finales-2026-diciembre.csv");
  assert.deepEqual(errores(h), []);
  assert.deepEqual(avisos(h).sort(), ["crlf", "finales-fecha", "finales-hora", "finales-pocas-filas"]);
});

// ---- validar(): el directorio entero ------------------------------------------------

test("tipoDeArchivo: solo las rutas contribuibles, segmento a segmento", () => {
  assert.equal(tipoDeArchivo("horarios/2027-1C.json"), "horarios");
  assert.equal(tipoDeArchivo("horarios/README.md"), "readme");
  assert.equal(tipoDeArchivo("carreras.json"), "indice");
  assert.equal(tipoDeArchivo("carreras/LAES.json"), "carreras");
  assert.equal(tipoDeArchivo("sga-carreras/S-plan.html"), "evidencia");
  assert.equal(tipoDeArchivo("finales-2027-febrero.csv"), "finales");
  for (const ruta of ["data.js", "horarios/2027-1C.json.bak", "horarios/x/2027-1C.json", "carreras/s.json", "carreras/../data.js", "sga-carreras/a.js", "finales.csv", "electivas.json"]) {
    assert.equal(tipoDeArchivo(ruta), null, ruta);
  }
});

test("validar(): un directorio completo válido no tiene errores y cruza índice y planes", () => {
  const { hallazgos, archivos } = validar(path.join(FIXTURES, "datos-ok"));
  assert.deepEqual(archivos, ["carreras.json", "finales-2026-diciembre.csv", "horarios/2026-2C.json", "carreras/S.json"]);
  assert.deepEqual(errores(hallazgos), []);
  assert.ok(avisos(hallazgos).includes("codigo-fuera-del-plan"));
});

test("validar(): los datos reales del repositorio no tienen errores", () => {
  const dir = path.join(FIXTURES, "..", "..", "..", "..", "data", "plan");
  const { hallazgos } = validar(dir);
  assert.deepEqual(errores(hallazgos), [], JSON.stringify(hallazgos.filter((h) => h.nivel === ERROR)));
});

test("validar(): la coherencia índice ↔ planes se revisa contra el árbol completo", () => {
  const { hallazgos } = validar(path.join(FIXTURES, "carreras/indice-roto"));
  assert.deepEqual(errores(hallazgos).sort(), ["carrera-fuera-del-indice", "plan-faltante", "plan-incoherente"]);
});
