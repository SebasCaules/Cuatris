# Scraping del SGA

Cómo se obtienen los horarios del ITBA, cómo se corre el scraper y cómo se vuelve a derivar
cada selector cuando deje de funcionar. Está escrito para alguien que llega a este
repositorio dentro de varios años y no vio nunca el SGA.

> **Resumen para el apurado.** `export SGA_USUARIO=…`, después
> `.venv/bin/cuatris sga bajar --anio 2026 --cuatrimestre 2C --salida /tmp/prueba-2026-2C.json --limite 3`
> para probar, y el mismo comando con `--salida data/v1/horarios/2026-2C.json` y sin `--limite`
> para el barrido completo (~500 peticiones, entre ocho y diez minutos). Si se corta, se
> vuelve a correr el mismo comando: retoma donde iba.

## Qué es el SGA y cómo se consigue una cuenta

El **SGA** (Sistema de Gestión Académica, `https://sga.itba.edu.ar`) es el sistema interno
del ITBA donde viven la oferta de cursos, las comisiones, los horarios y las aulas. **Es la
única fuente de horarios que tiene este proyecto**: no hay API pública ni exportación, y los
horarios ni siquiera aparecen en el listado de cursos, solo dentro de cada materia.

La cuenta es la institucional del ITBA, la misma que usan estudiantes y docentes; no hay
registro propio del SGA ni segundo factor (usuario y contraseña, nada más). Quien no la
tenga tiene que pedirla por los canales de soporte del ITBA: este proyecto no puede
gestionarla. El propio SGA enlaza el cambio de contraseña a
`https://ti.itba.edu.ar/chpassword/login.php`, que es de donde sale la contraseña que pide
el scraper.

**Las credenciales no se guardan en ningún lado.** No están en el repositorio, no van a un
archivo de configuración y el scraper no las escribe nunca en disco ni en el log. Viven en
memoria mientras dura la corrida —el re-login automático las necesita— y se borran al
terminar.

## Por qué el scraper no corre en CI

Dos razones, y las dos son definitivas:

1. **CI no tiene credenciales y no puede tenerlas.** El repositorio es público y la decisión
   de plataforma es cero secretos (solo `GITHUB_TOKEN` y OIDC para Pages). Poner una cuenta
   del ITBA en un secreto de Actions sería exponer una cuenta personal.
2. **Un chequeo que depende del SGA en vivo se convierte en un bloqueo.** El día que el ITBA
   cambie una pantalla, el CI empezaría a fallar y no se podría mergear nada, ni siquiera un
   cambio que no tenga que ver con los horarios.

Por eso el scraper lo corre **una persona, en su máquina**, y lo que entra al repositorio es
el JSON resultante, revisado en un PR. La validación en CI es 100 % offline y determinista:
corre sobre el archivo, no sobre el SGA.

## El recorrido, pantalla por pantalla

Lo que el scraper automatiza es exactamente lo que haría una persona:

1. Entrar a `https://sga.itba.edu.ar/app2/` e iniciar sesión.
2. Menú **Académica → Cursos**. Aparece el listado de cursos.
3. Filtrar por **Nivel** (`Grado`), **Período** (`Segundo Cuat.`) y **Año** (`2026`). Con
   esos filtros el listado dio **472 cursos** en septiembre de 2026, paginados de a **20**:
   24 páginas.
4. En cada fila, la **lupa** de la columna `Acciones` abre el detalle del curso.
5. En el detalle, la pestaña **Comisiones**. Ahí —y solo ahí— están los horarios: día, hora,
   aula, sede, modalidad, docentes y cupo de cada comisión.

Son ~472 detalles más ~24 listados: alrededor de 500 peticiones por cuatrimestre. No hay
atajo. «Administración → Ocupación de Aulas» muestra una grilla de aulas ocupadas, pero **no
dice qué materia ocupa cada aula**, así que no sirve como fuente (sí como validación cruzada
offline, que es trabajo de otro sprint).

## La plataforma: Wicket y las URL cifradas

El SGA es una aplicación **Apache Wicket** (jQuery 1.8, Bootstrap 2) detrás de un
balanceador de AWS. Tres consecuencias que explican casi todas las decisiones del scraper:

- **Todas las URL internas están cifradas** por el `CryptoMapper` de Wicket. La clave es de
  la aplicación, no de la sesión (dos sesiones limpias dieron la misma URL cifrada), pero
  cambia con los despliegues. Por eso **el único punto de entrada que se escribe en el código
  es `https://sga.itba.edu.ar/app2/`**; todo lo demás se navega siguiendo los `href` y los
  `<form action>` del HTML que el SGA acaba de devolver.
- **Los ids de componente rotan.** Nombres como `id1`, `id1a0_hf_0` o
  `results:topToolbars:toolbars:3366:filters:5:filter:filter` llevan un número que Wicket
  asigna al armar la página; con otro despliegue es otro número. Ningún selector de este
  proyecto se apoya en un id numérico: todos se anclan en texto visible o en el patrón del
  nombre del campo.
- **Hacen falta las tres cookies**: `JSESSIONID`, `AWSALB` y `AWSALBCORS`. `AWSALB` es la
  que mantiene la afinidad con la instancia del balanceador; sin ella la sesión de Wicket se
  pierde a mitad del barrido. El cliente las conserva solo y avisa en el log si alguna no
  llegó.

## Cómo se corre

Requisitos: Python 3.11+, una cuenta del SGA y el entorno del proyecto (`.venv/` en la raíz).
`.venv/` no está versionado (`.gitignore`), así que en un clon limpio hay que crearlo; las
dependencias salen de `vendor/`, sin red:

```bash
cd /ruta/al/repositorio
python3 -m venv .venv
.venv/bin/pip install --no-index --find-links vendor -r vendor/requisitos.txt
.venv/bin/pip install --no-index --no-build-isolation --no-deps -e tools
```

Eso deja `.venv/bin/cuatris`, que es el comando que usa el resto de esta página. (`docs/ci.md`
§«Correr todo localmente» instala lo mismo, más `ruff`, para correr los tests y los linters.)

```bash
export SGA_USUARIO=su.usuario        # la contraseña NO se exporta: se escribe cuando la pida
```

`SGA_CLAVE` también se lee del entorno si está definida, pero conviene no ponerla ahí: si
falta, el scraper la pide con `getpass`, que no la muestra en la terminal ni la deja en el
historial del shell.

**Primera corrida, siempre con `--limite 3`:**

```bash
.venv/bin/cuatris sga bajar \
  --anio 2026 --cuatrimestre 2C \
  --salida /tmp/prueba-2026-2C.json \
  --limite 3
```

Baja solo tres cursos y escribe el archivo completo: alcanza para ver en un minuto si el
login, los filtros, la paginación y el parseo siguen funcionando. **La salida va a `/tmp`, no
a `data/`, a propósito**: las fechas del período salen de los cursos que se hayan mirado, así
que con `--limite` el encabezado `periodo` no representa al cuatrimestre entero. Es una
prueba, no un entregable —el comando lo dice al terminar—, y ningún validador la distingue de
un archivo publicable: si quedara en la ruta de publicación y el barrido completo se cortara,
el PR publicaría el archivo de prueba.

**Barrido completo:**

```bash
.venv/bin/cuatris sga bajar \
  --anio 2026 --cuatrimestre 2C \
  --salida data/v1/horarios/2026-2C.json
```

Opciones:

| Opción | Para qué |
|---|---|
| `--anio`, `--cuatrimestre` | El período a bajar (`1C` o `2C`); juntos forman `periodo.id` |
| `--salida` | Archivo JSON a escribir, normalmente `data/v1/horarios/<periodo>.json` |
| `--limite N` | Baja solo los primeros N cursos (prueba) |
| `--desde-cero` | Borra el checkpoint del período y vuelve a bajar todo |
| `--ritmo` | Peticiones por segundo; por defecto **1.0** |
| `--nivel` | Nivel del filtro del listado; por defecto `Grado` |
| `--guardar-html` | Ante un error, vuelca la respuesta problemática en `.cuatris-cache/` (una por curso fallido, `<periodo>-<codigo>.html`) |
| `--verboso` | Muestra en la consola cada petición y cada redirección (el archivo de log las trae siempre) |
| `--data` | Directorio de datos del que la capa C3 toma el plan y el vocabulario |
| `--cache` | Directorio del checkpoint, de los volcados y de los descartes; por defecto `./.cuatris-cache` |

Sobre `--ritmo`: **no lo suba.** Una petición por segundo sobre ~500 peticiones son unos
ocho minutos, y el `User-Agent` que manda el scraper
(`Cuatris/0.1 (+https://github.com/SebasCaules/Cuatris)`) lo identifica ante quien administre
el sistema. Es la infraestructura de la universidad; el costo de ser cortés es un café.

**El archivo de log.** Cada corrida escribe, además de lo que muestra la consola, un archivo
`.cuatris-cache/<periodo>.log` en nivel DEBUG: cada petición con su método y su URL, cada
redirección, cada aviso y el resumen final, con hora. Se abre en modo *append*, y cada corrida
empieza con una línea `=== corrida <fecha> <hora> ===`. El identificador de sesión
(`;jsessionid=…`) va tapado en todas las líneas, así que el archivo se puede compartir. Es lo
que hay que mirar —o pegar— cuando algo salió mal: la terminal de un barrido de dieciséis
minutos no alcanza.

**Una corrida junta todos los errores.** Un curso que no se entiende (un valor nuevo, una
forma de cupo distinta) no frena el barrido: se anota con su motivo, se sigue con los demás y
al final se informan todos juntos. Los cursos buenos quedan en el checkpoint; lo que se pudo
armar queda en `.cuatris-cache/<periodo>.parcial.json`, fuera de `data/`. Se corrigen los
mapeos o el parser y se vuelve a correr **el mismo comando**: solo se repiten los fallidos.

### Por qué el barrido va página por página

El listado tiene ~24 páginas de 20 cursos. El scraper abre **una** página, visita los 20
detalles de esa página y recién entonces pide la siguiente; nunca lee el listado entero antes
de abrir un detalle. No es una preferencia: es lo único que funciona.

Wicket guarda las páginas con estado de cada sesión en un almacén acotado (un anillo en disco
de unos 10 MB). Cada detalle de curso que se abre crea páginas nuevas en ese almacén, y las
páginas del listado que nadie volvió a tocar se desalojan para hacer lugar. Un enlace que
salía de una página desalojada ya no apunta a nada: el SGA responde su pantalla de error
genérica («El sistema halló un error inesperado. Su pedido no pudo ser realizado…»). Con el
barrido página por página, cada clic sobre la página actual la vuelve a guardar, y la página
siguiente se pide desde ella, así que nunca se desaloja.

Se comprobó en la corrida real del 2026-09-12 (22:18–22:27): una versión anterior leía las 24
páginas primero; las 40 filas de las páginas 1 y 2 salieron bien y las 432 restantes
devolvieron la pantalla de error, una petición por curso. Es el síntoma a reconocer si alguien
«optimiza» el recorrido en el futuro.

### Cuando se corta

Cada curso terminado se escribe en el acto en `.cuatris-cache/<periodo>.jsonl`, una línea por
curso. Si se corta la red, vence la sesión o se cierra la terminal, **se vuelve a correr el
mismo comando** y el scraper saltea lo que ya bajó: solo se repite el recorrido del listado,
que es barato. `--desde-cero` borra ese archivo y empieza de nuevo; se usa cuando cambió algo
del parser y los datos viejos ya no sirven.

Si la sesión del SGA vence a mitad del barrido, el cliente lo detecta (el SGA devuelve la
pantalla de login en vez de lo pedido), vuelve a entrar **una vez** y reintenta esa misma
petición. Si vuelve a vencer inmediatamente, corta con un error: el checkpoint conserva todo
lo bajado.

Si el SGA responde su pantalla de error genérica a un clic (ver «Por qué el barrido va página
por página»), el cliente lo detecta (`PaginaVencida`) y el barrido **se recupera solo**: vuelve
a abrir el listado desde `/app2/` (menú «Cursos», filtros) y pagina hasta la página en la que
estaba, toma el enlace nuevo del mismo curso y lo reintenta una vez. Cada recuperación cuesta
tantas peticiones como páginas haya que volver a pasar. Si el curso vuelve a fallar, queda como
fallido y se sigue; si **cinco cursos seguidos** terminan así, el problema es el SGA y no un
curso: el barrido corta con un mensaje que lo dice, para no gastar 470 peticiones en vano. Se
espera unos minutos y se vuelve a correr el mismo comando. Tras un re-login pasa lo mismo, y
la misma recuperación lo resuelve: las páginas de Wicket de la sesión anterior ya no existen.

## Qué comprueba el scraper además de parsear

- **Que el filtro se haya aplicado**: si ninguna fila de la **primera página** es del período
  pedido, corta ahí mismo. Un filtro que no tomó produciría un archivo con dos cuatrimestres
  mezclados, y descubrirlo al final costaría dieciséis minutos.
- **Que el detalle sea el que se pidió**: si se abre la lupa de 30.28 y el SGA devuelve
  93.18, corta.
- **Códigos repetidos en el listado.** El SGA lista algunos códigos dos veces (en la corrida
  del 2026-09-12, 472 filas para 461 códigos). Cada aparición se baja y se guarda aparte en el
  checkpoint (`93.18`, `93.18#2`), con un `WARNING` que muestra las dos filas. Al armar el
  archivo se fusionan por código: si son idénticas queda una; si sus comisiones tienen ids
  distintos se unen (con `desde` mínimo y `hasta` máximo, y otro `WARNING`); si una misma
  comisión trae **horarios distintos en las mismas fechas**, ese código queda como fallido con
  los ids en conflicto, porque el contrato quiere un curso por código y nadie debe decidirlo a
  ciegas. Dos casos reales que sí se resuelven solos: (a) **dos ediciones** del mismo código en
  fechas distintas (81.73, «A» del 03/08 al 11/09 y «A» del 14/09 al 23/10): quedan las dos,
  cada comisión con sus `desde`/`hasta` propios y la segunda como `A.2`; (b) **dos cohortes**
  de un curso anual (10.01, 72.45: la que empezó en marzo, rotulada «Primer Cuat.», y la que
  empieza ahora) que tras el recorte al cuatrimestre coinciden en horario y aula: queda una,
  la de la fila del período pedido, con la unión de los docentes de las dos.
- **Que el archivo final valide** (C1, C2 y C3). Si hay errores, el archivo **se mueve** a
  `.cuatris-cache/<periodo>.invalido.json` —fuera de `data/`— y el comando sale con código 1,
  para que un archivo que no valida no se pueda confundir con uno publicable. Queda ahí solo
  para mirarlo: es un descarte y se borra. Nunca lo deje dentro de `data/`, porque un segundo
  archivo del mismo período rompe `cuatris indice actualizar` y tumba los gates de CI, que
  validan todos los JSON de `data/`.

**Cursos anuales.** El listado filtrado por un cuatrimestre trae también los cursos anuales,
que el SGA rotula con el período en que empiezan (por ejemplo «Primer Cuat.» y nombre
«(Anual)»). El scraper los acepta si su dictado se solapa con el intervalo de fechas de los
cursos propios del cuatrimestre, y **recorta sus fechas a ese intervalo**, porque el archivo
describe el cuatrimestre, no el año; lo avisa con un `WARNING` por curso. Es anual todo curso
cuyo dictado dura **240 días o más** (`es_anual`), venga rotulado con el período que venga:
las cohortes que empiezan este cuatrimestre y terminan el año que viene (10.01 y 72.45,
rotuladas «Segundo Cuat.» con fin en julio de 2027) también lo son, y sin esa regla estirarían
el `periodo` del archivo hasta 2027. Como el barrido va
página por página, el intervalo se conoce recién al final: por eso el checkpoint guarda, junto
con cada curso, el período y las fechas que decía su fila del listado (`listado`), y la
separación se hace al terminar, leyendo esos registros. Un curso de otro período que no se
solapa queda como fallido con ese motivo (no corta el resto).

## Qué extrae cada parser y en qué se ancla

Esta es la sección que hay que abrir primero cuando una corrida falle: dice, dato por dato,
en qué se ancla el parser y cómo comprobar que ese anclaje sigue valiendo.

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
| `dia`, `desde`, `hasta` | los tres primeros `<span>` hijos directos del `<div>`; los días van de `Lunes` a `Domingo` (61.27 dicta en domingo un bloque virtual asincrónico) |
| `aulas` y `sede` | `<span>` cuyo texto propio empieza con **`Aula ITBA:`**; el valor tiene la forma `001R #----> Sede Rectorado` |
| `modalidad` | `<span>` cuyo texto propio empieza con **`Aula externa:`**. La etiqueta engaña: el valor es la modalidad (`Presencial`, `Virtual sincrónico/a`, `Virtual asincrónico/a`, `Virtual` a secas → `virtual`, `Laboratorio` → `laboratorio`, `Blended`). Un valor con sufijo, como `Presencial - SDR` (73.67), se lee como la modalidad que lo encabeza y deja un `WARNING` con el sufijo, una vez por texto distinto |
| `docentes` | cada `<label>` de la celda `Profesores` |
| `cupo` / `ocupacion` | celda `Cupo`, con la forma `inscriptos / capacidad` (`48 / 49` = 48 inscriptos sobre 49 lugares); `2 / Ilimitado` = 2 inscriptos y sin `cupo` |

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
- **La sede solo sale de `Aula ITBA:`**. Un bloque sin ese `<span>` —virtual, `Laboratorio`,
  o presencial al que el SGA todavía no asignó aula (74.61, 32.57 com. N, 17.06 com. C el
  2026-09-13)— queda con `sede: null` y `aulas: []`, tal como lo publica el SGA.
- **El nombre del detalle trae a veces una anotación de fechas** («(Seminario - 03/08/2026 -
  11/09/2026)», «(Anual - 01/03/2026 - 31/12/2026)») que el listado no trae y que repite
  `Comienzo`/`Fin`; `parsear_curso` la quita (`nombre_sin_fechas`).
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

## Los anclajes del scraper en vivo

Los de arriba son los del HTML ya descargado. Estos son los que usa `cliente.py` para
navegar, y valen la misma regla: texto visible o patrón de nombre de campo, nunca un id.

| Dato | Anclaje (`tools/cuatris/sga/cliente.py`) | Cómo verificar que sigue valiendo |
|---|---|---|
| Punto de entrada | la constante `ENTRADA` = `/app2/`; es **lo único** escrito a mano | abrirlo en el navegador: tiene que redirigir dos veces y dejar la pantalla de login |
| Formulario de login | `parsers.extraer_formulario_login`: se busca el `<input type="password">`, se sube a su `<form>` y se leen `action` y los ocultos | ver el fuente de la pantalla de login: el `action` es relativo y cambia en cada carga |
| Campos que se envían | `user`, `password` y el botón `login` con valor `Ingresar`, más todos los ocultos del formulario, **con `js` forzado a `1`** (el HTML lo trae en `0` y el script de la página lo pone en `1`; enviado en `0`, el SGA entra en un bucle de redirecciones —«Exceeded maximum allowed redirects»— verificado el 2026-09-12) | si el ITBA renombra los campos, el login devuelve otra vez la pantalla de login; si vuelve el bucle de redirecciones, mirar primero qué hace el script de la pantalla de login con los ocultos |
| **Sesión iniciada** | el enlace cuyo texto contiene **`Salir`** en la barra superior, y que **no** haya campo de contraseña | está en todas las pantallas del SGA una vez adentro; se comprueba con los dos a la vez, porque si renombran el enlace, el campo de contraseña sigue delatando el login |
| **Sesión vencida** | reaparece el `<input type="password">` | cuando la sesión de Wicket caduca, el SGA responde el formulario de login a cualquier URL, incluso a una cifrada que antes funcionaba |
| **Pantalla de error del SGA** | un `<h3>` cuyo texto contiene **`error inesperado`**, o el `<h4>` de `div#notifications` con **`no pudo ser realizado`** (`pagina_de_error`); cualquiera de los dos alcanza | es la respuesta a un enlace de una página de Wicket desalojada; copia anonimizada en `tests/corpus/sga/error-inesperado.html` |
| Menú → listado | el `<a>` cuyo texto visible es **`Cursos`** | está bajo «Académica»; si lo renombran, cambiar `ENLACE_CURSOS` en `bajar.py`. El barrido lo usa también al **reabrir** el listado tras una pantalla de error, partiendo de `/app2/` |
| Pestaña de un curso | dentro de `div.tabpanel4`, el `<li>` cuyo texto es **`Comisiones`** | el detalle abre en «Plantel Docente»; el scraper salta a Comisiones salvo que ya esté activa |
| Campos de filtro | `parsers.extraer_ids_filtro`: patrón `results:topToolbars:toolbars:<n>:filters:<i>:filter:filter`, asociado al **título visible** de su columna | el `<n>` rota; pedir el filtro por `campos["Período"]`, nunca por índice |
| Valor de un desplegable | el `value` del `<option>` cuyo **texto visible** es `Grado` / `Segundo Cuat.` | los `value` son índices internos (`0`, `1`, `2`…) y pueden reordenarse; el texto es lo estable |
| Página siguiente | `div.navigator a.next` (lo devuelve `parsear_listado` en `paginacion.enlace_siguiente`) | cuando no está, el barrido terminó; el scraper además corta si el enlace se repite |

Los textos del listado se traducen al vocabulario del contrato en
`tools/cuatris/sga/normalizar.py` (`Segundo Cuat.` → `2C`, `Sede Rectorado` → `rectorado`,
`Presencial` → `presencial`). Un texto que ningún mapeo reconoce levanta `ValorDesconocido`
con el original: **hay que agregar el mapeo a mano**, después de verlo en el material, y
nunca adivinarlo.

## Diagnóstico cuando falle

El orden de siempre: mirar el mensaje, mirar el HTML, comparar contra el corpus.

1. **Leer la excepción.** `EstructuraInesperada` trae el fragmento de HTML que no se pudo
   leer; `ValorDesconocido` trae el texto que no está mapeado. Con `--traceback` se ve el
   traceback completo en vez del resumen.
2. **Guardar el HTML problemático:**

   ```bash
   .venv/bin/cuatris sga bajar --anio 2026 --cuatrimestre 2C \
     --salida /tmp/prueba.json --limite 3 --guardar-html
   ```

   Deja la respuesta de cada curso fallido en `.cuatris-cache/<periodo>-<codigo>.html` y, si
   el barrido entero se cortó, la última respuesta en `.cuatris-cache/<periodo>-error.html`.
   El archivo `.cuatris-cache/<periodo>.log` trae la secuencia completa de peticiones.
3. **Compararlo con el corpus.** En `tests/corpus/sga/` están las capturas anonimizadas
   sobre las que se escribieron los parsers:

   | Archivo | Qué pantalla es |
   |---|---|
   | `oferta-materias.html` | listado de cursos, página 1 de 24, con filtros y paginación |
   | `oferta-filtrada-nombreycuatri.html` | listado filtrado, una sola fila |
   | `horarios-materia-detalle.html` | detalle de un curso, pestaña «Plantel Docente» |
   | `horarios-materia-detalle-comisiones.html` | detalle, pestaña «Comisiones», una comisión |
   | `horarios-materia-multiples-comisiones.html` | 93.18, nueve comisiones: el caso rico |
   | `detalle-comisiones-25.20.html` | comisión con un bloque «Virtual» a secas y otro «Blended» |
   | `detalle-comisiones-61.27.html` | cuatro comisiones con bloques virtuales asincrónicos en domingo |
   | `detalle-comisiones-73.67.html` | modalidad con sufijo, «Presencial - SDR» |
   | `error-inesperado.html` | la pantalla de error genérica del SGA (página de Wicket desalojada) |

   ```bash
   diff <(.venv/bin/python -c "import sys,bs4;print(bs4.BeautifulSoup(open(sys.argv[1]).read(),'html.parser').prettify())" .cuatris-cache/2026-2C-error.html) \
        <(.venv/bin/python -c "import sys,bs4;print(bs4.BeautifulSoup(open(sys.argv[1]).read(),'html.parser').prettify())" tests/corpus/sga/oferta-materias.html)
   ```

   La diferencia señala el anclaje que hay que actualizar. Las tablas de arriba dicen cuál.
4. **Arreglarlo con un test.** Al cambiar un anclaje se agrega la captura nueva al corpus
   —**anonimizada**: el HTML del SGA lleva el nombre del usuario en la barra superior, que se
   reemplaza por `APELLIDO, NOMBRE`— y el test que la cubre, en el mismo PR.

Síntomas frecuentes:

| Síntoma | Causa probable |
|---|---|
| «El SGA no aceptó el login» | usuario o contraseña; si son correctos, cambió el formulario de login |
| «El HTML no trae campos `results:topToolbars:…`» | cambió la grilla del listado |
| «El desplegable no tiene la opción `Grado`» | renombraron el nivel o el período en el filtro |
| «La celda Horarios tiene texto pero no se pudo leer ningún bloque» | cambió el marcado de los bloques horarios: es el caso más caro, porque sin este control la corrida quedaría verde y con todos los cursos sin horarios |
| «Valor de sede/modalidad no reconocido» | apareció una sede o una modalidad nueva: agregar el mapeo en `normalizar.py` |
| Todo vuelve a la pantalla de login | se perdió `AWSALB`: el balanceador mandó la petición a otra instancia |
| «El SGA respondió su pantalla de error» en un curso, y el barrido se recupera solo | normal: una página del listado desalojada por Wicket; solo importa si se repite en cinco cursos seguidos |
| «5 cursos seguidos terminaron en la pantalla de error del SGA» | el SGA está caído o rechaza la sesión: esperar unos minutos y volver a correr el mismo comando |
| «N de M cursos no se pudieron parsear» al final | la lista de abajo dice el motivo de cada uno; corregir todos los mapeos juntos y volver a correr: solo se repiten esos |

## Cómo se carga el resultado

El scraper ya escribe el archivo en forma canónica y lo valida; estos pasos son para revisarlo
y publicarlo.

```bash
# 1. Forma canónica (debería no cambiar nada: el scraper ya la escribe así)
.venv/bin/cuatris fmt --check data/v1/horarios/2026-2C.json

# 2. Validación completa (C1 bytes y forma, C2 esquema, C3 invariantes)
.venv/bin/cuatris validar data/v1/horarios/2026-2C.json

# 3. Activar el período en el índice: hasta que no esté acá, la SPA no lo ve
.venv/bin/cuatris indice actualizar
```

`cuatris indice actualizar` recalcula el `hash` y la fecha de `data/index.json`, y crea la
entrada del período nuevo leyendo `periodo` del propio archivo (`--publicado YYYY-MM-DD` fija
la fecha de publicación). Es el único comando que escribe hashes: `cuatris validar` los comprueba.

```bash
# 4. Verlo en la página antes de abrir el PR
cd app && npm run dev        # sirve además ../data bajo /data/, así que lee el archivo recién escrito
```

Este paso no es decorativo: es lo único que muestra lo que ningún validador puede ver.
`periodoActivo` (`app/src/datos/cargar.ts`; `docs/contrato.md`, «`data/index.json`») elige el
período con `desde <= hoy <= hasta`, así que un `periodo` mal fechado deja el cuatrimestre
nuevo fuera de la pantalla sin que nada falle; y un archivo de prueba de tres cursos valida
igual de bien que uno completo. Abra el período nuevo, confirme que aparece seleccionado, que
la cantidad de materias es la esperada y que una materia conocida trae sus comisiones y
horarios.

Después, el PR:

```bash
git checkout -b datos/horarios-2026-2C
git add data/v1/horarios/2026-2C.json data/index.json
git commit -m "Horarios 2026-2C desde el SGA"
git push -u origin datos/horarios-2026-2C
```

Qué mirar antes de aprobarlo:

- El diff son **datos, nunca código**: si toca algo fuera de `data/`, algo está mal.
- La cantidad de cursos y de comisiones contra la corrida anterior. Una caída brusca suele ser
  un parser que dejó de encontrar algo, no un cuatrimestre más chico.
- Los avisos (`WARNING`) del validador: un código que no está en el plan es esperable —los
  horarios traen todas las carreras—, pero `inscriptos > capacidad` o una colisión de docente
  merecen una mirada.
- `.cuatris-cache/` **no entra al repositorio** (está en `.gitignore`): es caché local y los
  volcados de `--guardar-html` llevan el nombre del usuario.
