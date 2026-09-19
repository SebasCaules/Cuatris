// Tests de los guardarraíles de .github (node --test): cada regla con un caso que
// dispara y uno que no; los workflows reales del repositorio tienen que pasar.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { bloquesRun, revisarDirectorio, revisarWorkflow } from "../guardarrailes.mjs";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const reglas = (h) => [...new Set(h.map((x) => x.regla))].sort();

const BASE = `name: x
on:
  pull_request_target:
permissions: {}
jobs:
  j:
    runs-on: ubuntu-24.04
    permissions: {}
    steps:
      - uses: actions/checkout@${SHA}
        with:
          persist-credentials: false
      - name: paso
        env:
          NUMERO: \${{ github.event.pull_request.number }}
        run: |
          echo "$NUMERO"
          git fetch origin "+refs/pull/$NUMERO/head:refs/cuatris/pr"
      - run: echo inline
`;

test("bloquesRun: block scalars e inline, con su línea", () => {
  const b = bloquesRun(BASE.split("\n"));
  assert.equal(b.length, 2);
  assert.match(b[0].texto, /git fetch origin/);
  assert.equal(b[1].texto, "echo inline");
});

test("un workflow bien armado no tiene hallazgos", () => {
  assert.deepEqual(revisarWorkflow(".github/workflows/x.yml", BASE), []);
});

test("cada regla dispara con su caso", () => {
  const casos = {
    "permissions-explicitas": BASE.replace("permissions: {}\njobs:", "jobs:"),
    "interpolacion-en-run": BASE.replace('echo "$NUMERO"', "echo ${{ github.event.pull_request.title }}"),
    "accion-sin-fijar": BASE.replace(`actions/checkout@${SHA}`, "actions/checkout@v5"),
    "secreto-ajeno": BASE.replace("NUMERO: ${{ github.event.pull_request.number }}", "TOKEN: ${{ secrets.PAT }}"),
    "checkout-del-pr": BASE.replace("persist-credentials: false", "ref: ${{ github.event.pull_request.head.sha }}"),
  };
  for (const [regla, texto] of Object.entries(casos)) {
    assert.deepEqual(reglas(revisarWorkflow(".github/workflows/x.yml", texto)), [regla], regla);
  }
  const checkout = BASE.replace('echo "$NUMERO"', 'gh pr checkout "$NUMERO"');
  assert.deepEqual(reglas(revisarWorkflow(".github/workflows/x.yml", checkout)), ["checkout-del-pr"]);
  // Con `pull_request` (no target) el checkout del PR es lo normal.
  const pr = checkout.replace("pull_request_target:", "pull_request:");
  assert.deepEqual(revisarWorkflow(".github/workflows/x.yml", pr), []);
  // GITHUB_TOKEN y las acciones locales están permitidos.
  const ok = BASE.replace("NUMERO: ${{ github.event.pull_request.number }}", "GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}").replace(`      - run: echo inline`, `      - uses: ./.github/actions/local\n      - run: echo inline`);
  assert.deepEqual(revisarWorkflow(".github/workflows/x.yml", ok), []);
});

test("los workflows del repositorio pasan los guardarraíles", () => {
  const h = revisarDirectorio(path.join(RAIZ, ".github"));
  assert.deepEqual(h, []);
});
