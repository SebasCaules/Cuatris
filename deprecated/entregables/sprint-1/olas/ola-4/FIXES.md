# Ola 4 — Fixes confirmados de la auditoría final

Cada clúster es un worker. Corrige TODOS los findings de tu clúster (alta, media y baja) sin salirte de tu ownership; los findings traen la reproducción y un fix propuesto: el fix es una sugerencia, la reproducción es la prueba de que quedó resuelto. Agrega un test por cada finding de comportamiento. No hagas commits.


## F1 — CI y seguridad del pipeline (10 findings)

**Ownership:** `.github/workflows/**`, `.github/CODEOWNERS`, `tools/cuatris/validar/triage_pr.py`, `tools/cuatris/validar/guardarrailes.py`, `tests/tools/test_triage_pr.py`, `tests/tools/test_guardarrailes.py`, `docs/ci.md`. Además: agrega a `ci-codigo.yml` (job de Python) el paso `cuatris validar --data app/src/datos/ejemplo app/src/datos/ejemplo/index.json app/src/datos/ejemplo/v1/**/*.json` que pide F2.


### F1.1 [alta] El gate valida un árbol distinto del que se mergea (.gitattributes del propio PR)

- Archivo: `.github/workflows/pr-datos.yml:110`
- Dimensión: A1
- Detalle: `git archive refs/cuatris/pr data | tar -x -C .cuarentena` aplica los atributos `export-ignore`/`export-subst` que declara el **.gitattributes del propio PR**, así que los bytes en `.cuarentena` no son los bytes del PR. El triage marca `.gitattributes` (triage_pr.py:75) pero su clase no hace fallar el job (pr-datos.yml:80-99), y `validar-datos` es uno de los dos checks requeridos (docs/ci.md:14-16).
Reproducción exacta (clon del repo, hecha):
1. `printf 'data/v1/vocabulario.json export-subst\n' > .gitattributes; git add -A; git commit`
2. `sed -i 's/"rectorado"/"$Format:%x72ectorado$"/' data/v1/vocabulario.json; git commit -am poison`
3. `git archive <rama> data | tar -x -C /tmp/q2`
   → `/tmp/q2/data/v1/vocabulario.json` dice `"id": "rectorado"`; el archivo del PR dice `"id": "$Format:%x72ectorado$"`.
4. En cuarentena: `cuatris fmt --check ...` rc=0 y `cuatris validar --data data ...` rc=0 (verde).
   En el árbol real del PR: rc=1 con `hash-incorrecto` de `v1/vocabulario.json` y `sedes[0].id no cumple el patron ^[a-z0-9_]+$`.
Con `export-ignore` pasa lo simétrico: con `data/v1/planes/* export-ignore` el archivo `data/v1/planes/S10-Rev23.json` desaparece de `.cuarentena` y nunca se valida (comprobado). El único freno hoy es el chequeo de hashes de `index.json`; cualquier archivo de datos no indexado (p. ej. `data/v1/catalogo/*.json`, ya en el allowlist) queda invisible.
- Fix propuesto: En el paso «Copiar los datos del PR a .cuarentena/», abortar antes del `git archive` si `git ls-tree -r refs/cuatris/pr --name-only | grep -q '\(^\|/\)\.gitattributes$'`.


### F1.2 [alta] El guardarraíl de `pull_request_target` no ve un checkout del PR por SHA

- Archivo: `tools/cuatris/validar/guardarrailes.py:664`
- Dimensión: A1
- Detalle: `_trae_codigo_del_pr` solo reconoce dos formas: la cadena literal `refs/pull/` dentro de un `run:` (línea 671) o un `actions/checkout` cuyo `ref:`/`repository:` contenga la subcadena `head` (líneas 673-680). Traer el head del PR por SHA no usa ninguna de las dos, así que `pull-request-target-con-permisos` nunca dispara.
Reproducción (hecha): workflow con `on: pull_request_target`, un job con `permissions: {contents: write, pull-requests: write}`, `uses: actions/checkout@<sha40>  # v7.0.1` y un paso
```
env:
  SHA: ${{ github.event.pull_request.head.sha }}
run: |
  git fetch origin "$SHA" && git checkout FETCH_HEAD
  npm ci
```
`cuatris guardarrailes b.yml` → «sin hallazgos en 1 ruta(s)», rc=0. Es A1/A3 exacto: ejecución del código del PR con token de escritura, y el guardarraíl lo aprueba.
- Fix propuesto: En `_trae_codigo_del_pr`, considerar también todo `run:` que mencione `git fetch`/`git checkout`/`gh pr checkout` junto a `github.event.pull_request.head` (o a una variable que lo reciba por `env:`).


### F1.3 [alta] `interpolacion-peligrosa` solo mira `run:`, no `with:` ni `if:`

- Archivo: `tools/cuatris/validar/guardarrailes.py:570`
- Dimensión: A1
- Detalle: `_revisar_interpolaciones` itera los pasos y solo examina `paso.get("run")` (líneas 575-577). Las entradas `with:` de una acción no se miran nunca, y `with.script` de `actions/github-script` es un sumidero de ejecución de JavaScript tan directo como un `run:` (también quedan sin mirar `if:` y los `with:` de acciones que evalúan plantillas).
Reproducción (hecha): workflow con `on: pull_request_target`, job con `permissions: {contents: write}` y
```
- uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea  # v7.0.1
  with:
    script: core.setOutput('t', `${{ github.event.pull_request.title }}`)
```
`cuatris guardarrailes a.yml` → «sin hallazgos en 1 ruta(s)», rc=0. Un título de PR con un backtick cierra la plantilla y ejecuta código con el token del job.
- Fix propuesto: En `_revisar_interpolaciones`, aplicar `INTERPOLACIONES_PELIGROSAS` a todas las cadenas del paso (`run`, `if` y cada valor de `with`), no solo a `run`.


### F1.4 [alta] Nada valida ni rechaza archivos que no sean `*.json` dentro de `data/`, y el deploy los publica

- Archivo: `.github/workflows/pr-datos.yml:131`
- Dimensión: A1
- Detalle: Tanto el gate (`pr-datos.yml:131`) como el deploy (`deploy.yml:57`) arman la lista con `find data -type f -name '*.json'`: cualquier otro archivo dentro de `data/` no pasa por C1/C2/C3. El deploy después hace `cp -R data app/dist/data` (deploy.yml:90) sin filtrar, y la SPA sirve esa carpeta desde su mismo origen (`app/src/datos/cargar.ts:61`, `${import.meta.env.BASE_URL}data/`).
Reproducción: agregar `data/v1/horarios/nota.html` con `<script>fetch('//x/?'+localStorage.plan)</script>`. `find data -type f -name '*.json'` no lo lista → `cuatris fmt --check` y `cuatris validar` ni lo abren → `validar-datos` verde; el triage lo marca `necesita-humano` pero eso no hace fallar ningún check. Si se mergea, queda servido en `https://sebascaules.github.io/Cuatris/data/v1/horarios/nota.html`, mismo origen que la SPA y su `localStorage` (A5).
- Fix propuesto: En el paso de validación de `pr-datos.yml` y en el de `deploy.yml`, fallar si `find data -type f ! -name '*.json'` devuelve algo.


### F1.5 [alta] Los tres guardias de ruta de `es_ruta_de_datos` no tienen ni un test

- Archivo: `tools/cuatris/validar/triage_pr.py:160-162 (tests: tests/tools/test_triage_pr.py:89-102)`
- Dimensión: A5
- Detalle: La tabla negativa de `test_rutas_que_no_son_datos` cubre extensión, subdirectorio, mayúsculas y data/v2, pero ninguna ruta con `\`, con `/` inicial ni con un segmento `..`. Mutación aplicada sobre una copia del repo: `if not ruta or ruta.startswith("/") or "\\" in ruta:` → `if not ruta:` (P8) y `("", ".", "..")` → `("", ".")` (P4); en los dos casos `pytest tests/tools -q` da 366 passed. El guardia del backslash es el único que sostiene la regla: comprobado en el intérprete, `es_ruta_de_datos('data/v1/horarios/..\\..\\.github\\workflows\\x.json')` da False con el código real y True sin ese guardia, porque `_coincide` parte solo por `/` y `fnmatch` acepta `..\..\.github\workflows\x.json` contra `*.json`. Es decir: se puede borrar la defensa del vector A12 y el gate sigue verde.
- Fix propuesto: Agregar a la tabla de `test_rutas_que_no_son_datos` los casos `data/v1/horarios/..\\..\\.github\\workflows\\x.json`, `data/v1/horarios/../../x.json`, `/data/index.json` y `data//index.json`.


### F1.6 [media] `decidir` recalcula la clase con una regla más débil que el triage

- Archivo: `.github/workflows/pr-datos.yml:211`
- Dimensión: A1
- Detalle: El heredoc de `decidir` (líneas 211-219) deriva la clase usando **solo** `es_ruta_de_datos`. El triage rechaza además por modo de git, puntero LFS, `.gitattributes`/`.gitmodules` y colisión de mayúsculas (triage_pr.py:275-305); nada de eso se reaplica. Las dos implementaciones de «clase» discrepan, y la del comentario es la que ve el humano que mergea.
Reproducción (hecha): rama que solo hace `git update-index --chmod=+x data/v1/vocabulario.json`.
- `cuatris pr triage --base main --head <rama>` → `"clase": "necesita-humano"`, motivo «el PR lo deja como un archivo ejecutable», rc=1.
- El mismo fragmento Python de `decidir` sobre `data/v1/vocabulario.json` imprime `DATOS`.
Con `RESULTADO=success`, el comentario dice «Clase del PR según el allowlist de rutas: `DATOS`» y «Este PR cumple las condiciones automáticas». Es además el punto donde el plan engancha el auto-merge del Sprint 3 (pr-datos.yml:247-250).
- Fix propuesto: Que `decidir` compare la clase que recalcula contra `steps.triage.outputs.clase` y falle si difieren (o publique la más restrictiva de las dos).


### F1.7 [media] `test_gitattributes` pasa aunque se borre la regla que dice comprobar

- Archivo: `tests/tools/test_triage_pr.py:205-210 (regla en tools/cuatris/validar/triage_pr.py:75 y 278)`
- Dimensión: A5
- Detalle: El test afirma `any(".gitattributes" in motivo for motivo in resultado.motivos)`, pero el motivo del allowlist también contiene el texto «.gitattributes» (««.gitattributes» no esta en el allowlist de rutas de datos…»). Mutación verificada: `ARCHIVOS_DE_GIT = (".gitattributes", ".gitmodules")` → `ARCHIVOS_DE_GIT = ()` y `pytest tests/tools -q` da 366 passed. La regla específica de archivos de git queda sin ningún test que la distinga del rechazo genérico, y `.gitmodules` no aparece en ninguna fixture.
- Fix propuesto: Afirmar el motivo exacto (`any("cambia como git materializa el arbol" in m for m in resultado.motivos)`) y agregar el caso `.gitmodules`.


### F1.8 [baja] Borrar todos los horarios publicados se clasifica `DATOS` y pasa los dos checks en verde

- Archivo: `tools/cuatris/validar/triage_pr.py:65`
- Dimensión: A1
- Detalle: `MODOS_ADMITIDOS = (MODO_AUSENTE, MODO_ARCHIVO)` admite la baja (`000000`) como modo válido, y ninguna capa de Sprint 1 mira magnitud ni bajas (C4 queda para el Sprint 3).
Reproducción (hecha) sobre un repo con `data/v1/horarios/2026-2C.json` publicado e indexado:
1. `git rm data/v1/horarios/2026-2C.json`
2. dejar `"horarios": []` en `data/index.json` y recanonizar.
3. `cuatris pr triage --base <antes> --head <después>` → `"clase": "DATOS"`, `"motivos": []`, rc=0.
4. Validación en cuarentena del árbol resultante → rc=0 (sin hallazgos).
Los dos checks requeridos quedan verdes y el comentario dice «Este PR cumple las condiciones automáticas» para un PR que despublica el cuatrimestre entero; el deploy publica después un índice vacío.
- Fix propuesto: Mientras C4 no exista, que el triage rechace como `necesita-humano` todo cambio con `modo_destino == MODO_AUSENTE` (cualquier baja dentro de `data/`).

- **DECISIÓN N0: hasta que exista C4 (Sprint 2), cualquier baja o borrado dentro de data/ es `necesita-humano`.**


### F1.9 [baja] Los guardarraíles no alcanzan las acciones locales ni los subdirectorios de `.github`

- Archivo: `tools/cuatris/validar/guardarrailes.py:609`
- Dimensión: A1
- Detalle: `_revisar_acciones` saltea con `continue` todo `uses:` que empiece por `./` (línea 609) y `revisar_ruta` no recorre subdirectorios: solo toma los `.yml`/`.yaml` hijos directos del directorio (líneas 761-764). El CI invoca únicamente `cuatris guardarrailes .github/workflows` (ci-codigo.yml:60). Consecuencia: un `.github/actions/<lo-que-sea>/action.yml` —donde caben `run:` con `${{ github.event.* }}`, `uses:` sin SHA y referencias a `secrets.`— no lo revisa nadie, ni siquiera indirectamente a través del workflow que lo invoca, porque el `uses: ./...` se saltea antes de cualquier chequeo. Hoy no existe ese directorio, así que es una puerta abierta, no una brecha actual.
- Fix propuesto: Que `revisar_ruta` recorra recursivamente y que el CI corra `cuatris guardarrailes .github`, aplicando las reglas de pasos también a los `action.yml` locales.


### F1.10 [baja] `/.gitattributes` no está bajo CODEOWNERS

- Archivo: `.github/CODEOWNERS:2`
- Dimensión: A1
- Detalle: CODEOWNERS cubre `/.github/`, `/tools/`, `/schemas/`, `/vendor/`, `/tests/fixtures/`, `/politica.json` y `/data/v1/planes/`, pero no `/.gitattributes` ni `/.gitmodules`, que son exactamente los archivos que el triage describe como «cambian cómo git materializa el árbol» (triage_pr.py:75-76) y la palanca del finding alto de `git archive`. Un PR que agrega `.gitattributes` queda `necesita-humano` —lo que no hace fallar ningún check— y no exige revisión de code owner.
- Fix propuesto: Agregar `/.gitattributes @SebasCaules` y `/.gitmodules @SebasCaules` a `.github/CODEOWNERS`.


## F2 — Validador y contrato (12 findings)

**Ownership:** `tools/cuatris/validar/__init__.py`, `tools/cuatris/validar/triage.py`, `tools/cuatris/validar/invariantes.py`, `tools/cuatris/validar/esquema.py`, `schemas/v1/**`, `tests/tools/test_esquema.py`, `tests/tools/test_triage.py`, `tests/tools/test_invariantes.py`, `tests/fixtures/**`, `docs/contrato.md`, `entregables/sprint-1/CONTRATO-v1.md`, `app/src/datos/ejemplo/**` (corrige la fixture para que valide con C3; si cambias sus hashes, regenera `index.json` de ejemplo con `cuatris indice actualizar --data app/src/datos/ejemplo`).


### F2.1 [alta] Ningún validador exige que un archivo de data/v1/ declare contrato 1.x

- Archivo: `tools/cuatris/validar/__init__.py:125`
- Dimensión: A2
- Detalle: CONTRATO-v1.md:9 fija `"contrato": "1.0.0"` y docs/contrato.md:115-120 declara que un cambio major «crea `data/v2/` y `schemas/v2/`, y no toca v1». Ningún validador lo comprueba: el patrón `^\d+\.\d+\.\d+$` de los cinco schemas acepta cualquier SemVer y C3 no mira el campo. Reproducción: copié `data/` al scratchpad, puse `"contrato": "9.9.9"` en `v1/horarios/2026-2C.json`, recalculé los hashes del índice y corrí `cuatris validar --data <copia> <copia>/index.json <copia>/v1/horarios/2026-2C.json` → rc 0, sin un solo hallazgo (solo los warnings habituales de código fuera del plan). `cuatris fmt --check` también pasa. Con eso el archivo atraviesa `pr-datos.yml:137-138` y el paso «Revalidar data/ completo» de `deploy.yml:63-64`, se publica en Pages, y recién ahí `cargar.ts:94` lanza `ContratoIncompatible` y todos los visitantes ven la pantalla de error: la SPA solo lee `MAJOR_SOPORTADO = 1`. El contrato pone el corte de compatibilidad en el directorio (`v1/`) y el único gate que lo custodia no lo mira.
- Fix propuesto: En `validar_archivo`, antes de C3, emitir ERROR si el major de `datos["contrato"]` no es 1 para cualquier archivo bajo `v1/` (y para `index.json`), con una fixture nueva en `tests/fixtures/deben-fallar/`.


### F2.2 [media] index.json puede mentir sobre período y vigencia sin que ningún gate lo note

- Archivo: `tools/cuatris/validar/triage.py:222`
- Dimensión: A2
- Detalle: `revisar_index` solo compara los `hash` contra el archivo referido; no comprueba que `horarios[].periodo`, `desde` y `hasta` coincidan con el `periodo.id/desde/hasta` del archivo apuntado, pese a que `indice.py:13-14` declara que «el archivo manda sobre el indice» y CONTRATO-v1.md:159-160 hace depender de esas fechas qué período está activo. Ningún workflow vuelve a correr `cuatris indice actualizar` para diffear (ci-codigo.yml no lo invoca; pr-datos.yml:137-138 y deploy.yml:63-64 solo corren `fmt --check` y `validar`). Reproducción: en una copia de `data/` cambié a mano `index.json` → `horarios[0]` de `{periodo: "2026-2C", desde: "2026-07-26", hasta: "2026-12-31"}` a `{periodo: "2020-1C", desde: "2020-01-01", hasta: "2020-12-31"}` sin tocar el archivo de horarios ni el hash; `cuatris validar --data <copia> <copia>/index.json` → rc 0, «sin hallazgos». Con eso publicado, `periodoActivo` (cargar.ts:204) no encuentra nada activo ni futuro y la SPA se queda sin período, o —si las fechas apuntan a otro lado— `cargarHorarios` entrega un archivo cuyo `periodo.id` no es el pedido y el motor lanza `HorariosDeOtroPeriodo` (N0-13).
- Fix propuesto: Agregar a C1/C3 una regla que compare cada entrada de `index.horarios` contra el `periodo` del archivo referido y falle con ERROR si difieren.


### F2.3 [media] periodo.id no se comprueba contra anio y cuatrimestre

- Archivo: `tools/cuatris/validar/invariantes.py:194`
- Dimensión: A2
- Detalle: CONTRATO-v1.md:51 y docs/contrato.md:25 fijan la regla `periodo.id = <anio>-<cuatrimestre>`. Es exactamente lo que un JSON Schema no puede expresar —los tres campos tienen patrones independientes— y por eso le tocaría a C3, pero `_revisar_horarios` (líneas 194-217) no la corre: sus seis reglas son identidades, fechas de cursos, franjas, sedes, colisiones y códigos contra el plan. `grep -rn "cuatrimestre\|anio" tools/cuatris/validar/` solo devuelve `invariantes.py:594`, que es la regla de `cuatrimestre_sugerido` del plan, otra cosa. Reproducción: en una copia de `data/v1/horarios/2026-2C.json` puse `periodo.anio = 2019` y `periodo.cuatrimestre = "1C"` dejando `periodo.id = "2026-2C"`, recalculé hashes y corrí `cuatris validar --data <copia> <copia>/v1/horarios/2026-2C.json` → rc 0, ningún hallazgo. No hay tampoco fixture en `tests/fixtures/deben-fallar/` para este caso.
- Fix propuesto: Agregar en `_revisar_horarios` una regla `periodo-incoherente` (ERROR) que exija `id == f"{anio}-{cuatrimestre}"`, con su fixture en `deben-fallar/`.


### F2.4 [media] Fechas imposibles atraviesan las tres capas del validador

- Archivo: `tools/cuatris/validar/invariantes.py:309`
- Dimensión: A2
- Detalle: CONTRATO-v1.md:13 exige que las fechas sean `^\d{4}-\d{2}-\d{2}$` «además válida como fecha». Solo el regex se aplica: los cinco schemas usan el patrón y nada más, y `_revisar_fechas_de_cursos` compara los strings lexicográficamente contra el período, sin construir una fecha. El único `dt.date.fromisoformat` del proyecto está en `indice.py:65` y valida el argumento `--publicado`, no los datos. Reproducción: en una copia de `data/v1/horarios/2026-2C.json` puse `cursos[0].hasta = "2026-09-31"` (septiembre no tiene 31, y cae dentro del período, así que la comparación por string no lo detecta) y `fuente.capturado = "2026-02-30"`; `cuatris validar --data <copia> <copia>/v1/horarios/2026-2C.json` → rc 0, ningún hallazgo. `tests/fixtures/deben-fallar/` tiene `fecha-con-hora.json` pero ningún caso de fecha inexistente. El dato viaja a la SPA, donde `periodoActivo` y la vigencia de los cursos comparan strings y tratan «31 de septiembre» como un día real.
- Fix propuesto: Agregar a C1 (`triage.revisar_datos`) o a C3 una regla `fecha-invalida` que corra `datetime.date.fromisoformat` sobre todo string que cumpla el patrón de fecha, con su fixture en `deben-fallar/`.


### F2.5 [media] «ocupacion fuera del hash estable» es una garantía que el código no cumple

- Archivo: `docs/contrato.md:44`
- Dimensión: A2
- Detalle: docs/contrato.md:44-45 justifica la separación `cupo`/`ocupacion` diciendo que existe «para que dos capturas independientes del mismo cuatrimestre produzcan el mismo hash: habilita la corroboración entre dos personas», y `schemas/v1/horarios.schema.json:112` repite que `ocupacion` es «opcional y fuera del hash estable». No hay ningún hash estable en el repositorio: `canon.hash_canonico` (canon.py:97) hashea el texto canónico del archivo entero, `ocupacion` incluida, y es el único hash que existe — es el que escribe `indice.py:162` y el que comprueba `triage.revisar_index:249`. `grep -rni "ocupacion" tools/cuatris/canon.py tools/cuatris/indice.py tools/cuatris/validar/triage.py` no devuelve nada. Dos capturas del mismo cuatrimestre en días distintos difieren en `ocupacion.inscriptos` y `ocupacion.al` —y además en `fuente.capturado`, que tampoco queda fuera— así que dan hashes distintos siempre y la corroboración prometida no se puede hacer. El riesgo es que alguien construya el flujo de corroboración del Sprint 2 sobre una propiedad que no se cumple.
- Fix propuesto: O bien implementar `hash_estable()` ignorando `ocupacion` y `fuente.capturado` y publicarlo aparte, o bien borrar la promesa de docs/contrato.md:44-45 y de la `description` del schema.

- **DECISIÓN N0: NO implementar `hash_estable` en este sprint; borrar la promesa de docs/contrato.md y de la description del schema, y dejar una nota «llega con la replicación independiente (Sprint 3)».**


### F2.6 [baja] El techo de 8 h por bloque es un ERROR duro que ningún contrato documenta

- Archivo: `tools/cuatris/validar/invariantes.py:36`
- Dimensión: A2
- Detalle: `DURACION_MAXIMA_MINUTOS = 8 * 60` produce el ERROR `bloque-demasiado-largo` en `_revisar_franjas` (invariantes.py:378-387), con su fixture `tests/fixtures/deben-fallar/c3-bloque-demasiado-largo.json` (un bloque 08:00–17:00). Ni CONTRATO-v1.md:62 ni docs/contrato.md:39 mencionan ese límite: ambos documentan solo «`desde < hasta`, entre 07:00 y 23:00 (C3)», o sea una ventana de 16 h. Reproducción: un bloque real de seminario intensivo de sábado 09:00–18:00 cumple las dos reglas escritas y es rechazado con ERROR por una regla que nadie declaró; en `data/v1/horarios/2026-2C.json` el bloque más largo es de 3 h (30.28 com. A, 19:00–22:00), así que ninguna fixture de `deben-pasar/` toca el umbral y nadie lo descubre hasta que aparezca el dato. Es justo el falso positivo crónico que docs/contrato.md:92-93 declara inadmisible («si un validador nuevo rechaza uno de estos, el validador está mal, no el dato») y que la amenaza A10 y la decisión G-04 del EXEC_STATE ya obligaron a corregir una vez con el caso `sabado`.
- Fix propuesto: Documentar el techo de 8 h en la fila de `bloques[].desde/hasta` de CONTRATO-v1.md y docs/contrato.md, o bajar `bloque-demasiado-largo` de ERROR a WARNING.

- **DECISIÓN N0: documentar el techo de 8 h en CONTRATO-v1.md y docs/contrato.md (queda como ERROR).**


### F2.7 [baja] app/src/datos/ejemplo/ es un corpus del contrato que ningún gate valida y que hoy falla C3

- Archivo: `app/src/datos/ejemplo/v1/abreviaciones.json:1`
- Dimensión: A2
- Detalle: Los cinco JSON de `app/src/datos/ejemplo/` tienen forma de documento del contrato (su LEEME.md:6 afirma que «todo valor literal sale de CONTRATO-v1.md; no hay datos inventados») y son el corpus contra el que corren `cargar.test.ts`, `App.test.tsx` y los `satisfies` de `tipos.test.ts`. Ningún workflow los pasa por el validador: `ci-codigo.yml` corre pytest, ruff, guardarrailes, typecheck, lint, vitest y build, ninguno invoca `cuatris validar`; `pr-datos.yml:137-138` y `deploy.yml:63-64` solo miran `data/`. Reproducción: `cuatris validar --data app/src/datos/ejemplo app/src/datos/ejemplo/index.json app/src/datos/ejemplo/v1/*.json app/src/datos/ejemplo/v1/planes/*.json app/src/datos/ejemplo/v1/horarios/*.json` devuelve dos ERROR de C3 hoy mismo — «el codigo «72.42» tiene abreviacion pero no existe en el plan» y lo mismo con «72.44» (regla `abreviacion-sin-materia`, invariantes.py:887) — más un warning `materia-sin-abreviacion` por 72.45. El corpus que los tests usan como sustituto de los datos reales no cumple el contrato que dice encarnar, y no hay gate que lo diga.
- Fix propuesto: Agregar un paso `cuatris validar --data app/src/datos/ejemplo …` al job python de ci-codigo.yml y corregir la fixture (abreviaciones solo de códigos presentes en su plan).


### F2.8 [baja] «minors vacío en las obligatorias» no lo aplica ningún validador

- Archivo: `tools/cuatris/validar/invariantes.py:735`
- Dimensión: A2
- Detalle: CONTRATO-v1.md:111 y docs/contrato.md:60 dicen que `materias[].minors` es un «array de siglas de `minors[]`; vacío para obligatorias». `_revisar_minors` solo comprueba que cada sigla usada esté declarada en `minors[]`: no mira el `ciclo` de la materia, y el schema tampoco puede (planes.schema.json:55-61 es un array de `sigla_minor` sin condicional). Reproducción: en una copia de `data/v1/planes/S10-Rev23.json` puse `minors: ["CD", "IA"]` en 31.08 (ciclo `basico`), recalculé los hashes y corrí `cuatris validar --data <copia> <copia>/v1/planes/S10-Rev23.json` → rc 0, ningún hallazgo. Consecuencia concreta: `FilaMateria.tsx:136` pinta las siglas de `materia.minors` sin filtrar por ciclo, así que una obligatoria mal cargada aparecería en 13c con chips de minor y sumaría a los créditos del minor en `progreso.ts:253`.
- Fix propuesto: Extender `_revisar_minors` con un ERROR cuando una materia de ciclo distinto de `electiva` declara `minors` no vacío.


### F2.9 [baja] dictado_conjunto admite códigos inexistentes y silencia colisiones de aula

- Archivo: `tools/cuatris/validar/invariantes.py:434`
- Dimensión: A2
- Detalle: `_dictado_conjunto` arma el mapa simétrico de exenciones que `_revisar_colisiones_de_aula` (línea 472) usa para saltear pares de cursos; no comprueba que los códigos listados correspondan a cursos del archivo, y CONTRATO-v1.md:56 solo pide «array de códigos». Reproducción: en una copia de `data/v1/horarios/2026-2C.json` puse `cursos[0].dictado_conjunto = ["99.99"]`, recalculé hashes y corrí `cuatris validar --data <copia> …` → rc 0, ningún hallazgo, pese a que 99.99 no existe en el archivo ni en el plan. El efecto real es el opuesto al que parece: `dictado_conjunto` es la única lista blanca del ERROR `colision-de-aula`, así que un código mal tipeado ahí desactiva la detección para el par que se pretendía eximir y nadie se entera —a diferencia de `codigo-fuera-del-plan`, que al menos advierte.
- Fix propuesto: Emitir WARNING (ERROR cuando exista `no-plan.json`) por cada código de `dictado_conjunto` que no sea un `cursos[].codigo` del mismo archivo.


### F2.10 [baja] El vocabulario de ejemplo trae sdf y el publicado no, contra N0-9

- Archivo: `app/src/datos/ejemplo/v1/vocabulario.json:13`
- Dimensión: A2
- Detalle: N0-9 fija que `vocabulario.json` lleva «solo las sedes observadas en el material (`rectorado`, `sdt`); `sdf` entra cuando aparezca en una captura», y `data/v1/vocabulario.json` cumple con dos sedes. La fixture de la app declara tres: `rectorado`, `sdt` y `sdf` (líneas 12-15), copiando el ejemplo de CONTRATO-v1.md:134-137, que es anterior a la decisión. El resultado es que la regla C3 `sede-desconocida` (invariantes.py:423) tiene dos vocabularios distintos según el corpus, y que el corpus de los tests es justamente el permisivo: si el scraper emitiera `sede: "sdf"` —el mapeo existe en `tools/cuatris/sga/normalizar.py:76`, cuyo comentario afirma que «los ids son los de `data/v1/vocabulario.json`», lo cual es falso para `sdf`— los tests de la app pasarían y solo fallaría el validador sobre `data/`.
- Fix propuesto: Quitar la sede `sdf` de `app/src/datos/ejemplo/v1/vocabulario.json` y anotar en CONTRATO-v1.md §4 que el ejemplo de tres sedes quedó superado por N0-9.


### F2.11 [baja] C1 abre rutas arbitrarias del runner antes de que C2 valide el patrón de `archivo`

- Archivo: `tools/cuatris/validar/triage.py:233`
- Dimensión: A1
- Detalle: `revisar_index` hace `destino = base / relativa` y `canon.hash_canonico(destino)` (líneas 231-233) con `relativa` tomado tal cual del JSON del PR, y corre **antes** que el schema (`tools/cuatris/validar/__init__.py:123-125`), que es quien impone `^v1/[^/]+\.json$`.
Reproducción (hecha): `data/index.json` con `"vocabulario": {"archivo": "../../../../../../etc/passwd", "hash": "sha256:000…"}` →
`ERROR data/index.json: «../../../../../../etc/passwd» no se pudo leer: JSON invalido: Expecting value (linea 1, columna 1)`
y la línea de `^v1/…` aparece después. El archivo se abre igual. No hay exfiltración (el mensaje no trae contenido) ni escritura, y el job corre con `permissions: {}`, pero C1 no debería seguir un `..` que el PR escribe.
- Fix propuesto: En `revisar_index`, saltear con un hallazgo propio toda `archivo` que no sea relativa y contenida en el directorio de datos (`(base / relativa).resolve().is_relative_to(base.resolve())`) antes de hashear.


### F2.12 [baja] `PROFUNDIDAD_MAXIMA` es código muerto para el vector A9 y el fallo aborta el lote

- Archivo: `tools/cuatris/validar/triage.py:20`
- Dimensión: A1
- Detalle: El tope `PROFUNDIDAD_MAXIMA = 12` se comprueba en `revisar_datos` (línea 166), es decir **después** de que `canon.cargar_texto` ya parseó el documento entero. Un JSON con más de ~1000 niveles revienta antes en el parser con `RecursionError`, que no es `canon.ErrorCanonico` y por lo tanto no lo atrapa `revisar_texto` (líneas 96-100).
Reproducción (hecha): `python -c "import json;d=[];x=d;[ (lambda y: (x.append(y),))(…) for _ in range(3000)];…"` generando 3000 arrays anidados, y luego `cuatris validar hondo.json voc.json` →
```
error: maximum recursion depth exceeded
(vuelva a correr con --traceback para ver el detalle completo)
```
rc=1 (falla cerrado, bien) pero `voc.json` no se valida: el lote se corta en el primer archivo, al revés de lo que fija N0-8 para los archivos ilegibles.
- Fix propuesto: Poner un tope de profundidad sobre el texto antes de parsear (contar `[`/`{` anidados en `revisar_texto`) y atrapar `RecursionError` como un hallazgo del archivo, sin cortar el lote.


## F3 — Motor de dominio y estado (11 findings)

**Ownership:** `app/src/motor/**`, `app/src/estado/planUsuario.ts`, `app/src/estado/planUsuario.test.ts`.


### F3.1 [alta] «Desaprobada» se importa como aprobada

- Archivo: `app/src/motor/historia.ts:25`
- Dimensión: A3
- Detalle: `PALABRAS` usa la raíz `"aprobad"` y la busca con `normalizada.includes(candidata.raiz)` (línea 64). «desaprobada» contiene «aprobad», así que una materia reprobada entra como `aprobada`; lo mismo «No aprobada», y «Ausente»/«Libre» caen en el default documentado («sin palabra clave se asume aprobada»). Reproducción ejecutada: `parsearHistoria("93.58 Álgebra 9 Aprobada\n72.03 Introducción a la Informática 3 Aprobada\n72.31 Programación Imperativa 9 Desaprobada\n93.26 Análisis Matemático I 6 No aprobada\n93.59 Matemática Discreta 6 Ausente", PLAN)` devuelve `noReconocidas: []` y las cinco en `{estado:"aprobada"}`; `creditosAprobados` da 33 en vez de 12, y con 72.31 falsamente aprobada `motivosBloqueo("72.33","2026-2C",...)` devuelve `[]` y `estadoMateria("72.33",...)` da `disponible` cuando debería estar bloqueada. Es un defecto del emparejamiento por substring, independiente de la muestra que S-01 espera.
- Fix propuesto: Probar primero las raíces negativas («desaprobad», «no aprobad», «ausente», «libre») y mandar esas líneas a `noReconocidas` en vez de a `reconocidas`.


### F3.2 [alta] Correlativa que se está cursando nunca destraba

- Archivo: `app/src/motor/creditos.ts:114`
- Dimensión: A3
- Detalle: `aprobadasAlEmpezar` solo suma `itemsAprobados` (estado `aprobada`) y lo planificado en períodos anteriores; una materia que la historia trae como `regular` o `cursando` no entra nunca, en ningún período futuro. Reproducción ejecutada con `historia = {"72.31":{estado:"regular"}}` y `periodos = {"2026-2C": []}`: `motivosBloqueo("72.33","2026-2C",u,PLAN)` → `[{tipo:"correlativa",codigo:"72.31",estado:"falta"}]`; `seDestrabaEn("72.33",u,PLAN,"2026-2C")` → `null` y `seDestrabaEn("72.33",u,PLAN,"2030-1C")` → `null`. En 13f (`MotivosBloqueo.tsx:104` y `:167`) eso se imprime como «Correlativa 72.31 Programación Imperativa · todavía no la aprobaste» y «No se destraba con lo planificado hasta ahora.», sin botón de salida, para el caso más común: el estudiante que pega la historia mientras cursa la correlativa. Contradice la propia regla optimista del motor, que sí adelanta lo planificado.
- Fix propuesto: En `aprobadasAlEmpezar`, agregar también los códigos cuya historia es `regular`/`cursando` cuando `periodo` es posterior al primer período del plan.

- **DECISIÓN N0-15: en la simulación optimista, una materia con historia `cursando` o `regular` cuenta como aprobada para todo período posterior al período activo (o al primero del plan si no hay activo); en el período activo mismo, no.**


### F3.3 [alta] La regla «título por ítems» se comprueba contra una fixture que repite el filtro del código

- Archivo: `app/src/motor/fixtures/reales.ts:66-73 (contra app/src/motor/progreso.ts:97-102; tests: app/src/motor/progreso.test.ts:12-42, 75-83)`
- Dimensión: A5
- Detalle: `codigosDelCiclo` calcula `PLAN.materias.filter(m => m.vigente && m.ciclo === ciclo).map(...).sort()`, que es literalmente el mismo predicado que `itemsDeCiclos`. Los tests de títulos arman la historia con ese resultado y después afirman `faltanItems === []`: expectativa y código salen de la misma expresión. Mutación verificada: en `itemsDeCiclos` cambiar `.sort();` por `.sort().slice(1);` (pierde 12.09 Química, el primero de los 28 ítems vigentes del básico) y `npx vitest run` da 484 passed, 0 failed. Con esa mutación Analista se declara alcanzado sin Química. Ningún test fija cuántos ítems tiene cada ciclo ni nombra uno concreto salvo 94.51.
- Fix propuesto: Anclar la regla con literales: `expect(BASICO).toHaveLength(28)` y `expect(BASICO).toContain("12.09")`, y un caso que quite 12.09 y espere `faltanItems === ["12.09"]`.


### F3.4 [media] Una materia ya aprobada sigue chocando en la grilla

- Archivo: `app/src/motor/horarios.ts:137`
- Dimensión: A3
- Detalle: `bloquesDelPeriodo` recorre `planUsuario.periodos[periodo]` sin mirar la historia, y `materiasEnGrilla` (`paginas/PaginaPlan/armado.ts:141`) hace lo mismo; `marcarAprobada` (`estado/planUsuario.ts:340`) no quita la materia de los períodos planificados. Reproducción ejecutada con `periodos = {"2026-2C":[{codigo:"72.44",comision:"S"},{codigo:"93.18",comision:"A"}]}`: antes de marcar, `choques("2026-2C",u,H).length === 1` (lunes 15:00–16:00); después de agregar `"72.44":{estado:"aprobada"}` a la historia, sigue siendo `1`, la grilla sigue devolviendo `[["72.44",undefined],["93.18","planificada"]]` y `creditosDelPeriodo("2026-2C",...)` sigue contando sus 6 créditos. El usuario ve «▲ 1» y el aviso de conflicto contra una materia que ya aprobó.
- Fix propuesto: Saltear en `bloquesDelPeriodo` y en `materiasEnGrilla` las materias cuya historia ya es `aprobada` (o quitarlas de los períodos al marcarlas).

- **DECISIÓN N0: al marcar una materia como aprobada se la quita de todos los períodos planificados (acción del estado), y además la grilla saltea las aprobadas.**


### F3.5 [media] «Habilita» lista materias que ya no existen en el plan

- Archivo: `app/src/motor/estado.ts:194`
- Dimensión: A3
- Detalle: `habilita` filtra por `correlativas.includes(codigo)` sin mirar `materia.vigente`, mientras que 13c sí filtra vigencia (`componentes/PanelAgregar/resultados.ts:299`). Resultado: la ficha 13e promete destrabar materias que el panel nunca va a ofrecer. Reproducción ejecutada sobre el plan real: `habilita("72.44", PLAN)` → `["72.89","73.80","73.81","73.83","73.89"]`, y 73.81 «Ciberseguridad Ofensiva y Defensiva» y 73.83 «Gestión estratégica de la Ciberseguridad» tienen `vigente:false`; `habilita("72.27", PLAN)` mete cinco no vigentes (73.63, 73.67, 73.68, 73.69, 74.61). `FichaMateria.tsx:283` las imprime tal cual bajo «HABILITA», con nombre y todo. 72.44 es justo la materia del recorrido de humo («cripto»).
- Fix propuesto: Agregar `materia.vigente &&` al filtro de `habilita` en `app/src/motor/estado.ts:195`.


### F3.6 [media] La detección de cambio de sede (↕) no tiene ningún caso negativo

- Archivo: `app/src/motor/horarios.ts:243 (tests: app/src/motor/horarios.test.ts y fixtures/sedes-consecutivas.ts)`
- Dimensión: A5
- Detalle: Todos los casos de `paresConCambioDeSede` son positivos: bloques pegados en sedes distintas. Mutación verificada: `if (sedeUno === null || sedeOtro === null || sedeUno === sedeOtro)` → `if (sedeUno === null || sedeOtro === null)`, o sea «dos bloques pegados cualesquiera con sede son un ↕»; `npx vitest run` da 484 passed. Un motor que avisa «Cambiás de sede» entre dos bloques consecutivos en Rectorado pasa la suite entera, y el ↕ es justamente lo que el mockup dibuja en 13b/13d. (No re-litiga N0-12: la fixture sintética se acepta; lo que falta es el caso que NO es ↕.)
- Fix propuesto: Agregar a `horarios.test.ts` un caso con dos bloques consecutivos en la misma sede y afirmar `cambiosDeSede(...)` vacío.


### F3.7 [media] El umbral de `creditos_requeridos` no tiene caso de borde

- Archivo: `app/src/motor/estado.ts:101-110 (tests: app/src/motor/estado.test.ts)`
- Dimensión: A5
- Detalle: Hay tests de «faltan créditos» y de «alcanzan», pero ninguno se para justo en el valor. Mutación verificada: `if (tienes < materia.creditos_requeridos)` → `if (tienes < materia.creditos_requeridos - 1)`; `npx vitest run` da 484 passed. Con esa mutación una materia que exige 120 créditos se desbloquea con 119, que es exactamente el error de un carácter que esta regla puede sufrir (el plan trae umbrales de 51, 96, 120, 140, 144, 160, 168 y 192).
- Fix propuesto: Agregar dos casos vecinos: con `creditosAlEmpezar` igual al umbral (sin motivo) y con umbral menos uno (motivo `creditos` con `tienes` exacto).


### F3.8 [media] El orden de relevancia de `buscar` solo está probado en un escalón

- Archivo: `app/src/motor/buscar.ts:21-27 (tests: app/src/motor/buscar.test.ts:19-32)`
- Dimensión: A5
- Detalle: El único test de orden es «cripto» (prefijo antes que nombre). Mutación verificada: intercambiar `abreviacion: 2` y `nombre: 3` en `RELEVANCIA`; `npx vitest run` da 484 passed, aunque el orden documentado es código exacto > prefijo > abreviación > nombre > docente. Caso real disponible en el corpus publicado: «compiladores» coincide con la abreviación de 72.23 y con el nombre de 72.39, sin ser prefijo de ninguna; hoy nada fija que 72.23 vaya primero.
- Fix propuesto: Agregar `expect(buscar("compiladores", PLAN, ABREVIACIONES)).toEqual(["72.23", "72.39"])`.


### F3.9 [baja] `minors().faltan` puede quedar negativo y ningún test lo impide

- Archivo: `app/src/motor/progreso.ts:254 (tests: app/src/motor/progreso.test.ts:119-152)`
- Dimensión: A5
- Detalle: Los tres casos de minors se quedan en 0, 3 y 14 créditos, siempre por debajo del mínimo de 14. Mutación verificada: `faltan: Math.max(0, minor.creditos_minimos - creditos)` → `faltan: minor.creditos_minimos - creditos`; `npx vitest run` da 484 passed. Un estudiante con 18 créditos de CD vería «faltan -4» en el panel de progreso y la suite no lo nota.
- Fix propuesto: Agregar un caso con créditos del minor por encima del mínimo y afirmar `faltan === 0`.


### F3.10 [baja] El horizonte de `seDestrabaEn` (PERIODOS_ADELANTE) no está fijado por ningún test

- Archivo: `app/src/motor/estado.ts:54 y 180 (tests: app/src/motor/estado.test.ts)`
- Dimensión: A5
- Detalle: La constante está documentada como «doce cuatrimestres, seis años» más el actual, o sea 13 períodos mirados. Mutación verificada: `periodosDesde(arranque, PERIODOS_ADELANTE + 1)` → `periodosDesde(arranque, PERIODOS_ADELANTE)`; `npx vitest run` da 484 passed. No hay ningún caso que se destrabe en el último período de la ventana ni uno que caiga justo afuera y devuelva `null`.
- Fix propuesto: Agregar un caso que se destrabe exactamente en el período 13 desde el arranque y otro en el 14 que devuelva `null`.


### F3.11 [baja] Las anclas de las expresiones regulares de forma no están probadas

- Archivo: `app/src/motor/periodos.ts:13 (tests: app/src/motor/periodos.test.ts:22-28) y tools/cuatris/sga/parsers.py:54`
- Dimensión: A5
- Detalle: Las tablas negativas solo traen textos que fallan por el contenido, nunca por texto sobrante alrededor. Mutaciones verificadas: `const PERIODO = /^(\d{4})-([12])C$/` → `/(\d{4})-([12])C/` deja `npx vitest run` en 484 passed (con ella `esPeriodoId("basura 2026-1C basura")` da true); `_CODIGO = re.compile(r"^\d{2}\.\d{2}$")` → `re.compile(r"\d{2}\.\d{2}")` deja `pytest tests/tools -q` en 366 passed (con ella el listado acepta «93.180» y «93.18 bis» como código de materia).
- Fix propuesto: Agregar a cada tabla negativa un caso con texto pegado alrededor: `" 2026-1C"`, `"x2026-1C"`, `"2026-1Cx"` y `"93.180"`.


## F4 — Interfaz (13 findings)

**Ownership:** `app/src/App.tsx`, `app/src/App.test.tsx`, `app/src/componentes/**` (todo menos lo que use F3), `app/src/paginas/**`, `app/src/estado/contexto.tsx`, `app/src/estado/contexto.test.tsx`, `app/src/estilos/**`. No toques `app/src/motor/**` ni `estado/planUsuario.ts`: si necesitas algo del motor (p. ej. `faltanItems` ya existe), úsalo tal como está.


### F4.1 [alta] Un plan guardado corrupto no se avisa ni se puede exportar

- Archivo: `app/src/estado/contexto.tsx:81`
- Dimensión: A2
- Detalle: CONTRATO-v1.md:179-180 es una regla dura del §6: «nunca se descarta un plan guardado sin exportarlo antes», y `almacenamiento.ts:4-6` la promete textualmente («se deja intacto y se devuelve el error; la interfaz ofrece exportarlo antes de empezar de cero»). La interfaz no la ofrece: `contexto.tsx:81-82` publica `errorGuardado` y `crudoGuardado` en el contexto, pero `grep -rn "errorGuardado\|crudoGuardado" app/` devuelve solo su declaración (`contexto.tsx:37,39`), su asignación (`81,82`) y `contexto.test.tsx:11`. Ningún componente los lee: los 15 consumidores de `usePlanUsuario()` (App.tsx:56,214; MenuPlan.tsx:65, que es el que tiene exportar/importar; PaginaPlan.tsx:153; etc.) desestructuran únicamente `plan` y `despachar`. Reproducción: con `localStorage["cuatris.plan_usuario"] = "{\"version\":2}"` (o cualquier JSON que `migrar` rechace), `leer()` devuelve `{estado:"corrupto"}`, `estadoInicial` (contexto.tsx:44) arranca en `planUsuarioInicial()` y `puedeGuardar` (contexto.tsx:68) queda en `false`. El usuario ve un plan vacío sin ningún cartel, lo rellena durante toda la sesión y nada se persiste jamás, porque el `useEffect` de guardado retorna temprano — y al cerrar la pestaña pierde también el trabajo nuevo.
- Fix propuesto: Que `Disposicion`/`App` rendericen una `PantallaEstado` cuando `errorGuardado !== null`, con un botón que descargue `crudoGuardado` antes de permitir seguir.


### F4.2 [alta] Tab hacia una tarjeta fuera de la ventana rompe el carrusel de forma permanente

- Archivo: `app/src/componentes/Carrusel/Carrusel.css:67-68 (y Carrusel.tsx:193-211)`
- Dimensión: A4
- Detalle: Todas las tarjetas quedan en el DOM, ninguna es `inert` ni `aria-hidden` (decisión deliberada, Carrusel.tsx:196-201) y la ventana las recorta con `overflow: hidden`. Recorrido reproducido en el navegador (npm run dev, `data/` real, 1280x900, #/plan con 3 períodos): al enfocar el botón «+ agregar materia» de la tercera tarjeta —que está fuera de la ventana— el navegador hace scroll del contenedor recortado. Medido antes: `.carrusel__ventana.scrollLeft = 0`, pista en x=14, tarjeta 1 en x=14. Después de `focus()`: `scrollLeft = 506`, pista en x=-492, tarjeta 1 en x=-492. En pantalla se ven «1.º cuatrimestre 2027» y «2.º cuatrimestre 2027» mientras los chips siguen marcando «2.º 2026 / 1.º 2027» y el contador sigue diciendo «2 de 3 visibles». El estado visual y el estado del componente quedan desincronizados y no hay forma de volver: la flecha ‹ está deshabilitada (índice 0) y hacer clic en el chip «2.º 2026» deja la tarjeta en x=-492 (scrollLeft sigue en 506). Solo se recupera recargando la página. Con Tab desde la barra superior se llega al mismo estado sin tocar nada raro.
- Fix propuesto: En `.carrusel__ventana` usar `overflow: clip` en vez de `overflow: hidden` (y marcar `inert` las tarjetas fuera de `[indice, indice+visibles)`).


### F4.3 [alta] «Faltan 0 créditos» con el título no alcanzado

- Archivo: `app/src/componentes/PanelProgreso/PanelProgreso.tsx:193`
- Dimensión: A3
- Detalle: `progresoTitulos` calcula bien `faltanItems` (`motor/progreso.ts:176`), pero ese campo no se renderiza en ningún lado: el único consumo en toda la app está en los tests. 13b arma su cierre solo con créditos (`faltanCreditos = requeridos - creditos - planificados`, línea 193, impreso en la línea 262) y 13i hace lo mismo en `PaginaProgreso.tsx:113`. Reproducción ejecutada: historia con los 28 ítems de básico + los 16 de profesional menos 94.52 «Inglés II» (0 créditos) + 27 créditos de electivas → `progresoTitulos(...)[2]` = `{alcanzado:false, creditos:243, requeridos:243, faltanItems:["94.52"], estimado:null}`. El panel dibuja la barra al 100 % con «243/243», sin ✓, y el pie dice «Faltan 0 créditos y 0 de electivas para el título principal. Todavía no alcanza con lo planificado.». El mismo efecto con Analista: «147/147» y ningún cartel que nombre a 94.51. La regla estrella del dominio (título por ítems, incluidos los de 0 créditos) se computa y no llega nunca al usuario.
- Fix propuesto: Renderizar `titulo.faltanItems` en `PanelProgreso`/`PaginaProgreso` y usarlo —no solo los créditos— para el texto de cierre.


### F4.4 [media] El panel «Agregar materia» no tiene alto acotado: estira la página a 6600 px

- Archivo: `app/src/componentes/primitivas/PanelLateral.css:63-67 (y Disposicion.css:28-34, App.tsx:177-189)`
- Dimensión: A4
- Detalle: `.panel-lateral__cuerpo` declara `flex:1; min-height:0; overflow-y:auto`, pero el panel se monta dentro de `.disposicion__panel`, un bloque sin altura acotada (`.disposicion` solo tiene `min-height:100%`), así que el scroll interno nunca se activa. Reproducción: #/plan → «Agregar materia» (filtro «Disponibles» por omisión, ~100 resultados del plan S10-Rev23). Medido: `getComputedStyle(panel).height = 6526.59px`, `.panel-agregar__lista` 6302 px con `overflow-y: visible`, `document.documentElement.scrollHeight = 6638`. Con `window.scrollTo(0,1200)` la captura muestra la mitad izquierda completamente vacía: desaparecen la barra superior, el carrusel y las dos tarjetas, y también la cabecera del propio panel (el ✕ «Cerrar» y el campo de búsqueda), así que para cerrar el panel o cambiar la consulta hay que volver a subir. Contradice el motivo por el que 13c es panel y no modal («mientras buscás sigue viéndose dónde va a caer la materia», PanelLateral.tsx:4-5).
- Fix propuesto: Acotar el alto del contenedor: `.disposicion__cuerpo { height: 100vh; overflow: hidden; }` (o `max-height:100vh` en `.disposicion__panel`) para que `.panel-lateral__cuerpo` scrollee solo.


### F4.5 [media] El carrusel no deja asomar la tarjeta siguiente (13b)

- Archivo: `app/src/componentes/Carrusel/Carrusel.css:91-97`
- Dimensión: A4
- Detalle: `.carrusel__tarjeta` usa `flex: 0 0 calc((100% - (visibles - 1) * hueco) / visibles)`, es decir reparte la ventana exactamente entre las `visibles` tarjetas y no deja margen para el asomo. Medido en el navegador con 3 períodos y `visibles=2`: ventana 1002 px, tarjetas 1 y 2 en x=14 y x=520 (496 px cada una), tarjeta 3 en x=1026, o sea íntegramente fuera de los 1016 px de la ventana; a la derecha de la segunda tarjeta no se ve nada. El mockup 13b usa tarjetas fijas de 440 px con hueco de 10 en la misma ventana de ~1002 px (`etapa3-mockup-v2.dc.html`, artboard 13b: `width:440px;flex:none`), lo que deja ~112 px de la tercera tarjeta a la vista; la nota del propio artboard dice «Dos cuatrimestres enteros con su calendario y el tercero asomando, que es lo que avisa que hay más» y es la razón declarada de la decisión 12a (carrusel en vez de scroll).
- Fix propuesto: Restar el asomo al reparto: `flex: 0 0 calc((100% - (var(--carrusel-visibles) - 1) * var(--carrusel-hueco) - var(--carrusel-asomo, 112px)) / var(--carrusel-visibles))`.


### F4.6 [media] El panel de 13c se dibuja a 225 px en el hueco del progreso, no a 330 px

- Archivo: `app/src/App.tsx:177-189 (con Disposicion.css:28-31 y PanelLateral.tsx:19)`
- Dimensión: A4
- Detalle: `PanelAgregar` se pasa como `panel` de `Disposicion`, o sea se monta dentro de `.disposicion__panel { flex: 0 0 250px; padding: 12px }`. Como `.panel-lateral` lleva `max-width:100%`, el ancho pedido (330 px, el de 13c y el valor por omisión documentado en PanelLateral.tsx:19) se recorta al contenido del aside. Medido en el navegador: `document.querySelector('[role=dialog]').getBoundingClientRect()` da `x:1043, width:225`. Además, al abrirlo el carrusel baja de 2 tarjetas a 1 (PaginaPlan.tsx:211-213 fuerza `visibles = 1`), mientras que el artboard 13c conserva las dos tarjetas de 440 px al lado del panel de 330 («2 de 5 visibles»). El resultado es que las filas del panel parten los nombres en tres líneas y el cuatrimestre destino se ve peor, no mejor.
- Fix propuesto: Sacar `PanelAgregar` del slot `panel` y montarlo como tercera columna propia de `.disposicion__cuerpo` con su ancho de 330 px.


### F4.7 [media] El buscador de la barra superior descarta lo que se escribe

- Archivo: `app/src/App.tsx:168-170`
- Dimensión: A4
- Detalle: La barra recibe `onBuscar: () => abrirPanel(periodoActivo)`: el callback ignora el texto que `BarraSuperior` le pasa (BarraSuperior.tsx:164-167 llama `onCambio={onBuscar}` con el valor del campo). Reproducción: en #/plan, escribir «cripto» en «Buscar materia, código o docente». Medido inmediatamente después: el campo de arriba conserva `value = "cripto"`, el panel se abre, y el campo del panel queda en `value = ""`. O sea que quedan dos buscadores visibles con contenidos distintos y hay que volver a tipear la consulta en el panel. En 13c el campo de la barra y la consulta del panel son la misma búsqueda.
- Fix propuesto: Pasar el texto: `onBuscar: (texto) => abrirPanel(periodoActivo, texto)` y que `PanelAgregar` reciba ese valor como consulta inicial.


### F4.8 [media] #/progreso muestra el progreso dos veces: la página 13i y el panel lateral

- Archivo: `app/src/App.tsx:118-123`
- Dimensión: A4
- Detalle: `lateral = null` solo se ejecuta en la rama de «inicio» (línea 120); la rama `ruta.vista === "progreso"` (línea 121) deja el `PanelProgreso` montado en el aside. Reproducción: #/progreso con 28 materias aprobadas. En pantalla conviven, a 1280 px, la sección «Títulos» de la página (Analista ✓ obtenible ya · Bachiller 153/192 · Ingeniero/a 153/243 · Electivas 0 de 27) y, a la derecha, el panel «Progreso» con exactamente los mismos tres títulos, las mismas barras, las mismas electivas y los mismos cuatro minors a 0/14. El artboard 13i no tiene panel derecho: es ancho completo, «pestaña aparte porque es lectura, no edición».
- Fix propuesto: Agregar `lateral = null;` dentro de la rama `else if (ruta.vista === "progreso")` de App.tsx.


### F4.9 [media] El panel no modal atrapa el foco: con teclado no se puede volver al carrusel

- Archivo: `app/src/componentes/primitivas/foco.ts:74-109 (usado desde PanelLateral.tsx:34)`
- Dimensión: A4
- Detalle: `PanelLateral` declara explícitamente que no es un modal —no lleva velo ni `aria-modal` justamente para que el carrusel siga usable (PanelLateral.tsx:4-7)— pero llama a `useFocoAtrapado`, que en cada Tab recicla el foco dentro de la caja (foco.ts:89-101). Con el panel abierto, un usuario de teclado queda encerrado en el panel: no alcanza las flechas ‹ ›, los chips de cuatrimestre, el selector 1/2/3 ni los bloques de la tarjeta, que son lo que el panel debía dejar visible. Al mismo tiempo, como el resto de la página no está `inert` ni `aria-hidden`, un lector de pantalla sí puede recorrerla en modo lectura: la promesa auditiva y la de teclado se contradicen. Y el `keydown` está enganchado en la caja (foco.ts:104), así que si el foco sale del panel con un clic en el carrusel, Escape deja de cerrarlo.
- Fix propuesto: En `PanelLateral` usar `useFocoAtrapado` solo para Escape y el foco inicial (pasar una opción `atrapar: false`), dejando Tab libre.


### F4.10 [media] La grilla no sabe dibujar «bloqueada»

- Archivo: `app/src/paginas/PaginaPlan/armado.ts:175`
- Dimensión: A3
- Detalle: `EstadoEnGrilla` (`componentes/GrillaSemanal/GrillaSemanal.tsx:42`) solo admite `"cursando" | "planificada" | "sinHorario"`, y `estadoEnGrilla` devuelve `undefined` para todo lo demás. Como `estadoMateria` da precedencia a `bloqueada` sobre `planificada` (documentado en `motor/estado.ts:119-121`: «una materia planificada que quedó bloqueada tiene que verse bloqueada»), la materia planificada y bloqueada pierde hasta el glifo de «planificada». Reproducción ejecutada con `periodos = {"2026-2C":[{codigo:"72.44",comision:"S"}]}` e historia vacía: `estadoMateria("72.44","2026-2C",...)` → `"bloqueada"`, `motivosBloqueo` → `[{tipo:"correlativa",codigo:"72.07",estado:"falta"}]`, y `materiasEnGrilla("2026-2C",u,PLAN,H,ABREVIACIONES)` devuelve `[{codigo:"72.44", estado: undefined}]`: el bloque se dibuja como uno normal, sin borde ni glifo, y nada en 13b avisa que esa materia no se puede cursar.
- Fix propuesto: Agregar `"bloqueada"` a `EstadoEnGrilla` (con su glifo) y devolverlo desde `estadoEnGrilla` cuando `estadoMateria` da `bloqueada`.


### F4.11 [baja] «Sugerir corrección» está deshabilitado en todas las pantallas y sin explicación

- Archivo: `app/src/componentes/BarraSuperior/BarraSuperior.tsx:168-174 (App.tsx:161-174 nunca pasa `onSugerir`)`
- Dimensión: A4
- Detalle: `App` monta `BarraSuperior` sin la prop `onSugerir`, así que el botón queda `disabled` siempre. Comprobado en el navegador en #/plan y #/progreso: `boton.disabled === true`, `boton.title === ""`, sin `aria-label` ni `aria-describedby`; al hacer clic no cambia el hash ni aparece nada. Es un control muerto presente en las cuatro pantallas de ancho completo del mockup (13a, 13b, 13c, 13i), donde se dibuja como acción activa, y el único acceso a 13j. Además, al estar `disabled` no recibe foco, así que con teclado o lector de pantalla no hay manera de enterarse de por qué no responde (a diferencia de los botones de la ficha, que al menos llevan `title="Llega en el Sprint 3"`, FichaMateria.tsx:366-370).
- Fix propuesto: Mientras 13j no exista, dar el mismo trato que en la ficha: `<Boton variante="secundario" disabled title="Llega en el Sprint 3">` y anunciarlo con `aria-describedby` en vez de dejarlo mudo.

- **Igual que en la ficha: deshabilitado con title y aria-describedby «Llega en el Sprint 3».**


### F4.12 [baja] Los botones deshabilitados de la ficha explican su motivo solo con `title`

- Archivo: `app/src/componentes/FichaMateria/FichaMateria.tsx:366-371`
- Dimensión: A4
- Detalle: «Mover a otro cuatrimestre» y «Sugerir corrección» se dibujan con `<Boton disabled title="Llega en el Sprint 2|3">`. Comprobado en #/materia/72.44: `disabled === true`, `aria-disabled === null`, sin texto alternativo. Un botón `disabled` no recibe foco, así que el motivo no llega ni por teclado ni por lector de pantalla, y `title` solo aparece al pasar el mouse y quedarse quieto (nunca en pantalla táctil). Quedan como dos de las cuatro acciones al pie de la ficha sin explicación visible.
- Fix propuesto: Cambiar `disabled` por `aria-disabled="true"` + `aria-describedby` apuntando a una nota visible («Llega en el Sprint 2») al pie de la fila de acciones.


### F4.13 [baja] Dos selectores de archivo invisibles en la cadena de tabulación del primer ingreso

- Archivo: `app/src/componentes/MenuPlan/MenuPlan.tsx:118-125 (montado en App.tsx:58 y PaginaInicio.tsx:40)`
- Dimensión: A4
- Detalle: `useMenuPlan` monta su `<input type="file" class="menu-plan__archivo">` cada vez que se llama, y en el primer ingreso se llama dos veces: una en `App` (para el menú ⋯) y otra en `PaginaInicio` (para «Importar un plan guardado»). El input se oculta con `clip-path: inset(50%)` a propósito para que siga siendo alcanzable (MenuPlan.css:7-20), así que en #/plan con el plan vacío el árbol de accesibilidad lista dos controles idénticos «Archivo de plan exportado»: al tabular, el foco desaparece dos veces en puntos sin nada visible y sin indicación de foco. Los dos botones que los disparan («Importar un plan guardado» y ⋯ → «Importar plan») ya están en la cadena.
- Fix propuesto: Poner `tabIndex={-1}` en ese input (los botones que lo abren ya dan el acceso de teclado) y montar `useMenuPlan` una sola vez, en `App`.


## F5 — Scraper y operación (12 findings)

**Ownership:** `tools/cuatris/sga/**`, `tests/tools/test_sga_*.py`, `docs/scraping-sga.md`, `.gitignore`, y borrar `triage.json` de la raíz si está versionado.


### F5.1 [media] El identificador de sesión del SGA se imprime en cada petición

- Archivo: `tools/cuatris/sga/bajar.py:427`
- Dimensión: A6
- Detalle: `logging.basicConfig(level=logging.INFO, format="%(message)s")` sube a INFO el logger **raíz**, y con eso el logger `httpx` empieza a emitir su línea «HTTP Request: …» con la URL completa. Las URL del SGA llevan `;jsessionid=<token>` (docs/scraping-sga.md:253), así que las ~500 peticiones de un barrido escriben el token de sesión vivo en la terminal (y en cualquier redirección a archivo). El proyecto construyó `_sin_sesion()` (cliente.py:437-439) justo para evitarlo y lo aplica en cliente.py:300, :311 y :318, pero el logger de httpx lo esquiva por completo. Reproducción (scratchpad, sin red, con `httpx.MockTransport`): `ClienteSGA(transporte=t)._pedir("POST", "https://sga.itba.edu.ar/app2/;jsessionid=ABC123SECRETO?0-1.-login", {...})` tras `logging.basicConfig(level=logging.INFO)` imprime literalmente `INFO HTTP Request: POST https://sga.itba.edu.ar/app2/;jsessionid=ABC123SECRETO?0-1.-login "HTTP/1.1 503 …"`. Ningún test cubre el saneado del log (`grep -rn "jsessionid" tests/` solo lo usa como dato de entrada).
- Fix propuesto: Agregar `logging.getLogger("httpx").setLevel(logging.WARNING)` inmediatamente después del `basicConfig` de `bajar.ejecutar`.


### F5.2 [media] No hay instrucción alcanzable para crear el `.venv` que todo el instructivo asume

- Archivo: `docs/scraping-sga.md:86`
- Dimensión: A6
- Detalle: El instructivo del scraper invoca `.venv/bin/cuatris` en seis lugares (líneas 8, 101, 116, 316, 360, 363, 366) y su única línea de requisitos dice «Python 3.11+ con las dependencias del proyecto instaladas (`.venv/` en la raíz)», sin decir cómo se crea ni enlazar a ningún lado que lo diga. `.venv/` está en `.gitignore:6`, así que quien clone el repositorio no lo tiene. `README.md` (9 líneas) no tiene sección de instalación. `docs/ci.md:47-51` sí trae los `pip install --no-index --find-links vendor …`, pero instala en el Python del entorno, **no** en `.venv/`, y ninguna doc de `docs/` enlaza a la otra. La receta correcta (`python3 -m venv .venv && .venv/bin/pip install …`) existe solo en `CLAUDE.md:118-120`, que se presenta como «guía del proyecto para Claude Code», y en `entregables/sprint-1/ENV.md:24`, que es interno del sprint. Reproducción: siguiendo docs/scraping-sga.md literalmente desde un clon limpio, el primer comando falla con `no such file or directory: .venv/bin/cuatris`.
- Fix propuesto: Agregar al inicio de «Cómo se corre» el bloque `python3 -m venv .venv && .venv/bin/pip install --no-index --find-links vendor -r vendor/requisitos.txt && .venv/bin/pip install --no-index --no-build-isolation --no-deps -e tools`.


### F5.3 [media] La corrida de prueba escribe en la ruta publicable y nada lo impide

- Archivo: `docs/scraping-sga.md:101`
- Dimensión: A6
- Detalle: El instructivo manda la primera corrida («siempre con `--limite 3`», líneas 8 y 100-105) a `--salida data/v1/horarios/2026-2C.json`, exactamente la misma ruta que la publicación (líneas 115-119). La única salvaguarda es la frase «Ese archivo no se publica» y un mensaje al final de `bajar.ejecutar` (bajar.py:481-485). Nada en la herramienta distingue ese archivo: verifiqué que `cuatris fmt --check`, `cuatris validar` y `cuatris indice actualizar` lo aceptan sin ninguna objeción (el archivo de 3 cursos es canónico y válido; solo el rango `periodo.desde/hasta` queda recortado, y `periodo_de_filas`, bajar.py:268-292, no deja marca de ello en el JSON). Si el barrido completo posterior se corta, lo que queda en la ruta publicable es el archivo de prueba, y el `git add data/v1/horarios/2026-2C.json` de la línea 377 lo publica. La misma doc ya usa `/tmp/prueba.json` para la corrida de diagnóstico en la línea 317: es una inconsistencia interna.
- Fix propuesto: Cambiar el `--salida` de la corrida de prueba (líneas 8 y 103) a `/tmp/prueba-2026-2C.json`, como ya hace la línea 317.


### F5.4 [media] El `.invalido.json` queda dentro de `data/` y bloquea el resto de la operación

- Archivo: `tools/cuatris/sga/bajar.py:475`
- Dimensión: A6
- Detalle: Cuando la validación final falla, `args.salida.replace(ruta_invalida(args.salida))` deja el archivo como `data/v1/horarios/<periodo>.invalido.json`, es decir **dentro del árbol de datos**, porque el `--salida` que documenta el instructivo apunta ahí. Ese archivo queda como mina: (a) rompe el paso 3 del propio instructivo (docs/scraping-sga.md:366). Reproducido: `cp -R data $S/data; cp $S/data/v1/horarios/2026-2C.json $S/data/v1/horarios/2026-2C.invalido.json; .venv/bin/cuatris indice actualizar --data $S/data` → `error: el periodo «2026-2C» esta en dos archivos: «v1/horarios/2026-2C.invalido.json» y «v1/horarios/2026-2C.json»`, salida 1, con un mensaje que no menciona al scraper ni sugiere borrarlo. (b) `.github/workflows/deploy.yml:57-64` y `pr-datos.yml:131-138` corren `cuatris fmt --check` y `cuatris validar` sobre `find data -type f -name '*.json'`, así que un `.invalido.json` olvidado tumba el deploy o el gate del PR. El instructivo nunca dice que haya que borrarlo.
- Fix propuesto: En `ruta_invalida`, escribir el archivo rechazado fuera del árbol de datos (por ejemplo `Path(CACHE) / f"{salida.stem}.invalido.json"`) y decirlo en el mensaje.


### F5.5 [media] El comando de diagnóstico de la doc no corre: usa `python` sin el venv

- Archivo: `docs/scraping-sga.md:333`
- Dimensión: A6
- Detalle: El paso 3 de «Diagnóstico cuando falle» —la vía de escape que la doc señala como «la sección que hay que abrir primero cuando una corrida falle»— propone `diff <(python -c "import sys,bs4;print(bs4.BeautifulSoup(...).prettify())" …) <(python -c "…" …)`. Es el único lugar del documento que no usa el prefijo `.venv/bin/`. Reproducción en esta máquina: `which python` → `python not found`; y con el intérprete del sistema, `/usr/bin/python3 -c "import bs4"` → `ModuleNotFoundError: No module named 'bs4'`. `beautifulsoup4` solo está instalado dentro de `.venv`, así que el comando falla tanto por el nombre del binario como por la dependencia.
- Fix propuesto: Reemplazar las dos apariciones de `python -c` de ese bloque por `.venv/bin/python -c`.


### F5.6 [media] Los tests de `normalizar` alimentan el diccionario con sus propias claves: la tolerancia a acentos no se prueba

- Archivo: `tools/cuatris/sga/normalizar.py:91-97 (tests: tests/tools/test_sga_parsers.py:365-397)`
- Dimensión: A5
- Detalle: `_buscar` aplica `clave()` a los dos lados (a la entrada y a las claves de DIAS/MODALIDADES/SEDES/CUATRIMESTRES) y cada caso parametrizado usa el literal exacto de la tabla («Miércoles», «Sábado», «Virtual sincrónico»), así que la normalización se cancela sola. Mutación verificada: en `clave()` reemplazar el despojo de acentos por `sin_acentos = texto`; `pytest tests/tools -q` da 366 passed. Con el código real `normalizar.dia("Miercoles")` y `normalizar.dia("MIERCOLES")` devuelven «miercoles»; con la mutación lanzan `ValorDesconocido`, que es el modo de falla real cuando el SGA publique la página sin tilde o en NFD.
- Fix propuesto: Parametrizar también variantes que no sean la clave: «Miercoles», «MIÉRCOLES», «SÁBADO» en NFD y « Segundo  Cuat. » con espacios de más.


### F5.7 [baja] El log de reintento imprime la URL sin sanear

- Archivo: `tools/cuatris/sga/cliente.py:287`
- Dimensión: A6
- Detalle: `REGISTRO.warning("Reintento %d de %d dentro de %.1f s (%s %s).", intento, self.reintentos, espera, metodo, url)` pasa `url` en crudo, mientras que las otras tres salidas del mismo método (líneas 300, 311 y 318) pasan por `_sin_sesion()`. Como `bajar.ejecutar` deja el root logger en INFO, los WARNING se ven siempre. Reproducción (mismo script de scratchpad con `MockTransport` que devuelve 503): `WARNING Reintento 1 de 1 dentro de 0.0 s (POST https://sga.itba.edu.ar/app2/;jsessionid=ABC123SECRETO?0-1.-login).`, contra el `ErrorDeRed` final de la línea 318 que sí imprime `;jsessionid=…`. Es el mismo secreto que el hallazgo de httpx, por otra vía y con otro arreglo.
- Fix propuesto: Cambiar el último argumento de ese `REGISTRO.warning` por `_sin_sesion(url)`.


### F5.8 [baja] `--cache` existe en la CLI y no está en la tabla de opciones

- Archivo: `docs/scraping-sga.md:123`
- Dimensión: A6
- Detalle: La tabla «Opciones» (líneas 123-132) lista `--anio`, `--cuatrimestre`, `--salida`, `--limite`, `--desde-cero`, `--ritmo`, `--nivel`, `--guardar-html` y `--data`, pero omite `--cache`, que sí existe (`tools/cuatris/sga/bajar.py:407-413`). Reproducción: `.venv/bin/cuatris sga bajar --help` muestra `[--cache DIRECTORIO]  Directorio del checkpoint y de los volcados (por defecto ./.cuatris-cache)`. Importa para la operación porque es la única forma de correr el scraper desde un directorio distinto de la raíz sin ensuciar el checkpoint, y toda la sección «Cuando se corta» habla de `.cuatris-cache/` como si la ruta fuera fija.
- Fix propuesto: Agregar a la tabla la fila `| --cache | Directorio del checkpoint y de los volcados; por defecto ./.cuatris-cache |`.


### F5.9 [baja] `triage.json` de una prueba manual quedó commiteado en la raíz

- Archivo: `triage.json:1`
- Dimensión: A6
- Detalle: El archivo está versionado (`git ls-files | grep triage.json` lo devuelve) y no figura en `.gitignore`. Su contenido es la salida de una corrida manual de `cuatris pr triage --salida triage.json`: `{"archivos": ["data/v1/planes/otro.json"], "clase": "necesita-humano", "motivos": [...]}`, y ese `data/v1/planes/otro.json` no existe en el repositorio. `.github/workflows/pr-datos.yml:94` genera ese mismo nombre dentro del workspace del runner, así que el archivo del repositorio no cumple ninguna función: es un artefacto de prueba que alguien sin contexto leería como estado real del proyecto, y cualquier PR que lo regenere lo ensucia con un diff espurio.
- Fix propuesto: `git rm triage.json` y agregar `triage.json` a `.gitignore`.


### F5.10 [baja] El instructivo salta de activar el índice al PR sin ningún paso de verificación visual

- Archivo: `docs/scraping-sga.md:366`
- Dimensión: A6
- Detalle: «Cómo se carga el resultado» va de `cuatris indice actualizar` (línea 366) directo a `git checkout -b` / `git push` (líneas 376-380). La lista «Qué mirar antes de aprobarlo» (382-391) es toda sobre el diff y los WARNING del validador: nunca se abre la página. Es un punto ciego real, porque lo que puede fallar sin que ningún validador se entere —un período que no queda activo porque `periodoActivo` exige `desde <= hoy <= hasta` (docs/contrato.md:85-86, `app/src/datos/cargar.ts:204-213`), o un archivo de prueba de 3 cursos— solo se ve en el navegador. La infraestructura ya existe: `npm run dev` sirve `../data` bajo `/data/` (`app/vite.config.ts:26-77`, `app/LEEME.md:11`), y el propio cierre de `olas/ola-4/AUDITORIA.md:37-39` exige ese recorrido antes del veredicto.
- Fix propuesto: Insertar entre el paso 3 y el PR un paso «4. Verlo: `cd app && npm run dev` y recorrer el período nuevo antes de abrir el PR».


### F5.11 [baja] El rechazo de BOM en el formato canónico no se prueba

- Archivo: `tools/cuatris/canon.py:50-52 (tests: tests/tools/test_canon.py)`
- Dimensión: A5
- Detalle: `leer_texto` rechaza tres cosas —BOM, CRLF y claves duplicadas— y las dos últimas tienen fixture (`no-canonico.json`, `clave-duplicada.json`). Mutación verificada: `if crudo.startswith(BOM_UTF8):` → `if False:`; `pytest tests/tools -q` da 366 passed (CRLF y claves duplicadas sí matan sus mutantes). Como el hash del índice se calcula sobre el texto canónico, un BOM admitido cambia el hash publicado sin que nadie lo note.
- Fix propuesto: Agregar a `test_canon.py` un archivo que empiece con `\xef\xbb\xbf` y esperar `ErrorCanonico`.


### F5.12 [baja] Un cupo con la forma rota no está cubierto: el scraper reventaría con `ValueError` crudo

- Archivo: `tools/cuatris/sga/parsers.py:435 (tests: tests/tools/test_sga_parsers.py:139-146)`
- Dimensión: A5
- Detalle: Solo hay casos de cupo válido («48 / 49») y de celda vacía. Mutación verificada: `if len(partes) != 2 or not all(re.fullmatch(r"\d+", p) for p in partes):` → `if len(partes) != 2:`; `pytest tests/tools -q` da 366 passed. Con el código real, una celda «lleno / -» da `EstructuraInesperada`; sin ese guardia da un `ValueError` sin contexto que sube hasta la CLI, que es la diferencia entre un error de dominio legible y un stacktrace en medio de una bajada.
- Fix propuesto: Agregar un caso con la celda «lleno / -» y esperar `EstructuraInesperada`.
