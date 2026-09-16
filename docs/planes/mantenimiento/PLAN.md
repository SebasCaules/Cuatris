# Mantenimiento comunitario de los datos — plan de implementación

> **Estado: pendiente, no se empezó.** Plan aprobado por el autor el 2026-09-16 y guardado
> para implementarlo más adelante. Nada de lo que describe existe todavía en el repositorio
> (ni la rama `mantenimiento`, ni `scripts/datos/`, ni `tools/`). Para retomarlo: empezar
> por la Etapa 0 de la tabla de «Etapas» y llevar el estado en un `EXEC_STATE.md` al lado
> de este archivo, como en `docs/planes/mapa-correlativas/`.

## Contexto

El proyecto anterior (`deprecated/`) tenía como requisito central la **longevidad**: que
cualquiera pudiera actualizar horarios, planes y fechas por PR, con validación automática y
merge seguro sin revisión experta, para que el sitio siguiera vivo sin el autor. De eso se
implementó el Sprint 1 (gate `pr-datos.yml` con `pull_request_target` + `permissions: {}`,
triage por ruta y modo de git, forma canónica, schema, invariantes C1–C3, CODEOWNERS,
plantillas) y quedó sin hacer C4 (magnitud del cambio), auto-merge, centinela, sugerencias
desde la página y el log/rollback. Al pasar al planner de StudyVaults se perdió todo: hoy el
único workflow es `deploy.yml`, el repo no tiene ruleset ni CODEOWNERS, y cada cuatrimestre
depende del autor (bajar el SGA, commitear, pushear).

Objetivo: retomar esa idea sobre el proyecto actual (Next.js, datos en `data/plan/`) de modo
que **horarios, planes de estudio del SGA y planillas de finales** se actualicen por PR de
cualquiera, con gate automático y auto-merge, y que el propio repositorio pida ayuda cuando
falte un dato (cuatrimestre nuevo, llamado de finales).

### Decisiones del autor (2026-09-16)

- Datos contribuibles: horarios (`data/plan/horarios/<AAAA>-<n>C.json`), planes del SGA
  (`data/plan/carreras.json`, `data/plan/carreras/<CODIGO>.json`, HTML de evidencia en
  `data/plan/sga-carreras/`) y finales (`data/plan/finales-<AAAA>-<mes>.csv`). **No** el plan
  curado de Informática (`data.js`, sigue en StudyVaults).
- Auto-merge total: correcciones puntuales se mergean solas; cargas masivas (cuatrimestre
  nuevo, plan nuevo, planilla nueva) esperan una ventana de 72 h. Código y CI: nunca sin
  revisión del autor.
- Validador nuevo en Node (`scripts/datos/*.mjs`, sin dependencias, como los pipelines
  actuales) portando reglas y fixtures de `deprecated/`. El scraper Python del SGA sale de
  `deprecated/` a `tools/` como herramienta mantenida.
- Desde la página: link a un issue prellenado (sin bot).

### Fuera de alcance

Bot issue→PR (Fase 5 vieja), `CHANGELOG.jsonl` y herramientas de historia (Fase 6: el
historial de git + `git revert` alcanzan), corroboración con Ocupación de Aulas (C5),
cambios en `data.js`/StudyVaults, cambios en `components/planner/` y `lib/planner/`
(directorios espejados; nada de este plan los toca).

## Diseño

### 1. Validador de datos — `scripts/datos/` (Node ≥ 22, cero dependencias)

Reemplaza a `cuatris validar` / `cuatris pr triage` de `deprecated/tools/cuatris/validar/`
(fuente de las reglas: `esquema.py`, `invariantes.py`, `triage_pr.py`, `canon.py`;
schema de horarios: `deprecated/schemas/v1/horarios.schema.json`).

- `validar.mjs` — CLI: `node scripts/datos/validar.mjs [--dir data/plan] [--json out] [archivos…]`.
  Sin archivos valida todos los contribuibles. Salida: una línea por hallazgo
  (`error`/`aviso`, archivo, ruta JSON, mensaje). Exit 0 sin errores (avisos permitidos),
  1 con errores, 2 si no pudo leer. `--fmt` reescribe en forma canónica.
- `forma.mjs` (C1): tamaño máximo por tipo, profundidad ≤ 12, **claves duplicadas** (escáner
  propio: `JSON.parse` no las ve), claves `__proto__`/`constructor`/`prototype`, caracteres
  de control y bidi, correo/teléfono/legajo en strings (error), forma canónica (claves
  ordenadas, 2 espacios, LF, salto final; misma serialización que `canon.py`).
- `horarios.mjs` (C2+C3, contrato 1.1.0): `contrato` 1.x; `periodo` coherente con el nombre
  de archivo; código `^\d{1,3}\.\d{1,3}$` único; `desde`/`hasta` ISO y dentro del período;
  comisiones con id único por curso; bloques con `dia` del enum, horas `HH:MM` con
  `desde < hasta`, `modalidad` del enum, `sede` conocida (aviso), `aulas` array; cupo y
  ocupación enteros (inscriptos > capacidad: aviso); `dictado_conjunto` simétrico;
  **colisión de aula** (error; excluye virtual, sin aula y conjunto); colisión de docente
  (aviso). Los enums salen de `scripts/build-planner-data.mjs` (`DIA`, `MODALIDAD`, `SEDE`)
  para que validador y build no diverjan: se extraen a `scripts/datos/vocabulario.mjs` y
  el build los importa de ahí.
- `carreras.mjs`: `carreras.json` (índice) y `carreras/<CODIGO>.json` (forma que emite
  `build-carreras-data.mjs`: `carrera.codigo` = nombre de archivo, `bloques[].tipo` ∈
  {todos, creditos, uno}, materias con código único, créditos ≥ 0, correlativas existentes
  (aviso) y **acíclicas** (error), `titulos`); coherencia índice ↔ archivos.
- `finales.mjs`: nombre `finales-<AAAA>-<mes>.csv`, cabecera esperada
  (`Cód,Materia,Primer llamado,Hora[,Segundo llamado,Hora]`), códigos válidos y únicos,
  fechas «lunes, 14 de diciembre de 2026» parseables con ≥ 80 % en el mes del nombre, horas
  `HH:MM`, ≥ 100 filas (aviso si menos). Reusa el tokenizador de
  `scripts/build-mesas-finales-data.mjs` (extraer a `scripts/datos/csv.mjs`).
- `triage.mjs` (C1 sobre el diff + C4): `node scripts/datos/triage.mjs --base <ref> --head <ref> [--salida triage.json]`.
  `git diff --raw -M -z` desde el merge-base; allowlist segmento a segmento:
  `data/plan/horarios/<AAAA>-[12]C.json`, `data/plan/horarios/README.md`,
  `data/plan/carreras.json`, `data/plan/carreras/<CODIGO>.json`,
  `data/plan/sga-carreras/*.html` (evidencia: nunca se abre en el gate),
  `data/plan/finales-<AAAA>-<mes>.csv`. Rechaza (→ `necesita-humano`): rutas fuera del
  allowlist, symlinks, submódulos, ejecutables, punteros LFS, `.gitattributes`/`.gitmodules`,
  colisiones de mayúsculas, **cualquier baja**. Clase por magnitud (`politica.json`, un
  solo archivo con los umbrales):
  - `datos-menor` (merge inmediato): solo modificaciones; horarios ≤ 5 cursos tocados y 0
    cursos quitados; carreras ≤ 1 archivo y ≤ 10 materias tocadas, mismo `plan`; finales
    ≤ 10 filas tocadas.
  - `datos-mayor` (merge tras 72 h): archivo de horarios nuevo que sea **exactamente el
    período siguiente** al más nuevo existente y con cantidad de cursos dentro de ±30 % del
    anterior; plan nuevo (`plan` distinto, o carrera nueva listada en `carreras.json`);
    planilla de finales nueva; modificaciones por encima de «menor» pero ≤ 50 % del archivo
    y ≤ 5 cursos quitados.
  - `necesita-humano`: todo lo demás. Nunca hace fallar el check: solo gobierna el merge.
  Salida: `{clase, archivos, motivos, resumen}`; el resumen (cursos agregados/quitados/
  modificados por archivo, materias, filas) va al comentario del bot.
- `guardarrailes.mjs`: sobre `.github/**`: todo workflow declara `permissions`, ningún `run:`
  interpola `${{ github.event.* }}`, acciones de terceros fijadas a SHA, ningún `secrets.`
  salvo `GITHUB_TOKEN`. Port acotado de `guardarrailes.py` (~120 líneas).
- `test/*.test.mjs` con `node --test` (`npm run test:datos`): fixtures portadas de
  `deprecated/tests/fixtures/{deben-pasar,deben-fallar}` (horarios: los casos raros reales
  —dos aulas, sede que cambia, domingo virtual, dictado conjunto, docente repetido— y los
  negativos c3-*), fixtures nuevas para carreras y finales, y un test del triage sobre un
  repo git temporal (modo, baja, período salteado, ±30 %). Test del guardarraíl contra los
  workflows reales.
- `package.json`: `datos:validar`, `datos:fmt`, `datos:triage`, `test:datos`.

### 2. Workflows — `.github/workflows/`

Mismo modelo de amenazas del plan viejo (`deprecated/docs/ci.md`: A1–A15); las decisiones
se copian como comentarios en cada workflow, como ya hacía `pr-datos.yml`.

- **`pr-datos.yml`** (`pull_request_target`, sin filtro `paths:`, concurrency por PR).
  - Job `validar-datos` (`permissions: {}`; **único check requerido**): checkout de la
    rama base (código, validador, lockfile), `setup-node` fijado a SHA; `git fetch
    refs/pull/N/head` verificando el SHA; triage; abortar si el PR trae `.gitattributes`;
    `git archive` de `data/plan` a `.cuarentena/`; **overlay**: copiar sobre `data/plan`
    del checkout base solo los archivos que el triage aceptó como datos (el resto del árbol
    del PR jamás entra); `validar.mjs` sobre todo `data/plan` (atrapa «dos PR válidos por
    separado, inválidos juntos»); **build de prueba** `npm ci && npm run build` (es lo que
    hará el deploy; `data.js` no es contribuible, así que el `vm` del build nunca ejecuta
    bytes del PR). Resumen en `$GITHUB_STEP_SUMMARY`; `triage.json` como output.
  - Job `decidir` (`contents: write`, `pull-requests: write`, `actions: write`, `if: always()`):
    no abre ningún archivo del PR; recalcula la clase por rutas desde la API y publica la
    más restrictiva; aborta si el SHA cambió; comenta (tabla del resumen del triage, estado,
    qué pasa ahora). Etiqueta con la clase. Si `validar-datos` pasó:
    - `datos-menor` → `gh pr merge --merge` (síncrono; el ruleset solo exige
      `validar-datos`, que ya terminó) y **dispara el deploy** con
      `gh workflow run deploy.yml --ref main` — un merge hecho con `GITHUB_TOKEN` **no**
      dispara el `push` de `deploy.yml` (regla de GitHub; `workflow_dispatch` es la
      excepción documentada). Solo si la rama base es la default; si no (PR de prueba contra
      `mantenimiento`), mergea y no despliega.
    - `datos-mayor` → etiqueta `esperando` + comentario con marcador
      `<!-- cuatris:espera sha=… hasta=<ISO> -->` (72 h desde ahora).
    - `necesita-humano` → comentario con qué lo revisa una persona. Exit 0.
- **`centinela.yml`** (`schedule` cada 6 h + `workflow_dispatch`; `contents: write`,
  `pull-requests: write`, `issues: write`, `actions: write`):
  1. PRs abiertos con `esperando`: lee el marcador del bot; si `sha` = head actual, `hasta`
     ≤ ahora y el check `validar-datos` de ese SHA está en `success` → merge + dispatch del
     deploy; si el SHA cambió, quita la etiqueta (el gate ya volvió a correr).
  2. Datos que faltan (una vez por día, idempotente por título): si hoy ≥ 1/feb y no existe
     `horarios/<año>-1C.json`, o ≥ 1/jul sin `<año>-2C.json` → issue «Faltan los horarios de
     …» con la receta de CONTRIBUTING y etiqueta `ayuda-necesaria`; igual para finales
     (≥ 1/may → julio, ≥ 1/oct → diciembre, ≥ 1/dic → febrero del año siguiente).
  3. Revalida `data/plan` de `main`; si falla, issue «Los datos de main no validan».
- **`ci.yml`** (`pull_request` + `push` a `main`, `paths-ignore: deprecated/**`; `contents:
  read`): `npm ci`, `typecheck`, `test:grafo`, `test:datos`, `guardarrailes`, `build`.
  **No** es check requerido: para PRs de forks de gente nueva GitHub lo deja pendiente
  hasta que alguien apruebe la corrida, y un check requerido pendiente bloquearía el
  auto-merge (A10). Los PR de código igual exigen revisión del autor por CODEOWNERS.
- **`deploy.yml`**: agrega `node scripts/datos/validar.mjs` antes del build (un merge malo
  no despliega; Pages conserva el último deploy bueno) y `schedule` semanal como red de
  seguridad; conserva `workflow_dispatch` (lo usa el bot) y el `push` a `main` (commits del
  autor).

### 3. Plataforma (`.github/` y configuración del repo)

- `CODEOWNERS`: `* @SebasCaules` y, debajo, las rutas contribuibles **sin dueño** (una línea
  posterior sin owners quita la propiedad): `/data/plan/horarios/`, `/data/plan/carreras/`,
  `/data/plan/carreras.json`, `/data/plan/sga-carreras/`, `/data/plan/finales-*.csv`.
- `ISSUE_TEMPLATE/dato-incorrecto.yml` (formulario: carrera, código, período, qué está mal,
  fuente en el SGA), `ISSUE_TEMPLATE/config.yml` (links a CONTRIBUTING y
  docs/mantenimiento.md), `pull_request_template.md` (adaptación del viejo: fuente del dato,
  `npm run datos:validar`).
- `scripts/repo/configurar-github.sh` + `scripts/repo/ruleset-main.json` (idempotente, con
  `gh api`; **lo corre el autor cuando dé el OK**, no este plan): etiquetas (`datos-menor`,
  `datos-mayor`, `necesita-humano`, `esperando`, `ayuda-necesaria`); ruleset sobre `main`:
  PR obligatorio con 0 aprobaciones + revisión de code owners, check requerido
  `validar-datos`, sin force-push ni borrado, **bypass siempre para el rol admin** (el autor
  sigue pusheando directo; único mantenedor, gap G-07 del plan viejo); permisos por defecto
  del token en lectura (ya está); Pages por Actions (ya está). Estado actual verificado:
  sin rulesets, sin protección, `allow_auto_merge` off (no hace falta: el bot mergea).

### 4. Scraper del SGA → `tools/`

- Mover `deprecated/tools/cuatris/{sga/, canon.py, __init__.py}` y un `cli.py` reducido
  (solo `sga bajar`) a `tools/cuatris/`; `pyproject.toml` sin `fastjsonschema`/`openpyxl`;
  `tools/vendor/` regenerado con `vendorizar.py` (solo httpx, bs4 y sus dependencias);
  tests `test_sga_*.py`, `test_canon.py` + `tests/corpus/sga` → `tools/tests/`.
- `bajar.py`: salida por defecto `data/plan/horarios/<periodo>.json`; la validación al
  final llama a `node scripts/datos/validar.mjs <archivo>` por subprocess (si no hay `node`,
  imprime el comando) en vez de `cuatris.validar`.
- `data/plan/bajar-carreras.py`: `sys.path` → `tools/` (hoy apunta a `deprecated/tools`).
- `deprecated/` queda intacto; `DEPRECADO.md` anota que el scraper vive ahora en `tools/`.
- `.gitignore`: `tools/.venv/`, `.cuatris-cache/` (ya está).

### 5. Finales generados en el build (sale del espejo)

`lib/planner/mesasFinales.ts` y `finalesFlags.ts` hoy están commiteados dentro de
`lib/planner/` (espejo con `rsync --delete`): un CSV nuevo acá se perdería en el próximo
sync. Cambio (todo fuera de los directorios espejados):

- `package.json`: `predev`/`prebuild`/`typecheck` corren `npm run datos` (los tres
  generadores) en vez de solo `build-planner-data.mjs`.
- `.gitignore`: `lib/planner/mesasFinales.ts`, `lib/planner/finalesFlags.ts`
  (`git rm --cached`); `scripts/sync-desde-studyvaults.sh`: excluirlos del rsync como a
  `data.json`. Registrar la divergencia en `CAMBIOS-LOCALES.md` (los CSV de Cuatris pasan a
  ser un superconjunto de los de StudyVaults).

### 6. Página y documentación

- `components/shell/Footer.tsx`: link «¿Un dato está mal?» →
  `${REPO_URL}/issues/new?template=dato-incorrecto.yml` (aparece en portada y planner: el
  Footer vive en `app/layout.tsx`); `lib/site.ts`: `ISSUE_URL`, `CONTRIBUTING_URL`.
- `components/shell/Landing.tsx`, sección «De dónde salen los datos»: una frase «Cualquiera
  puede actualizarlos» con link a CONTRIBUTING.
- `CONTRIBUTING.md` (raíz, español neutro): cuatro recetas —corregir un horario a mano,
  cargar un cuatrimestre nuevo (`tools/`), actualizar el plan de una carrera
  (`bajar-carreras.py` + `npm run carreras`), archivar una planilla de finales—, qué revisa
  el bot, plazos (inmediato / 72 h), qué necesita a una persona.
- `docs/mantenimiento.md` (para quien herede el repo): arquitectura del gate, modelo de
  amenazas resumido (con referencia a `deprecated/docs/ci.md`), configuración de plataforma
  y su script, cómo romper el vidrio (ruleset, deploy manual, revert), qué hace el centinela.
- `tools/README.md` (correr el scraper; port corto de `deprecated/docs/scraping-sga.md`:
  cuenta del SGA, recorrido, por qué no corre en CI, diagnóstico).
- `README.md` («Actualizar datos» → recetas), `CLAUDE.md` (nuevos directorios `scripts/datos`,
  `tools/`, reglas: nada del gate se ejecuta desde el PR; los umbrales viven en
  `politica.json`), `data/plan/horarios/README.md`.

## Ramas y worktree

Precedente del repo: `mapa-correlativas` (worktree en `.claude/worktrees/`, plan en
`docs/planes/<rama>/`, merge a `main` con commit de merge). Se repite:

```
main ──┬──────────────────────────────────────────────── merge --no-ff ──▶
       └─ mantenimiento (integración; worktree .claude/worktrees/mantenimiento)
            ├─ mant/1-validador     ─┐
            ├─ mant/2-triage         │  cada etapa: rama corta desde mantenimiento,
            ├─ mant/3-workflows      │  gates verdes, rebase sobre mantenimiento,
            ├─ mant/4-scraper        ├─ merge --ff-only (historial lineal adentro),
            ├─ mant/5-finales        │  rama borrada
            ├─ mant/6-docs-portada   │
            └─ mant/7-plataforma    ─┘
```

- Crear: `git worktree add .claude/worktrees/mantenimiento -b mantenimiento main`
  (desde `main` local); `ln -s <main>/node_modules node_modules`; `npm run datos`; dev en
  `:3103` si hace falta ver la portada/pie (entrada `cuatris-mantenimiento` en
  `.claude/launch.json`, como la de `cuatris-mapa`). `main` no se toca hasta el cierre.
- Commits por rutas explícitas (nunca `-A`), prefijo `Mantenimiento:` en el asunto.
- Plan y estado versionados en `docs/planes/mantenimiento/{PLAN.md,EXEC_STATE.md}`
  (copia de este plan + tabla de pasos con commit y estado), como en `mapa-correlativas`.
- **Prueba real de los workflows** (única forma de probar `pull_request_target`): pushear
  `mantenimiento` a `origin` **con permiso del autor** (no despliega: `deploy.yml` solo mira
  `main`) y abrir PRs de prueba desde ramas `prueba/*` **contra `mantenimiento`**: el gate
  corre con el workflow de la rama base. Casos: corrección menor válida (se mergea sola,
  sin deploy), horario inválido (check rojo), symlink (necesita-humano), cuatrimestre nuevo
  (esperando + marcador), PR de código (necesita-humano). Las ramas de prueba se borran.
- Cierre: `git rebase main` en `mantenimiento` (o merge de `main` si hay conflictos con
  `CAMBIOS-LOCALES.md`), gates, `git merge --no-ff mantenimiento` desde `main`,
  `git worktree remove`, `git branch -d`. Push a `main` y ejecución de
  `configurar-github.sh` **solo a pedido del autor**; recién entonces el gate está activo en
  producción.

## Etapas

| Etapa (rama) | Entrega | Verificación |
|---|---|---|
| 0 · `mantenimiento` | worktree, `docs/planes/mantenimiento/{PLAN,EXEC_STATE}.md`, launch.json | `npm run typecheck` |
| 1 · `mant/1-validador` | `scripts/datos/{validar,forma,horarios,carreras,finales,vocabulario,csv}.mjs`, fixtures y tests, scripts npm; `build-planner-data.mjs` importa el vocabulario | `npm run test:datos`; `npm run datos:validar` limpio sobre `data/plan` real (2026-2C, 16 carreras, 3 CSV); cada fixture negativa falla por su regla |
| 2 · `mant/2-triage` | `triage.mjs`, `politica.json`, `guardarrailes.mjs`, tests con repo git temporal | tests; triage sobre `main..mapa-correlativas` = `necesita-humano`; sobre una rama local que edita 1 curso = `datos-menor` |
| 3 · `mant/3-workflows` | `pr-datos.yml`, `centinela.yml`, `ci.yml`, `deploy.yml` (validación + schedule), CODEOWNERS, plantillas, etiquetas en el script | `guardarrailes.mjs` limpio; simulación local de los pasos del gate con bash (fetch, archive, overlay, validar, build); prueba real contra `mantenimiento` (ver arriba) |
| 4 · `mant/4-scraper` | `tools/` (paquete, vendor, tests, README), `bajar.py` con salida nueva y validación por Node, `bajar-carreras.py` apuntando a `tools/`, nota en DEPRECADO.md | `python -m pytest tools/tests -q` desde un venv con `--no-index`; `python3 data/plan/bajar-carreras.py --help`; `cuatris sga bajar --help` |
| 5 · `mant/5-finales` | generación en build, gitignore, exclusión en el sync, CAMBIOS-LOCALES | `./run.sh build`: combinador de finales con las mismas mesas que antes (diff del `.ts` generado vs el commiteado = vacío antes de borrarlo del índice) |
| 6 · `mant/6-docs-portada` | Footer, Landing, `lib/site.ts`, CONTRIBUTING, docs/mantenimiento.md, README, CLAUDE.md | `typecheck` + `build`; portada y planner en `:3103`/`./run.sh build`: link del pie abre `issues/new?template=…` (claro/oscuro, 400 px) |
| 7 · `mant/7-plataforma` | `scripts/repo/configurar-github.sh`, `ruleset-main.json` | `bash -n`; modo `--dry-run` que imprime las llamadas sin ejecutarlas; no se corre contra el repo en este plan |
| Cierre | rebase, merge a `main`, EXEC_STATE final | `typecheck`, `build`, `test:grafo`, `test:datos`, `./run.sh build` |

## Verificación de punta a punta (tras el push y la configuración, a pedido del autor)

1. PR real del autor desde una rama con un horario corregido a mano → comentario del bot con
   la tabla, etiqueta `datos-menor`, merge automático, `deploy.yml` disparado por el bot, el
   sitio muestra el cambio.
2. PR con un archivo `2027-1C.json` sintético (copia de 2026-2C con el período cambiado) →
   `esperando` con marcador; `centinela` disparado a mano no mergea antes del plazo (probar
   con `hasta` editado a mano en el comentario del bot → mergea y despliega). Revertir con
   `git revert` después.
3. PR que toca `scripts/` → `necesita-humano` + revisión de code owner exigida por el ruleset.
4. `centinela` con fecha simulada (`CENTINELA_HOY=2027-02-15` por `workflow_dispatch` input)
   abre el issue «Faltan los horarios de 2027-1C».

## Trampas conocidas (van como comentarios en los workflows)

- `pull_request_target` corre el workflow de la **rama base**: por eso se puede probar
  contra `mantenimiento` y por eso el PR no puede reescribir el gate.
- Un merge o push hecho con `GITHUB_TOKEN` no dispara workflows de `push`: el deploy se
  dispara explícitamente por `workflow_dispatch`, y solo cuando la base es `main`.
- `git archive` respeta el `.gitattributes` del PR (`export-subst`/`export-ignore`): se
  aborta si el PR trae uno.
- Un check requerido que queda pendiente (CI de `pull_request` en un fork nuevo) bloquea el
  auto-merge para siempre: solo `validar-datos` es requerido.
- `decidir` no puede ser check requerido: se bloquearía a sí mismo al mergear.
