# EXEC_STATE — Sprint 1 (MVP)

Método: workforce (N0 = esta sesión, Fable 5.1; workers y verificadores = Opus 5 por pedido
del autor; adjudicación final = N0). Plan de referencia: `entregables/05-plan-sprints.md`,
Sprint 1. Estado: se actualiza al cerrar cada paso.

## Fase 0 — Reconciliación (2026-09-12)

Estado real: no había código ni repositorio local; el repo remoto `SebasCaules/Cuatris`
existe vacío. Toolchain local: Python 3.12, Node 23, npm 10, git, gh autenticado; faltaban
pytest/ruff/fastjsonschema (instalados en `.venv`).

| Gap | Qué asumía el plan | Realidad | Fix |
|---|---|---|---|
| G-01 | Un cuatrimestre de horarios en `material-raw/04-horarios-vigentes/` | Solo README; los HTML de muestra están en `02-sga/html/` | El dataset real sale del scraper (Ola 2) corrido por el autor; Ola 1 y 3 trabajan con fixtures reales del corpus |
| G-02 | Pegar historia académica (13a) | No hay muestra del formato | 13a arranca con «marcar a mano»; parser cuando llegue `material-raw/06-historia-academica/` |
| G-03 | JSON Schema 2020-12 con validadores precompilados y job de recompilación | Un validador Python puro (`fastjsonschema`) valida desde el schema sin red; precompilar no aporta | **Draft-07**; sin precompilado; `fastjsonschema` vendorizado. Plan parcheado |
| G-04 | Caso negativo «día sábado» | Un día real rechazado por schema es un falso positivo crónico (A10) | `sabado` en el enum; negativo = `domingo`. Plan parcheado |
| G-05 | `selectolax`, `pdfplumber`, `pydantic`, `jsonschema` | Tienen partes compiladas: rompen la vendorización de wheels puros | Solo puro-Python: `fastjsonschema`, `beautifulsoup4`, `openpyxl`, `httpx`; PDF se decide en Sprint 2 |
| G-06 | «Todo código de horarios existe en un plan o en `no-plan.json`» | Los horarios traen las 472 materias de todas las carreras; el plan tiene 163 | En Sprint 1 es warning; error cuando exista `no-plan.json` (Sprint 2) |
| G-07 | Ruleset «incluyendo administradores» + revisión de code owner obligatoria | Repositorio de un solo mantenedor: nadie puede aprobar sus PRs | Ruleset estricto para todos, con bypass explícito del rol admin sobre la revisión de code owner; `centinela` lo audita (Sprint 3) |
| G-08 | Tipos TS generados de los schemas desde el día uno | Los schemas y la app se construyen en paralelo en la Ola 1 | Tipos a mano en Ola 1 (`app/src/contrato/tipos.ts`); generación + test de equivalencia en Ola 2 |

## Decisiones N0

- **N0-0** Modelos: workers y verificadores en Opus 5 (pedido del autor); N0 adjudica findings
  y hace la auditoría de cierre con auditores Opus 5 y veredicto propio.
- **N0-1** Contrato v1 fijado en `CONTRATO-v1.md` (formas, enums, hash del índice, estado del
  usuario). Manda sobre `02-plan-backend.md` si difieren.
- **N0-2** Sin `pull request` de push hasta que el autor confirme; commits locales por ola.
- **N0-3** Licencia MIT.
- **N0-4** CLI con `argparse` (stdlib), registro de subcomandos por módulo; `.venv` en la raíz.
- **N0-5** Puntos de integración exclusivos del orquestador: `tools/pyproject.toml`,
  `tools/cuatris/cli.py` (registro de subcomandos ajenos), `README.md`, `.github/**`,
  `data/index.json`.

## Pasos

| Paso | Estado | Commit | Notas |
|---|---|---|---|
| F0 reconciliación, contrato, ENV, specs de la Ola 1 | DONE | — | este archivo |
| F0 esqueleto del repo, `.venv`, `git init`, commit inicial | DOING | | |
| Ola 1 · W1.1 contrato + validador C1/C2 | TODO | | |
| Ola 1 · W1.2 plan + abreviaciones + vocabulario | TODO | | |
| Ola 1 · W1.3 parsers SGA offline | TODO | | |
| Ola 1 · W1.4 cascarón de la SPA | TODO | | |
| Ola 1 · integración, gates, commit | TODO | | |
| Ola 2 · C3 invariantes, scraper en vivo + instructivo, motor de dominio, shell de pantallas, workflows, index | TODO | | specs al cerrar la Ola 1 |
| Ola 3 · pantallas 13b, 13c, 13d, 13e, 13h, 13a, exportar/importar | TODO | | |
| Ola 4 · datos reales (corrida del autor), deploy a Pages, auditoría final, smoke | TODO | | |

## Fixes y tareas diferidas (S-nn)

| S | Qué | Superficie | Origen | Cuándo |
|---|---|---|---|---|
| S-01 | Parser de historia académica | app 13a | G-02 | cuando llegue la muestra |
| S-02 | `no-plan.json` y código desconocido como error | validador C3 | G-06 | Sprint 2 |
| S-03 | Generación de tipos TS desde schemas + test de equivalencia | app | G-08 | Ola 2 |

## Veredicto final

Pendiente.
