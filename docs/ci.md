# Integración continua, validación de PR y despliegue

Tres workflows en `.github/workflows/`. El diseño completo está en la Fase 4 de
`entregables/02-plan-backend.md`; acá va lo operativo.

## Qué hace cada workflow

| Workflow | Disparador | Para qué | Permisos |
|---|---|---|---|
| `ci-codigo.yml` | `pull_request`, `push` a `main` | Corre el código del PR: `ruff`, `pytest`, `cuatris guardarrailes .github`, `cuatris validar` sobre el corpus de ejemplo de la SPA, y en la SPA `npm ci`, `typecheck`, `lint`, `test`, `build` | `contents: read` |
| `pr-datos.yml` | `pull_request_target` | Clasifica el diff, trae los datos del PR a `.cuarentena/` y los valida; después comenta el resultado en el PR | `{}` en `validar-datos`, `pull-requests: write` en `decidir` |
| `deploy.yml` | `push` a `main`, manual | Revalida `data/` entero, construye la SPA con `VITE_BASE=/Cuatris/`, copia `data/` a `dist/data/` y publica en Pages por OIDC | `contents: read`, `pages: write`, `id-token: write` |

Los dos checks que el ruleset exige son **`ci-codigo`** (job resumen: falla si alguno de los
dos jobs reales no terminó en `success`, incluidos `skipped` y `cancelled`) y
**`validar-datos`**.

## El modelo de amenazas, en corto

La tabla completa (A1–A14) está en la Fase 4 del plan. Lo que implementan estos workflows:

- **A1/A3 — ejecutar código del PR con permisos.** `pr-datos.yml` usa `pull_request_target`,
  así que el workflow y el validador salen **siempre de la rama base** y el PR no puede
  reescribirlos. El precio habitual de ese disparador —un token con escritura— se paga con
  `permissions: {}` en el único job que toca bytes del PR. Esos bytes se traen con
  `git fetch refs/pull/<n>/head` y se extraen con `git archive`: nunca se ejecuta nada.
  `cuatris guardarrailes` vigila lo mismo en los workflows: reconoce como «traer código del
  PR» el `actions/checkout` del head, el `run:` que hace `git fetch`/`git checkout` del head
  por SHA —la forma que no nombra `refs/pull/`— y también la forma idiomática por número
  (`gh pr checkout "$NUMERO"`, `git fetch origin "pull/$NUMERO/head"`), donde el dato del PR
  es `github.event.pull_request.number` o `github.event.number` y llega por `env:`.
- **A1 — el gate valida un árbol distinto del que se mergea.** `git archive` aplica los
  atributos `export-subst` y `export-ignore` que declare el `.gitattributes` **del propio PR**:
  con el primero los bytes de `.cuarentena` dejan de ser los del PR, con el segundo un archivo
  no llega a `.cuarentena` y no se valida nunca. Por eso el paso «Copiar los datos del PR a
  `.cuarentena/`» aborta si el árbol del PR trae un `.gitattributes` en cualquier nivel, y
  `/.gitattributes` y `/.gitmodules` están bajo CODEOWNERS.
- **A2 — el PR desactiva sus propios controles.** No lo resuelve el código sino CODEOWNERS
  sobre `/.github/**`, `/tools/**`, `/schemas/**`, `/vendor/**`, `/.gitattributes` y
  `/.gitmodules`.
- **A4 — bypass del check requerido.** El check sale de la rama base, no del PR.
- **A5 — contenido activo servido desde el origen de la SPA.** Ni C1, ni C2, ni C3 abren un
  archivo que no sea `*.json`, y el deploy copia `data/` entero a `dist/data/`, que se sirve
  desde el mismo origen que la SPA y su `localStorage`. El gate y el deploy fallan si aparece
  cualquier archivo que no sea `*.json` dentro de `data/`.
- **A12 — escape del allowlist por modo de git.** `cuatris pr triage` rechaza symlinks,
  submódulos, punteros LFS, `.gitattributes`, `.gitmodules` y rutas que colisionan en
  minúsculas, y su allowlist compara segmento por segmento (un `*` no cruza barras) y
  descarta rutas con barra inicial, con `\` o con un segmento vacío, `.` o `..`.
- **C4 todavía no existe (llega en el Sprint 2).** Mientras tanto, **toda baja dentro de
  `data/`** sale `necesita-humano`: nada del Sprint 1 mira magnitud, y un PR que borra el
  archivo de horarios y deja `"horarios": []` en el índice despublicaría el cuatrimestre
  entero con los dos checks en verde.
- **A15 — instalar paquetes dentro del gate.** Las dependencias salen de `vendor/` con
  `pip --no-index`. Sin red y sin resolución de dependencias.
- **A10 — que alguien desactive las defensas por hartazgo.** `pr-datos.yml` corre para
  **todos** los PR (sin filtro `paths:`) para que el check requerido siempre aparezca, y la
  clase `necesita-humano` **no** hace fallar el job: un PR de código es legítimamente
  «necesita-humano» y no tiene por qué quedar bloqueado. La clase gobierna el auto-merge, que
  llega en el Sprint 3.
  El precio conocido de la defensa de A1 va acá, porque es justo el tipo de fricción que
  después se «arregla» desactivándola: como `pr-datos.yml` corre para todos los PR sin filtro
  `paths:` y `validar-datos` es check requerido, **un PR que agregue un `.gitattributes` en
  cualquier nivel no puede pasar el check nunca**, aunque sea legítimo (normalizar finales de
  línea, marcar binarios). Es deliberado: mientras el gate extraiga con `git archive`, un
  `.gitattributes` del PR reescribe los bytes que se validan. La salida no es aflojar el
  corte sino meter ese archivo por un push directo a `main` —donde `/.gitattributes` está bajo
  CODEOWNERS— y no por el gate.

`decidir` nunca abre un archivo del PR: le vuelve a pedir la lista a la API, reaplica el
allowlist con la misma función que el triage, aborta si el SHA cambió y trata cualquier
resultado que no sea `success` como falla. Ese recálculo ve **solo rutas**, así que no puede
reaplicar lo que el triage rechaza por modo de git, puntero LFS, archivos de git, bajas dentro
de `data/` ni colisiones de mayúsculas: `decidir` recibe por `outputs` la clase que calculó el
triage y publica **la más restrictiva de las dos**. La clase que ve quien mergea es la que
gobierna el auto-merge del Sprint 3, y una clase de más es exactamente lo que no puede pasar.

## Correr todo localmente

```bash
# Dependencias reproducibles, sin red (lo mismo que hace el CI).
pip install --no-index --find-links vendor -r vendor/requisitos.txt
pip install --no-index --no-build-isolation --no-deps -e tools
pip install "ruff==0.16.7"          # ruff no se vendoriza: es un binario por plataforma

ruff check tools tests
python -m pytest tests/tools -q

# `.github` entero, no solo `.github/workflows`: el recorrido es recursivo para alcanzar
# también un `.github/actions/<nombre>/action.yml`, que corre con los permisos de quien lo usa.
cuatris guardarrailes .github

# El corpus de ejemplo de la SPA también es un documento del contrato.
cuatris validar --data app/src/datos/ejemplo app/src/datos/ejemplo/index.json \
  app/src/datos/ejemplo/v1/**/*.json

# El triage de un PR, contra dos refs cualesquiera del repositorio local.
cuatris pr triage --base main --head mi-rama     # 0 = DATOS, 1 = necesita-humano, 2 = error

# Lo que revalida el deploy (lo que no sea *.json dentro de data/ hace fallar el paso).
find data -type f ! -name '*.json'               # tiene que no devolver nada
cuatris fmt --check $(find data -type f -name '*.json')
cuatris validar --data data $(find data -type f -name '*.json')

# La SPA.
cd app && npm ci && npm run typecheck && npm run lint && npm test -- --run && npm run build
```

Para rehacer `vendor/` (con red, y solo cuando cambian las dependencias):
`python tools/vendorizar.py`, y `python tools/vendorizar.py --verificar` para comprobar sin
red que los wheels coinciden con `vendor/requisitos.txt`.

> La instalación va en **dos** órdenes y no en una: `pip` entra en modo de verificación de
> hashes en cuanto un requerimiento trae `--hash`, y en ese modo rechaza un editable
> (`-e tools`) porque no hay un único archivo que hashear.

## Ajustes de plataforma: solo los puede hacer el dueño del repositorio

Nada de esto se puede versionar; hay que dejarlo hecho en la configuración de GitHub y
revisarlo cada tanto (el `centinela.yml` del Sprint 3 audita parte de esto).

1. **Ruleset sobre `main`**: PR obligatorio, sin force-push, historial lineal, y checks
   requeridos **`ci-codigo`** y **`validar-datos`**.
2. **Pages con origen «GitHub Actions»** (no «rama»), o `deploy.yml` falla al publicar.
3. **Permisos por defecto del `GITHUB_TOKEN` en solo lectura**, para todo el repositorio.
4. **«Require approval for first-time contributors»** activo, para que un PR de alguien nuevo
   no dispare workflows sin que una persona lo mire.
5. **Revisión de code owner obligatoria**, con **bypass explícito del rol admin** sobre esa
   revisión: el repositorio tiene un solo mantenedor y nadie más puede aprobar sus PR
   (gap G-07 de `EXEC_STATE.md`). El ruleset sigue siendo estricto en todo lo demás.
6. **Cero secretos.** El único admitido es `GITHUB_TOKEN`, que emite la propia ejecución;
   `cuatris guardarrailes` falla si aparece cualquier otro.
