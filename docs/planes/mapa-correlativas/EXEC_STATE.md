# EXEC_STATE — Mapa de correlativas v2

Rama `mapa-correlativas` (worktree `.claude/worktrees/mapa-correlativas`, creada desde
`main@334b40f` porque otra sesión sigue commiteando en `main`). Se mergea a `main` al cierre.

## Pasos

| Paso | Estado | Commit | Notas |
|---|---|---|---|
| F0 reconciliación + PLAN/EXEC_STATE/FIXES | DONE | (este) | 12 gaps (G-01…G-12), todos con fix asignado |
| Ola 1 · U1 layout puro + test | DONE | 3f577ab | 1 vuelta de fix (columna fantasma por créditos; comparador no transitivo). Ajuste N0-10 del orquestador |
| Ola 1 · U2 hook de viewport + test | DONE | 3f577ab | VERDE a la primera |
| Ola 1 · U6 modelo puro + test | DONE | 3f577ab | VERDE; `neighborOf` ↑↓ ahora recorre sub-columna por sub-columna (orquestador) |
| Ola 1 · U8 CSS | DONE | 3f577ab | VERDE (1 media: `r` del punto → agregado en CSS) |
| Ola 1 · integración + gates + commit | DONE | 3f577ab | typecheck · build · test:grafo limpios; GrafoView viejo puenteado a la firma nueva hasta la ola 2. 10 agentes, 1,46 M tokens |
| Ola 2 · U3 tarjeta | DONE | c443d3e | VERDE (1 baja: tamaño de los glifos → regla en grafo.css) |
| Ola 2 · U4 controles + minimapa | DONE | c443d3e | VERDE a la primera |
| Ola 2 · U5 stage SVG | DONE | c443d3e | VERDE a la primera |
| Ola 2 · U7 GrafoView (orquestador) + integración + gates + commit | DONE | c443d3e | Smoke en dev (S, LCA, I, B, P; claro/oscuro; 400 px; teclado). Fixes del orquestador: tap con pointer capture (target del pointerdown), encuadre de la frontera sin hueco a la izquierda y apoyado arriba con la capa encendida, foco por teclado que se revela. 6 agentes, 0,91 M tokens |
| Transversal · U9 persist + package.json | DONE | 3f577ab | `loadGrafoElectivas`/`saveGrafoElectivas`, `npm run test:grafo` |
| Transversal · U10 docs (CAMBIOS-LOCALES §18) | DONE | c443d3e | |
| Cierre · U11 smoke con datos | DONE | | dev (S, LCA, I, B, P; claro/oscuro; 400 px; teclado) y build estático servido bajo `/Cuatris/` |
| Cierre · U12 auditoría final adversarial + fixes + gates + veredicto | DONE | 8a3e539 | 6 auditores Fable (53 hallazgos: 6 altas —3 duplicados—, 19 medias, 28 bajas). La refutación por agente se frenó a pedido del autor (25 agentes Fable era desproporcionado): adjudicó el orquestador (Opus). Detalle abajo |
| Merge a `main` | TODO | | push solo a pedido del autor |

## Decisiones N0

- **N0-1** Capa de electivas apagada por defecto (persistida en `plan_grafo_electivas_v1`):
  el espinazo de obligatorias solo se lee entero y legible; las electivas son hojas que
  duplican los nodos y triplican las aristas. La búsqueda la enciende sola si hace falta.
- **N0-2** Clic en un nodo = fijar la cadena y la tarjeta (con `EstadoControl` y «Detalle»);
  el `DetailDrawer` se abre con doble clic o desde «Detalle». Antes el clic abría el drawer:
  cambia porque el drawer tapa el mapa y no deja ver qué se destraba al cambiar el estado.
- **N0-3** Espinazo arriba (obligatorias, alto fijo por plan) y electivas colgando debajo de
  un riel: las obligatorias no se mueven al prender/apagar la capa.
- **N0-4** Aristas de cadena en dos tonos: aguas arriba (necesita) en tinta, aguas abajo
  (destraba) en acento — la pregunta del mapa («qué destraba») va en el color de acento.
- **N0-5** Electivas sin correlativas se ubican por créditos acumulados del plan nominal
  (dato del plan, no invención); sin ningún requisito, columna 0. Columnas largas de
  electivas se parten en sub-columnas de 14; las aisladas van a la derecha (sin cruces).
- **N0-6** Layout y modelo son funciones puras sobre el plan (`computeGraphLayout(plan)`),
  testeables con Node contra las 16 carreras; la vista pasa `PLAN`.
- **N0-7** Sin leyenda, pistas, contador ni porcentaje de zoom: todo por forma, color,
  tooltips y la tarjeta. Los mismos glifos de estado que `EstadoControl`.
- **N0-8** El encuadre inicial va a la frontera (primer cuatrimestre con obligatorias
  pendientes), no a 1.º año.
- **N0-9** Modelos: workers Sonnet (effort high en U1/U2/U5), verificadores de ola Sonnet
  high, auditores y refutadores del cierre en Fable.

- **N0-10** El ancho de las columnas depende de la capa: con electivas apagadas todas miden
  `NODE_W` (espinazo compacto, sin huecos); encendidas, las columnas con sub-columnas se
  ensanchan y corren a las siguientes. La fila (`y`) y la columna de cada obligatoria no
  cambian. (El builder de U1 había fijado la geometría con el grafo completo para cumplir
  el test (d) al pie de la letra; el test pasa a exigir columna e `y`, no `x`.)

- **N0-11** `viewport.set` (minimapa) cuenta como interacción del usuario: un resize
  posterior no pisa esa vista.
- **N0-12** El tap se decide por el elemento bajo el puntero en el `pointerdown` (con
  `setPointerCapture` el `pointerup` llega retargeteado al viewport).

- **N0-13** Encuadre de la frontera: al borde izquierdo, con la columna anterior de
  referencia solo si ambas entran; con la capa encendida el lienzo se apoya arriba. La
  opción `align:"left-third"` del hook se elimina (nadie la usaba). El encuadre automático
  usa `frame({auto:true})`, nunca el `fitAll` pegajoso del botón «ver todo».
- **N0-14** «Cursando» en el mapa va en slate/`--link`, como `EstadoControl` y la barra
  (DESIGN.md: un estado = un color). El acento (`--brass`) queda para cursable, aristas
  que destraban y énfasis; como texto se usa `--accent-text`.
- **N0-15** Planes con año pero sin cuatrimestre (LCA): cada año se parte en tantas
  columnas como su cadena interna más larga; cabecera solo en la primera columna del año.
- **N0-16** El espinazo pasa por una transposición geométrica de pares adyacentes tras la
  mediana (cruces reales −20…−50 % en todas las carreras; ≤ 7 ms por layout).

## Auditoría final (adjudicación del orquestador)

Confirmados y corregidos: la animación de entrada de las electivas pisaba `.is-dim` y
`.st-blocked` (`both` → `backwards`; 3 auditores lo vieron); salto de escala tras «ver
todo» en pantallas angostas (piso dinámico); ↑↓ entre sub-columnas; `fitAll` pegajoso
desde el encuadre automático; columna fantasma con la capa apagada (L, LAES, LN, Q); LCA
con materias bajo la cabecera de otro año; búsqueda que reencendía la capa y pisaba la
preferencia; `localeCompare` con locale del sistema; Esc que no soltaba con el foco fuera de
la sección; doble clic que soltaba el fijado; foco perdido al soltar desde la tarjeta;
tab-stop inicial en 1.º año; «ir a donde estoy» que escondía la frontera con zoom alto;
tarjeta cortada por arriba en móvil; paneo sin cota; encuadres que no contaban como
interacción; color de «cursando» y textos en acento crudo (contraste); re-renders del SVG
por estados ajenos (`memo` + callbacks estables); glifos duplicados (ahora los de
`EstadoControl` + `IconLock`); `test:grafo` sin datos generados y conteo cableado; docs
(§18, PLAN, CLAUDE.md, README) desactualizados; y las bajas baratas (aria-pressed, «+N»
con tooltip, chip de correlativa ausente del plan, deltaMode/ctrl+rueda, pinch con tres
dedos, tooltips a medida, z-index de los controles, `preventScroll`, listas vacías
estables, código muerto, comentarios viejos).

Refutados / no aplicados: ninguno de los alta/media. Diferidos a FIXES.md: S-03 (dato de
E: correlativa 31.17 fuera del plan), S-04 (pasar `nodeById` al stage).

## Veredicto final

VERDE. Gates: `npm run typecheck`, `npm run build`, `npm run test:grafo` limpios; smoke en
dev y en el build estático servido bajo `/Cuatris/` (S, LCA, I, B, P; claro/oscuro; 400 px;
teclado). Pendiente del autor: merge de `mapa-correlativas` a `main` y push (dispara el
deploy).
