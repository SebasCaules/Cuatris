# Cuatris — guía del proyecto para Claude Code

Planificador de cursada para Ingeniería en Informática del ITBA (plan S10-Rev23). El
estudiante acomoda troncales y electivas en cuatrimestres futuros y ve correlativas, choques
de horario y carga. **SPA en React sobre GitHub Pages, sin servidor.** Lo que llamamos
«backend» es la capa de datos versionada en el repositorio, GitHub Actions y una CLI en
Python que la mantiene. El proyecto es un legado: tiene que seguir funcionando dentro de
muchos años, mantenido por gente sin contexto.

Repositorio: `SebasCaules/Cuatris` (público, rama `main`). Sitio: `https://sebascaules.github.io/Cuatris/`
— es un sitio de proyecto, la SPA se sirve bajo `/Cuatris/`.

## Estado y mapa de documentos

Sprint 1 (MVP) construido y auditado en local (método workforce): estado, gaps, decisiones
N0-n y deuda S-nn en `entregables/sprint-1/EXEC_STATE.md`; contrato exacto en
`entregables/sprint-1/CONTRATO-v1.md`. Pendiente: primer push, configuración de plataforma,
deploy y el primer período real de horarios (scraper corrido por el autor).

| Documento | Qué es | Autoridad sobre |
|---|---|---|
| `entregables/00-brief.md` | Pedido original (§0–§9), textual | Requisitos |
| `entregables/02-plan-backend.md` | Plan aprobado, Fases 0–6 | Contrato de datos, CI, CLI, seguridad de PRs |
| `entregables/05-plan-sprints.md` | Plan §9; Sprint 1 = MVP | Orden de trabajo, arquitectura de la SPA |
| `entregables/04-diseno/` | Mockups importados de Claude Design + `tokens.md` | Interfaz, colores, tipografía, métricas |
| `entregables/03-abreviaciones-materias.csv` | 163 abreviaciones aprobadas y únicas | `abreviaciones.json` |
| `entregables/01-prompt-claude-design.md`, `06-prompt-claude-design-etapa4.md` | Prompts de diseño (etapas 1–3 hechas; etapa 4 pendiente) | — |
| `material-raw/` | Fuentes crudas: PDFs, HTML del SGA, plan en Excel, hallazgos | **Fuera del repositorio** |
| `material-raw/02-sga/HALLAZGOS.md` | Cómo funciona el SGA, casos raros verificados | Scraper y validadores |
| `material-raw/PENDIENTES.md` | Material que falta | — |

Ante una duda de alcance, primero el brief; de implementación, los planes; de aspecto, el
diseño. Si dos se contradicen, dilo antes de elegir.

## Decisiones cerradas

No se reabren sin pedido explícito del autor.

- **Plataforma**: repositorio público; cero secretos (solo `GITHUB_TOKEN` y OIDC para Pages);
  CODEOWNERS sobre `/.github/**`, `/tools/**`, `/schemas/**`, `/vendor/**`,
  `/tests/fixtures/**`, `/politica.json`, `/data/v1/planes/**`; `material-raw/` nunca entra.
- **Un solo lenguaje de herramientas: Python 3.11+**, dependencias vendorizadas como wheels
  en `vendor/` (`pip --no-index`). Nada de Node en `tools/`.
- **Contrato de datos** en `data/v1/`, campo `contrato` en SemVer, un major = directorio
  nuevo. Serialización canónica (`cuatris fmt`). Fechas `YYYY-MM-DD` sin hora. Códigos como
  string (`"93.18"`). `aulas` es array y nunca enum. `sede` y `modalidad` van en el bloque.
  `cupo` separado de `ocupacion`. Publicar un archivo no lo activa: lo activa `index.json`
  por fecha.
- **PRs de datos**: `pull_request_target` con `permissions: {}` en el job que toca archivos
  del PR; validador y workflows siempre desde la rama base; los datos son bytes, nunca
  código; auto-merge por niveles, `planes/` nunca automático.
- **Sugerencias desde la página**: issue prellenado → workflow → el mismo PR que una
  corrección manual. El payload es una intención, jamás un diff ni una ruta.
- **Plan de estudios**: se cargan las 163 materias del SGA con `vigente` verdadero para las
  129 del Excel. Abreviaciones únicas (error duro). Títulos por ítems aprobados: Analista 147,
  Bachiller en Ingeniería 192, Ingeniero/a 243. Electivas: 27 créditos. **Minors** (no
  «orientaciones»): cuatro, mínimo **14** créditos.
- **Diseño**: paleta 4a «Arena y ladrillo»; widget 7a con el choque según 9d; carrusel
  horizontal; mockup v2 (13a–13j); chip de minor 14b. Tipografía **Newsreader** (texto) y
  **JetBrains Mono** (datos), vendorizadas; no IBM Plex ni Google Fonts en tiempo de ejecución.
- **SPA**: Vite + React + TypeScript sin framework de componentes; tipos generados de los
  JSON Schema; motor de dominio en TypeScript puro y probado, separado de la interfaz;
  enrutado por hash; `base` de Vite por variable de build; estado del usuario en el navegador
  con exportar/importar; cero telemetría.

## Reglas de trabajo en este proyecto

- **Credenciales del SGA: nunca.** No pedirlas, no guardarlas, no ponerlas en ningún archivo.
  El scraper corre local con variables de entorno y el instructivo explica cómo. Si algo
  necesita sesión autenticada, lo corre el autor.
- **No inventar datos.** Códigos, horarios, aulas, nombres: solo lo que está en
  `material-raw/` o en el SGA verificado. Un plan anterior inventó `21.07`, `"dia":"MA"` y
  `"sede":"MADERO"`; se descartó. Si falta un dato, se dice.
- **Los siete casos raros reales tienen que pasar** cualquier validador nuevo: comisión en
  dos aulas simultáneas, letras no contiguas (A–H, K; «S»), comisión que cambia de sede,
  modalidades mixtas, período corto (15.09), homónimas con distinto código, cupo 48/48. Cada
  falso positivo que aparezca se agrega como fixture permanente en el mismo PR que lo corrige.
- **Comprobar el formato antes de depender de él.** Los HTML del SGA, los PDFs y el Excel
  están en `material-raw/`; correr el parser sobre uno antes de sobre todos.
- **Anonimizar antes de commitear fixtures**: los HTML guardados traen `CAULES, SEBASTIAN`
  en la barra superior; reemplazar por un marcador.
- **Idioma.** Documentación, comentarios, mensajes de commit y todo lo dirigido al autor: en
  español neutro (tú/usted), sin voseo ni regionalismos. Los **textos de la interfaz** —los del
  mockup y los nuevos— van en voseo, como el mockup, porque hablan a estudiantes del ITBA; no
  «corregirlos» ni mezclar registros dentro de la aplicación.
- **Git.** Trabajar en rama, PR contra `main`, nunca reescribir historia. Commitear solo
  cuando el autor lo pida. En una sesión de datos, `git add` por rutas explícitas.
- **El diseño se importa, no se reinterpreta.** Si un mockup no cubre un estado, la decisión
  mínima va anotada en `05-plan-sprints.md` («Huecos del mockup»), no improvisada en código.

## Hechos verificados que suelen confundirse

- El SGA (`sga.itba.edu.ar`) es Apache Wicket con URLs cifradas: **el único punto de entrada
  estable es `https://sga.itba.edu.ar/app2/`**; los ids de componente rotan entre despliegues
  y se extraen del HTML en cada corrida. Se necesitan las tres cookies (`JSESSIONID`,
  `AWSALB`, `AWSALBCORS`).
- Los horarios solo existen en la pestaña Comisiones de cada curso: un barrido completo son
  ~472 cursos y ~500 peticiones. Debe ser reanudable y con rate limit.
- «Ocupación de Aulas» no identifica la materia: no sirve como fuente, sí como validador
  cruzado offline.
- Los PDFs de materias son nativos y tienen exactamente 11 secciones delimitadas por `➢`
  (a veces seguido de U+200B). Un PDF con otra forma debe romper el parser, no producir un
  JSON a medias.
- **No existe todavía un cuatrimestre completo de horarios** en `material-raw/`: sale del
  scraper corrido por el autor. Tampoco hay muestra de la historia académica (pantalla 13a).
- 72.45 Proyecto Final exige 160 créditos aprobados; Inglés I/II y Práctica Laboral valen 0
  créditos pero son ítems de los títulos.

## Estructura prevista del repositorio

```
app/          SPA (Vite + React + TS)            tools/cuatris/  CLI Python
data/         index.json, CHANGELOG.jsonl, v1/   vendor/         wheels
schemas/v1/   JSON Schema draft-07                 tests/          corpus anonimizado y fixtures
docs/         contrato, scraping-sga, runbook    .github/        workflows y CODEOWNERS
```

## Comandos

Entorno: `.venv/bin/python` (crear con `python3 -m venv .venv && .venv/bin/pip install
--no-index --find-links vendor -r vendor/requisitos.txt && .venv/bin/pip install --no-index
--no-build-isolation --no-deps -e tools && .venv/bin/pip install ruff==0.16.7`).

```
cuatris fmt [--check] <json…>                   forma canónica
cuatris validar [--data data] <json…>           C1 triage, C2 schema, C3 invariantes
cuatris plan importar --excel … --sga … --titulos … --creditos-decididos 72.23=6 --creditos-decididos 72.70=3 --salida data/v1/planes/S10-Rev23.json
cuatris abreviaciones importar|exportar         CSV curado ↔ abreviaciones.json
cuatris sga bajar --anio 2026 --cuatrimestre 2C --salida data/v1/horarios/2026-2C.json [--limite 3]
cuatris indice actualizar --data data           hashes y entradas nuevas de index.json
cuatris pr triage --base <ref> --head <ref>     clase del PR (DATOS / necesita-humano)
cuatris guardarrailes [.github/workflows]       reglas de seguridad de los workflows
```

Tests y lint: `.venv/bin/python -m pytest tests/tools -q` · `.venv/bin/ruff check tools tests`.
App (`cd app`): `npm ci` · `npm run dev` (sirve `../data` bajo `/data/`) · `npm run typecheck`
· `npm run lint` · `npm test -- --run` · `npm run build` (`VITE_BASE=/Cuatris/` en Pages).
Muestrario de componentes: `#/muestrario`.

## Cuando vuelva Claude Design

La Etapa 4 (prototipo conectado) se importa a `entregables/04-diseno/` como se hizo el
2026-09-12: `/design-login` desde una sesión interactiva, o descarga por la API del editor
desde el Chrome del autor si la sesión no permite el login. Quitar los scripts inyectados
(`data-omelette-injected`) y actualizar `tokens.md` y el Sprint 3 con lo que traiga.
