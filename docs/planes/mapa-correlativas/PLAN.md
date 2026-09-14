# Mapa de correlativas v2 — plan de rediseño y rebuild

Pedido del autor (2026-09-14): «Rediseña y rebuildea todo el mapa de correlativas. La idea
central de toda la página es describir lo mínimo y que sea todo interactivo e intuitivo».

Método: `/workforce` (olas verificadas). Estado de ejecución en `EXEC_STATE.md`; fixes
diferidos en `FIXES.md`.

## 0. Estado real (Fase 0, reconciliación)

Lo que hay hoy (`components/planner/views/GrafoView.tsx`, `grafo.css`,
`lib/planner/layoutGraph.ts`; intactos desde el import inicial de StudyVaults):

- SVG con pan/zoom a mano, layout Sugiyama L→R por cuatrimestre (obligatorias) y «un cuatri
  después de la última correlativa» (electivas), centrado vertical por columna.
- Texto explicativo por todos lados: leyenda de 6 ítems, pista «arrastrá para mover · rueda
  para zoom», «Pasá el mouse…», conteo «96 materias · 125 correlativas», lectura «55 %».
- Hover = cadena (una sola tonalidad); clic = abre el `DetailDrawer`. Botones con `title=`.

Gaps encontrados (cada uno con su fix en la unidad indicada):

| Gap | Qué pasa | Fix |
|---|---|---|
| G-01 | Solo se dibujan las materias que aparecen en alguna arista: quedan afuera las aisladas (Informática: 72.45 Proyecto Final, 72.98, 94.24, 12.09…; Industrial: 84 de 145). | U1: el layout parte de TODAS las materias del plan. |
| G-02 | Obligatorias sin `cuatri` (LCA: ninguna lo tiene) caen todas en la columna 0 → una sola columna de 11 nodos. | U1: columna por `anio` si falta `cuatri`, y por camino más largo si no hay nada; pasada de validez (toda arista va estrictamente a la derecha). |
| G-03 | Electivas sin correlativas se ubican en la columna 0 aunque exijan créditos (Industrial: 55 electivas piden 72 cr). | U1: columna mínima por créditos acumulados del plan nominal. |
| G-04 | Columnas de 20+ electivas (una sola fila por nodo) → lienzo de 1.500+ px de alto. | U1: las electivas de una columna se reparten en sub-columnas de a lo sumo `MAX_ROWS`; las sin aristas van a la derecha (no cruzan nada). |
| G-05 | Leyenda, pistas, conteo y porcentaje: describen en vez de mostrar. | U5/U7/U8: se eliminan; la semántica va en forma, color y tooltips/tarjeta de hover. |
| G-06 | `title=` en los botones de zoom (regla del autor: `Tooltip`). | U4. |
| G-07 | Una sola tonalidad de cadena: no distingue «lo que necesito» de «lo que destrabo». | U5/U8: aguas arriba en tinta, aguas abajo en acento. |
| G-08 | El estado (cursando / cursada / final) no se ve en el mapa; solo «aprobada». | U5/U6: mismos glifos que `EstadoControl`. |
| G-09 | No se puede cambiar el estado desde el mapa. | U3: la tarjeta fijada lleva el `EstadoControl`. |
| G-10 | Sin pinch en táctil (`touch-action:none` mata el zoom nativo). | U2. |
| G-11 | `computeGraphLayout()` lee `PLAN` global: no testeable con Node contra las 16 carreras. | U1: función pura `computeGraphLayout(plan, opts)` + `scripts/test-grafo-layout.mts`. |
| G-12 | Encuadre inicial fijo en 1.º año aunque el estudiante vaya por 4.º. | U2/U7: encuadre en la «frontera» (primer cuatrimestre con obligatorias pendientes). |

Fuera de alcance (anotado, no se hace): portar a StudyVaults (`CAMBIOS-LOCALES.md` §18 lo
registra), puntos de área/minor en las electivas del mapa (S-01 en `FIXES.md`).

## 1. Contrato de diseño (decisiones N0)

Principio: **cero texto que describa**. Nada de leyendas, pistas ni contadores. Cada control
y cada estado se explican solos por forma, posición y color (los mismos del resto del planner)
y, al posarse, por un `Tooltip` o por la tarjeta de la materia. Textos de la interfaz en voseo
(hablan a estudiantes), como el resto del planner.

### 1.1 Lienzo

- Columnas = cuatrimestres del plan (`1º·1c … 5º·2c`), cabecera «1º» (mono 12 px 600) y
  «1c» (mono 9.5 px, mayúsculas, muted). Bandas de año alternadas de fondo
  (`color-mix(muted 4%)`), sin guías verticales. Planes sin cuatrimestre nominal: cabecera
  solo con el año; sin nada nominal: sin cabeceras ni bandas.
- **Espinazo arriba, electivas abajo**: la banda superior contiene las obligatorias (alto =
  la columna con más obligatorias; cada columna centrada verticalmente en la banda). Las
  electivas cuelgan debajo de la banda, alineadas arriba, separadas por un riel punteado
  (solo cuando la capa de electivas está encendida). La posición de las obligatorias **no
  depende** de la capa de electivas.
- Nodo obligatoria 108×34; electiva 108×28. Contenido: punto de tipo a la izquierda
  (`--slate` obligatoria / `--brass` electiva, r=3), sigla (mono; 12 px 600 / 11 px 500),
  glifo de estado a la derecha. Siglas de más de 9 caracteres (obligatoria) o 10
  (electiva) se comprimen con `textLength`/`lengthAdjust="spacingAndGlyphs"` hasta el
  ancho útil entre el punto y el glifo.
- Estados (un estado = un color, igual que `EstadoControl`):

  | Estado | Relleno / borde | Glifo |
  |---|---|---|
  | final aprobado | `status-go` 14 % / go 45 % | doble tilde (`CheckDouble`) en go |
  | cursada, falta final | `status-warn` 14 % / warn 45 % | tilde simple en warn |
  | promocionada / no rinde | `status-promo` 14 % / promo 45 % | tilde rellena en promo |
  | cursando | slate 16 % / slate 60 % (como `EstadoControl` y la barra) | punto `--link` (pulso de motion.css) |
  | cursable | brass 6 % / `--brass` 1.6 px | ninguno |
  | bloqueada (faltan correlativas o créditos) | panel / `--line`, opacidad .62 | candado muted |

- Aristas: por defecto `color-mix(muted 30%)` 1.2 px con flecha chica. Con una materia
  activa (hover o fijada): las aristas **aguas arriba** (lo que necesita) en tinta
  (`color-mix(ink 55%)` 1.8 px), las **aguas abajo** (lo que destraba) en `--brass` 2 px;
  el resto a opacidad .05. Nodos fuera de la cadena a opacidad .18.
- Modos de énfasis (excluyentes, en este orden de prioridad): cadena (hover ?? fijada) ›
  búsqueda (consulta no vacía: coinciden en código/sigla/nombre) › foco «Cursables» (chip) ›
  ninguno.

### 1.2 Interacción

- Arrastrar = panear; rueda = zoom anclado al cursor; pinch = zoom anclado al punto medio;
  botones `+` `−`; «ver todo» (⤢); «ir a donde estoy» (◎ = frontera: primer cuatrimestre con
  obligatorias pendientes). Cuatro botones de ícono con `Tooltip`; sin lectura de porcentaje.
- Encuadre inicial (N0-13): si todo entra legible (escala ≥ .72) se muestra entero; si no,
  escala .72 con la frontera al borde izquierdo —con la columna anterior (ya cursada) de
  referencia si ambas entran— y la banda del espinazo centrada; con la capa de electivas
  encendida el lienzo se apoya arriba (cabeceras visibles, electivas colgando). Se
  re-aplica al cambiar de tamaño o de capa mientras el usuario no haya tomado control
  (panear, zoom, ver todo, ir a donde estoy, Enter en la búsqueda, flechas).
- Posarse sobre un nodo (180 ms): cadena + **tarjeta** a la derecha del nodo (a la izquierda
  o debajo si no entra): sigla · código · créditos / nombre / línea de estado con color de
  estado («Cursable», «Faltan: AM1 · Álgebra», «Faltan 24 créditos», «Cursando», «Cursada ·
  falta el final», «Final aprobado», «Promocionada») / fila «Requiere» (chips de las
  correlativas directas, tildadas las aprobadas) / fila «Habilita» (chips de lo que destraba
  directamente). La tarjeta de hover no captura el puntero.
- Clic en un nodo = **fijar** (la cadena queda y la tarjeta suma el `EstadoControl` y el
  botón «Ver detalle» → `OPEN_DRAWER`); clic sobre el fijado, clic en vacío o Esc = soltar
  (Esc desde cualquier lado, salvo con el detalle o la ficha abiertos; si el foco estaba
  en la tarjeta vuelve al nodo). Doble clic = abrir el detalle con el nodo fijado. El nodo
  fijado nunca se atenúa. Un arrastre nunca fija.
- Teclado: un solo tab-stop entre los nodos (roving; de entrada, la primera obligatoria de
  la frontera), flechas ← → siguen correlativas, ↑ ↓ recorren la columna (obligatorias y
  después las electivas sub-columna por sub-columna), Enter/Espacio fija, Esc suelta; el
  nodo enfocado por teclado se revela si quedó fuera de la vista.
- Búsqueda (campo de la cabecera de la vista, mismo aspecto que «Materias»): filtra en vivo
  (100 ms) resaltando coincidencias; Enter centra y fija la primera; Esc limpia. Si solo
  coinciden electivas y la capa está apagada, se enciende sola (una vez por consulta, sin
  tocar la preferencia guardada).
- Chips (mismo `vtools__chip` que «Materias»): **Electivas** (capa; se persiste en
  `plan_grafo_electivas_v1`; default apagada; no se muestra si el plan no tiene electivas)
  y **Cursables** (foco: resalta lo que ya se puede cursar). Cada chip con `Tooltip`.
- Minimapa (esquina inferior izquierda, oculto bajo 640 px): nodos como puntos, rectángulo
  del viewport; arrastrar o tocar panea.
- Cambiar el estado desde la tarjeta fijada recalcula todo el planner (misma acción
  `SET_ESTADO`): el mapa muestra al instante qué se destraba.

### 1.3 Reglas duras

- Sin `title=`; todo control con `Tooltip` (`components/planner/Tooltip.tsx`).
- Cero hex en CSS: solo tokens del planner (`--panel`, `--line`, `--ink`, `--muted`,
  `--brass`, `--slate`, `--status-*`, `--status-*-text`, `--shadow-*`, `--ring`,
  `--dur-*`, `--ease-*`). Texto de estado siempre con `--status-*-text`.
- Static-export safe: `window`/`document`/`ResizeObserver` solo dentro de `useEffect`; primer
  render determinista.
- `prefers-reduced-motion: reduce` apaga transiciones y pulsos.
- Sin dependencias nuevas. Sin `any`. `npm run typecheck` y `npm run build` limpios.
- No tocar archivos fuera del ownership de la unidad (§3). Los puntos compartidos
  (`GrafoView.tsx`, `persist.ts`, `CAMBIOS-LOCALES.md`) los integra el orquestador.

## 2. Contratos de módulo (firmas fijas; las unidades construyen contra esto)

### 2.1 `lib/planner/layoutGraph.ts` (U1) — puro, solo `import type`

```ts
import type { Edge, Plan } from "./types";

export interface GraphNode { id: string; abbr: string; ob: boolean; col: number; x: number; y: number; w: number; h: number }
export interface GraphColumn { index: number; x: number; cx: number; width: number; year: number | null; top: string | null; sub: string | null }
export interface GraphBand { year: number; x: number; width: number }
export interface GraphLayout {
  nodes: GraphNode[]; edges: Edge[]; columns: GraphColumn[]; bands: GraphBand[];
  width: number; height: number;
  /** y donde termina la banda del espinazo (riel); las electivas empiezan debajo */
  spineBottom: number;
  /** hay electivas EN EL LIENZO (capa encendida y el plan tiene alguna) */
  hasElectivas: boolean;
}
export interface LayoutOptions { electivas: boolean }
export const GRAPH_METRICS: { NODE_W: 108; OB_H: 34; EL_H: 28; COL_GAP: 60; SUB_GAP: 10; OB_GAP: 10; EL_GAP: 8; PAD: 40; HEADER_H: 36; BAND_GAP: 26; MAX_ROWS: 14 };
export function computeGraphLayout(plan: Plan, opts?: LayoutOptions): GraphLayout;
```

Reglas:
1. Nodos = todas las `obligatorias` + (si `opts.electivas`) todas las `electivas`.
   Aristas = de `Materia.correlativas` (c → m), filtradas a nodos presentes (con la capa
   apagada se descartan las que tocan electivas).
2. Columna nominal: `anio`+`cuatri` → `(anio-1)*2+(cuatri-1)`. Solo `anio` (LCA): cada año
   ocupa tantas columnas como el camino más largo entre sus propias obligatorias y cada
   una va a la columna de su profundidad dentro del año (columnas acumuladas por año);
   nada → null. Obligatorias con nominal: esa columna. Resto: `max(col(pred)+1)` sobre sus
   correlativas presentes, y para electivas además `≥ colCreditos(creditosReq)` =
   (primera columna k con acumulado nominal ≥ creditosReq) + 1 (acumulado = suma de créditos
   de obligatorias con nominal ≤ k; si nunca alcanza, la última columna). Sin correlativas ni
   créditos → 0. Punto fijo (electiva→electiva, obligatorias sin nominal).
3. Pasada de validez: para toda arista `from→to`, `col(to) ≥ col(from)+1` (empujar `to`;
   punto fijo, guard 100).
4. Orden en cada columna: obligatorias arriba (orden inicial por `anio, cuatri, codigo`), luego
   electivas (inicial por sigla). Heurística de la mediana (16 barridas alternadas
   abajo/arriba) sin nodos dummy: como muchas aristas saltan varias columnas, cada nodo toma
   la mediana de la **posición normalizada** (`i/(n-1)`, o .5 si la columna tiene un solo
   nodo) de TODOS sus predecesores (barrida hacia abajo) o sucesores (hacia arriba), estén en
   la columna que estén; sin vecinos conserva su lugar (sort estable). Las obligatorias solo
   miran vecinos obligatorios (el espinazo no depende de la capa); las electivas miran a sus
   correlativas (ya fijas) y a sus sucesoras electivas. Dentro de las electivas, primero las
   que tienen alguna arista (ordenadas por mediana), después las aisladas (por sigla).
   Después de la mediana, el espinazo pasa por una transposición de pares adyacentes
   (Sugiyama) que intercambia dos obligatorias vecinas si bajan los cruces GEOMÉTRICOS
   entre aristas obligatoria→obligatoria. Todo orden por texto usa `localeCompare` con
   locale fijo `"es"` (determinismo entre navegadores).
5. Coordenadas: `x` de columna acumulado (ancho de columna = `max(NODE_W, sub*(NODE_W+SUB_GAP)-SUB_GAP)` con `sub = ceil(nElectivas/MAX_ROWS)`, o 1 con la capa apagada — N0-10); `COL_GAP` entre columnas; con la capa apagada las columnas terminan en la última obligatoria (sin columna fantasma). Banda del espinazo: alto = `maxOb*(OB_H+OB_GAP)-OB_GAP`, obligatorias centradas en la banda; `spineBottom = PAD+HEADER_H+bandH`. Electivas desde `spineBottom+BAND_GAP`, en columnas de a `MAX_ROWS` (llenado por columna: la primera sub-columna se lleva las que tienen aristas).
6. `columns[k]`: `top`/`sub` según nominal del plan (`"1º"`/`"1c"`; solo año → `top` solo en
   la primera columna del año y `sub:null`; nada nominal → ambos null). Las columnas que quedan **más allá de la última columna
   nominal** (nodos empujados por la pasada de validez, p. ej. P: 46.02→46.03 ambas de
   5º·2c) no llevan cabecera (`top`/`sub` null, `year` null): no se inventa un «6.º año».
   `bands`: una por año con ≥1 columna nominal, solo si hay años nominales.
7. Determinista (misma entrada → mismo JSON). Cero solapamientos. `width/height` finitos.

Done-test (`scripts/test-grafo-layout.mts`, Node ≥ 23 con type stripping, carga
`lib/planner/data.json` y `lib/planner/carreras/*.json`; falla con exit ≠ 0): para cada plan,
con capa encendida y apagada: (a) un nodo por materia; (b) toda arista `col(to) > col(from)`;
(c) sin solapamiento de rectángulos (incluye cabeceras: ningún nodo por encima de
`PAD+HEADER_H`); (d) obligatorias: mismas `x,y` con la capa encendida y apagada; (e) S:
columna de cada obligatoria = su cuatrimestre nominal; LCA: ≥ 2 columnas y `sub === null`;
(f) determinismo; (g) ninguna columna de electivas con más de `MAX_ROWS` filas; (h) imprime
por plan: columnas, ancho×alto, cruces aproximados (aristas ob→ob que se cruzan). Se agrega
`"test:grafo": "node scripts/test-grafo-layout.mts"` en `package.json` (orquestador).

### 2.2 `components/planner/grafo/grafoModel.ts` (U6) — puro, solo `import type`

```ts
import type { Edge, Materia } from "@/lib/planner/types";
import type { GraphNode } from "@/lib/planner/layoutGraph";

export interface GraphAdjacency { succ: Map<string, string[]>; pred: Map<string, string[]> }
export function buildAdjacency(edges: Edge[]): GraphAdjacency;
/** up = todo lo que necesita (ancestros), down = todo lo que destraba (descendientes); all = up ∪ down ∪ {id} */
export interface Chain { up: Set<string>; down: Set<string>; all: Set<string> }
export function chainOf(id: string, adj: GraphAdjacency): Chain;

export type NodeEstado = "final" | "regular" | "promo" | "cursando" | "avail" | "blocked";
export interface NodeStatus { estado: NodeEstado; faltanCorr: string[]; faltanCred: number }
export interface StatusCtx { approved: Set<string>; finalDone: Set<string>; cursando: Set<string>; approvedCredits: number; tieneFinal: (code: string) => boolean }
export function statusOf(m: Materia, ctx: StatusCtx): NodeStatus;
/** primera columna con alguna obligatoria no aprobada; 0 si no hay */
export function frontierColumn(nodes: GraphNode[], approved: Set<string>): number;
/** ids cuyo código, sigla o nombre normalizados contienen la consulta normalizada; vacío si la consulta está vacía */
export function matchQuery(materias: Materia[], query: string, norm: (s: string) => string): Set<string>;
/** vecino para navegación por teclado: ArrowRight = primera sucesora, ArrowLeft = primera predecesora, ArrowUp/Down = anterior/siguiente en la misma columna (obligatorias primero, después las electivas sub-columna por sub-columna: por x y luego por y) */
export function neighborOf(id: string, key: string, nodes: GraphNode[], adj: GraphAdjacency): string | null;
```

`statusOf`: `finalDone` → `final`; `approved` sin final → `tieneFinal ? "regular" : "promo"`;
`cursando` → `cursando`; si no, `faltanCorr` = correlativas no aprobadas, `faltanCred` =
`max(0, creditosReq - approvedCredits)`; ambos vacíos → `avail`, si no `blocked` (misma verdad
que `metrics.isAvailable` + `estado.estadoOf`).

Done-test (`scripts/test-grafo-model.mts`): sobre S: `chainOf("72.11")` (AM2 o la que
corresponda) separa up/down y no se incluyen mutuamente; `statusOf` coincide con
`isAvailable`-equivalente para 30 materias al azar con `approved` = `aprobadasDefault` ∪ 1.º
año; `matchQuery("am")` incluye AM1/AM2; `frontierColumn` con todo 1.º año aprobado = 2.

### 2.3 `components/planner/grafo/useViewport.ts` (U2) — hook cliente

```ts
export interface Transform { scale: number; tx: number; ty: number }
export interface ContentRect { x: number; y: number; w: number; h: number }
export interface ViewportApi {
  viewportRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<SVGGElement | null>;
  get(): Transform;
  set(t: Transform): void;                                    // clamp de escala + aplica + notifica
  zoomBy(factor: number): void;                               // anclado al centro; marca interacción
  fitAll(): void;                                             // encuadra todo (FIT_PAD 40); sticky ante resize
  frame(rect: ContentRect, opts?: { scale?: number; auto?: boolean }): void; // centra un rect; `auto` = encuadre automático (no marca interacción)
  centerOn(x: number, y: number, minScale?: number): void;    // centra un punto, escala ≥ minScale; marca interacción
  toScreen(x: number, y: number): { x: number; y: number };   // contenido → px del viewport
  subscribe(cb: (t: Transform) => void): () => void;          // notifica en rAF tras cada cambio
  handlers: { onPointerDown; onPointerMove; onPointerUp; onPointerCancel } // para el div del viewport
  ready: boolean;                                             // primer encuadre aplicado (estado React)
}
export interface ViewportOptions {
  width: number; height: number;                              // tamaño del contenido
  initialFrame: (api: ViewportApi) => void;                   // encuadre inicial (lo define la vista)
  onTap?: (target: Element, e: PointerEvent) => void;         // clic limpio (sin arrastre > 5 px)
  onDoubleTap?: (target: Element, e: PointerEvent) => void;   // dos taps en < 320 ms sobre el mismo target
}
export function useViewport(opts: ViewportOptions): ViewportApi;
export const VIEWPORT_LIMITS: { MIN_SCALE: 0.25; MAX_SCALE: 2.4; FIT_MIN_SCALE: 0.06; FIT_PAD: 40 };
```

Comportamiento: transformación en `useRef` aplicada imperativamente al `transform` del
`<g>` (no re-renderiza React); rueda con listener nativo `{passive:false}` (zoom anclado al
cursor, factor `1.0016^-deltaY`); arrastre con `setPointerCapture` (clase `is-panning` en el
viewport mientras se mueve); **pinch** con dos punteros (escala por razón de distancias,
anclada al punto medio, que también panea); doble rAF para el encuadre inicial +
`ResizeObserver` que re-encuadra (`fitAll` si el último pedido fue «ver todo», si no
`initialFrame`) mientras `userInteracted` sea falso; al cambiar `width/height` (capa de
electivas) mantiene la transformación si el usuario ya interactuó, si no re-encuadra. `set`
clampea la escala a `[piso, MAX_SCALE]`, donde el piso es `MIN_SCALE` o, si un encuadre
dejó el mapa más chico (pantallas angostas), la escala aplicada (sin saltos al primer
gesto); `fitAll` y los encuadres automáticos bajan hasta `FIT_MIN_SCALE`. El paneo se acota
para que siempre queden ≥ 64 px de contenido a la vista. `set`, `frame` (sin `auto`),
`centerOn`, rueda, pinch, arrastre y botones cuentan como interacción del usuario.
Static-export safe.

Done-test: `npm run typecheck`; funciones puras exportadas `fitTransform(contentW, contentH,
vw, vh, pad, minScale, maxScale)` y `zoomAtPoint(t, px, py, factor, min, max)` con test en
`scripts/test-grafo-viewport.mts` (fit centra; zoom mantiene fijo el punto anclado).

### 2.4 `components/planner/grafo/GrafoCard.tsx` (U3)

```tsx
export interface GrafoCardProps {
  id: string; pinned: boolean;
  anchor: ContentRect;                 // rect del nodo en coordenadas de contenido
  viewport: ViewportApi;               // toScreen + subscribe para seguir el pan/zoom
  status: NodeStatus;
  requiere: string[];                  // correlativas directas
  habilita: string[];                  // sucesoras directas
  approved: Set<string>;
  onDetalle: () => void;               // → OPEN_DRAWER (lo despacha la vista)
  onClose: () => void;                 // soltar (× de la tarjeta fijada)
}
export function GrafoCard(props: GrafoCardProps): ReactElement;
```

Se dibuja absoluto dentro de `.grafo-viewport` (no portal), con el `useLayoutEffect` que
mide y posiciona (derecha del nodo; izquierda o debajo si no entra en el viewport) y se
reubica en cada `subscribe`. Nombres y créditos desde `byId` (`@/lib/planner/model`).
`pinned=false` → `pointer-events:none`, sin controles. `pinned=true` → `EstadoControl` +
botón «Ver detalle» + botón × (`Tooltip` «Soltar · Esc»). La raíz de la tarjeta frena la
propagación de `pointerdown`/`pointerup`/`click` (así el viewport no interpreta un clic en la
tarjeta como tap en vacío ni como arrastre). Estructura de clases en §2.8.

### 2.5 `components/planner/grafo/GrafoControls.tsx` + `GrafoMinimap.tsx` (U4)

```tsx
export function GrafoControls(p: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onLocate: () => void }): ReactElement;
export function GrafoMinimap(p: { layout: GraphLayout; viewport: ViewportApi; lit: Set<string> | null }): ReactElement;
```

Controles: cuatro `<button class="grafo-btn">` con íconos SVG propios (más, menos, «ver todo»
= 4 esquinas, «ir a donde estoy» = mira/crosshair), cada uno con `Tooltip` («Acercar»,
«Alejar», «Ver toda la carrera», «Ir a donde estoy: el primer cuatrimestre con materias
pendientes»). Minimapa: `<svg viewBox="0 0 width height">` escalado a 160 px de ancho (alto
proporcional, máx. 120), nodos como `<rect>`, rectángulo del viewport actualizado por
`subscribe` (mutación directa del atributo, sin estado); `pointerdown`/`move` en el minimapa
mueve el viewport (`viewport.set` con la misma escala). Oculto en `max-width: 640px` (CSS).

### 2.6 `components/planner/grafo/GrafoStage.tsx` (U5)

```tsx
export interface Emphasis { mode: "none" | "chain" | "search" | "spot"; lit: Set<string> | null; up: Set<string> | null; down: Set<string> | null; active: string | null }
export interface GrafoStageProps {
  layout: GraphLayout;
  statuses: Map<string, NodeStatus>;
  emphasis: Emphasis;
  hoverId: string | null; pinnedId: string | null; tabStopId: string | null;
  stageRef: RefObject<SVGGElement | null>;
  nodeRef: (id: string, el: SVGGElement | null) => void;
  onHover: (id: string | null) => void;
  onFocus: (id: string) => void; onBlur: (id: string) => void;
  onKeyDown: (e: KeyboardEvent<SVGGElement>, id: string) => void;
  ready: boolean;
}
export function GrafoStage(p: GrafoStageProps): ReactElement;
```

Dibuja `<svg class="grafo-svg">` con `<defs>` (tres markers), `<g ref={stageRef}
class="grafo-stage">`: bandas, cabeceras, riel (si `hasElectivas`), aristas (Bézier cúbica del
medio-derecho al medio-izquierdo, tangentes horizontales), nodos (`<g class="gnode …"
data-code role="button" tabIndex aria-label>` con rect, ring, punto, sigla, glifo). Sin
manejadores de puntero propios (el viewport detecta el tap por `data-code`); sí
`onMouseEnter/Leave`, `onFocus/Blur`, `onKeyDown`. `aria-label`: «{sigla}, {código},
{obligatoria|electiva}, {estado en palabras}».

### 2.7 `components/planner/views/GrafoView.tsx` (U7, orquestador)

Compone todo: estado (`electivasOn` persistido, `spot`, `query`, `hoverId`, `pinnedId`,
`rovingId`), layout memoizado por `electivasOn`, statuses por estado del planner, énfasis,
frontera, teclado (Esc suelta; roving), chips, búsqueda, `OPEN_DRAWER`, encuadre inicial
(`frame` sobre la frontera). `usePlanner()` solo acá y en la tarjeta (EstadoControl).

### 2.8 Contrato de clases CSS (`components/planner/grafo.css`, U8) — todo bajo `.planner`

- Raíz: `.grafo-view` (define los tokens derivados: `--gnode-*`, `--gedge`, `--gedge-up`,
  `--gedge-down`, `--gband`, `--grail`). Cabecera: reusa `.panel-head.panel-head--tools >
  .vtools`, `.vtools__search` (+ `.grafo-search.is-nomatch input` borde `--status-warn`),
  `.vtools__chip`.
- Viewport: `.grafo-viewport` (`height: clamp(420px, 68vh, 760px)`, fondo `--panel` con
  puntos `radial-gradient` 26 px, `touch-action:none`, `overflow:hidden`, `cursor:grab`),
  `.grafo-viewport.is-panning` (`grabbing`), `.grafo-svg`, `.grafo-stage` (opacidad 0 →
  `.is-ready` 1).
- Bandas/cabeceras: `.grafo-band`, `.grafo-rail`, `.grafo-col__anio`, `.grafo-col__cuatri`.
- Aristas: `.grafo-edge`, `.grafo-edge.is-up`, `.grafo-edge.is-down`, `.grafo-edge.is-dim`;
  markers `.grafo-arrow`, `.grafo-arrow--up`, `.grafo-arrow--down`.
- Nodos: `.gnode`, `.gnode--ob`, `.gnode--el`; estado `.st-final`, `.st-regular`,
  `.st-promo`, `.st-cursando`, `.st-avail`, `.st-blocked`; énfasis `.is-dim`, `.is-hover`,
  `.is-pinned`, `.is-match`; hijos `.gnode__rect`, `.gnode__ring`, `.gnode__dot`,
  `.gnode__abbr`, `.gnode__glyph` (+ `.gnode__glyph--go/--warn/--promo/--cursando/--lock`).
  `:focus-visible` sin outline: `.gnode__rect` con `stroke: var(--brass)` 2.4 px.
- Tarjeta: `.grafo-card` (+ `.is-pinned`, `.grafo-card--left`, `.grafo-card--below`),
  `.grafo-card__head`, `.grafo-card__abbr`, `.grafo-card__code`, `.grafo-card__cr`,
  `.grafo-card__name`, `.grafo-card__status` (+ `.is-final/.is-regular/.is-promo/
  .is-cursando/.is-avail/.is-blocked`, texto con `--status-*-text`), `.grafo-card__row`,
  `.grafo-card__lbl` (mono 10 px mayúsculas muted), `.grafo-card__chips`, `.grafo-chip`
  (+ `.is-ok` go, `.is-missing` muted), `.grafo-card__acts`, `.grafo-card__estado`,
  `.grafo-card__detail` (botón texto), `.grafo-card__close` (×). Ancho 260 px (`min(260px,
  calc(100vw - 32px))` en angosto), `--shadow-2`, borde `--line-2`, radio 10 px, entrada
  `pv-tooltip-in`.
- Controles: `.grafo-controls` (abajo a la derecha, columna), `.grafo-btn` (36×36, panel-2,
  borde line-2, hover brass).
- Minimapa: `.grafo-minimap` (abajo a la izquierda), `.grafo-minimap__svg`,
  `.grafo-minimap__node` (+ `--ob`, `--el`, `.is-lit`), `.grafo-minimap__view`.
- Movimiento: nodos `transition: opacity var(--dur-base)`; `.gnode--el` entra con
  `planner-fade`; pulso de cursando con el keyframe de `motion.css` si existe (si no, uno
  propio `grafo-pulse`); todo apagado bajo `prefers-reduced-motion`.
- Angosto (`max-width: 640px`): minimapa oculto, viewport `clamp(380px, 62vh, 720px)`,
  tarjeta a ancho de pantalla menos 32 px, controles 32×32.

Done-test: `grep -nE "#[0-9a-fA-F]{3,8}\b" grafo.css` sin resultados (salvo `rgba(0,0,0`
en sombras si hiciera falta); todas las clases del contrato presentes; `npm run build` limpio.

## 3. Unidades, ownership y olas

| U | Archivos (dueño exclusivo en su ola) | Ola | Dificultad |
|---|---|---|---|
| U1 | `lib/planner/layoutGraph.ts`, `scripts/test-grafo-layout.mts` | 1 | alta |
| U2 | `components/planner/grafo/useViewport.ts`, `scripts/test-grafo-viewport.mts` | 1 | alta |
| U6 | `components/planner/grafo/grafoModel.ts`, `scripts/test-grafo-model.mts` | 1 | media |
| U8 | `components/planner/grafo.css` | 1 | media |
| U3 | `components/planner/grafo/GrafoCard.tsx` | 2 | media |
| U4 | `components/planner/grafo/GrafoControls.tsx`, `GrafoMinimap.tsx` | 2 | media |
| U5 | `components/planner/grafo/GrafoStage.tsx` | 2 | alta |
| U7 | `components/planner/views/GrafoView.tsx` | 2 (orquestador) | alta |
| U9 | `lib/planner/persist.ts` (`loadGrafoElectivas`/`saveGrafoElectivas`), `package.json` (`test:grafo`) | transversal (orquestador) | baja |
| U10 | `CAMBIOS-LOCALES.md` §18, `README.md` si nombra el mapa | transversal (orquestador) | baja |
| U11 | Smoke visual con datos (S, I, LCA, LN, E), claro/oscuro, 400 px, teclado | cierre (orquestador) | — |
| U12 | Auditoría final adversarial (auditores + refutadores en el modelo N0) | cierre | — |

Cada unidad de ola pasa por `build → verify (adversarial) → fix → re-verify`; a la 3.ª vuelta
escala BLOCKED al orquestador. DONE lo definen los done-tests, no el builder.

## 4. Gates

- `npm run typecheck`, `npm run build`, `npm run test:grafo` (los tres scripts de test).
- Smoke en `./run.sh build` (`/Cuatris/planificar/?view=grafo&carrera=…`) y en dev.
- Cero `title=` en `components/planner/grafo/**` y `GrafoView.tsx`; cero hex en `grafo.css`.
