# Mantenimiento del repositorio: cómo se sostiene solo

Para quien herede Cuatris sin contexto. El objetivo de diseño es la **longevidad**: que los
datos (horarios, planes, finales) se actualicen por PR de cualquiera, con validación
automática y merge sin revisión experta, y que cuando algo se rompa el sitio degrade a
*datos viejos pero correctos*, nunca a *datos malos* ni a *sitio caído*. Para el contribuyente
está `CONTRIBUTING.md`; esta página es la de atrás del mostrador.

## Las piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Validador | `scripts/datos/validar.mjs` (+ `forma`, `estructura`, `horarios`, `carreras`, `finales`) | Reglas de forma e invariantes sobre `data/plan`. `npm run datos:validar` |
| Triage | `scripts/datos/triage.mjs` + `politica.json` | Clasifica el diff de un PR: `datos-menor` / `datos-mayor` / `necesita-humano` |
| Comentario | `scripts/datos/comentario.mjs` | El comentario del bot en el PR (con el marcador de espera) |
| Centinela | `scripts/datos/centinela.mjs` | Qué dato falta a esta altura del año |
| Guardarraíles | `scripts/datos/guardarrailes.mjs` | Reglas de seguridad sobre `.github/**`. `npm run guardarrailes` |
| Gate | `.github/workflows/pr-datos.yml` | Valida en cuarentena, decide, mergea, dispara el deploy |
| Centinela | `.github/workflows/centinela.yml` | Cada 6 h: merges vencidos, issues por datos que faltan, revalidación |
| CI | `.github/workflows/ci.yml` | Typecheck, tests, build del código de un PR; tests del scraper |
| Deploy | `.github/workflows/deploy.yml` | Revalida, construye y publica en Pages |
| Scraper | `tools/` | Baja los horarios del SGA (corrida local con cuenta) |
| Tests | `npm run test:datos`, `python -m pytest tools/tests` | Fixtures de cada regla, triage sobre un repo temporal, guardarraíles |

## Cómo corre un PR de datos

```
PR abierto/actualizado
  └─ pr-datos.yml (pull_request_target: el workflow y los scripts salen de la rama por defecto)
       ├─ validar-datos  (permissions: {})   ← el único check requerido
       │    git fetch refs/pull/N/head → triage (rutas, modos de git, tamaño, magnitud)
       │    → copia SOLO los archivos de datos aceptados sobre data/plan (git cat-file)
       │    → validar.mjs sobre todo data/plan → npm ci && npm run build
       └─ decidir  (contents/pull-requests/issues/actions: write; no abre nada del PR)
            relee la lista de archivos de la API, recalcula la clase (la más restrictiva)
            comenta (un comentario por PR, actualizado), etiqueta
            datos-menor  → gh pr merge --match-head-commit → gh workflow run deploy.yml
            datos-mayor  → etiqueta esperando + marcador <!-- cuatris:espera sha hasta -->
            necesita-humano / inválido → solo informa

centinela.yml (cada 6 h)
  esperando + marcador vencido + SHA sin cambios + validar-datos en verde → merge + deploy
  datos que faltan (centinela.mjs) → issue «ayuda-necesaria» (uno por título; se cierra solo)
  validar.mjs sobre main → issue si falla
```

**Por qué así** (el modelo de amenazas completo es la Fase 4 de
`deprecated/entregables/02-plan-backend.md` y `deprecated/docs/ci.md`; acá lo que
implementan estos workflows):

- *Ejecutar código del PR con permisos* (A1/A3): `pull_request_target` toma el workflow de
  la rama por defecto; el job que toca bytes del PR no tiene permisos; los bytes se traen con
  `git fetch` y `git cat-file`, nunca con checkout; solo se copian archivos regulares del
  allowlist; lo único que se ejecuta es el código de la base (`npm run build`, que evalúa
  `data/plan/data.js`, que no es contribuible).
- *El PR desactiva sus propios controles* (A2): CODEOWNERS cubre todo salvo los datos, y el
  ruleset exige revisión de code owner → un PR de código espera al autor.
- *Escape del allowlist por modo de git* (A12): el triage rechaza symlinks, submódulos,
  ejecutables, punteros LFS, `.gitattributes`/`.gitmodules`, colisiones de mayúsculas y
  cualquier baja.
- *Corrupción masiva de buena fe* (A6, el escenario más probable): un cuatrimestre nuevo
  tiene que ser el siguiente al último y traer ±30 % de cursos; una modificación que toca más
  de la mitad de un archivo o quita cursos va a una persona; los umbrales están en
  `politica.json`.
- *Bloqueo permanente por falsos positivos* (A10): los avisos no bloquean; los casos raros
  reales del SGA son fixtures permanentes (`scripts/datos/test/fixtures/horarios/deben-pasar`);
  `ci` no es check requerido (en un fork nuevo queda pendiente).
- *Un merge malo llega a producción*: `deploy.yml` revalida antes de construir; Pages
  conserva el último deploy bueno.

## Trampas de GitHub que este diseño esquiva (no las «arregle»)

- Un merge o push hecho con `GITHUB_TOKEN` **no dispara** workflows de `push`. Por eso el
  bot dispara `deploy.yml` con `workflow_dispatch` (la excepción documentada) y `deploy.yml`
  además corre por `schedule` semanal.
- `decidir` no puede ser check requerido: se bloquearía a sí mismo al mergear.
- `ci` no puede ser check requerido: para un fork de un contribuyente nuevo, GitHub deja la
  corrida de `pull_request` pendiente de aprobación; un check requerido pendiente bloquea
  el merge automático para siempre. `pull_request_target` no tiene ese problema.
- `git archive` y el checkout aplican el `.gitattributes` del árbol extraído; por eso el
  gate aborta si el PR trae uno y usa `git cat-file`.
- `pull_request_target` solo se dispara si el workflow existe en la **rama por defecto**, y
  corre esa versión (GITHUB_SHA y GITHUB_REF son los de `main`, no los de la base del PR).
  Un cambio en `pr-datos.yml` no se puede probar en una rama: recién corre cuando está en
  `main`. Comprobado el 2026-09-19: cinco PR contra una rama con el workflow no dispararon
  nada.

## Configuración de la plataforma (no se versiona)

Todo lo demás vive en el repositorio; esto hay que dejarlo hecho en la configuración de
GitHub y lo aplica `scripts/repo/configurar-github.sh` (idempotente; con `--dry-run` muestra
las llamadas sin ejecutarlas; necesita `gh` autenticado como administrador):

1. **Etiquetas** `datos-menor`, `datos-mayor`, `necesita-humano`, `esperando`,
   `ayuda-necesaria`, `dato-incorrecto` (el bot también las crea si faltan).
2. **Ruleset sobre `main`** (`scripts/repo/ruleset-main.json`): PR obligatorio con 0
   aprobaciones y revisión de code owners, check requerido `validar-datos`, sin force-push ni
   borrado, **bypass siempre para el rol administrador** (el autor sigue pusheando directo a
   `main`; es el único que puede aprobar un PR de código, y no puede aprobar los propios).
3. **Permisos por defecto del `GITHUB_TOKEN` en solo lectura** (`Settings → Actions →
   General`); cada workflow declara lo que necesita.
4. **Pages con origen «GitHub Actions»**.
5. **Cero secretos.** El único admitido es `GITHUB_TOKEN`; `npm run guardarrailes` falla si
   aparece otro.

Para comprobar el estado: `gh api repos/SebasCaules/Cuatris/rulesets`,
`gh api repos/SebasCaules/Cuatris/actions/permissions/workflow`.

## Operación

- **Probar un cambio del gate**: mergearlo a `main` (pasa por `ci`, que corre el validador,
  los tests y los guardarraíles) y después abrir PR de prueba **inofensivos** desde ramas
  `prueba/*`: una línea en `data/plan/horarios/README.md` (`datos-menor`, se mergea sola y
  publica: no cambia ningún dato), un JSON con un bloque invertido (check rojo; se cierra),
  un symlink (`necesita-humano`; se cierra), un `2027-1C.json` sintético (`datos-mayor` +
  `esperando`; **se cierra antes de que venza la espera**), un cambio en `scripts/`
  (`necesita-humano` + revisión del autor; se cierra). Las ramas de prueba se borran.
- **Probar el centinela**: `gh workflow run centinela.yml -f hoy=2027-02-15` abre el issue
  «Faltan los horarios de 1C 2027» si el archivo no existe.
- **Un PR quedó `esperando` y hay que apurarlo**: mergearlo a mano (el autor, o quien tenga
  permiso); el centinela quita la etiqueta en la próxima vuelta.
- **Un dato malo se mergeó**: `git revert` del merge en un PR (clase `necesita-humano` si
  quita algo: lo mergea el autor) o push directo del autor a `main`. El deploy revalida.
- **Romper el vidrio** (el gate se rompió y hay que mergear igual): el autor pushea directo
  a `main` (bypass de administrador) o desactiva temporalmente el check requerido en el
  ruleset. Después, arreglar el gate en un PR y volver a activar.
- **Falsos positivos**: cada uno se agrega como fixture permanente en
  `scripts/datos/test/fixtures/` en el mismo PR que ajusta la regla. Nunca se afloja una
  regla sin su fixture.
- **Cambia el SGA**: el scraper falla con `EstructuraInesperada`; `--guardar-html` deja el
  HTML para compararlo con `tools/tests/corpus/sga/`. Ver `tools/README.md`.
- **Cambia un umbral**: `scripts/datos/politica.json`, en un PR de código.

## Relación con StudyVaults

El código del planner (`components/planner/`, `lib/planner/`, `lib/url-state/`,
`packages/ui/`) se espeja desde StudyVaults con `npm run sync`; nada de este mecanismo lo
toca. Los datos contribuibles y los scripts son propios de Cuatris. `mesasFinales.ts` y
`finalesFlags.ts` se generan en cada build desde los CSV de acá y están excluidos del sync
(`CAMBIOS-LOCALES.md` §27).
