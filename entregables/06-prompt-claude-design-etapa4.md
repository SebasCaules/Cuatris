# Etapa 4 — Prototipo conectado (wireframe navegable de toda la aplicación)

## Contexto

Seguimos en este mismo proyecto. Ya están decididas y aprobadas: la paleta **4a «Arena y
ladrillo»** (turno 5), el widget **7a «cuatrimestre compacto»** con el choque según **9d**
(turno 7), el **carrusel horizontal 12a**, el **mockup v2 con diez pantallas 13a–13j**
(turno 13) y la marca de minor **14b** (chip de contorno con la sigla). No hay que rediseñar
nada de eso: hay que **conectarlo** y **completar lo que falta** para que la aplicación entera
se pueda recorrer de punta a punta.

## Objetivo

Un solo archivo, `Etapa 4 - Prototipo.dc.html`, donde **cada botón, chip, enlace, fila y
tarjeta lleva a una pantalla real dentro del mismo archivo**. En modo Presentar tiene que
poder recorrerse desde el primer ingreso hasta enviar una corrección de datos **sin callejones
sin salida**: ningún control muerto, ningún estado que se mencione y no exista.

## Reglas

1. **Reutiliza 13a–13j tal como están**: mismos componentes, tokens, textos y datos de
   ejemplo. Solo agrega lo que falta.
2. **Una pantalla = una sección con id estable** (`p-01-inicio`, `p-02-pegar-historia`, …),
   con título y una nota de dos líneas: **«Llega desde:»** y **«Sale hacia:»**, con los ids.
3. **Todo elemento interactivo enlaza a un ancla.** Si el destino no existe, créalo, aunque
   sea un estado aburrido (vacío, error, confirmación).
4. **No inventes datos.** Usa el escenario de las etapas anteriores (147 créditos aprobados,
   93.18 ↔ 72.44 el lunes, 72.45 bloqueada por 160 créditos). Aplica estas correcciones que
   surgieron al cruzar el mockup con las fuentes oficiales:
   - «Orientaciones · 18 cr» pasa a **«Minors · mínimo 14 cr»**; son cuatro: Ciencia de
     Datos, Inteligencia Artificial, Imágenes y Realidad Virtual, Arquitectura de Software.
   - Los títulos son tres y se evalúan **por ítems aprobados**, no solo por créditos:
     Analista en Tecnología Informática (147, todo el ciclo básico), Bachiller en Ingeniería
     (192), Ingeniero/a en Informática (243). Inglés I/II y Práctica Laboral valen 0 créditos
     pero cuentan como ítems.
   - Las comisiones se ordenan así: sin choques primero, luego con cupo antes que llenas,
     luego menos cambios de sede, luego por letra.
5. **Cambio de tipografía, único ajuste visual permitido.** Reemplaza `IBM Plex Sans` por
   **Newsreader** (Google Fonts; 400/500/600 e itálicas) y `IBM Plex Mono` por
   **JetBrains Mono** (400/500/600/700), conservando los roles: Newsreader para texto y
   títulos, JetBrains Mono para códigos, horarios, chips y números. Reajusta las tallas lo
   mínimo para que 13b siga cabiendo en 1280 px con dos tarjetas.
6. **Cero servidor, cero cuenta.** Todo vive en el navegador; la única salida externa es
   abrir un issue de GitHub al enviar una sugerencia.
7. **Trabaja por etapas y detente en cada una hasta que yo apruebe:**
   - **4.1 Mapa de navegación**: un diagrama de nodos (pantallas) y flechas (acciones) que
     cubra la lista de abajo. Sin dibujar pantallas todavía.
   - **4.2 Prototipo conectado de escritorio** (1280 px), con todas las pantallas del mapa.
   - **4.3 Estados restantes**: carga, error, vacío, confirmaciones, migración.
   - **4.4 Móvil (390 px) y modo oscuro** para las pantallas que indico al final.

## Lo que el prototipo tiene que cubrir

### A. Entrada

- **A1 Primer ingreso (13a)** con sus dos caminos.
- **A2 Pegar historia académica**: texto reconocido (resumen: n aprobadas, n en curso, n no
  reconocidas), líneas no reconocidas con qué hacer, texto vacío o sin formato.
- **A3 Marcar materias a mano**: lista del plan por año y cuatrimestre con casillas, buscador,
  contador de créditos, botón «Listo» que lleva al carrusel.
- **A4 Importar un plan guardado (JSON)**: éxito, archivo inválido, archivo de una versión
  más nueva que la aplicación.

### B. Plan

- **B1 Carrusel (13b)**: flechas, chips de período, control «n visibles» (1, 2 o 3
  tarjetas), barra de posición, comportamiento con más de cinco períodos, botón para agregar
  un período al final y para quitar uno vacío.
- **B2 Tarjeta de cuatrimestre** en todas sus variantes: con horarios; sin horarios
  publicados; sin horarios pero con fecha esperada («salen en noviembre de 2026»); «horarios
  publicados hace n días»; **«la comisión que elegiste cambió»** con la opción de revisar.
- **B3 Buscar y agregar (13c)**: sin resultados; bloqueada con motivo; sin horario publicado;
  cupo lleno; electiva con sus minors; **ya está en el plan** (en otro período); materia sin
  comisiones publicadas.
- **B4 Elegir comisión (13d)**: vista previa al pasar el mouse; elegir una comisión llena
  igual (advertencia, no bloqueo); llegar desde la ficha («Cambiar de comisión») y desde
  «Resolver» de un conflicto, con la otra materia fijada.
- **B5 Ficha (13e)** con las tres acciones conectadas: «Cambiar de comisión» → B4; «Mover a
  otro cuatrimestre» → selector de período con los destinos bloqueados explicados; «Sugerir
  corrección» → D1 prellenado. Agrega «Quitar del plan» con confirmación. Variantes:
  materia **aprobada** (solo lectura) y **planificada sin horarios**.
- **B6 Bloqueada (13f)**: «Planificar en 2.º 2027» mueve el carrusel hasta ahí y la deja
  agregada.
- **B7 Conflictos (13h)**: ▲ y ↕; qué muestra «Ver» en el caso ↕; «Resolver de a uno»
  recorre los conflictos en orden.
- **B8 Tramo futuro (13g)**: hitos de título y de destrabe, con enlace a la ficha.

### C. Progreso (13i)

Cada título, electiva y minor enlaza a algo (la ficha, o el buscador filtrado por ese
minor). Variante «todavía no hay historia cargada».

### D. Sugerencias (13j)

- **D1 Desde la barra**, sin contexto: primero se elige el dato (materia → comisión →
  bloque, o un campo de la ficha), después el formulario.
- **D2 Desde la ficha**, prellenado.
- **Enviar**: pantalla que explica que se abre un issue en GitHub y que hace falta una
  cuenta de GitHub; qué pasa si no la tiene.
- **Historial «n tuyas · m aplicadas»** con estados: abierta, aplicada, rechazada, y el caso
  sin conexión (historial sin estado).

### E. Sistema

- Cargando datos; error de carga con datos viejos en caché («datos del 3 de septiembre»);
  «los datos son más nuevos que la aplicación»; plan guardado con versión vieja (migración);
  menú de la barra: exportar, importar, borrar todo (confirmación), «acerca de» con la fuente
  de los datos y la fecha de la última actualización.

### F. Móvil y oscuro (solo en 4.4, después de aprobar 4.3)

- **390 px**: A1, B1 con una tarjeta, B3, B4, B5.
- **Modo oscuro**: B1, B3, B4, B5, con los tokens de la paleta 4a.

## Formato de entrega

- La **primera sección es el mapa** (4.1), y se actualiza en cada etapa.
- Cada pantalla: id, título, «Llega desde», «Sale hacia», y una nota de una línea si hubo que
  decidir algo.
- **Al final, dos tablas**: «Decisiones que tomé sin preguntar» y «Lo que no pude conectar y
  por qué». Prefiero una tabla larga a un control muerto.
- Termina cada etapa con tres opciones de siguiente paso, como hasta ahora, y **espera mi
  aprobación** antes de seguir.
