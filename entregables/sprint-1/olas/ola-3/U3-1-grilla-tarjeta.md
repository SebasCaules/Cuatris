# U3.1 — `GrillaSemanal`, `TarjetaCuatrimestre` y `ListaConflictos` (el widget 7a con el choque 9d)

Es el componente compartido de la Ola 3: las pantallas 13b, 13d y 13h lo usan. Se construye
solo y se verifica antes de que arranquen las demás.

## Ownership

- `app/src/componentes/GrillaSemanal/**`, `app/src/componentes/TarjetaCuatrimestre/**`,
  `app/src/componentes/ListaConflictos/**` (código, CSS y tests)
- `app/src/paginas/Muestrario.tsx`: **solo** agregar una sección con los tres componentes en
  sus variantes (no toques el resto).

## Lee

- `CLAUDE.md`; `entregables/04-diseno/tokens.md` (sección «Grilla semanal (widget 7a)» y
  «Estados»); `entregables/04-diseno/README.md` para servir los mockups y mirar
  `etapa2-widget.dc.html#t7` (el widget aprobado, con su HTML como referencia de medidas) y
  `etapa3-mockup-v2.dc.html#13b`, `#13g`, `#13h`.
- `entregables/sprint-1/CONTRATO-v1.md` §1 y §6.
- El código real de la Ola 2: `app/src/motor/` (`choques`, `cambiosDeSede`, tipos de los
  resultados), `app/src/componentes/primitivas/` (Etiqueta, Glifo, Nota, Boton) y
  `app/src/estilos/tokens.css` (`--hora-px`, `--materia-0…9`). Reutilízalos; no dupliques.

## Entregables

1. **`GrillaSemanal`** (`props`: `bloques` ya resueltos por materia —código, abreviación,
   color índice, comisión, bloques del contrato—, `choques` y `cambiosDeSede` del motor,
   `horaPx` (15 con dos tarjetas, 18 con una), `alPasar(bloque)`, `alClic(codigo)`):
   - Columnas lunes–viernes; filas 08–22; **solo líneas en la hora en punto**, etiqueta de
     hora en mono centrada sobre su línea (como 7a). Bloques posicionados en absoluto por
     `desde/hasta` con `border-left: 3px` del color de materia y relleno
     `color-mix(... 14%, superficie)`; nombre = abreviación (line-clamp 1); etiqueta de aula
     en mono **solo si el bloque dura ≥ 2 h**; dos aulas → `003T · 004T`.
   - **Choque (9d)**: cada materia conserva su tramo exclusivo; la franja compartida se
     dibuja encima con `border-top/bottom: 2px` del color de choque y el rayado de tokens;
     sin etiqueta en reposo, al pasar el mouse muestra «▲ 93.18 ↔ 72.44 · 15–16»;
     `aria-label` completo siempre.
   - Cambio de sede ↕ entre bloques consecutivos: marca pequeña en el borde entre ambos con
     `title`; nunca bloquea.
   - Bloques de sábado: no van en la grilla; se listan al pie con Etiqueta («sáb 09–12 · 002R»).
   - Estado por borde y glifo según tokens (cursando lleno, planificada guionado, sin
     horario punteado); el relleno nunca cambia con el estado.
2. **`TarjetaCuatrimestre`** (`props`: período, título «1.º cuatrimestre 2026», resumen
   «7 materias · 39 cr · ▲ 1», y una de tres variantes):
   - `conHorarios`: GrillaSemanal + pie con las materias sin horario publicado en Nota
     punteada («— 15.09 Agile / Lean · sin horario publicado») + `ListaConflictos` + Nota
     «Horarios publicados hace n días · pueden cambiar hasta la inscripción» cuando el índice
     trae `publicado`.
   - `sinHorarios`: Nota «Sin horarios publicados: salen en <mes de año>. Hasta entonces se
     planifica por carga y correlativas.» (o «Sin horarios publicados.» si no hay
     `horarios_esperados`) + lista de materias con barra de color, abreviación y créditos +
     fila «+ agregar materia» (callback) + hitos opcionales (Nota verde: «✓ Al aprobar este
     cuatrimestre: 243 cr · Ingeniero/a en Informática», «72.45 Proyecto Final se destraba
     con 160 cr ✓») que recibe como `hitos: string[]`.
   - `vacia`: solo el título y «+ agregar materia».
   - Misma altura entre tarjetas hermanas (la fija el contenedor del carrusel); ancho por
     `visibles`.
3. **`ListaConflictos`**: cabecera `CONFLICTOS · n` en mono; filas numeradas con recuadro
   oscuro para ▲ («Lun 15–16 · 93.18 Álgebra ↔ 72.44 Criptografía» + botón «Resolver») y
   recuadro claro con ↕ para cambios de sede («Jue 16:00 Rectorado → 19:00 SDT» + «Ver»);
   la fila activa (al pasar sobre el choque en la grilla) se resalta con borde 1.5 px.
   Callbacks `alResolver(choque)` y `alVer(cambio)`.
4. **Tests** (Testing Library): posiciones (un bloque 14–16 con `horaPx=15` queda a `top =
   6*15` y `height = 2*15`); dos aulas en la etiqueta; etiqueta ausente con bloque de 1 h;
   choque real 93.18 A ↔ 72.44 S produce la franja rayada y la fila 1 de la lista; sábado al
   pie; variante sin horarios con hitos; `aria-label` de los choques. Usa
   `tests/fixtures/deben-pasar/horarios-casos-raros.json` y el plan real; nada inventado.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- En `#/muestrario`, la tarjeta con horarios reproduce el «1.º cuatrimestre 2026» de 13b con
  los datos de la fixture (misma disposición de columnas, franja rayada del lunes 15–16, lista
  de conflictos al pie); compárala tú contra el mockup servido y anota diferencias en `notes`.
- Cero `style={{…}}` salvo `top/height/left` calculados de los bloques y variables CSS.
