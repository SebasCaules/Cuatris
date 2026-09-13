# Cambios locales respecto del planner de StudyVaults

Registro de lo que Cuatris cambió **dentro de los directorios que se espejan** desde
StudyVaults (`components/planner/`, `lib/planner/`, `lib/url-state/`, `packages/ui/`).
`npm run sync` los pisa: cada entrada de esta lista hay que portarla a StudyVaults o
reaplicarla después del sync. Cuando una entrada ya esté en StudyVaults, se borra de acá.

Base sincronizada: árbol de trabajo de `StudyVaultsITBA/site` del 2026-09-13 ~02:45 (commit
`4c5d1af` + cambios sin commitear de la sesión «Planificador de cursada ITBA»).

## 1. Guardar o cargar progreso desde cualquier vista

- `components/planner/ProgresoModal.tsx` (nuevo): modal con el bundle `.json` portable del
  planner (el mismo que exporta el IOModal del Plan de cursada), con resumen de lo que
  contiene, confirmación destructiva y acuse.
- `components/planner/IOModal.tsx`: `ImportConfirm`, `ImportDone`, `summarize` e
  `ImportSummary` pasan a exportarse (los reusa el modal nuevo). Sin cambios de comportamiento.
- `components/planner/Sidebar.tsx`: prop opcional `onProgreso`; botón `side__util` «Guardar o
  cargar progreso» antes del pie.
- `components/planner/PlannerApp.tsx`: estado `progresoOpen`, monta el modal, pasa
  `onProgreso` al rail; el banner de primer uso suma el link «o cargá un progreso guardado»
  (`.first-run__load`).
- `components/planner/planner.css`: reglas `.first-run__load`, `.prog-modal`,
  `.prog-modal__stats`.

Por qué: el estado vive solo en `localStorage`; sin una entrada global, cambiar de navegador
o venir desde el planner de StudyVaults obligaba a marcar todo de nuevo (el export estaba
solo en el Plan de cursada, detrás de «Importar / Exportar»).

## 2. Plegado de años: dos casillas seguidas plegaban una sola

- `components/planner/views/CuatriView.tsx`: los años recién completados esperan en un
  `useRef<Set>` en vez del closure del `setTimeout`; el cleanup del effect cancela el timer
  pero no lo pendiente, así dos años completados en menos de 260 ms se pliegan los dos.

## 3. Título de la pestaña por vista

- `components/planner/PlannerApp.tsx`: `document.title = "<vista> · <sitio>"` en cada cambio
  de vista (`VIEW_TITLES`); el sufijo sale del título con el que llegó la página. Un
  `MutationObserver` sobre `<head>` lo reaplica cuando la metadata streameada de Next lo
  pisa tras hidratar. En StudyVaults daría «Mis materias · StudyVaults ITBA».

## 4. `title=` → Tooltip (solo en PlannerApp)

- `components/planner/PlannerApp.tsx`: la × del banner y el botón de mostrar el rail usan
  `<Tooltip>` en vez de `title=` (regla del autor). El resto de los `title=` del planner
  (~60) queda como en StudyVaults, donde se está haciendo esa migración.

## Fuera de los directorios espejados (no lo toca el sync)

`app/` (manifest instalable, iconos PNG, título de página), `components/shell/`,
`lib/content/slug.ts`, `lib/site.ts`, `scripts/`, `run.sh`: son propios del standalone y no
tienen equivalente que portar.
