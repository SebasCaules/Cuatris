// Tests del triage (node --test) sobre un repositorio git temporal: cada caso es
// una rama que parte de un `main` con los datos de fixtures/datos-ok y toca algo;
// se afirma la clase (scripts/datos/triage.mjs) y, cuando importa, el motivo.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { serializar } from "../forma.mjs";
import { DATOS_MAYOR, DATOS_MENOR, NECESITA_HUMANO, clasificar, tipoDeRuta } from "../triage.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
let repo;
let n = 0;

const git = (...args) =>
  execFileSync("git", ["-C", repo, "-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "core.autocrlf=false", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString("utf8")
    .trim();

const leerJson = (relativa) => JSON.parse(readFileSync(path.join(repo, "data/plan", relativa), "utf8"));
const escribir = (relativa, contenido) => {
  const ruta = path.join(repo, relativa);
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, typeof contenido === "string" || Buffer.isBuffer(contenido) ? contenido : serializar(contenido));
};

/** Crea una rama desde main, aplica `cambiar()` y la commitea. Devuelve el nombre. */
function rama(cambiar) {
  const nombre = `caso-${++n}`;
  git("checkout", "-q", "-b", nombre, "main");
  cambiar();
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", nombre);
  git("checkout", "-q", "main");
  return nombre;
}

/** Como `rama`, pero `cambiar()` edita el índice de git con plumbing y el commit
 *  se arma con write-tree/commit-tree: ni el disco ni la rama actual se tocan. */
function ramaSinDisco(cambiar) {
  const nombre = `caso-${++n}`;
  cambiar();
  const arbol = git("write-tree");
  const commit = git("commit-tree", arbol, "-p", "main", "-m", nombre);
  git("update-ref", `refs/heads/${nombre}`, commit);
  git("read-tree", "main");
  return nombre;
}

const clase = (nombre) => clasificar(repo, "main", nombre);

before(() => {
  repo = mkdtempSync(path.join(os.tmpdir(), "cuatris-triage-"));
  git("init", "-q", "-b", "main");
  cpSync(path.join(FIXTURES, "datos-ok"), path.join(repo, "data/plan"), { recursive: true });
  escribir("data/plan/sga-carreras/S-plan.html", "<html>evidencia</html>\n");
  escribir("scripts/x.mjs", "// código\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});

after(() => {
  rmSync(repo, { recursive: true, force: true });
});

test("tipoDeRuta: solo bajo data/plan/, sin normalizar nada", () => {
  assert.equal(tipoDeRuta("data/plan/horarios/2027-1C.json"), "horarios");
  assert.equal(tipoDeRuta("data/plan/sga-carreras/S-plan.html"), "evidencia");
  for (const r of ["/data/plan/carreras.json", "data\\plan\\carreras.json", "data/plan/./carreras.json", "data/plan/carreras/../data.js", "data/plan/data.js", "horarios/2027-1C.json", ""]) {
    assert.equal(tipoDeRuta(r), null, r);
  }
});

test("un diff vacío o fuera del allowlist necesita a una persona", () => {
  assert.equal(clase(rama(() => {})).clase, NECESITA_HUMANO);
  const r = clase(rama(() => escribir("scripts/x.mjs", "// otro código\n")));
  assert.equal(r.clase, NECESITA_HUMANO);
  assert.match(r.motivos[0], /no es un archivo de datos contribuible/);
  const mixto = clase(
    rama(() => {
      escribir("scripts/x.mjs", "// otro\n");
      const h = leerJson("horarios/2026-2C.json");
      h.cursos[0].nombre += "!";
      escribir("data/plan/horarios/2026-2C.json", h);
    }),
  );
  assert.equal(mixto.clase, NECESITA_HUMANO);
  assert.deepEqual(mixto.datos, []);
});

test("horarios: una corrección chica es datos-menor; con bajas o masiva, no", () => {
  const menor = clase(
    rama(() => {
      const h = leerJson("horarios/2026-2C.json");
      h.cursos.find((c) => c.comisiones.length).comisiones[0].docentes = ["Docente, Nuevo"];
      escribir("data/plan/horarios/2026-2C.json", h);
    }),
  );
  assert.equal(menor.clase, DATOS_MENOR);
  assert.deepEqual(menor.datos, ["data/plan/horarios/2026-2C.json"]);
  assert.equal(menor.resumen["data/plan/horarios/2026-2C.json"].cursosModificados, 1);

  const baja = clase(
    rama(() => {
      const h = leerJson("horarios/2026-2C.json");
      h.cursos.splice(0, 1);
      escribir("data/plan/horarios/2026-2C.json", h);
    }),
  );
  assert.equal(baja.clase, DATOS_MAYOR);
  assert.equal(baja.resumen["data/plan/horarios/2026-2C.json"].cursosQuitados, 1);

  const masiva = clase(
    rama(() => {
      const h = leerJson("horarios/2026-2C.json");
      for (const c of h.cursos) c.nombre += " (bis)";
      escribir("data/plan/horarios/2026-2C.json", h);
    }),
  );
  assert.equal(masiva.clase, NECESITA_HUMANO);
  assert.match(masiva.motivos[0], /cambian 6 de 6 cursos/);

  const periodo = clase(
    rama(() => {
      const h = leerJson("horarios/2026-2C.json");
      h.periodo.hasta = "2026-12-30";
      escribir("data/plan/horarios/2026-2C.json", h);
    }),
  );
  assert.equal(periodo.clase, NECESITA_HUMANO);
});

test("horarios: un cuatrimestre nuevo es datos-mayor solo si es el siguiente y del tamaño esperado", () => {
  const siguiente = (nombre, id, cursos) => {
    const h = leerJson("horarios/2026-2C.json");
    h.periodo = { id, anio: Number(id.slice(0, 4)), cuatrimestre: id.slice(5), desde: `${id.slice(0, 4)}-02-01`, hasta: `${id.slice(0, 4)}-07-31` };
    for (const c of h.cursos) {
      c.desde = h.periodo.desde;
      c.hasta = h.periodo.hasta;
    }
    if (cursos !== undefined) h.cursos = h.cursos.slice(0, cursos);
    escribir(`data/plan/horarios/${nombre}`, h);
  };
  const ok = clase(rama(() => siguiente("2027-1C.json", "2027-1C")));
  assert.equal(ok.clase, DATOS_MAYOR);
  assert.equal(ok.resumen["data/plan/horarios/2027-1C.json"].motivo, "cuatrimestre nuevo");

  const salteado = clase(rama(() => siguiente("2027-2C.json", "2027-2C")));
  assert.equal(salteado.clase, NECESITA_HUMANO);
  assert.match(salteado.motivos[0], /siguiente al último publicado \(2026-2C.json → 2027-1C.json\)/);

  const chico = clase(rama(() => siguiente("2027-1C.json", "2027-1C", 1)));
  assert.equal(chico.clase, NECESITA_HUMANO);
  assert.match(chico.motivos[0], /1 cursos frente a 6/);
});

test("bajas, symlinks, ejecutables, LFS y .gitattributes necesitan a una persona", () => {
  const baja = clase(rama(() => rmSync(path.join(repo, "data/plan/finales-2026-diciembre.csv"))));
  assert.equal(baja.clase, NECESITA_HUMANO);
  assert.match(baja.motivos[0], /se borra/);

  const symlink = clase(rama(() => symlinkSync("/etc/passwd", path.join(repo, "data/plan/horarios/2027-1C.json"))));
  assert.equal(symlink.clase, NECESITA_HUMANO);
  assert.match(symlink.motivos[0], /enlace simbólico/);

  const ejecutable = clase(rama(() => chmodSync(path.join(repo, "data/plan/horarios/2026-2C.json"), 0o755)));
  assert.equal(ejecutable.clase, NECESITA_HUMANO);
  assert.match(ejecutable.motivos[0], /ejecutable/);

  const lfs = clase(rama(() => escribir("data/plan/horarios/2027-1C.json", "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n")));
  assert.equal(lfs.clase, NECESITA_HUMANO);
  assert.match(lfs.motivos.join(" "), /Git LFS/);

  const atributos = clase(rama(() => escribir("data/plan/.gitattributes", "*.json text\n")));
  assert.equal(atributos.clase, NECESITA_HUMANO);
  assert.match(atributos.motivos[0], /materializa el árbol/);
});

test("evidencia: el HTML del SGA no cambia la clase, salvo por tamaño o colisión de mayúsculas", () => {
  const ok = clase(rama(() => escribir("data/plan/sga-carreras/I-plan.html", "<html>otro</html>\n")));
  assert.equal(ok.clase, DATOS_MENOR);
  const enorme = clase(rama(() => escribir("data/plan/sga-carreras/I-plan.html", "x".repeat(5 * 1024 * 1024))));
  assert.equal(enorme.clase, NECESITA_HUMANO);
  assert.match(enorme.motivos[0], /pesa más de/);
  // En macOS el sistema de archivos no distingue mayúsculas: la ruta que colisiona
  // entra al índice de git directamente, sin pasar por el disco.
  const colision = clase(
    ramaSinDisco(() => {
      const sha = git("hash-object", "-w", "--stdin");
      git("update-index", "--add", "--cacheinfo", `100644,${sha},data/plan/sga-carreras/s-plan.html`);
    }),
  );
  assert.equal(colision.clase, NECESITA_HUMANO);
  assert.match(colision.motivos[0], /mismo archivo en macOS y en Windows/);
});

test("finales: una planilla nueva es datos-mayor; dos filas corregidas, datos-menor", () => {
  const nueva = clase(rama(() => escribir("data/plan/finales-2027-febrero.csv", readFileSync(path.join(repo, "data/plan/finales-2026-diciembre.csv")))));
  assert.equal(nueva.clase, DATOS_MAYOR);
  const corregida = clase(
    rama(() => {
      const ruta = path.join(repo, "data/plan/finales-2026-diciembre.csv");
      writeFileSync(ruta, readFileSync(ruta, "utf8").replace("19:00,\"lunes, 21", "18:00,\"lunes, 21"));
    }),
  );
  assert.equal(corregida.clase, DATOS_MENOR);
  assert.equal(corregida.resumen["data/plan/finales-2026-diciembre.csv"].filasTocadas, 1);
});

test("carreras: una materia corregida es datos-menor; plan nuevo o carrera nueva, datos-mayor", () => {
  const menor = clase(
    rama(() => {
      const p = leerJson("carreras/S.json");
      p.bloques[0].secciones[0].materias[0].creditos += 1;
      escribir("data/plan/carreras/S.json", p);
    }),
  );
  assert.equal(menor.clase, DATOS_MENOR);
  const plan = clase(
    rama(() => {
      const p = leerJson("carreras/S.json");
      p.plan = "S11";
      p.planes[0].nombre = "S11";
      const i = leerJson("carreras.json");
      i.carreras[0].plan = "S11";
      escribir("data/plan/carreras/S.json", p);
      escribir("data/plan/carreras.json", i);
    }),
  );
  assert.equal(plan.clase, DATOS_MAYOR);
  assert.match(plan.resumen["data/plan/carreras/S.json"].motivo, /plan nuevo/);
  assert.match(plan.resumen["data/plan/carreras.json"].motivo, /plan vigente/);
  const nueva = clase(
    rama(() => {
      const p = leerJson("carreras/S.json");
      p.carrera.codigo = "I";
      escribir("data/plan/carreras/I.json", p);
    }),
  );
  assert.equal(nueva.clase, DATOS_MAYOR);
  const indiceNuevo = clase(
    rama(() => {
      rmSync(path.join(repo, "data/plan/carreras.json"));
    }),
  );
  assert.equal(indiceNuevo.clase, NECESITA_HUMANO);
});
