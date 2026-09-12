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
- **N0-6** Créditos de 72.23 y 72.70: gana el Excel (6 y 3); el «1» del listado del SGA no es
  plausible. Queda como `--creditos-decididos` explícito en el importador y en los tests.
- **N0-7** Textos de la interfaz, incluidos los nuevos: en voseo como el mockup (finding
  «Recargá en un rato» de W1.4 rechazado como defecto; ENV y CLAUDE.md aclarados).
- **N0-8** `cli.py` con registro explícito `MODULOS_EXTERNOS` (un módulo = `AYUDA`,
  `configurar`, `ejecutar`); errores de dominio con mensaje limpio salvo `--traceback`; un
  archivo que no se puede abrir no aborta el lote. Cierra los dos findings medios de W1.1.
- **N0-9** `vocabulario.json` solo con las sedes observadas en el material (`rectorado`,
  `sdt`); `sdf` entra cuando aparezca en una captura.
- **N0-10** «Sin horario publicado» no es un estado de materia: es un atributo de la oferta
  (`seOfrece`, `cupoLleno` del motor). `estadoMateria` conserva el parámetro `horarios`
  documentado como reservado.
- **N0-11** `deben-pasar/` admite advertencias por diseño (`c3-docente-repetido.json`); el test
  exige «sin errores», no «sin hallazgos». El techo de `creditos_requeridos` se mide contra
  el máximo entre la suma de materias y el título más alto, para que un plan parcial válido
  (la fixture del contrato) no sea error.
- **N0-12** Fixture sintética `motor/fixtures/sedes-consecutivas.ts` aceptada como caso de
  prueba de ↕ (no existe un caso real en el material); marcada y fuera de `data/`.
- **N0-13** Pasar horarios de otro período al motor lanza `HorariosDeOtroPeriodo`; una
  comisión guardada que ya no existe se descarta en silencio hasta el aviso del Sprint 2.
- **N0-14** Ruta `#/muestrario` cableada en `rutas.ts`/`App.tsx`; el puente provisional de
  `Disposicion` se retiró.

## Pasos

| Paso | Estado | Commit | Notas |
|---|---|---|---|
| F0 reconciliación, contrato, ENV, specs de la Ola 1 | DONE | — | este archivo |
| F0 esqueleto del repo, `.venv`, `git init`, commit inicial | DONE | 27a129e | MIT, CODEOWNERS, pyproject, conftest |
| Ola 1 · W1.1 contrato + validador C1/C2 | DONE | ola-1 | VERDE (wf_9c4f0791-712) |
| Ola 1 · W1.2 plan + abreviaciones + vocabulario | DONE | ola-1 | VERDE (wf_9c4f0791-712) |
| Ola 1 · W1.3 parsers SGA offline | DONE | ola-1 | VERDE (wf_9c4f0791-712) |
| Ola 1 · W1.4 cascarón de la SPA | DONE | ola-1 | VERDE (wf_9c4f0791-712) |
| Ola 1 · integración, gates, commit | DONE | ola-1 | 172 tests Python, 62 tests app, validar/fmt/build verdes |
| Ola 2 · W2.1 invariantes + índice | DONE | ola-2 | ROJO→integrado por N0 (test de fixtures, registro `indice`) |
| Ola 2 · W2.2 scraper en vivo + instructivo | DONE | ola-2 | VERDE; N0: `valor_de_opcion` sin `value`, jsessionid fuera de logs |
| Ola 2 · W2.3 motor de dominio | DONE | ola-2 | VERDE; N0: `HorariosDeOtroPeriodo` |
| Ola 2 · W2.4 primitivas + carrusel + tipos generados | DONE | ola-2 | ROJO→VERDE; ruta muestrario cableada por N0 |
| Ola 2 · W2.5 workflows + vendor + guardarraíles | DONE | ola-2 | ROJO→VERDE; 20 wheels, 3.5 MB; registro `pr`/`guardarrailes` |
| Ola 2 · integración, gates, commit | DONE | ola-2 | 366 tests Python, 236 tests app, guardarrailes 0, índice validado |
| Ola 3 · pantallas 13b, 13c, 13d, 13e, 13h, 13a, exportar/importar | TODO | | |
| Ola 4 · datos reales (corrida del autor), deploy a Pages, auditoría final, smoke | TODO | | |

## Fixes y tareas diferidas (S-nn)

| S | Qué | Superficie | Origen | Cuándo |
|---|---|---|---|---|
| S-01 | Parser de historia académica | app 13a | G-02 | cuando llegue la muestra |
| S-02 | `no-plan.json` y código desconocido como error | validador C3 | G-06 | Sprint 2 |
| S-03 | Generación de tipos TS desde schemas + test de equivalencia | app | G-08 | Ola 2 (W2.4) |
| S-04 | Regex de legajo demasiado estricta (`legajo nro. 58123` no se detecta) | triage C1 | W1.1 baja | Ola 4 (transversal) |
| S-05 | Persistencia en localStorage que falla en silencio (cuota llena) | app estado | W1.4 baja | Ola 3 (pantalla de aviso) |
| S-06 | Fixture 72.44 con fechas del período en vez de las de su captura (1C 2026) | fixtures | W1.1 baja | documentar en `docs/contrato.md` en Ola 4 |
| S-07 | Datos de ejemplo de la app con una comisión recombinada de literales del contrato | app datos/ejemplo | W1.4 baja | reemplazar por un recorte de datos reales en Ola 4 |
| S-08 | Unificar clases de error de la CLI bajo una base común | tools | W1.2 baja | Ola 4 |
| S-09 | `cuatris validar` sobre una fixture de abreviaciones contra el plan real imprime ~160 warnings `materia-sin-abreviacion` (contexto por omisión) | validador C3 | W2.1 baja | Ola 4: aplicar la completitud solo al archivo referido por `index.json` |
| S-10 | `--guardar-html` no avisa cuando no hubo ninguna respuesta que guardar | scraper | W2.2 baja | Ola 4 |
| S-11 | Comisión guardada que ya no existe en los horarios publicados: aviso «la comisión cambió» | app/motor | W2.3 media | Sprint 2 (hueco del mockup) |
| S-12 | Reemplazar la fixture sintética de ↕ por un caso real cuando el scraper baje un período completo | motor tests | N0-12 | Ola 4 o Sprint 2 |
| S-13 | La ayuda de `cuatris --help` muestra «(ver --help)» en vez de `AYUDA` para los subcomandos no invocados | cli | N0 | Ola 4 |
| S-14 | `buscar` por docente sin caso positivo en tests: el corpus no trae docentes de materias del plan | motor tests | W2.3 baja | Ola 4 con datos reales |

## Veredicto final

Pendiente.
