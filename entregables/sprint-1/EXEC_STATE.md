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
- **N0-9** `vocabulario.json` solo con las sedes observadas. `rectorado` y `sdt` del material;
  `sdf` («Sede Distrito Financiero») entró el 2026-09-12 al aparecer en la corrida real del
  scraper.
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
- **N0-15** Simulación optimista: una materia con historia `cursando` o `regular` cuenta como
  aprobada para todo período posterior al activo; en el activo, no.
- **N0-16** La ficha 13e queda como página con «← Plan» en el Sprint 1 (el mockup la dibuja
  como panel de 560 px); pasa a modal en el Sprint 2 (S-22). El resto de los findings de la
  auditoría (29 confirmados + 13 que el tope de refutación dejó pasar y N0 revisó a mano) va
  a la ola de fixes `olas/ola-4/FIXES.md` en cinco clústeres.
- **N0-17** `hash_estable` (ocupación fuera del hash) no se implementa en este sprint: se
  retira la promesa de la documentación hasta la replicación independiente del Sprint 3.
- **N0-18** Hasta que exista C4, cualquier baja dentro de `data/` es `necesita-humano`.
- **N0-19** Marcar una materia como aprobada la quita de los períodos planificados; la grilla
  saltea las aprobadas.
- **N0-20** N0-15 ampliada: sin ningún período planificado, lo que la historia trae como
  `cursando`/`regular` cuenta como aprobado para cualquier período consultado (el usuario
  recién pegó su historia y mira hacia adelante).
- **N0-23** (pedido del autor) Interacción intuitiva sin textos guía; casillas propias para
  año y cuatrimestre; tooltip propio en cada estado (nada de `title=`); ciclo cronológico
  pendiente → cursando → cursada → final; el año completo se pliega solo; densidad y medidas
  copiadas de StudyVaults «Mis materias».
- **N0-22** (pedido del autor) La pestaña «Plan» es el plan de estudios interactivo; el
  carrusel pasa a «Cursada»; cuatro estados por materia (final, cursada, cursando, pendiente);
  marcar año o cuatrimestre entero = final. Regla permanente: componentes propios, nada de
  controles por defecto (guardada en memoria).
- **N0-21** El período de prueba (fixture publicada localmente como 2026-2C) se usó solo para
  el smoke y nunca se versiona: un `git add -A` lo coló en el commit de fixes y se retiró con
  un amend antes de cualquier push.

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
| Ola 3A · U3.1 grilla semanal + tarjeta + lista de conflictos | DONE | ola-3a | VERDE (wf_6a1c5fda-af8); medido contra 13b elemento por elemento |
| Ola 3B · U3.2 página del plan · U3.3 panel agregar · U3.4 modal comisiones · U3.5 ficha y bloqueo · U3.6 inicio y menú | DONE | 61798d7 | todas VERDE; N0 cableó `App.tsx`, corrigió cupo-lleno y motivos encajonados (U3.3) y la comisión desaparecida (U3.5) |
| Ola 3B · smoke visual con período de prueba (fixture como 2026-2C, sin versionar) | DONE | — | 13a → marcar 28 materias → 13b con grilla → 13c «cripto» → 13d Elegir S → bloque en la grilla, progreso 153/192 → 13e ficha. Sin errores de consola |
| Ola 4 · auditoría adversarial (6 dimensiones) + refutación | DONE | — | 36 agentes; 61 findings, 29 confirmados, 1 refutado, 13 sin refutar por tope (adjudicados por N0), 18 bajos |
| Ola 4 · fixes en cinco clústeres (F1 CI · F2 validador · F3 motor · F4 interfaz · F5 scraper) + re-verificación | DONE | d697b0d | 58 findings corregidos; F1 y F2 quedaron ROJO por residuales que cerró N0 (guardarraíl: `env:` raíz y `ref: refs/pull/`; fixture de ejemplo); 462 tests Python, 536 tests app |
| Ola 4 · push, ruleset y Pages, deploy, smoke con el período real | BLOCKED | | espera el OK del autor al push y su corrida del scraper (`docs/scraping-sga.md`) |
| Ola 5 · R1 reformulación: pestaña Plan = plan de estudios interactivo (4 estados, marcar años/cuatrimestres), carrusel → «Cursada», componentes propios | DONE | eb0e26e | VERDE (wf_c9c2f512-68a); 591 tests app |
| Ola 5 · R2 plan compacto como StudyVaults, casillas propias, cierre automático del año, tooltips propios, ciclo cronológico | DONE | 101bc74 | ROJO→VERDE (wf_a2244e33-8de); 630 tests app; medidas verificadas en el navegador; cierra S-24 |

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
| S-15 | Choque con solapamiento total: el bloque desaparece de la grilla (solo queda la franja rayada y la lista) | GrillaSemanal | U3.1 baja | Sprint 2 |
| S-16 | `choquesDelBloque` no distingue comisión: si se dibujaran dos comisiones de la misma materia a la vez, se recortarían entre sí | GrillaSemanal | U3.1 baja | Sprint 2 (no ocurre en 13b/13d) |
| S-17 | `Disposicion` dibuja el `<aside>` vacío en el primer ingreso | app | smoke N0 | Ola 4 fixes |
| S-18 | `PegarHistoria` muestra «No encontré códigos…» con el área vacía, antes de que el usuario escriba | app 13a | smoke N0 | Ola 4 fixes |
| S-19 | `GrillaSemanal` sin prop `destacados`: el «Ver» de ↕ resalta por una regla CSS sobre `aria-label` | app | U3.2 | Sprint 2 |
| S-20 | Materia planificada con comisiones publicadas pero sin comisión elegida no se ve en la tarjeta | app | U3.2 | Sprint 2 (hoy el panel siempre pasa por el modal) |
| S-21 | `useDatos` sin caché: cada página que lo llame vuelve a pedir los JSON (hoy solo `App` lo llama) | app datos | U3.2/U3.3 | Sprint 2 (`ProveedorDatos`) |
| S-22 | Ficha 13e como modal de 560 px con ✕ en vez de página | app | auditoría A4 | Sprint 2 |
| S-23 | El período de prueba (fixture) no permite recorrer 13h → «Resolver» en el navegador: hace falta el período real | smoke | auditoría A4 | con la corrida del scraper |
| S-24 | ~~Ciclo con «final» antes de «cursada»~~ Cerrado en R2: ciclo cronológico, «final» es el último paso | app Plan | R1 verificador | cerrado (101bc74) |
| S-25 | `MenuPlan.elegirArchivo` crea un `<input type=file>` transitorio en `document.body`; si el navegador no dispara `cancel` (Safari viejo) queda hasta la próxima importación | app | R2 verificador | Sprint 2 |
| S-26 | Scraper: primera corrida real del autor (2026-09-12) destapó `js=1` obligatorio y el 404 de `/app2` sin barra tras el login; ambos corregidos (20b7ac5, ffd5e8e); falta confirmar la prueba de 3 cursos | scraper | corrida real | pendiente del autor |

## Veredicto final

**Sprint 1 (MVP): construido, auditado y verde en local; publicación pendiente del autor.**

- Código: 16 unidades en cuatro olas, cada una con verificación adversarial independiente;
  auditoría final de seis dimensiones (61 findings → 29 confirmados + 13 adjudicados por N0 +
  1 refutado + 18 bajos) y ola de fixes en cinco clústeres con re-verificación.
- Gates al cierre: 462 tests de Python, `ruff` limpio, `guardarrailes` en 0 sobre `.github/`,
  `validar --data data` en 0, 536 tests de la app, `typecheck`, `lint` y `build` verdes, sin
  Google Fonts en el `dist/`.
- Smoke en el navegador con un período de prueba: 13a → marcar → 13b → 13c → 13d → 13e sin
  errores de consola. 13h → «Resolver» queda sin recorrer hasta tener un período real (S-23).
- Cero altas abiertas. Deuda registrada en S-01…S-23.
- Falta, y no depende de esta sesión: el OK del autor al primer push, la configuración de
  plataforma (ruleset, Pages, permisos del token), el deploy, y la corrida del scraper para el
  primer período real.
