# R1 — Pestaña «Plan» = plan de estudios interactivo; el carrusel pasa a «Cursada»

Reformulación pedida por el autor (2026-09-12) antes del Sprint 2, con una captura de su
sitio StudyVaults como referencia visual. Decisiones cerradas por N0:

- La pestaña **«Plan»** muestra el **plan de estudios completo** (años → cuatrimestres →
  materias) y ahí mismo se marca lo hecho. El carrusel de cuatrimestres con horarios (la
  pantalla 13b actual) pasa a una pestaña nueva **«Cursada»** (`#/cursada`). Pestañas:
  Plan · Cursada · Progreso.
- Desaparece el paso «Marcar materias a mano» del primer ingreso (13a): el botón pasa a
  «Marcar en el plan» y lleva a `#/plan`. `PegarHistoria` e «Importar» siguen en `#/inicio`.
- **Cuatro estados por materia**, con un control propio que cicla al clic:
  pendiente → **final** (aprobada con final = `historia.estado: "aprobada"`) → **cursada**
  (cursada aprobada, falta el final = `"regular"`) → **cursando** (`"cursando"`) → pendiente
  (sin entrada en `historia`). Marcar un **año entero** o un **cuatrimestre entero** pone todo
  en *final*; «Desmarcar» quita las entradas.
- **Regla del autor, permanente**: cada componente es propio y único de la página. **Ningún
  control nativo con aspecto por defecto** (nada de `<input type="checkbox">`, `<select>`,
  `<progress>`), ninguna librería de componentes, ningún set de iconos genérico. Los glifos se
  dibujan en SVG propio (la doble tilde, la tilde simple, el punto de «cursando»).

## Ownership

Toda `app/src/**` (única unidad de esta ola; nadie más toca el repositorio). Fuera de `app/`
no toques nada. Sin commits.

## Lee

- `CLAUDE.md`; `entregables/04-diseno/tokens.md` (colores, tipografía); la captura de
  referencia la describe la sección «Aspecto» de abajo (no hay archivo).
- Código real: `app/src/estado/planUsuario.ts` (acciones y `historia`), `app/src/motor/`
  (`creditosAprobados`, `itemsAprobados`, `progresoTitulos`, `electivas`, `minors`),
  `app/src/componentes/primitivas/`, `app/src/paginas/PaginaPlan/` (el carrusel que se muda),
  `app/src/paginas/PaginaInicio/`, `app/src/componentes/MarcarAprobadas/` (se elimina),
  `app/src/rutas.ts`, `app/src/App.tsx`, `app/src/componentes/BarraSuperior/`.

## Entregables

1. **Rutas y pestañas.** `rutas.ts`: `#/plan` → vista `plan` (plan de estudios), `#/cursada`
   → vista `cursada` (el carrusel), `#/progreso`, `#/materia/<codigo>`, `#/inicio`,
   `#/muestrario`. `BarraSuperior`: pestañas Plan · Cursada · Progreso (la activa con
   `aria-current`). `App.tsx`: sin redirección al primer ingreso; `#/plan` siempre muestra el
   plan de estudios; el panel derecho (`PanelProgreso`) se muestra en Plan y en Cursada;
   `PanelAgregar`/`ModalComisiones` siguen operando sobre Cursada. Renombra
   `paginas/PaginaPlan` → `paginas/PaginaCursada` (`PaginaCursada`, `CursadaConDatos`) para
   que los nombres digan la verdad; ajusta imports y tests.
2. **Estado.** En `estado/planUsuario.ts`, acciones `marcarEstado({ codigo, estado })` con
   `estado: "aprobada" | "regular" | "cursando" | null` (`null` borra la entrada) y
   `marcarVarias({ codigos, estado })` (misma semántica, en una sola transición). Al pasar a
   `"aprobada"` se quita la materia de todos los períodos planificados (regla N0-19, ya
   implementada en `marcarAprobada`: reutilízala o reemplázala). `marcarAprobada` puede quedar
   como alias. Tests del reducer para cada transición y para la limpieza de períodos.
3. **`PaginaPlanDeEstudios`** (`#/plan`): una **`TarjetaAnio`** por año 1–5 (obligatorias
   por `cuatrimestre_sugerido`: año = `ceil(n/2)`, cuatrimestre = `n impar → 1.º, par → 2.º`)
   y al final una **`TarjetaElectivas`**. Las materias con `vigente: false` se muestran solo
   si tienen entrada en `historia`. Los ítems de 0 créditos aparecen normalmente («0 cr»).
   - **`TarjetaAnio`**: cabecera con «Año 1» (Newsreader, ~22 px), rótulo mono en versalitas
     «CICLO BÁSICO» / «CICLO PROFESIONAL» (según el ciclo de sus materias; si mezcla, los dos
     separados por «·»), y a la derecha `BarraProgreso` + «9/9» en mono (n = materias del año
     con *final*; m = total del año). Al pasar el mouse o enfocar la cabecera aparecen dos
     acciones en mono pequeño: «Marcar año» (todo a *final*) y «Desmarcar».
   - **`ColumnaCuatrimestre`** ×2 por año, separadas por una línea vertical: rótulo mono
     «1.º CUATRIMESTRE» con «5/5» a la derecha y las mismas dos acciones al pasar el mouse
     («Marcar cuatrimestre», «Desmarcar»). Bajo 900 px las columnas se apilan.
   - **`FilaMateriaPlan`**: `MarcaMateria` + código en mono gris + nombre en Newsreader +
     créditos en mono a la derecha («3 cr»). Clic en el nombre → `#/materia/<codigo>`. Fila
     con resaltado suave al pasar el mouse.
   - **`MarcaMateria`** (el control propio, ~28 px, esquinas de `--radio-chip`): botón con
     cuatro aspectos — *pendiente*: contorno gris, vacío; *final*: relleno verde
     (`--aprobada`, ver tokens) con **doble tilde** blanca en SVG como la captura; *cursada*:
     relleno verde con tilde simple; *cursando*: contorno verde con un punto verde al centro.
     Clic o Enter/Espacio cicla pendiente → final → cursada → cursando → pendiente;
     `aria-label` «31.08 Sistemas de Representación: aprobada con final» (o «cursada aprobada,
     falta el final», «cursando», «pendiente»); `title` con la ayuda «Clic: cambia el estado».
   - **`BarraProgreso`** (primitiva nueva en `primitivas/`): pista fina gris, relleno verde
     proporcional, sin `<progress>` nativo; `role="progressbar"` con `aria-valuenow/max`.
   - **`TarjetaElectivas`**: cabecera «Electivas» + rótulo «27 CR REQUERIDOS» + barra con
     créditos aprobados de electivas / 27 («18/27 cr»); campo de búsqueda (la primitiva
     `Campo`) que filtra por código, nombre o abreviación; filas iguales a las obligatorias
     más los chips de minor (14b, el `Chip` existente) tras el nombre; agrupadas en dos
     columnas por orden alfabético o una sola lista si prefieres, pero con la misma fila.
   - **Estado vacío** (sin ninguna entrada en `historia`): `Nota` arriba de las tarjetas:
     «Marcá lo que ya aprobaste. Si tenés la historia académica del SGA, podés pegarla.» con
     enlace «Pegar historia» → `#/inicio`. No es otra pantalla: el plan se ve igual.
4. **Cursada** (`#/cursada`): el carrusel actual sin cambios funcionales. Si `historia` está
   vacía, `Nota` arriba: «Todavía no marcaste nada en el Plan: los choques y correlativas se
   calculan sobre lo aprobado.» con enlace a `#/plan`.
5. **Primer ingreso** (`#/inicio`): título y párrafo del mockup; botones «Pegar historia
   académica» (primario) y «Marcar en el plan» (secundario → `#/plan`); enlace «Importar un
   plan guardado». Elimina `componentes/MarcarAprobadas/**` y sus tests.
6. **Tokens**: agrega a `tokens.css` `--aprobada` (verde: usa `--materia-6`, `#2F7A6A`, o un
   verde propio derivado de la paleta 4a; documenta la elección en `tokens.css`) y su versión
   para modo oscuro; `--aprobada-texto` blanco/claro.
7. **Muestrario**: sección «Plan de estudios» con `MarcaMateria` en sus cuatro estados,
   `BarraProgreso` en 0 %, 50 % y 100 %, y una `TarjetaAnio` completa.
8. **Tests** (Testing Library, con el plan real): la página lista 5 años y la sección de
   electivas; el año 1 tiene 5 + 4 materias en el orden del plan; «Marcar año» deja las 9 en
   `historia` con `aprobada` y la barra dice «9/9»; el ciclo del control recorre los cuatro
   estados y termina en pendiente; marcar «cursada» produce `regular`; una no vigente no se
   lista salvo marcada; la búsqueda de electivas filtra por abreviación («cripto» → 72.44);
   **`document.querySelectorAll('input[type="checkbox"], select, progress').length === 0`**
   en la página del plan (la regla del autor, fijada en un test); las pestañas y rutas nuevas;
   `#/inicio` sin «Marcar materias a mano».

## Aspecto (la captura de referencia)

Tarjeta blanca con borde suave y esquinas de 8 px sobre el fondo arena. Cabecera con
«Año 1» grande en serif, «CICLO BÁSICO» en mono chico con tracking, y a la derecha una barra
fina verde llena hasta «9/9». Cuerpo dividido en dos columnas por una línea vertical clara;
cada columna arranca con «1.º CUATRIMESTRE» en mono chico y «5/5» a la derecha; debajo,
filas de ~60 px: cuadrado verde redondeado con doble tilde blanca, código en mono gris,
nombre en serif de ~17 px, créditos en mono gris a la derecha. Todo en la paleta 4a con
Newsreader y JetBrains Mono; ningún control con aspecto de navegador.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- `git status --porcelain` solo muestra archivos bajo `app/`.
- Con `npm run dev`, `#/plan` reproduce la disposición de la captura con el plan real;
  compárala y anota diferencias en `notes`. `#/cursada` sigue mostrando el carrusel.
- Cero controles nativos con aspecto por defecto en `#/plan`, `#/cursada` y `#/inicio`
  (verifícalo en el DOM; las casillas de `MarcarAprobadas` desaparecen con el componente).
