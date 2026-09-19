// Tests del comentario del bot y del centinela (node --test).
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { datosEsperados, queFalta } from "../centinela.mjs";
import { MARCADOR, armarComentario, leerEspera } from "../comentario.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

const triage = {
  clase: "datos-mayor",
  datos: ["data/plan/horarios/2027-1C.json"],
  motivos: [],
  resumen: { "data/plan/horarios/2027-1C.json": { tipo: "horarios", cambio: "nuevo", clase: "datos-mayor", cursos: 470, cursosDelAnterior: 461, motivo: "cuatrimestre nuevo" } },
};

test("comentario: espera con marcador, tabla y avisos plegados", () => {
  const texto = armarComentario({
    triage,
    validacion: { hallazgos: [{ nivel: "aviso", regla: "sobrecupo", archivo: "horarios/2027-1C.json", mensaje: "x" }] },
    estado: "success",
    clase: "datos-mayor",
    accion: "espera",
    ejecucion: "https://example.invalid/run/1",
    sha: SHA,
    hasta: "2026-09-22T10:00:00.000Z",
  });
  assert.ok(texto.startsWith(MARCADOR + "\n"));
  assert.match(texto, /✅ La validación de datos pasó/);
  assert.match(texto, /\| `horarios\/2027-1C.json` \| nuevo \| `datos-mayor` \| 470 cursos \(el período anterior tenía 461\); cuatrimestre nuevo \|/);
  assert.match(texto, /se mergea solo el 2026-09-22 10:00 UTC/);
  assert.match(texto, /<details><summary>Avisos \(no bloquean\) \(1\)/);
  assert.doesNotMatch(texto, /Errores/);
  assert.deepEqual(leerEspera(texto), { sha: SHA, hasta: "2026-09-22T10:00:00.000Z" });
});

test("comentario: humano con motivos, inválido con errores, sin marcador de espera", () => {
  const humano = armarComentario({ triage: { ...triage, clase: "necesita-humano", motivos: ["«scripts/x.mjs» no es un archivo de datos contribuible"] }, estado: "success", clase: "necesita-humano", accion: "humano", ejecucion: "u" });
  assert.match(humano, /Por qué necesita a una persona/);
  assert.match(humano, /scripts\/x.mjs/);
  assert.equal(leerEspera(humano), null);
  const invalido = armarComentario({ triage, validacion: { hallazgos: [{ nivel: "error", regla: "colision-de-aula", archivo: "h", mensaje: "m" }] }, estado: "failure", clase: "datos-menor", accion: "invalido", ejecucion: "u" });
  assert.match(invalido, /❌/);
  assert.match(invalido, /<details open><summary>Errores \(1\)/);
  assert.match(invalido, /Corregí los errores/);
  const sinTriage = armarComentario({ triage: null, validacion: null, estado: "cancelled", clase: "necesita-humano", accion: "humano", ejecucion: "u" });
  assert.match(sinTriage, /se canceló/);
});

test("centinela: qué se espera a cada altura del año", () => {
  const archivos = (hoy) => datosEsperados(hoy).map((d) => d.archivo);
  assert.deepEqual(archivos("2027-01-10"), ["finales-2027-febrero.csv"]);
  assert.deepEqual(archivos("2027-02-15"), ["horarios/2027-1C.json", "finales-2027-febrero.csv"]);
  assert.deepEqual(archivos("2027-04-01"), ["horarios/2027-1C.json"]);
  assert.deepEqual(archivos("2027-06-01"), ["horarios/2027-1C.json", "finales-2027-julio.csv"]);
  assert.deepEqual(archivos("2027-07-15"), ["horarios/2027-1C.json", "horarios/2027-2C.json", "finales-2027-julio.csv"]);
  assert.deepEqual(archivos("2027-09-19"), ["horarios/2027-2C.json"]);
  assert.deepEqual(archivos("2027-11-01"), ["horarios/2027-2C.json", "finales-2027-diciembre.csv"]);
  assert.deepEqual(archivos("2027-12-05"), ["horarios/2027-2C.json", "finales-2027-diciembre.csv", "finales-2028-febrero.csv"]);
});

test("centinela: solo reclama lo que no existe", () => {
  const dir = path.join(FIXTURES, "datos-ok"); // tiene 2026-2C y finales-2026-diciembre
  assert.deepEqual(queFalta("2026-11-01", dir).map((d) => d.archivo), []);
  assert.deepEqual(queFalta("2027-03-01", dir).map((d) => d.archivo), ["horarios/2027-1C.json"]);
  const faltante = queFalta("2027-03-01", dir)[0];
  assert.equal(faltante.titulo, "Faltan los horarios de 1C 2027");
  assert.match(faltante.cuerpo, /CONTRIBUTING\.md/);
});
