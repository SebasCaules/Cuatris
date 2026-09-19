# Cuatris

Planificador de cursada para las **carreras de grado del ITBA**: elegís tu carrera, marcás
las materias que ya cursaste y armás tu cursada — correlativas, horarios sin choques, plan
cuatrimestre a cuatrimestre, minors, créditos y combinación de finales. Sin cuenta: todo se
guarda en tu navegador y se puede exportar/importar.

Sitio: https://sebascaules.github.io/Cuatris/ (portada) · https://sebascaules.github.io/Cuatris/planificar/ (planificador)

Es la **versión standalone del planificador de [StudyVaults ITBA](https://sebascaules.github.io/StudyVaults/)**
(`site/app/electivas/planificar` de ese repositorio): el mismo código, con una portada propia
y sin el resto del portal. El proyecto anterior de Cuatris (SPA propia + CLI en Python)
quedó congelado en [`deprecated/`](deprecated/DEPRECADO.md).

## Correr en local

```bash
npm ci
./run.sh            # dev con hot-reload en http://localhost:3100
./run.sh build      # build estático idéntico a Pages, servido en http://localhost:3101/Cuatris/
```

`run.sh` limpia `.next/`, `out/` y `lib/planner/data.json` antes de compilar para que nunca
queden cambios viejos pegados. Sin el script: `npm run dev` / `npm run build` (el hook
`prebuild` regenera `lib/planner/data.json` a partir de `data/plan/data.js`).

## Mapa

| Ruta | Qué es |
|---|---|
| `app/` | Next.js (App Router, `output: "export"`): `layout.tsx` (fuentes, tema, header/footer), `page.tsx` (la portada) y `planificar/page.tsx` (el planificador) |
| `components/planner/` | El planificador: estado (`state.tsx`), vistas (`views/`), drawer, ficha, modales y sus `.css`. **Espejo de StudyVaults.** |
| `lib/planner/` | Dominio: modelo, correlativas, optimizador de plan, horarios, finales, persistencia, exportación. **Espejo de StudyVaults.** |
| `lib/url-state/` | Estado en la URL (`?view=…`) sobre el static export. Espejo de StudyVaults. |
| `packages/ui/` | `@studyvaults/ui`, el sistema de diseño (tokens, chrome, primitivos). Espejo de StudyVaults. |
| `components/shell/` | Lo propio del standalone: `Header`, `Footer`, marca, portada (`Landing`) |
| `lib/content/slug.ts`, `lib/site.ts` | Shims del standalone (`withBase`, URLs) |
| `data/plan/` | Fuentes de datos. **Contribuibles por PR** (ver `CONTRIBUTING.md`): `horarios/<periodo>.json` (SGA, contrato 1.1.0), `carreras.json` + `carreras/<CODIGO>.json` (planes del SGA, desde el HTML de `sga-carreras/`), `finales-*.csv` (planillas oficiales). Del autor: `data.js` (plan curado de Informática, desde `electivas.csv`/`obligatorias.csv` → `electivas.py` → `build-data.py`) |
| `scripts/` | Pipelines: `build-planner-data.mjs`, `build-mesas-finales-data.mjs` y `build-finales-flags-data.mjs` (→ `lib/planner/data.json`, `mesasFinales.ts`, `finalesFlags.ts`, en cada build), `build-carreras-data.mjs`, `build-fichas-data.mjs` (PDFs → `fichas.ts`, requiere `pdftotext`), `sync-desde-studyvaults.sh`; `datos/`: el validador, el triage y el bot del gate de datos (`docs/mantenimiento.md`) |
| `tools/` | El scraper de horarios del SGA (Python; `tools/README.md`) |
| `.github/` | `pr-datos.yml` (gate y auto-merge de los PR de datos), `centinela.yml`, `ci.yml`, `deploy.yml`, CODEOWNERS y plantillas |
| `public/electivas-fichas/` | Programas analíticos oficiales (PDF), enlazados desde la ficha de cada materia |

## Actualizar datos

Horarios, planes de estudio y finales se actualizan **por PR de cualquiera**: el gate los
valida y los mergea solo, y el sitio se publica. Las recetas están en
[`CONTRIBUTING.md`](CONTRIBUTING.md); cómo funciona el mecanismo, en
[`docs/mantenimiento.md`](docs/mantenimiento.md).

```bash
npm run datos:validar       # lo que revisa el gate, sobre data/plan
npm run datos:fmt           # forma canónica de los JSON de datos
npm run test:datos          # tests del validador, el triage y los guardarraíles
# plan curado de Informática (solo el autor): editar data/plan/*.csv y luego
(cd data/plan && python3 electivas.py && python3 build-data.py)
```

## Traer cambios del planner desde StudyVaults

El código del planificador se desarrolla en StudyVaults; este repositorio lo espeja:

```bash
npm run sync     # rsync de components/planner, lib/planner, lib/url-state, packages/ui, fichas y data/plan
npm run typecheck && npm run build
```

Los cambios hechos localmente dentro de los directorios sincronizados se pisan: revisar el
`git diff` y volver a aplicar lo que haya que conservar.

## Publicar

Push a `main` dispara `.github/workflows/deploy.yml` (validación + build + GitHub Pages); el
bot del gate lo dispara también tras cada merge automático, y corre una vez por semana. En la
configuración del repositorio, *Pages → Source* debe ser **GitHub Actions**; el ruleset de
`main` y las etiquetas los aplica `scripts/repo/configurar-github.sh`.
