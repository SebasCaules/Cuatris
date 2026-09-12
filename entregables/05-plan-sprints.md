# Plan de integración fullstack — Cuatris (§9)

Sprints de alcance fijo, no de calendario: cada uno termina cuando su demostración pasa.
El **Sprint 1 es el MVP**. El plan de backend (`02-plan-backend.md`, Fases 0–6) no se
reemplaza: aquí se reparte entre sprints y se cruza con la SPA que fija el diseño.

## 1. Punto de partida

**Diseño aprobado** (`04-diseno/`): paleta 4a «Arena y ladrillo», widget 7a «cuatrimestre
compacto» con el choque según 9d, carrusel horizontal 12a, y el mockup v2 con diez pantallas
(13a–13j) más la marca de minor 14b. Los tokens están en `04-diseno/tokens.md`.

**Datos disponibles hoy**

| Dato | Fuente | Estado |
|---|---|---|
| Plan S10-Rev23: 163 materias, correlativas, créditos, créditos requeridos, cuatrimestre sugerido, ciclos, minors | `Plan S10-Rev23.xlsx` + `materias-carrera-info.html` | listo para importar |
| Títulos: Analista 147 · Bachiller en Ingeniería 192 · Ingeniero/a 243 | `oferta-carrera-info-titulos.html` | verificado |
| Electivas 27 cr; minors con mínimo de 14 cr en uno | `Plan S10-Rev23.xlsx` (hoja Obligatorias, pie) | verificado |
| Abreviaciones, 163 únicas | `03-abreviaciones-materias.csv` | listo |
| Catálogo de materias (PDFs) | 6 PDFs de muestra | parser pendiente (Fase 2) |
| **Horarios de un cuatrimestre completo** | — | **no existe**: solo hay páginas de muestra del SGA; sale del scraper (Fase 3) corrido con tus credenciales |
| Historia académica (formato de pegado de 13a) | — | **falta una muestra** |

La última fila es la que ordena el Sprint 1: el scraper está en el camino crítico del MVP,
no es un extra.

**Repositorio**: [`SebasCaules/Cuatris`](https://github.com/SebasCaules/Cuatris) — público,
vacío, rama `main`, sin Pages todavía. El sitio quedará en
`https://sebascaules.github.io/Cuatris/`; al ser un sitio de proyecto, la SPA se sirve bajo
`/Cuatris/` (ver arquitectura).

## 2. Lo que el diseño fija para la SPA

Traducción pantalla → componentes → datos → lógica. Es el inventario contra el que se cierra
cada sprint.

| Pantalla | Componentes | Datos que consume | Lógica de dominio |
|---|---|---|---|
| 13a Primer ingreso | `PegarHistoria`, `MarcarAprobadas` | plan | parser tolerante de historia académica; estado inicial |
| 13b Plan · carrusel | `BarraSuperior`, `Carrusel` (flechas, chips, «n de m visibles», barra de posición), `TarjetaCuatrimestre` en dos variantes (`GrillaSemanal` / `ListaSinHorarios`), `ListaConflictos`, `PanelProgreso` | index, horarios del período, plan, abreviaciones | choques ▲, cambios de sede ↕, créditos por cuatrimestre, progreso de títulos |
| 13c Buscar y agregar | `PanelAgregar` (búsqueda, filtros Todas / Disponibles / Electivas / ≤ 6 cr, resultados con chip de horario, chips de minor 14b, «+») | plan, horarios, abreviaciones, docentes | estado por materia (disponible / bloqueada con motivo / sin horario / cupo lleno); búsqueda por código, nombre, abreviación y docente |
| 13d Elegir comisión | `ModalComisiones` (lista comparable con consecuencias, «Elegir/Elegida», colapsado «n comisiones más») + `GrillaSemanal` en vista previa | horarios | orden por compatibilidad; recálculo de choques con la comisión bajo el cursor |
| 13e Ficha | `FichaMateria` (estado, correlativas con estado, habilita, horario de la comisión, docentes, cupo; acciones) | plan, horarios, catálogo (Sprint 2) | correlativas directas e inversas |
| 13f Bloqueada | `MotivosBloqueo` + `SeDestrabaEn` | plan | simulación optimista: créditos al empezar cada cuatrimestre; primer cuatrimestre donde el bloqueo desaparece |
| 13g Tramo futuro | `TarjetaCuatrimestre` variante lista, hito «al aprobar este cuatrimestre» | plan, index (`horarios_esperados`) | hitos de título y de destrabe |
| 13h Choques | `BannerConflictos` («n conflictos sin resolver · Resolver de a uno»), `ListaConflictos` con tipos ▲ y ↕ | horarios | «Resolver» abre 13d para una de las dos materias |
| 13i Progreso | `PestanaProgreso` (títulos con estimado, electivas contra 27, minors contra 14) | plan | estimación del cuatrimestre en que se alcanza cada umbral |
| 13j Sugerir corrección | `FormularioSugerencia` (qué dato, dice, debería decir, cómo lo sabés) + historial «n tuyas · m aplicadas» | — | arma la URL del issue prellenado (Fase 5); consulta el estado de los issues propios |

**Motor de dominio** (módulo TypeScript puro, sin React, con tests): `estadoMateria`,
`motivosBloqueo`, `creditosAlEmpezar`, `seDestrabaEn`, `choques`, `cambiosDeSede`,
`progresoTitulos`, `electivas`, `minors`, `ordenarComisiones`, `habilita`, `buscar`. Es la
parte que tiene que sobrevivir a cualquier rediseño; por eso va separada de la interfaz.

## 3. Hallazgos al cruzar el diseño con las fuentes

Correcciones que se aplican en la implementación sin volver a Claude Design:

1. **«Orientaciones · 18 cr» → «Minors · 14 cr».** El ITBA los llama minors (folleto y
   Excel), son cuatro (Ciencia de Datos, Inteligencia Artificial, Imágenes y Realidad Virtual,
   Arquitectura de Software) y el mínimo es **14 créditos**, no 18. Nombre y umbral salen del
   JSON del plan; el mockup usó valores de relleno.
2. **Títulos**: los tres del mockup existen tal cual en el SGA (147 / 192 / 243). Pero
   «Analista» exige *aprobar todos los ítems del ciclo básico*, no juntar 147 créditos: el
   motor evalúa ítems, y por eso importa que Inglés I/II y Práctica Laboral (0 créditos) se
   rastreen como ítems.
3. **Historia académica (13a)**: el mockup muestra «código nombre créditos estado» por línea;
   el formato real del SGA no está en el material. El parser se escribe tolerante (código por
   regex, estado por palabra clave, el resto se ignora) y «marcar a mano» es el camino
   garantizado hasta tener la muestra.
4. **Escala horaria**: 18 px/h en el widget aprobado, 15 px/h en el mockup con dos tarjetas.
   Es un token que depende de cuántas tarjetas hay visibles.
5. **«Horarios publicados hace 3 días»** y **«salen en noviembre de 2026»** piden dos campos en
   `index.json`: `publicado` por archivo de horarios y `horarios_esperados` (curado) por
   período futuro.
6. **Búsqueda por docente** pide un índice de docentes derivado de los horarios.
7. **Comisiones «ordenadas por compatibilidad»**: orden explícito — sin choques primero, luego
   cupo disponible antes que lleno, luego menos cambios de sede, luego el `id`.
8. **↕ cambio de sede** entre bloques seguidos es una regla del motor de la SPA, no un
   invariante de CI (la sede la elige el ITBA, no el estudiante).
9. **Historial «3 sugerencias tuyas · 2 aplicadas»**: los números de issue se guardan en el
   navegador y su estado se consulta a la API pública de GitHub (sin token, 60 peticiones/hora
   por IP, con caché). Si la API no responde, se muestra el historial sin estado.

Huecos del mockup, resueltos con una decisión mínima en el sprint indicado:

| Hueco | Decisión | Sprint |
|---|---|---|
| Flujo «marcar materias a mano» | Lista del plan por año/cuatrimestre con casillas; el cuatrimestre sugerido ordena | 1 |
| Qué abre «Resolver» | 13d para la primera materia del par, con la otra fijada | 1 |
| «Mover a otro cuatrimestre» | Selector de período en la ficha; sin arrastrar | 2 |
| Copia de seguridad del plan | Exportar/importar JSON desde la barra: «todo queda en este navegador» exige una salida | 1 |
| Versión móvil | El mockup es de 1280 px; pedir la Etapa 4 a Claude Design en paralelo al Sprint 1 y aplicarla en el 3 | 3 |
| Modo oscuro | La paleta lo define; aplicar por tokens | 3 |
| Cambio de horarios ya publicados con una comisión elegida | Aviso en la tarjeta «esta comisión cambió» y opción de revisar | 2 |

## 4. Arquitectura de la SPA

- **Vite + React + TypeScript**, sin framework de componentes: el diseño trae sus propios
  tokens y la dependencia extra es un costo a diez años. CSS con variables (`tokens.css`) y
  módulos por componente. Tipografía: **Newsreader** para texto y **JetBrains Mono** para
  datos —las mismas de StudyVaults, por pedido explícito—, **vendorizadas** como woff2 (ver
  `04-diseno/tokens.md`).
- **Tipos generados del contrato.** `schemas/v1/*.json` → `app/src/contrato/*.d.ts` en el
  build (`json-schema-to-typescript`). Un solo origen de verdad; si el schema cambia, la SPA no
  compila hasta adaptarse.
- **Carga de datos**: `data/index.json` decide el período activo por fecha (publicar ≠
  activar), y de ahí se cargan `planes/S10-Rev23.json`, `abreviaciones.json`, el archivo de
  horarios del período y, bajo demanda, `catalogo/<codigo>.json`. Cada entrada del índice lleva
  el hash del archivo para invalidar caché. Si `contrato` tiene un major desconocido, la SPA
  muestra «datos más nuevos que la aplicación» en vez de renderizar basura.
- **Estado del usuario en el navegador**, sin cuenta ni servidor: un solo documento
  `plan_usuario` versionado (`version: 1`) con historia académica, materias por período,
  comisión elegida, orden de colores y sugerencias enviadas; migraciones explícitas entre
  versiones; exportar/importar JSON.
- **Motor de dominio puro** (`app/src/motor/`), probado con los siete casos raros reales y con
  el escenario del mockup (147 créditos aprobados, choque 93.18 ↔ 72.44, 72.45 bloqueada por
  160 créditos).
- **Enrutado por hash** (`#/plan`, `#/progreso`, `#/materia/72.41`): GitHub Pages no reescribe
  rutas y un `404.html` con truco es una deuda que se olvida.
- **Ruta base `/Cuatris/`**: es un sitio de proyecto, no de usuario. `base` de Vite sale de una
  variable de entorno del build y los datos se piden relativos a `import.meta.env.BASE_URL`;
  nada en el código asume la raíz del dominio, para que un cambio de nombre o un dominio
  propio no rompa nada.
- **Cero telemetría, cero llamadas a terceros** salvo la API pública de GitHub para el
  historial de sugerencias y la apertura del issue.
- **Pruebas**: `vitest` para motor y persistencia; pruebas de componentes con Testing Library
  para los flujos 13c/13d/13h; comparación visual manual contra cada pantalla del mockup con
  una lista de verificación por sprint.

## 5. Ajustes al backend que pide el diseño

Se incorporan al plan de backend (Fase 1) en el Sprint 1:

- `planes/S10-Rev23.json`: por materia `ciclo`, `cuatrimestre_sugerido`, `creditos_requeridos`,
  `correlativas`, `electiva`, `minors` (siglas), `vigente`; a nivel plan `titulos`
  (`{nombre, tipo, creditos, requiere_items}`), `electivas_requeridas: 27`, `minors`
  (`{sigla, nombre, creditos_minimos: 14}`).
- `index.json`: `publicado` por archivo de horarios, `horarios_esperados` por período futuro,
  `hash` por archivo.
- `abreviaciones.json`: importado del CSV aprobado; unicidad como error duro (ya en el plan).
- Nada cambia en el contrato de horarios: el diseño consume exactamente lo que ya define
  (`aulas` en array, `sede` y `modalidad` por bloque, `cupo` y `ocupacion` separados).

## 6. Sprints

### Sprint 1 — MVP: «planificar con datos reales»

**Objetivo.** Una persona con su historia académica arma su plan sobre el cuatrimestre con
horarios publicados y los siguientes por carga, ve los choques y elige comisiones. El sitio
está publicado y cualquier PR de datos pasa por validación.

**Backend y datos** (Fases 0, 1 y 3 en su versión mínima):

1. Fase 0 completa: `git init` local y primer push a `SebasCaules/Cuatris` (`main`),
   `.gitignore` con `material-raw/`, paquete `tools/` con `vendor/`, ruleset en `main`,
   `CODEOWNERS`, Pages con origen «GitHub Actions», cero secretos. Corpus anonimizado en
   `tests/corpus/` (reemplazar `CAULES, SEBASTIAN` antes del primer commit).
2. Contrato v1: schemas de `horarios`, `planes`, `abreviaciones`, `index`; `cuatris fmt` y
   `cuatris validar` con C1 (triage y forma canónica), C2 (schema) y C3 (correlativas
   acíclicas, códigos existentes, horas válidas, colisión de aula). Tipos TS generados.
3. `cuatris plan importar`: `Plan S10-Rev23.xlsx` + listado del SGA → `planes/S10-Rev23.json`
   con los campos de la sección 5. `cuatris abreviaciones importar` → `abreviaciones.json`.
4. Scraper mínimo: parsers contra los HTML guardados (fixture de Álgebra Lineal: 9 comisiones,
   31 bloques, comisión B en dos aulas), luego login, listado paginado, detalle por curso,
   checkpoint por curso, rate limit. Instructivo corto para correrlo. **Lo corres tú** y el
   resultado entra como primer PR de datos: `horarios/2026-2C.json`.
5. Workflows: `ci-codigo.yml` (tests de `tools/` y de `app/`), `pr-datos.yml` con
   `pull_request_target` y `permissions: {}` en el job que valida (sin auto-merge todavía:
   solo check requerido), `deploy.yml` (revalida `main`, construye, publica por OIDC).

**Frontend**:

6. `tokens.css`, fuentes, cascarón de la aplicación, carga de datos por `index.json`, estado
   local versionado con exportar/importar.
7. Motor: `estadoMateria`, `motivosBloqueo`, `creditosAlEmpezar`, `choques`, `cambiosDeSede`,
   `progresoTitulos`, `electivas`, `minors`, `ordenarComisiones`, `habilita`, `buscar`, con
   sus tests.
8. Pantallas: 13a (marcar a mano garantizado; pegar historia si llega la muestra), 13b
   (carrusel, grilla, tarjeta sin horarios, lista de conflictos, panel de progreso resumido),
   13c (buscar y agregar con filtros y chips de minor), 13d (elegir comisión con vista previa
   recalculada), 13e (ficha sin catálogo: correlativas, habilita, horario, docentes, cupo),
   13h (banner y lista; «Resolver» → 13d). Bloqueadas visibles en resultados con el motivo
   (la parte de 13f que no necesita simulación).

**Orden de ejecución.** 1 → 2 → 3 y 6 → 7 → 4 (parsers primero, contra fixtures) → 8 en el
orden 13b, 13c, 13d, 13e, 13h, 13a → 5. El scraper en vivo se prueba en cuanto están los
parsers, para que tu corrida no espere al final.

**Demostración que cierra el sprint.**

- Marcas tus aprobadas (o pegas la historia), ves 2026-2C con horarios reales y los períodos
  siguientes por carga.
- Agregas 72.41, eliges comisión, ves el choque con 72.44 en la grilla y en la lista, lo
  resuelves cambiando de comisión, y el plan sobrevive a cerrar el navegador.
- Exportas el plan a JSON y lo vuelves a importar en otro navegador.
- El sitio está en GitHub Pages; un PR con un horario de sábado o una correlativa circular
  queda bloqueado por el check, y un PR válido de un curso pasa.
- Los siete casos raros reales pasan el validador.

**Si hay que recortar**, en este orden: la vista previa en vivo de 13d (queda la lista con sus
consecuencias), el parser de historia académica (queda marcar a mano), la búsqueda por docente.

**Fuera del MVP, a propósito**: simulación «se destraba en» (13f), pestaña Progreso completa
(13i), sugerencias (13j), catálogo de PDFs, auto-merge, corroboración con evidencia, modo
oscuro, móvil, herramientas de historia.

### Sprint 2 — «Planificar a largo plazo con confianza»

**Objetivo.** El plan a varios años se explica solo: por qué algo está bloqueado, cuándo se
destraba, qué título cae en qué cuatrimestre, y la ficha trae la información oficial.

- Fase 2: parser de PDFs (`cuatris pdf parsear`, 11 secciones, falla ruidosamente), golden
  files para los 6 PDFs, `catalogo/<codigo>.json`; la ficha 13e pasa a mostrar contenidos y
  objetivos.
- Motor: `seDestrabaEn` y simulación optimista; hitos de 13g («al aprobar este cuatrimestre:
  243 cr», «72.45 se destraba con 160 cr»); estimado por título de 13i.
- Pantallas: 13f completa (motivos renglón por renglón, «Planificar en X» mueve el carrusel),
  13g, 13i, «Mover a otro cuatrimestre», aviso de comisión cambiada.
- Backend: C4 (diff semántico, riesgo por campo, presupuesto de 7 días desde trailers, deriva
  de vocabulario), `cuatris editar horario`, `no-plan.json`, `vocabulario.json`, activación por
  fecha en `index.json` con vista previa de períodos futuros, `publicado` y
  `horarios_esperados`, comentario legible del bot en cada PR (tabla del diff, tres
  verificaciones, enlace a la fuente).
- Fixtures: los siete casos raros como `tests/fixtures/deben-pasar/`, y un caso que falla por
  cada regla de C1–C4.

**Demostración.** 72.45 aparece bloqueada con sus tres motivos y «Se destraba en 2.º 2027»;
el botón lleva el carrusel ahí. Un PR que mueve un bloque recibe una tabla legible con el antes
y el después; uno que borra el 30 % de los cursos escala a humano.

### Sprint 3 — «Comunidad y blindaje»

**Objetivo.** Cualquier persona corrige un dato desde la página y el pipeline mergea solo lo
que corresponde, sin revisión experta.

- Fase 5 completa: plantilla de issue, `sugerencia-a-pr.yml` (intención, no diff; entorno, no
  interpolación; disparo explícito de la validación sobre el SHA del PR del bot), límite por
  autor, comentario en el issue cuando no valida. Pantalla 13j desde la barra y desde la ficha,
  con el historial «n tuyas · m aplicadas».
- C5: el scraper captura Ocupación de Aulas para K fechas; corroboración offline en CI con las
  reglas del plan (dirección única, existencia y no ausencia, coherencia ≥ 95 %, feriados por
  mediana, muestreo dentro del período de cada bloque).
- Política de auto-merge por niveles con `politica.json`; job `decidir` que habilita
  auto-merge; `centinela.yml` diario; guardarraíles sobre los workflows.
- Frontend: modo oscuro por tokens; versión móvil a partir de la Etapa 4 de Claude Design
  (pedirla al arrancar el Sprint 1); accesibilidad: teclado en carrusel, modal y panel de
  búsqueda, foco visible, glifos además de color (ya lo pide la paleta).

**Demostración.** Sugerir «aula 203T en vez de 201T» desde la ficha abre el issue prellenado;
el bot abre el PR, el gate lo aprueba, se mergea solo y el sitio lo muestra sin que nadie
toque nada. Un PR que intenta tocar `tools/` queda marcado `necesita-humano`.

### Sprint 4 — «Legado»

**Objetivo.** Que el proyecto pueda mantenerlo alguien sin contexto dentro de años.

- Fase 6: `CHANGELOG.jsonl`, `cuatris historia ver / revertir / consolidar`, siempre hacia
  adelante.
- Documentación: `docs/contrato.md` con la tabla de casos reales, `docs/scraping-sga.md`
  completo (cómo re-derivar los selectores, diagnóstico con el HTML guardado),
  `docs/runbook.md` con el procedimiento de romper el vidrio, y la **lista de cada
  cuatrimestre**: un comando, un PR, una fecha en `index.json`.
- Verificación de blindaje: PR que edita su workflow, PR con HTML en un nombre, symlink, JSON
  profundo, borrado masivo; cada uno con su resultado esperado como test.
- Extremo a extremo real: scraper contra el SGA → PR → CI → merge → deploy → la SPA levanta
  los datos; rollback de un PR malo con la herramienta.
- Presupuesto de rendimiento (tamaño del bundle y de los JSON, tiempo hasta la primera grilla)
  y congelamiento de `v1`.

**Demostración.** Se mergea un PR malo a propósito en una rama de prueba, `historia revertir`
lo deshace revalidando, y `centinela` abre un issue cuando un commit sobre `tools/` no tuvo
revisión de code owner.

### Después de los cuatro sprints (backlog, sin comprometer)

Compartir el plan por URL (estado comprimido en el hash), exportar a calendario (`.ics`),
modo sin conexión (PWA), otras carreras del ITBA con el mismo contrato.

## 7. Lo que necesito de ti

1. **Una muestra de la historia académica** tal como la copias del SGA: el texto pegado en un
   `.txt` y una captura de la pantalla, en `material-raw/06-historia-academica/`. Sin eso, 13a
   arranca solo con «marcar a mano».
2. **Repositorio: resuelto** (`SebasCaules/Cuatris`, público y vacío; `gh` ya está
   autenticado con tu cuenta). Los ajustes de plataforma de la Fase 0 —ruleset en `main`,
   Pages por Actions, `GITHUB_TOKEN` en solo lectura, aprobación de primeros
   contribuyentes— los aplico por API donde la API lo permite y te dejo la ruta exacta en la
   interfaz para los que no.
3. **Correr el scraper** a mitad del Sprint 1, con tus credenciales por variable de entorno:
   unas 500 peticiones, alrededor de 15–20 minutos con el rate limit conservador. Nunca me
   las pases; el instructivo explica cómo se usan.
4. Opcional, en paralelo: pedir a Claude Design la **Etapa 4** (móvil y modo oscuro aplicado a
   13b, 13c, 13d y 13e). Puedo redactar ese prompt.

## 8. Riesgos y cómo se acotan

| Riesgo | Efecto | Mitigación |
|---|---|---|
| El scraper en vivo tropieza con algo que las páginas guardadas no muestran (paginación Ajax, expiración de sesión) | Sin dataset real, el MVP se demuestra con fixtures | Parsers primero contra fixtures; prueba en vivo temprana, sobre 3 cursos, antes de la corrida completa |
| Formato de la historia académica distinto del supuesto | 13a degradado | «Marcar a mano» es el camino garantizado; el parser llega con la muestra |
| Los horarios de 2027-1C no salen hasta noviembre | El MVP planifica el futuro solo por carga | Es el comportamiento diseñado (13g); `horarios_esperados` lo explica en pantalla |
| El diseño de 1280 px no sirve en teléfono | Uso real limitado hasta el Sprint 3 | Etapa 4 en paralelo; el carrusel ya degrada a una tarjeta |
| Sprint 1 demasiado grande | Se estira | Lista de recorte explícita; nada del recorte es estructural |
