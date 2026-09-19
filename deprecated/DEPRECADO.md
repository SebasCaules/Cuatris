# `deprecated/` — el Cuatris anterior, congelado

El 2026-09-13 el proyecto cambió de rumbo: en vez de seguir construyendo un planificador
desde cero (SPA en Vite + React, CLI en Python, contrato de datos propio y scraper del SGA),
Cuatris pasó a ser la **versión standalone del planificador de StudyVaults ITBA**
(`site/app/electivas/planificar` de ese repositorio), que ya cubría todo el alcance previsto y
más. Lo que estaba en la raíz del repositorio hasta ese día se movió acá **tal cual** —con los
cambios sin commitear que había en curso incluidos— para que nada se pierda y todo siga
consultable. El `README.md` y el `CLAUDE.md` de esta carpeta son los del proyecto anterior.

Nada de esta carpeta se compila, se prueba ni se despliega. Los workflows de
`deprecated/.github/` no corren porque GitHub solo lee `/.github/`.

## Qué hay

| Carpeta | Qué era |
|---|---|
| `app/` | SPA Vite + React 18 + TypeScript (componentes propios, motor de dominio, estado en `localStorage`) |
| `tools/cuatris/` | CLI en Python: `fmt`, `validar`, `plan importar`, `sga bajar`, `indice`, `pr triage`, `guardarrailes` |
| `data/` | Contrato de datos v1 (`index.json`, `abreviaciones.json`, `vocabulario.json`, `horarios/2026-2C.json`, `planes/S10-Rev23.json`) |
| `schemas/v1/` | JSON Schema draft-07 del contrato |
| `tests/tools/` | Tests de la CLI (pytest) con su corpus anonimizado |
| `vendor/` | Wheels de Python vendorizadas (`pip --no-index`) |
| `docs/` | Contrato de datos, plan de estudios, scraping del SGA, CI |
| `entregables/` | Brief original, planes de backend y de sprints, diseño importado de Claude Design, `EXEC_STATE.md` |
| `material-raw/` | Fuentes crudas (ignorado por git, como siempre) |
| `.github/` | Workflows de CI, `pr-datos`, deploy a Pages, CODEOWNERS |
| `CLAUDE.md`, `README.md` | La guía y el léeme del proyecto anterior |

## Si hiciera falta volver a correr algo

- **CLI Python**: `cd deprecated && python3 -m venv .venv && .venv/bin/pip install --no-index
  --find-links vendor -r vendor/requisitos.txt && .venv/bin/pip install --no-index
  --no-build-isolation --no-deps -e tools` (el `.venv/` que quedó acá tiene rutas absolutas
  viejas: recrearlo). Tests: `.venv/bin/python -m pytest tests/tools -q`.
- **SPA vieja**: `cd deprecated/app && npm ci && npm run dev`.

Lo que sí sigue teniendo valor de referencia y no está en el planner nuevo: el scraper del
SGA (`tools/cuatris/sga/`, con sus hallazgos en `material-raw/02-sga/HALLAZGOS.md`) y el
período real de horarios `data/v1/horarios/2026-2C.json` (461 cursos, contrato 1.1.0).

**Lo que volvió a estar vivo (2026-09-19).** El scraper del SGA se promovió a `/tools/`
(paquete `cuatris` con solo `sga` y `canon`, sin vendorización: las dependencias se instalan
de PyPI) y es la herramienta mantenida para cargar cada cuatrimestre; la copia de acá queda
congelada. El validador y el triage de los PR de datos (`tools/cuatris/validar/`) se
reescribieron en Node en `/scripts/datos/`, y los workflows de `.github/` se rehicieron sobre
el mismo modelo de amenazas (`docs/ci.md` sigue siendo la explicación larga). Las fixtures de
horarios de `tests/fixtures/` se copiaron a `/scripts/datos/test/fixtures/`.
