# Scraping del SGA

Cómo se obtienen los horarios del ITBA y cómo se vuelve a derivar cada selector cuando deje
de funcionar. El SGA (`sga.itba.edu.ar`) corre sobre Apache Wicket con las URL cifradas: los
identificadores de componente rotan entre despliegues, así que **ningún selector puede
apoyarse en un id numérico**. Todo lo que sigue se ancla en texto visible o en nombres de
campo.

El recorrido completo (obtener la cuenta, iniciar sesión, navegar, reanudar una corrida
cortada, cargar el resultado con `cuatris fmt` y `cuatris validar`) se documenta en la Ola 2.
Esta sección describe únicamente qué extrae cada parser de `tools/cuatris/sga/parsers.py` y
en qué se ancla, que es lo que hay que revisar primero cuando una corrida falle.

## Qué extrae cada parser y en qué se ancla

Todos los parsers son **offline**: reciben el HTML ya descargado y no hacen ninguna petición.
Cuando el HTML no tiene la forma esperada lanzan `EstructuraInesperada` con el fragmento
problemático; cuando traen un valor que ningún mapeo reconoce, `ValorDesconocido` con el
texto original. Nunca devuelven un campo vacío en silencio.

Las copias anonimizadas del HTML sobre el que se escribieron están en `tests/corpus/sga/`.
Ante una falla, guarde el HTML nuevo y compárelo contra esos archivos: la diferencia señala
el anclaje que hay que actualizar.

### `parsear_listado(html) -> Listado`

Listado de cursos (`Académica > Cursos`). Devuelve las filas de la página y los datos de
paginación.

| Dato | Anclaje | Cómo verificar que sigue valiendo |
|---|---|---|
| La tabla | primera `<table>` cuya fila de encabezados contiene **`Cód.`, `Materia`, `Período` y `Año`** | buscar esos títulos en la página; si cambiaron, cambiar la tupla de `parsear_listado` |
| Cada columna | **posición del título** dentro de esa fila de encabezados, no un índice fijo | agregar o mover una columna en el SGA no rompe el parser; renombrarla, sí |
| `codigo`, `nombre`, `departamento`, `nivel` | texto de la celda de la columna homónima | — |
| `periodo` | columnas `Período` + `Año` (`Segundo Cuat.` + `2026` → `2026-2C`) | ver `normalizar.CUATRIMESTRES` |
| `desde`, `hasta` | columnas `Comienzo` y `Fin`, en `dd/mm/aaaa` | **son las únicas fechas de dictado que publica el SGA**: el detalle del curso no las trae |
| `activo` | atributo `checked` de la casilla de la columna `Activo` | — |
| `enlace_detalle` | `href` del `<a>` de la fila cuyo `<img>` tiene `alt`/`title` con «Detalles» | es la lupa; si el ícono cambia de rótulo, ajustar ese texto |
| `paginacion` | `div.navigatorLabel` (`Página 1 a 20 de 472`), `div.navigator a.next` y `a.last` | la página actual sale del `span.goto` que **no** tiene `<a>` (el número sin enlace es el actual) |

`total_paginas` se calcula: total de filas dividido por el tamaño de la página que declara la
etiqueta (472 / 20 = 24). Si la etiqueta no está (una sola página), los contadores quedan en
`None` y `hay_siguiente` es `False`: eso es lo que corta el barrido.

### `parsear_curso(html_detalle) -> Curso`

Detalle de un curso **con la pestaña Comisiones abierta**. Si está abierta otra pestaña, el
parser falla en vez de devolver un curso sin horarios.

| Dato | Anclaje |
|---|---|
| pestaña activa | `div.tabpanel4 li.active`; tiene que decir `Comisiones` |
| `codigo`, `nombre` | fila `Materia:` de la cabecera, con la forma `93.18 - Álgebra Lineal` |
| `departamento` | fila `Departamento:` |
| `cuatrimestre`, `anio` | fila `Cuatrimestre:` (`Segundo Cuat. 2026`) |
| `desde`, `hasta` | filas `Comienzo:` / `Fin:` **si existieran**; hoy el detalle no las publica y quedan en `None` |
| `comisiones` | delega en `parsear_comisiones` sobre el mismo HTML |

Las filas de la cabecera se ubican por el texto de su `<label>` en negrita, no por su
posición: agregar una fila nueva arriba no rompe nada.

### `parsear_comisiones(html) -> list[Comision]`

Pestaña Comisiones, la **única fuente de horarios** del SGA.

| Dato | Anclaje |
|---|---|
| La tabla | primera `<table>` con los encabezados `Comisión`, `Horarios`, `Profesores` y `Cupo` |
| `id` | texto de la celda `Comisión` (`A`, `K`, `S`: es opaco, no tiene orden) |
| bloques | un `<div>` hijo directo de la celda `Horarios` por renglón |
| `dia`, `desde`, `hasta` | los tres primeros `<span>` hijos directos del `<div>` |
| `aulas` y `sede` | `<span>` cuyo texto propio empieza con **`Aula ITBA:`**; el valor tiene la forma `001R #----> Sede Rectorado` |
| `modalidad` | `<span>` cuyo texto propio empieza con **`Aula externa:`**. La etiqueta engaña: el valor es la modalidad (`Presencial`, `Virtual sincrónico`, `Blended`) |
| `docentes` | cada `<label>` de la celda `Profesores` |
| `cupo` / `ocupacion` | celda `Cupo`, con la forma `inscriptos / capacidad` (`48 / 49` = 48 inscriptos sobre 49 lugares) |

Consecuencias que conviene tener presentes:

- **Dos aulas simultáneas son dos `<div>` en el HTML**, no un `<div>` con dos aulas. Los
  renglones que coinciden en día, horario, sede y modalidad se fusionan en un solo `Bloque`
  con dos elementos en `aulas` (93.18 comisión B, miércoles: `["003T", "004T"]`). En
  `bloques_crudos` queda un elemento por `<div>`, que es lo que hay que contar para comparar
  contra `HALLAZGOS.md` (93.18: 9 comisiones, **31 renglones**, 27 bloques fusionados).
- **La ocupación no trae fecha.** `ocupacion.al` queda en `None` y `a_contrato` le pone la
  fecha de captura de la corrida, que es la única fecha real que hay.
- El tercer `<span>` del grupo está oculto y vacío en todo el material. Si alguna vez trae
  texto, queda en `Bloque.extra` y `a_contrato` se niega a serializar ese bloque: así un dato
  nuevo no se pierde en silencio.
- **La sede solo sale de `Aula ITBA:`**, así que un bloque presencial sin aula asignada no
  tiene de dónde sacarla. En vez de dejar `sede: null` con modalidad presencial —combinación
  que CONTRATO-v1.md §1 prohíbe— el parser lanza `EstructuraInesperada` con el `<div>`.
- **Si la celda `Horarios` tiene texto pero ningún `<div>` hijo directo**, el parser lanza
  `EstructuraInesperada` con la celda en vez de devolver la comisión con `bloques: []`. Es el
  escenario de un cambio de marcado de Wicket: sin este control, una corrida quedaría verde
  con todos los cursos sin horarios.

### `extraer_formulario_login(html) -> (action, campos_ocultos)`

Se ancla en el **campo `password`**: se busca ese `<input>`, se sube a su `<form>` y se lee
el `action` y todos los `<input type="hidden">`. El `action` es relativo, lleva el
`;jsessionid=` y cambia en cada carga: **nunca se fija**; los ids (`id1`, `id1_hf_0`) rotan.
Además de los campos ocultos hay que postear `user`, `password` y el nombre del botón de
envío (`login`). Las credenciales salen de variables de entorno o de un prompt y **no se
guardan en ningún archivo**.

### `extraer_ids_filtro(html) -> FiltrosListado`

Los filtros y la paginación del listado son un POST al formulario con campos del tipo
`results:topToolbars:toolbars:3366:filters:1:filter:filter`. **Ese `3366` es un id de
componente de Wicket y cambia entre despliegues.**

El anclaje es el patrón del atributo `name`
(`results:topToolbars:toolbars:<n>:filters:<i>:filter:filter`): de ahí sale el prefijo, y
cada campo se asocia al **título visible de su columna** por la posición de la celda dentro
de la fila de filtros. Así, filtrar por período se pide por `campos["Período"]` y no por un
índice escrito a mano. El botón de filtrar (`…:filter:go`), el id del formulario y su campo
oculto (`<id del formulario>_hf_0`) salen del mismo HTML.

Si un día no hay ningún campo con ese patrón, el extractor falla: quiere decir que el SGA
cambió la grilla y hay que volver a mirar el HTML guardado.

### `a_contrato(cursos, periodo, capturado) -> dict`

Arma el JSON de `data/v1/horarios/<periodo>.json` (CONTRATO-v1.md §1). No escribe el archivo
ni lo valida contra el esquema: eso es de `cuatris fmt` y `cuatris validar`. `dictado_conjunto`
sale siempre `[]`, `sede` es `null` **solo** cuando la modalidad no es presencial (un bloque
presencial sin sede hace fallar la conversión), y un curso sin fechas de dictado (las del
listado) también hace fallar la conversión.
