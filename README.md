# Cuatris

Planificador de cursada para **Ingeniería en Informática del ITBA** (plan S10-Rev23): marcás
las materias que ya aprobaste y armás tu cursada — correlativas, horarios sin choques, plan
cuatrimestre a cuatrimestre, minors, créditos y combinación de finales. Sin cuenta: todo se
guarda en tu navegador y se puede exportar/importar.

Sitio: https://sebascaules.github.io/Cuatris/

Es la **versión standalone del planificador de [StudyVaults ITBA](https://sebascaules.github.io/StudyVaults/)**
(`site/app/electivas/planificar` de ese repositorio): el mismo código, servido como una única
página y sin el resto del portal. El proyecto anterior de Cuatris (SPA propia + CLI en Python)
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
| `app/` | Next.js (App Router, `output: "export"`): `layout.tsx` (fuentes, tema, header/footer) y `page.tsx` (el planificador) |
| `components/planner/` | El planificador: estado (`state.tsx`), vistas (`views/`), drawer, ficha, modales y sus `.css`. **Espejo de StudyVaults.** |
| `lib/planner/` | Dominio: modelo, correlativas, optimizador de plan, horarios, finales, persistencia, exportación. **Espejo de StudyVaults.** |
| `lib/url-state/` | Estado en la URL (`?view=…`) sobre el static export. Espejo de StudyVaults. |
| `packages/ui/` | `@studyvaults/ui`, el sistema de diseño (tokens, chrome, primitivos). Espejo de StudyVaults. |
| `components/shell/` | Lo propio del standalone: `Header`, `Footer`, marca |
| `lib/content/slug.ts`, `lib/site.ts` | Shims del standalone (`withBase`, URLs) |
| `data/plan/` | Fuentes de datos: `electivas.csv`/`obligatorias.csv` → `electivas.py` → `.json`; `horarios.json` (SGA, ver `SCRAPING.md`); `build-data.py` → `data.js`; planillas oficiales de finales `finales-*.csv` |
| `scripts/` | Pipelines: `build-planner-data.mjs` (→ `lib/planner/data.json`, en cada build), `build-mesas-finales-data.mjs` y `build-finales-flags-data.mjs` (→ `.ts` commiteados), `build-fichas-data.mjs` (PDFs → `fichas.ts`, requiere `pdftotext`), `sync-desde-studyvaults.sh` |
| `public/electivas-fichas/` | Programas analíticos oficiales (PDF), enlazados desde la ficha de cada materia |

## Actualizar datos

```bash
# horarios / materias: editar data/plan/*.csv o regenerar horarios.json (SCRAPING.md), luego
(cd data/plan && python3 electivas.py && python3 build-data.py)
# finales: archivar la planilla oficial como data/plan/finales-<año>-<mes>.csv, luego
npm run datos
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

Push a `main` dispara `.github/workflows/deploy.yml` (build + GitHub Pages). En la
configuración del repositorio, *Pages → Source* debe ser **GitHub Actions**.
