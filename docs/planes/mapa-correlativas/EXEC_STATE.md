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
| Ola 2 · U3 tarjeta | TODO | | |
| Ola 2 · U4 controles + minimapa | TODO | | |
| Ola 2 · U5 stage SVG | TODO | | |
| Ola 2 · U7 GrafoView (orquestador) + integración + gates + commit | TODO | | |
| Transversal · U9 persist + package.json | DONE | 3f577ab | `loadGrafoElectivas`/`saveGrafoElectivas`, `npm run test:grafo` |
| Transversal · U10 docs (CAMBIOS-LOCALES §18) | TODO | | |
| Cierre · U11 smoke con datos | TODO | | |
| Cierre · U12 auditoría final adversarial + fixes + gates + veredicto | TODO | | |
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

## Veredicto final

(pendiente)
