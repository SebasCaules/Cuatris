# W2.5 — Workflows de GitHub Actions, wheels vendorizados y guardarraíles

## Ownership

- `.github/workflows/ci-codigo.yml`, `.github/workflows/pr-datos.yml`, `.github/workflows/deploy.yml`
- `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/config.yml`
- `tools/vendorizar.py`, `vendor/**` (wheels), `tools/cuatris/validar/guardarrailes.py`,
  `tests/tools/test_guardarrailes.py`, `tools/cuatris/validar/triage_pr.py`,
  `tests/tools/test_triage_pr.py`
- `docs/ci.md`

No toques `CODEOWNERS` (ya existe) ni `cli.py`: `triage_pr.py` y `guardarrailes.py` exponen
`AYUDA`, `configurar(parser)` y `ejecutar(args) -> int` (la convención real de `cli.py`) y el
orquestador los registra en `MODULOS_EXTERNOS` como `pr` (acción `triage`) y `guardarrailes`.

## Lee

- `CLAUDE.md`; `entregables/02-plan-backend.md`: Fase 0 («Configuración de plataforma»), y
  de la Fase 4 todo desde «Tres principios» hasta «Los workflows» inclusive, más «Nota sobre
  el lenguaje». Es el diseño de seguridad; no lo reinterpretes, impleméntalo.
- `entregables/sprint-1/EXEC_STATE.md`: gaps G-03, G-05, G-07 y decisión N0-5.
- `tools/pyproject.toml`, `tools/cuatris/validar/` (qué comandos existen), `app/package.json`.

## Entregables

1. **`tools/vendorizar.py`**: descarga a `vendor/` los wheels **puro-Python (`none-any`)**
   de las dependencias de `tools/pyproject.toml` (runtime, más `pytest` y sus dependencias
   transitivas; **`ruff` no se vendoriza** porque es un binario: en CI se instala desde PyPI
   con la versión fijada), con versiones fijadas en `vendor/requisitos.txt` (`paquete==versión
   --hash=sha256:…`). Falla si algún wheel no es `none-any`. Ejecútalo y commitea los wheels
   (reporta el tamaño total en `notes`; si supera 15 MB, avisa). Instalación reproducible:
   `pip install --no-index --find-links vendor -r vendor/requisitos.txt -e tools`.
2. **`triage_pr.py`** (`cuatris pr triage --base <ref> --head <ref>`): clasifica el diff
   entre dos refs por ruta y por modo de git: rechaza symlinks, submódulos, punteros LFS,
   cambios en `.gitattributes`, rutas que colisionan en minúsculas; clase `DATOS` solo si
   **todos** los archivos matchean `data/v1/horarios/*.json`, `data/v1/catalogo/*.json`,
   `data/v1/abreviaciones.json`, `data/v1/vocabulario.json`, `data/index.json`; cualquier
   otro → `necesita-humano`. Salida JSON (`{clase, archivos, motivos}`) y código de salida.
   Tests con un repositorio git temporal.
3. **`guardarrailes.py`** (`cuatris guardarrailes .github/workflows`): comprueba que todo
   workflow declara `permissions` explícito en cada job, ningún `run:` interpola
   `${{ github.event.* }}` ni `${{ github.head_ref }}`, toda acción de terceros está fijada a
   un SHA de 40 caracteres (con comentario `# vX.Y.Z`), no hay `secrets.` fuera de
   `GITHUB_TOKEN`, y `pull_request_target` solo aparece con `permissions: {}` en el job que
   hace checkout del PR. Tests con workflows buenos y malos en fixtures temporales.
4. **`ci-codigo.yml`** (`pull_request` y `push` a `main`, `permissions: contents: read`):
   Python 3.12 con instalación desde `vendor/` sin red (`--no-index`), `ruff`, `pytest`,
   `cuatris guardarrailes`; Node 20 con `npm ci`, `typecheck`, `lint`, `test`, `build`.
5. **`pr-datos.yml`** (`pull_request_target`): job `validar-datos` con `permissions: {}`,
   checkout de la **rama base**, descarga de los archivos del PR a `.cuarentena/` con la API
   (`gh api` con `GITHUB_TOKEN` de solo lectura… si `permissions: {}` no permite leer un PR
   de fork público, usa `actions/checkout` del SHA del PR en un directorio aparte con
   `persist-credentials: false` y **sin ejecutar nada de ese directorio**), `cuatris pr
   triage`, `cuatris fmt --check` y `cuatris validar` sobre los archivos en cuarentena;
   job `decidir` (`permissions: pull-requests: write`) que **no abre ningún archivo del PR**:
   re-pide la lista de archivos a la API, reaplica el allowlist, aborta si el SHA cambió,
   trata `skipped`/`cancelled` como fallo, y **por ahora solo comenta el resultado en el PR**
   (el auto-merge por niveles llega en el Sprint 3; deja el punto de extensión). Documenta en
   comentarios del YAML por qué `pull_request_target` y por qué `permissions: {}`.
6. **`deploy.yml`** (`push` a `main` y `workflow_dispatch`; `permissions: contents: read,
   pages: write, id-token: write`): revalida `data/` completo con `cuatris validar`,
   construye `app/` con `VITE_BASE=/Cuatris/`, copia `data/` a `dist/data/`, publica con
   `actions/upload-pages-artifact` + `actions/deploy-pages`. Si la validación falla, no hay
   deploy (Pages conserva el último). Un smoke: `dist/index.html` existe y `dist/data/index.json`
   valida.
7. **`docs/ci.md`** (≤ 100 líneas): qué hace cada workflow, el modelo de amenazas resumido
   (referencia a la tabla del plan), cómo correr todo localmente, y **la lista de ajustes de
   plataforma que solo puede hacer el dueño** (ruleset en `main` con checks requeridos
   `ci-codigo` y `validar-datos`, Pages con origen «GitHub Actions», permisos por defecto
   del `GITHUB_TOKEN` en solo lectura, aprobación de primeros contribuyentes, bypass del
   admin sobre la revisión de code owner — gap G-07).

## Criterios de aceptación

- `.venv/bin/python -m pytest tests/tools -q` verde; `ruff` limpio; `cuatris guardarrailes
  .github/workflows` → 0 sobre tus propios workflows.
- `act` no es necesario; sí valida la sintaxis YAML de los tres workflows con un parser.
- Toda acción de terceros fijada a SHA con su versión en comentario.
- En `notes`: qué no pudiste probar sin el repositorio remoto y qué revisar en la primera
  ejecución real.
