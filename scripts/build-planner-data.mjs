// Convierte la data del planner (data/plan/data.js → `window.PLAN = {...}`) a un
// JSON tipado importable por la app (lib/planner/data.json). Corre en
// prebuild/predev. data/plan/data.js lo genera data/plan/build-data.py.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SRC = path.join(process.cwd(), "data", "plan", "data.js");
const DEST_DIR = path.join(process.cwd(), "lib", "planner");
const DEST = path.join(DEST_DIR, "data.json");

const code = readFileSync(SRC, "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // setea window.PLAN

const PLAN = sandbox.window.PLAN;
if (!PLAN || !Array.isArray(PLAN.obligatorias)) {
  throw new Error("[build-planner-data] window.PLAN inválido en " + SRC);
}

// Build divulgable: el planner se publica SIN materias pre-aprobadas, para que
// cada compañero arranque limpio y persista su propio progreso en localStorage.
PLAN.aprobadasDefault = [];

mkdirSync(DEST_DIR, { recursive: true });
writeFileSync(DEST, JSON.stringify(PLAN));
console.log(
  `[build-planner-data] ${PLAN.obligatorias.length} obligatorias · ${PLAN.electivas.length} electivas · ${PLAN.edges.length} edges → lib/planner/data.json`,
);
