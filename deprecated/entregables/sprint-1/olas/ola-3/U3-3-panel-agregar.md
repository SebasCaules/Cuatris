# U3.3 — `PanelAgregar` (13c: buscar y agregar materia)

## Ownership

- `app/src/componentes/PanelAgregar/**` (código, CSS, tests)

## Lee

- `CLAUDE.md`; mockup `#13c` y `#14b` (chip de minor) de `etapa3-mockup-v2.dc.html`;
  `entregables/05-plan-sprints.md` §2 (fila 13c) y §3 (hallazgo 1: minors).
- Código real: `app/src/motor/` (`buscar`, `estadoMateria`, `motivosBloqueo`), `app/src/estado/`
  (`agregarMateria`, `asignarColor`), `app/src/componentes/primitivas/` (PanelLateral, Campo,
  Chip, Etiqueta, Glifo, Boton).

## Entregables

1. **`PanelAgregar`** (`props`: `periodo`, `alCerrar`, `alElegirComision(codigo)`):
   `PanelLateral` con cabecera «Agregar a 1.º 2026» y ✕; `Campo` de búsqueda con foco
   automático; chips de filtro **Todas / Disponibles / Electivas / ≤ 6 cr** (exclusivos entre
   sí salvo «≤ 6 cr», que se combina); resultados con `buscar` del motor (sin texto: lista
   completa ordenada por cuatrimestre sugerido y código).
2. **Fila de resultado** (como 13c): código en mono + nombre; segunda línea con la Etiqueta
   del primer bloque de la comisión con menos choques («Mié 10–12 · 007R») si el período tiene
   horarios publicados para esa materia, o Nota punteada «— sin horario publicado»; chips de
   minor 14b (contorno, sigla) por cada minor de la electiva; créditos a la derecha en mono;
   botón «+» ladrillo. Estados: **bloqueada** (fondo rayado, glifo ⊘ y el motivo en una línea:
   «falta 72.11 Prog. Imperativa» o «requiere 160 cr, tenés 147»; sin botón «+»); **cupo
   lleno** en todas sus comisiones («◐ cupo 48/48 · Mar 14–16», el «+» sigue activo);
   **ya en el plan** («ya está en 2.º 2026», sin «+»); **aprobada** (no aparece salvo con
   filtro «Todas», con ✓ y sin «+»).
3. **Acción «+»**: si la materia tiene comisiones publicadas en el período → llama
   `alElegirComision(codigo)` (la elección la hace el modal de U3.4); si no → `agregarMateria`
   directo, asigna color y muestra un pequeño «✓ agregada» en la fila durante un segundo.
4. **Pie**: leyenda de siglas «CD Ciencia de Datos · IA Inteligencia Artificial · IRV Imágenes
   y Realidad Virtual · ARQ Arquitectura de Software», tomada del plan (`minors[]`), no
   escrita a mano.
5. **Sin resultados**: «Nada con «xyz». Probá con el código, el nombre o el docente.»
6. **Tests**: `buscar("pod")` lista 72.42 primero; filtro «Electivas» excluye obligatorias;
   «≤ 6 cr» excluye 72.45; una materia bloqueada muestra su motivo y no tiene «+»; «+» sobre
   una materia con comisiones llama `alElegirComision`; sobre una sin horarios agrega al estado.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- Compara el panel contra `#13c` (busca «análisis» con los datos reales) y anota diferencias en `notes`.
