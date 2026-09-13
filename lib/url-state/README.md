# url-state — contrato de estado deep-linkable

Capa que agrega **estado en la URL** a las islas cliente del sitio, para que
**recargar** y **compartir un link** reproduzcan el estado intermedio de una
página. El sitio sigue siendo **Next static export multi-ruta** (802 páginas,
pagefind, SEO) que YA navega sin reload (soft-nav vía `next/link`); esto es
**aditivo**.

> Fuente de verdad del mecanismo: `core.ts` (leelo). Basado en la guía de Next 16
> `single-page-applications` → "Shallow routing on the client": `history.pushState`/
> `replaceState` se integran con el router de Next y sincronizan sin recargar.

## API (de `@/lib/url-state/core`)

- `readParams(): URLSearchParams` — params actuales (vacío en SSR).
- `writeParams(mutate, mode?)` — muta los params vivos y escribe la URL (History
  API). `mode` = `"replace"` (default) | `"push"`.
- `useUrlState<T>({ initial, decode, encode, mode? }) → [value, set, hydrated]`
  — estado `useState` sincronizado con la URL, SSR-safe. Para islas simples.
- helpers: `csv` (Set⇄CSV), `flag` (bool por `"1"`), `setOrDelete(p,key,val,keep)`.

## Reglas duras (no negociables)

1. **SSR-safe.** Primer render = `initial` determinista (igual a SSR). Se hidrata
   desde la URL DESPUÉS de montar (mismo idioma que `persist.ts`/`SheetShell`).
   Nunca leer `window`/`location` fuera de un effect/handler.
2. **Cada superficie toca SOLO sus claves.** `writeParams`/`encode` hacen
   read-modify-write: seteá/borrá únicamente tus claves. Así dos islas en la
   misma ruta (planner + búsqueda global en `/electivas`) no se pisan.
3. **`decode` SIEMPRE valida.** Clave desconocida/fuera de rango → default. Nunca
   confíes en que la URL trae algo válido.
4. **Borrá las claves en su default.** URL corta y estable; `?` limpio cuando
   todo está por defecto (usá `setOrDelete`).
5. **Gatear escrituras detrás de `hydrated`.** No escribir la URL con defaults
   antes de haber leído lo que venía en ella (si no, un link compartido se pisa
   solo al montar). `useUrlState` ya lo maneja; en el reducer del planner,
   replicar el patrón del flag `hydrated` existente.
6. **`replace` por default; `push` solo para abrir/cerrar discreto** que Atrás
   deba revertir (drawer, tool abierta). No uses `push` para cada tecla/tick.
7. **No romper el static export.** Nada de `useSearchParams()` sin Suspense (deopta
   la página). Nada de `router.push` para estado efímero. Nada de hex/tokens
   nuevos: esto es lógica, no presentación.

## Taxonomía de claves (asignación fija — NO reutilizar entre superficies)

| Superficie | Ruta | Claves | Notas |
|---|---|---|---|
| **Búsqueda global** (modal) | todas | `q` | presencia abre el modal; valor = query. |
| **Planner** | `/electivas` | `view`, `pq`, `areas`, `disp`, `hor`, `combo`, `drawer`, `ficha` | ver abajo. `q` es de la búsqueda global, NO del planner. |
| **Toolkit** | `/[vault]/herramientas` | `tool` | key de la tool activa; ausente = grilla. |
| **Hojas** | `/[vault]/hojas` | `hoja` | `formulas` \| `conceptos` (el modo). Densidad/columnas/filtros siguen en localStorage (personales). |
| **Wiki** | `/[vault]/...` | — (ninguna) | El estado del sidebar/rails es **personal**, no compartible: sigue en localStorage/sessionStorage (WikiRail). El deep-link del wiki es la ruta + `#heading`, que ya funciona. |

### Detalle planner (`/electivas`)

Solo va a la URL el **estado de vista/navegación** (compartir link = misma vista
sobre los datos de quien lo abre). Lo **personal/pesado** (materias aprobadas,
opciones del plan) sigue SOLO en localStorage (`persist.ts`, sin cambios).

| Clave | Estado | Encoding | Default (se omite) |
|---|---|---|---|
| `view` | `state.view` | enum `cuatri\|elect\|combo\|plan\|grafo\|ref` | `cuatri` |
| `pq` | `state.search` | string | `""` |
| `areas` | `state.areasOn` | CSV de áreas, **solo si != todas** | todas activas |
| `disp` | `state.fDisp` | `"1"` | off |
| `hor` | `state.fHor` | `"1"` | off |
| `combo` | `state.combo` | CSV de códigos | vacío |
| `drawer` | `state.drawerCode` | código | null |
| `ficha` | `state.fichaCode` | código | null |

- **NO** van a la URL: `approved`, `plan.*`, `comboParams`, `fixedCom`, `combos`,
  `comboIdx`, `sideCollapsed` (siguen en localStorage / efímeros).
- **Overlap con localStorage**: `combo` se persiste en ambos. **La URL gana** al
  montar (intención explícita del link); si la URL no trae `combo`, cae a
  localStorage. Al cambiar, escribir en ambos.

## Patrón A — isla `useState` (toolkit, hojas, búsqueda global)

```tsx
import { useUrlState, setOrDelete } from "@/lib/url-state/core";

const VALID = new Set(tools.map((t) => t.key));
const [active, setActive, hydrated] = useUrlState<string | null>({
  initial: null,
  decode: (p) => {
    const t = p.get("tool");
    return t && VALID.has(t) ? t : null;          // validar
  },
  encode: (v, p) => setOrDelete(p, "tool", v ?? "", v != null),
  mode: "push",                                    // Atrás vuelve a la grilla
});
```

## Patrón B — reducer (planner)

El planner ya hidrata de localStorage en un effect (`HYDRATE`) y persiste por
slice gateado en `state.hydrated`. Se agrega en paralelo:

1. **Hidratar de la URL al montar** (después o junto al `HYDRATE` de localStorage):
   leer `readParams()`, validar, y despachar las acciones existentes
   (`SET_VIEW`, `SET_SEARCH`, `TOGGLE_AREA`, `SET_FILTER`, `TOGGLE_COMBO`,
   `OPEN_DRAWER`, `OPEN_FICHA`). La URL pisa lo de localStorage en las claves que
   trae. Marcar un flag `urlHydrated` (o reusar `hydrated`) para gatear.
2. **Escribir la URL** con un effect que observe las slices espejadas y llame
   `writeParams`, gateado en hidratado. Mantené las escrituras a localStorage
   existentes (no las quites). `drawer`/`ficha` → `push`; el resto → `replace`.

No cambiar la firma pública de `PlannerApp` ni el shape persistido en localStorage.

## Verificación (obligatoria por superficie)

- `tsc` limpio y `next build` limpio (802 páginas).
- En el browser: setear estado → la URL refleja → **recargar** reproduce el
  estado → **atrás/adelante** funciona → un link pegado en pestaña nueva
  reproduce el estado. Sin warnings de hidratación en consola.
