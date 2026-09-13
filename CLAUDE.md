# Cuatris — guía del proyecto para Claude Code

Planificador de cursada para Ingeniería en Informática del ITBA (plan S10-Rev23), publicado en
`https://sebascaules.github.io/Cuatris/` (sitio de proyecto de GitHub Pages: se sirve bajo
`/Cuatris/`). **Es la versión standalone del planificador de StudyVaults ITBA**
(`~/Desktop/ITBA/StudyVaultsITBA/site/app/electivas/planificar`): Next.js 16 con
`output: "export"`, React 19, TypeScript, sin Tailwind, con el sistema de diseño
`@studyvaults/ui` copiado como package del workspace.

El proyecto anterior (SPA Vite propia + CLI Python + scraper del SGA) está congelado en
`deprecated/` (ver `deprecated/DEPRECADO.md`). No se compila, no se prueba, no se despliega
y no se retoma sin pedido explícito del autor.

## Relación con StudyVaults (la regla más importante)

- El código del planner **se desarrolla en StudyVaults** y acá se espeja. Estos directorios
  se mantienen **byte-idénticos** a los de `StudyVaultsITBA/site`: `components/planner/`,
  `lib/planner/` (menos `data.json`, generado), `lib/url-state/`, `packages/ui/`,
  `public/electivas-fichas/`. Fuentes de datos: `data/plan/` ⇐ `StudyVaultsITBA/Electivas/`.
- `npm run sync` (`scripts/sync-desde-studyvaults.sh`) los trae con rsync `--delete` y
  regenera `lib/planner/data.json`. **Pisa cambios locales** en esos directorios: si se
  mejora algo del planner acá, la mejora tiene que llegar también a StudyVaults (o quedará
  perdida en el próximo sync). Las mejoras hechas solo acá se anotan en `CAMBIOS-LOCALES.md`
  para poder portarlas o reaplicarlas.
- Lo propio del standalone vive fuera de esos directorios y el sync no lo toca: `app/`,
  `components/shell/`, `lib/content/slug.ts` (shim de `withBase`/`SITE_URL`), `lib/site.ts`,
  `scripts/`, `next.config.ts`, `run.sh`.
- Los imports del planner apuntan a `@/lib/content/slug`, `@/lib/url-state/core` y
  `@studyvaults/ui`: esas rutas existen acá a propósito. No renombrarlas.

## Reglas de trabajo

- **Rutas absolutas siempre en Bash** (`/Users/sebastiancaules/Desktop/Projects/Cuatris/…`);
  el cwd se resetea entre llamadas.
- **Verificación**: antes de declarar algo hecho, `npm run typecheck` + `npm run build`
  limpios y verificación en el navegador con Claude Preview contra `./run.sh build`
  (`http://localhost:3101/Cuatris/`, idéntico a Pages) o `./run.sh` (dev, `:3100`).
  Nunca usar el Chrome del usuario salvo pedido explícito. "No veo los cambios" ⇒
  `./run.sh` / `./run.sh build` (limpian cachés), no debuggear a mano.
- **Static-export safe**: `window`/`localStorage`/`document` siempre detrás de guards; primer
  render determinista, hidratar desde el entorno en un `useEffect`.
- **Diseño**: reglas del autor heredadas de StudyVaults —diseño intuitivo con mínimo texto
  explicativo, acciones que se descubren por forma y posición, cada control y estado con
  tooltip del componente `components/planner/Tooltip.tsx` (nunca `title=`), lo completado se
  pliega solo, componentes propios (nada nativo con aspecto por defecto), tipografía
  Newsreader + JetBrains Mono vía `next/font`. Ver `components/planner/DESIGN.md`.
- **Datos**: no inventar códigos, horarios, aulas ni nombres; solo lo que está en `data/plan/`
  o en el SGA verificado. Credenciales del SGA: nunca (el scraper lo corre el autor, ver
  `data/plan/SCRAPING.md`).
- **Idioma**: documentación, comentarios, commits y todo lo dirigido al autor en español
  neutro (tú/usted). Los **textos de la interfaz** del planner están en voseo porque hablan a
  estudiantes del ITBA (igual que en StudyVaults): no «corregirlos».
- **Git**: commits sin trailer `Co-Authored-By`. Commitear temprano y agregando por rutas
  explícitas (nunca el árbol entero de una vez); push a `main` **solo cuando el autor lo
  pide** (dispara el deploy).

## Comandos

```
npm ci                      dependencias
./run.sh                    dev con hot-reload (:3100); limpia cachés antes
./run.sh build              build estático servido en http://localhost:3101/Cuatris/
npm run typecheck           regenera data.json + tsc --noEmit
npm run build               next build → out/ (prebuild regenera lib/planner/data.json)
npm run datos               regenera finalesFlags.ts y mesasFinales.ts desde data/plan/finales-*.csv
npm run sync                trae el planner desde StudyVaults (ver arriba)
node scripts/build-fichas-data.mjs   PDFs → lib/planner/fichas.ts (requiere pdftotext)
```

## Estructura

```
app/                 layout.tsx (fuentes, tema, header/footer) · page.tsx (el planner) · error/not-found
components/planner/  el planificador (espejo de StudyVaults)
components/shell/    Header, Footer, CuatrisMark (propios del standalone)
lib/planner/         dominio del planner (espejo de StudyVaults)
lib/url-state/       estado en la URL (espejo de StudyVaults)
lib/content/slug.ts  shim: BASE_PATH, SITE_URL, withBase
packages/ui/         @studyvaults/ui (espejo de StudyVaults)
public/electivas-fichas/  PDFs oficiales de las materias
data/plan/           fuentes de datos + scripts Python + planillas de finales
scripts/             pipelines .mjs y sync
deprecated/          el Cuatris anterior, congelado
```
