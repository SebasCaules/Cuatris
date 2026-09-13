# R2 — Plan de estudios: compacto como StudyVaults, casillas para año y cuatrimestre, cierre automático, tooltips

Segunda vuelta sobre R1, pedida por el autor tras ver la primera versión. Reglas nuevas del
proyecto (permanentes, guardadas en memoria y en `CLAUDE.md`):

- **La interacción es intuitiva, no guiada por textos.** Fuera los botones «Marcar año» /
  «Desmarcar»: marcar un año o un cuatrimestre entero se hace con una **casilla propia** en
  la cabecera. Las acciones se descubren por la forma y la posición.
- **Cada estado lleva un tooltip claro** («Aprobada con final», «Cursada aprobada, falta el
  final», «Cursando», «Pendiente»). El tooltip es un componente propio, no el `title` del
  navegador.
- Componentes propios, nunca controles nativos con aspecto por defecto (ya vigente).

## Ownership

Toda `app/src/**` (única unidad de esta ola). Nada fuera de `app/`. Sin commits.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/olas/ola-5/R1-plan-de-estudios.md` (lo construido);
  el código real de `app/src/paginas/PaginaPlanDeEstudios/**`, `componentes/TarjetaAnio/**`,
  `componentes/FilaMateriaPlan/**`, `componentes/MarcaMateria/**`, `primitivas/BarraProgreso*`,
  `estado/planUsuario.ts` (`marcarEstado`, `marcarVarias`), `estilos/tokens.css`.

## Medidas de la referencia (StudyVaults, «Mis materias», medidas en el navegador)

Copia estas medidas; son la razón de «más chico».

| Elemento | Referencia |
|---|---|
| Tarjeta del año | fondo superficie, borde `1px solid` línea suave, radio 8 px, sin padding, `overflow: hidden`; tarjetas apiladas con `gap: 14px` |
| Cabecera del año | `display:flex; align-items:baseline; gap:12px; padding:11px 16px; border-bottom:1px solid` línea; alto ≈ 49 px |
| Título «Año 1» | Newsreader **16.5 px**, peso 500, `letter-spacing:-0.01em` |
| Rótulo «CICLO BÁSICO» | JetBrains Mono **9 px**, `uppercase`, `letter-spacing:0.12em`, color tenue |
| Progreso del año | a la derecha (`margin-left:auto`), `gap:9px`: barra **96×3 px**, radio 3, con dos segmentos —verde `--aprobada` para *final* y ámbar para *cursada/cursando*— y «**9**/9» en mono 11 px (el numerador en peso 500 y color texto, el resto tenue) |
| Columnas | `grid-template-columns:1fr 1fr`; la segunda con `border-left:1px solid`; bajo 700 px una columna y `border-top` |
| Cabecera del cuatrimestre | `padding:8px 8px 5px`, mono **9.5 px** `uppercase` `letter-spacing:0.11em`, color medio; el contador «5/5» a la derecha, tenue, `letter-spacing:0.04em` |
| Columna | `padding:4px 10px 10px`; lista sin viñetas |
| Fila | `display:flex; align-items:center; gap:10px; padding:7px 8px; border-radius:6px`; alto **36 px**; hover con fondo suave |
| Marca | botón **22×22**, radio 6, `border:1px solid` línea fuerte; SVG **14 px** (19 px de ancho en *final*); *pendiente*: fondo superficie-2, icono transparente; *cursada*: fondo ámbar al 16 %, borde ámbar al 55 %, tilde simple en ámbar oscuro; *final*: fondo verde al 85 %, borde verde al 60 %, doble tilde blanca (`viewBox 0 0 24 16`, trazos `M2.5 8.5L6 12L11.5 4.5` y `M9.5 8.5L13 12L18.5 4.5`); *cursando* (no existe en la referencia): borde y punto central en `--acento` |
| Código | mono **10 px**, ancho fijo 40 px, tenue |
| Nombre | Newsreader **14 px**, `line-height:1.25`; en fila *final* color medio; hover con subrayado fino |
| Créditos | mono **10.5 px**, color medio (`3 cr`) |

Tokens nuevos en `tokens.css` (claro y oscuro): `--cursada` (ámbar: `--materia-3`,
`#A8762C`, o derivado), `--cursada-fondo`, `--linea-suave`, `--linea-fuerte`, `--fila-hover`.

## Entregables

1. **`Casilla`** (primitiva nueva): control propio con `role="checkbox"` y `aria-checked`
   `true | false | "mixed"`; 16×16, radio 4, borde línea fuerte; marcada = fondo `--aprobada`
   con tilde blanca en SVG; mixta = fondo `--aprobada` con guion blanco; foco visible; Espacio
   y clic la accionan. **Ningún `<input>`.**
2. **Casillas de año y de cuatrimestre.** En la cabecera del año, a la izquierda del título y
   alineada con la columna de marcas; en la cabecera de cada cuatrimestre, a la izquierda del
   rótulo. Estado derivado: marcada si todas las materias del grupo están en *final*; mixta si
   alguna tiene entrada y no todas son *final*; vacía si ninguna. Clic: si no está marcada →
   `marcarVarias(codigos, "aprobada")`; si está marcada → `marcarVarias(codigos, null)`.
   Tooltip: «Marcar todo el año como aprobado con final» / «Quitar las marcas del año» (ídem
   cuatrimestre). El clic en la casilla **no** pliega ni despliega la tarjeta.
3. **Cierre automático del año completo.** Cuando un año llega a *todas en final* (por casilla
   o por marcas individuales), la tarjeta se **pliega** a su cabecera con una transición de
   altura de ~220 ms (`prefers-reduced-motion` la anula), tras una pausa de ~250 ms para que
   se vea el último cambio. Un chevron propio (SVG) a la derecha de la cabecera indica el
   estado y toda la cabecera (salvo la casilla) alterna plegado/desplegado al clic o con Enter.
   Al abrir la página, los años completos ya aparecen plegados. Si el usuario despliega un año
   completo, queda desplegado hasta que lo pliegue o hasta que vuelva a completarse tras haber
   quitado alguna marca. Estado de plegado en memoria del componente (no en `plan_usuario`).
   `aria-expanded` en la cabecera; la lista plegada no recibe foco (`inert`).
4. **Ciclo cronológico de `MarcaMateria`**: pendiente → **cursando** → **cursada** → **final**
   → pendiente (como la referencia, que va pendiente → cursada → final; «cursando» se
   intercala antes porque es lo que pasa antes). Tooltip propio con el estado actual y el
   siguiente: «Pendiente · clic: cursando», «Cursando · clic: cursada aprobada», «Cursada
   aprobada, falta el final · clic: aprobada con final», «Aprobada con final · clic: pendiente».
   Con este orden, *final* es el último paso: la regla N0-19 (quitar de los cuatrimestres
   planificados) ya no se dispara de paso (cierra S-24).
5. **`Tooltip`** (primitiva nueva): burbuja propia, fondo `--texto` sobre texto claro, mono
   9.5 px, radio 4, flecha pequeña, aparece a los ~300 ms de hover o al foco, desaparece al
   salir; `aria-describedby` hacia un `role="tooltip"`; nunca `title=`. Úsala en `MarcaMateria`,
   `Casilla`, el chevron y los glifos de estado que ya existan en otras pantallas del plan
   (`Glifo` recibe un `descripcion` opcional que la muestra).
6. **Leyenda compacta** arriba de las tarjetas, una sola línea en mono 9.5 px: las cuatro
   marcas dibujadas con el mismo componente en tamaño 16 px y su nombre al lado. Sin más texto
   de instrucciones; se quita la `Nota` de estado vacío de R1 y su enlace pasa a un enlace
   discreto «Pegar historia académica del SGA» en la misma línea de la leyenda, a la derecha.
7. **Electivas**: misma fila y misma cabecera compacta; la barra de la tarjeta usa créditos
   (`18/27 cr`); casilla no aplica (no tiene sentido marcar todas las electivas): en su lugar
   nada. Chips de minor detrás del nombre a 9 px.
8. **Muestrario**: `Casilla` en sus tres estados, `Tooltip` sobre un botón, `MarcaMateria` en
   los cuatro estados con el tamaño nuevo, `BarraProgreso` con dos segmentos, una `TarjetaAnio`
   completa plegada y otra desplegada.
9. **Tests**: casilla del año marca las 9 en `aprobada` y queda `aria-checked="true"`; con una
   sola en *cursada* queda `mixed`; clic sobre marcada quita todas; la tarjeta completa se
   pliega (`aria-expanded="false"`) y la lista queda `inert`; al quitar una marca se despliega;
   el ciclo va pendiente → cursando → cursada → final → pendiente y marcar *final* desde
   pendiente requiere exactamente tres clics; los tooltips aparecen al foco con el texto
   exacto; `document.querySelectorAll('input, select, progress, [title]').length === 0` en
   `#/plan` (ahora tampoco `title`); medidas: fila de 36 px, marca de 22 px.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde;
  `git status --porcelain` solo bajo `app/`.
- Con `npm run dev`, `#/plan` se ve como la referencia: mide en el navegador fila, marca,
  cabecera y barra y anota en `notes` cada medida que difiera de la tabla.
- Cero `title=` y cero controles nativos en `#/plan`; todos los estados con tooltip propio.
