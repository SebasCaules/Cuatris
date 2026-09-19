# EXEC_STATE — Mantenimiento comunitario de los datos

Rama `mantenimiento` (worktree `.claude/worktrees/mantenimiento`, creada desde
`main@907921c`). Cada etapa se hizo en una rama corta `mant/N-*` desde `mantenimiento` y
volvió con `merge --ff-only` tras pasar sus gates. Se mergea a `main` al cierre; push solo a
pedido del autor.

## Pasos

| Etapa | Estado | Commit | Notas |
|---|---|---|---|
| 0 · worktree, PLAN/EXEC_STATE | DONE | a9db50f | |
| 1 · `mant/1-validador` | DONE | 88c1cc1, 1355e1c | 22 tests; 0 errores sobre `data/plan` real; los 17 planes canonizados (solo indentación); vocabulario y CSV compartidos con los pipelines de build |
| 2 · `mant/2-triage` | DONE | 8447995 | triage con magnitud (C4) sobre repo git temporal (8 tests); guardarraíles (4 tests); deploy.yml fijado a SHA |
| 3 · `mant/3-workflows` | DONE | 94dff90 | pr-datos.yml, centinela.yml, ci.yml, deploy.yml, CODEOWNERS, plantillas; comentario.mjs y centinela.mjs testeados (4 tests); simulación local de los pasos bash del gate |
| 4 · `mant/4-scraper` | DONE | 8571afa | `tools/` (176 tests pytest, ruff limpio); valida con Node; `bajar-carreras.py` → tools/; job `scraper` en ci.yml |
| 5 · `mant/5-finales` | DONE | 9810798 | generados en `npm run datos` (predev/prebuild/typecheck); fuera del sync; CAMBIOS-LOCALES §27; `mesasFinales.ts` byte-idéntico al que estaba commiteado |
| 6 · `mant/6-docs-portada` | DONE | 2c1c676 | pie y portada verificados en dev (:3103, claro/oscuro, 400 px) y en el build estático bajo `/Cuatris/`; CONTRIBUTING, docs/mantenimiento.md, README, CLAUDE.md |
| 7 · `mant/7-plataforma` | DONE | e6cc4e1 | `configurar-github.sh --dry-run` probado; no se aplicó |
| Gates de cierre | DONE | | typecheck · build · test:datos (38) · test:grafo · guardarrailes · datos:validar · pytest (176) · `./run.sh build` |
| Prueba real de los workflows contra `mantenimiento` | HECHA, NO CONCLUYENTE | | la rama se pusheó y se abrieron 5 PR contra ella (#1–#5): `pull_request_target` no se disparó porque solo corre desde la rama por defecto (E-09). `ci.yml` sí corrió (verde en los válidos, rojo en los inválidos) y destapó una prueba flaky (E-10). PR cerrados y ramas borradas |
| Cierre · merge a `main` | DONE | a63ef3b, f64c32d | `merge --no-ff` y push (deploy verde); `configurar-github.sh` aplicado: ruleset `main` activo (bypass del administrador, check requerido `validar-datos`, revisión de code owners, sin aprobación extra por cambios sin atribuir), etiquetas, token de solo lectura |
| Prueba real del gate en `main` | DONE | | PR inofensivos contra `main` (2026-09-19): **#6** una línea en `horarios/README.md` → `datos-menor`, comentario, **se mergeó sola** (9b0c446) y disparó el deploy; **#7** bloque invertido → `validar-datos` rojo, comentario con `bloque-invertido`, no se mergeó; **#8** symlink → `necesita-humano` con el motivo; **#9** `2027-1C.json` sintético → `datos-mayor` + `esperando` + marcador (72 h); **#10** cambio en `scripts/` → `necesita-humano`. Centinela: con `hoy=2027-02-15` abrió el issue #11 «Faltan los horarios de 1C 2027»; con la fecha real lo cerró solo (ya no vigente) y, con el marcador de #9 vencido a mano y el PR retargeteado a `mantenimiento`, **lo mergeó** contra esa rama sin desplegar. PR cerrados, ramas de prueba y `mantenimiento` borradas. Lo único no probable con una sola cuenta: la revisión de code owner exigida a un contribuyente que no es administrador (el autor la bypasea) |

## Decisiones durante la ejecución

- **E-01** `lib/planner/finalesFlags.ts` commiteado difería del generado solo en el comentario
  de cabecera (rutas `Electivas/` → `data/plan/`): el dato era idéntico. Resuelto en la etapa
  5 al pasar la generación al build.
- **E-02** Sin vendorización de wheels en `tools/`: el gate ya no corre Python (la
  vendorización existía para que el gate no tuviera red), así que las dependencias del
  scraper se instalan de PyPI (`pip install -e "tools[dev]"`); `deprecated/vendor/` queda
  como estaba.
- **E-03** El triage expone en `datos` todo archivo regular del allowlist aunque el PR
  necesite a una persona: así el gate valida igual lo que sí son datos y el comentario del
  bot trae esa validación.
- **E-04** El comentario del bot muestra todos los errores pero solo los avisos de los
  archivos que el PR toca (los demás ya estaban; 2026-2C trae 5 avisos permanentes).
- **E-05** `colision-de-docente` es un solo aviso agregado por archivo (2026-2C: 133
  docentes, 786 pares; listarlos uno por uno era ruido).
- **E-06** Las fixtures con CRLF se arman en memoria en los tests: `core.autocrlf=input`
  normaliza los finales de línea al commitear y un archivo CRLF no sobrevive en git.
- **E-07** `build-carreras-data.mjs` emite forma canónica; el `capturado` de cada plan sale
  del mtime del HTML, que git no conserva: los 17 JSON se canonizaron con `--fmt` (mismo
  contenido, fecha original) en vez de regenerarlos.
- **E-08** `ci.yml` no es check requerido (fork nuevo → corrida pendiente → merge automático
  bloqueado); el gate corre el mismo `npm run build` que el deploy para los PR con datos.
- **E-09** `pull_request_target` **solo se dispara si el workflow existe en la rama por
  defecto, y corre con GITHUB_SHA/GITHUB_REF de esa rama** (documentación de GitHub,
  comprobado con los PR #1–#5 contra `mantenimiento`: cero corridas). El plan asumía «la rama
  base». Consecuencias: el checkout sin `ref:` es `main` (mejor todavía: el código del gate
  nunca sale de otra rama), `fetch-depth: 0` sigue haciendo falta para que el triage
  encuentre la base de un PR contra otra rama, y la prueba real del gate solo puede hacerse
  con el workflow ya en `main`, con PR inofensivos (`docs/mantenimiento.md`, «Probar un
  cambio del gate»). Comentarios del workflow, docs y PLAN corregidos.
- **E-10** El test del triage limpiaba el repo temporal mientras git cerraba un proceso en
  segundo plano (ENOTEMPTY en Linux, una corrida de cinco): `gc.auto=0` en el repo temporal
  y `rmSync` con reintentos.
