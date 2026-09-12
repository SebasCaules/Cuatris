# U3.2 — `PaginaPlan` (13b + 13g + 13h) y `PanelProgreso`

## Ownership

- `app/src/paginas/PaginaPlan/**`, `app/src/componentes/PanelProgreso/**`,
  `app/src/componentes/BannerConflictos/**`, `app/src/paginas/PaginaProgreso/**`
- No toques `App.tsx` (lo cablea el orquestador): exporta `PaginaPlan` y `PaginaProgreso`
  como componentes sin props obligatorias que leen el estado por contexto.

## Lee

- `CLAUDE.md`; mockups `#13b`, `#13g`, `#13h`, `#13i` de `etapa3-mockup-v2.dc.html`;
  `entregables/05-plan-sprints.md` §2 (filas 13b, 13g, 13h, 13i) y §3 (hallazgos 1 y 2).
- Código real: `app/src/estado/` (acciones), `app/src/datos/` (`useDatos`, `periodoActivo`),
  `app/src/motor/` (todo), `app/src/componentes/Carrusel`, `TarjetaCuatrimestre`,
  `ListaConflictos`, `primitivas`.

## Entregables

1. **`PaginaPlan`**: Carrusel con un período por tarjeta. Períodos mostrados = los que
   tienen materias en `planUsuario.periodos` ∪ el activo del índice ∪ al menos dos futuros
   vacíos al final (para poder planificar); orden cronológico. Cada tarjeta recibe lo que
   `TarjetaCuatrimestre` pide: para el período que tiene archivo de horarios (activo o
   vista previa), variante `conHorarios` con los bloques de las comisiones elegidas y los
   choques/cambios de sede del motor; para los demás, `sinHorarios` con `horarios_esperados`
   y los hitos (`progresoTitulos` por período: «✓ Al aprobar este cuatrimestre: n cr ·
   Título» cuando ese período alcanza un título; «72.45 … se destraba con 160 cr ✓» cuando
   `seDestrabaEn` cae ahí para una materia planificada después).
   En `ListaConflictos` pasa `nombreDeMateria` para que las filas usen la **abreviación**
   («93.18 Álgebra ↔ 72.44 Cripto»), no el nombre completo.
   Botones: «Agregar materia» (abre el panel de U3.3 para el período seleccionado —
   callback `alAgregar(periodo)` que el orquestador conecta; mientras tanto, `console.info`
   no: deja el prop y un `TODO` explícito), «Resolver» de un choque (callback
   `alResolver(periodo, codigoA, codigoB)`), «Ver» de un cambio de sede (resalta ambos
   bloques en la grilla), clic en un bloque → navega a `#/materia/<codigo>`.
   El control «n visibles» (1/2/3) del carrusel va al estado (`setVisibles`). Cuando el
   panel lateral de agregar está abierto (prop `panelAbierto`), el carrusel baja a 1 visible
   y vuelve al cerrar (13c).
2. **`BannerConflictos`** (13h): arriba del carrusel cuando el período activo tiene ≥ 1
   choque: «▲ n conflictos sin resolver en 1.º 2026» + botón «Resolver de a uno» que dispara
   `alResolver` con el primer choque; con 0 choques no se renderiza.
3. **`PanelProgreso`** (columna derecha de 13b): títulos con barra y `n/m` (✓ y «obtenible
   ya» cuando `alcanzado`), «Electivas · 18 de 27 cr» con la barra segmentada de 3 cr por
   segmento, «MINORS» con `n / 14 cr` por minor (solo los que tienen créditos > 0, y todos si
   ninguno), y la línea «Faltan N créditos y M de electivas para el título principal. Con la
   carga actual, K cuatrimestres.» (K = períodos hasta el `estimado` del título principal; si
   no hay estimado, «todavía no alcanza con lo planificado»).
4. **`PaginaProgreso`** (13i, versión de lectura): las tres secciones de 13i —Títulos con
   «faltan n cr · estimado <período>», Electivas contra 27 con estado por fila (✓ aprobada /
   ◇ planificada), Minors con «n electivas más y queda»— reutilizando el motor. Sin edición.
5. **Estado vacío**: si el plan del usuario no tiene historia ni períodos, `PaginaPlan`
   muestra un enlace a `#/inicio` con el texto de 13a («Todavía no hay nada en tu plan»); no
   dupliques la pantalla de inicio.
6. **Tests**: con el plan real, la fixture de casos raros como horarios del período activo
   y un `planUsuario` de prueba (93.18 com. A y 72.44 com. S en el activo) → el banner dice
   «1 conflicto», la tarjeta muestra la lista, `PanelProgreso` muestra los tres títulos;
   `visibles` cambia el ancho de las tarjetas; el estado vacío enlaza a `#/inicio`.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- `npm run dev` con `data/` real (`cuatris indice actualizar` ya corrió) muestra el carrusel
  sin errores en consola; compara contra `#13b` y anota diferencias en `notes`.
