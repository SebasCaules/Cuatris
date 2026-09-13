# Contrato de datos v1

Los datos viven en `data/`, versionados en el repositorio. Cada archivo lleva `"contrato"` en
SemVer. Los valida `cuatris validar` (capas C1 y C2) y los formatea `cuatris fmt`. Los schemas
JSON Schema draft-07 están en `schemas/v1/` y son el artefacto: no hay paso de generación.

## Convenciones

- **Forma canónica**: `json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"`,
  UTF-8 sin BOM, finales de línea LF. Es la única forma válida; `cuatris fmt --check` la exige.
- Claves duplicadas = error. Evita el truco de `{"cupo": 48, "cupo": 0}`, donde el revisor lee
  una cosa y el parser usa otra.
- Fechas `YYYY-MM-DD`, sin hora ni zona horaria, y que existan en el calendario: el patrón del
  schema acepta el 31 de septiembre, así que la fecha se construye en C1 (`fecha-invalida`).
  Horas `HH:MM` de 24 h.
- Códigos de materia: string `^\d{2}\.\d{2}$` (`"93.18"` no es un decimal). Período:
  `^\d{4}-[12]C$`.
- `additionalProperties: false` en todos los objetos. Un campo desconocido corta con un mensaje
  propio: si el dato es real, se actualiza el schema en un PR aparte.
- Ningún string lleva caracteres de control, saltos de línea ni overrides bidireccionales.
- Correos, teléfonos y legajos son error duro: el historial público es inmutable.

## `data/v1/horarios/<periodo>.json`

| Campo | Tipo | Reglas |
|---|---|---|
| `periodo.id` / `anio` / `cuatrimestre` | string, entero, enum `1C`/`2C` | `id` = `<anio>-<cuatrimestre>` (C3: `periodo-incoherente`) |
| `periodo.desde` / `hasta` | fecha | vigencia del cuatrimestre |
| `fuente.sistema` / `capturado` | enum `sga`/`manual`, fecha | de dónde salieron los datos |
| `cursos[].codigo` | código | identidad del curso; única en el archivo |
| `cursos[].nombre` | string | como lo muestra el SGA |
| `cursos[].departamento` | string, opcional | como lo muestra el SGA |
| `cursos[].desde` / `hasta` | fecha | del curso, no del período: los períodos cortos son reales |
| `cursos[].dictado_conjunto` | array de códigos | requerido, puede ser `[]`; códigos del mismo archivo (C3, warning) |
| `comisiones[].id` | string, 1–40 caracteres sin espacios en los bordes (`^\S(?:.{0,38}\S)?$`) | opaco, tal como lo publica el SGA: `A`, `K`, `S`, pero también `Inglés`, `Única`, `Intensivo`, `C - MECÁNICA y NAVAL`; sin orden ni contigüidad; `A.2` es la segunda edición de una comisión `A` (ver `desde`/`hasta` de comisión) |
| `comisiones[].desde` / `hasta` | fecha, opcionales, siempre juntos | solo cuando la comisión se dicta en fechas distintas de las del curso (dos ediciones de un seminario bajo un código); dentro del curso; son las fechas que C3 usa para las colisiones (1.1.0) |
| `comisiones[].cupo.capacidad` | entero >= 0, opcional | estable; separado del dato volátil |
| `comisiones[].ocupacion` | `{inscriptos, al}`, opcional | volátil; `inscriptos > capacidad` es warning |
| `comisiones[].docentes` | array de strings | requerido, puede ser `[]` |
| `comisiones[].bloques` | array | puede ser `[]` si todavía no hay horario publicado |
| `bloques[].dia` | enum | `lunes`…`sabado` y `domingo`, sin acentos; `domingo` entró en el contrato 1.1.0 |
| `bloques[].desde` / `hasta` | hora | `desde < hasta`, entre 07:00 y 23:00, y nunca más de 8 h seguidas (C3) |
| `bloques[].sede` | string o `null` | id de `vocabulario.json`; `null` = el SGA no publica sede para ese bloque (virtual, laboratorio, o presencial sin aula asignada todavía) |
| `bloques[].modalidad` | enum | `presencial`, `virtual_sincronica`, `virtual_asincronica`, `virtual`, `laboratorio`, `blended`; `virtual` es «virtual sin decir si es sincrónica» y `laboratorio` una práctica de laboratorio sin aula ITBA, tal como lo publica el SGA (1.1.0) |
| `bloques[].aulas` | array de strings | **nunca enum**; puede ser `[]` o tener dos aulas |

`cupo` va separado de `ocupacion` porque el primero es estable y el segundo cambia todos los
días: así un diff dice de un vistazo si cambió la oferta o solo la cantidad de inscriptos.

El techo de **8 h** por bloque (`bloque-demasiado-largo`, error) sale de que una franja más
larga que una jornada es un error de carga, no una clase: en el material no hay ninguna que
llegue a 4 h. Si aparece un dictado real más largo —un intensivo de sábado, por ejemplo— el
que está mal es el validador, y el techo se sube con la fixture que lo motivó.

**No hay un «hash estable»**: el único hash del repositorio es `canon.hash_canonico`, sobre el
texto canónico del archivo entero, `ocupacion` y `fuente.capturado` incluidos. Dos capturas del
mismo cuatrimestre en días distintos dan hashes distintos, así que no sirve para corroborar una
carga contra otra. Un hash que ignore los campos volátiles llega con la replicación
independiente (Sprint 3); hasta entonces, nada del repositorio promete esa propiedad.

## `data/v1/planes/<plan>.json`

| Campo | Reglas |
|---|---|
| `titulos[]` | `{id, nombre, tipo, creditos}`; `tipo` es `intermedio` o `principal` |
| `titulos[].requiere_ciclos` | opcional: exige **todos los ítems** de esos ciclos, además de los créditos |
| `titulos[].requiere_electivas` | opcional: créditos de electivas aprobadas |
| `electivas.creditos_requeridos` | entero; hoy 27 |
| `minors[]` | `{sigla, nombre, creditos_minimos}`; son cuatro y el mínimo es 14 |
| `materias[].ciclo` | enum `basico`, `profesional`, `electiva` |
| `materias[].cuatrimestre_sugerido` | entero 1–10 en las obligatorias; `null` en las electivas |
| `materias[].creditos_requeridos` | créditos aprobados necesarios para cursarla (72.45 exige 160) |
| `materias[].correlativas` | códigos que existen en `materias` y forman un grafo acíclico (C3) |
| `materias[].minors` | siglas declaradas en `minors[]`; vacío en las obligatorias (C3: `minor-en-obligatoria`) |
| `materias[].vigente` | `true` si sigue en el plan vigente; `false` si solo está en el SGA |

Las materias de 0 créditos (94.51 Inglés I, 94.52 Inglés II, 72.98 Práctica Laboral) son
materias normales: cuentan como ítems de los títulos.

**Supuesto documentado**: el SGA solo publica los 192 créditos del Bachiller en Ingeniería;
`requiere_ciclos: ["basico"]` es una suposición razonable, no un dato verificado.

## `data/v1/abreviaciones.json`

Mapa de código a nombre corto de 1 a 24 caracteres (`{"72.42": "POD", "72.44": "Cripto"}`). Se
cura a mano porque el catálogo lo genera el parser de PDF y sobrescribiría cualquier edición.
Las abreviaciones son únicas: repetirlas es error duro.

## `data/v1/vocabulario.json`

Lista de sedes `{id, nombre}`. El `id` (`^[a-z0-9_]+$`) es lo que va en `bloques[].sede`; el
`nombre` es el texto del SGA, sin expandir siglas que el material no expande.

## `data/index.json`

Dice qué archivos existen, con qué hash y desde cuándo cada período está activo. El `hash` es
`sha256:` más el hash del contenido canónico del archivo referido (ruta relativa a `data/`); lo
comprueba C1 y la SPA lo usa como `?v=` para invalidar la caché. **Publicar no es activar**: un
archivo de horarios existe cuando está en el repositorio, pero solo es el cuatrimestre por
defecto cuando `desde <= hoy <= hasta`. `horarios_esperados` es un mapa curado a mano de
período a `YYYY-MM`, opcional.

C1 comprueba tres cosas sobre cada entrada: que la ruta sea relativa y caiga dentro del
directorio de datos (`archivo-fuera-del-directorio`), que el `hash` sea el del archivo
(`hash-incorrecto`) y, para los horarios, que el `periodo`, el `desde` y el `hasta` del índice
sean los del archivo apuntado (`periodo-incorrecto`): **el archivo manda sobre el índice**, y
un índice que miente sobre la vigencia deja a la SPA sin período activo. Se arregla corriendo
`cuatris indice actualizar`, que es lo único que escribe esas entradas.

## Los siete casos reales

Cada decisión de forma está obligada por un caso verificado en el SGA. Están todos en
`tests/fixtures/deben-pasar/horarios-casos-raros.json`: **si un validador nuevo rechaza uno de
estos, el validador está mal, no el dato**.

| Caso | Ejemplo concreto | Lo que obliga |
|---|---|---|
| Un bloque en dos aulas a la vez | 93.18 com. B, miércoles 10:00–12:00 en `003T` y `004T`; com. K, lunes 08:00–10:00 en `202R` y `203R` | `aulas` es array |
| Comisión que cruza sedes | 93.18 com. A: lunes en Rectorado, miércoles en SDT (`201T`) | `sede` va en el bloque |
| Modalidades mixtas | 30.28 com. A: jueves `blended`, viernes `presencial` | `modalidad` va en el bloque |
| Período corto | 15.09 Agile, Lean y Lean Six Sigma: 2026-09-18 a 2026-10-16 | `desde`/`hasta` van en el curso |
| Comisiones con letras no contiguas | 93.18 tiene A–H y **K**; 72.44 usa **S** | `id` es un string opaco |
| Homónimas con distinto código | 23.05 y 25.66, ambas «Acústica para Ingenieros» | la identidad es `codigo`, nunca el nombre |
| Cupo completo | 93.18 com. A: 48 inscriptos sobre 48 de capacidad | `inscriptos == capacidad` es válido |

## Versiones del contrato

El `contrato` de cada archivo es SemVer y el major lo custodia el directorio (`v1`). Una versión
**minor** agrega algo que los lectores viejos no rompen pero tienen que aprender; una **patch**
no cambia la forma.

| Versión | Fecha | Qué agregó | Por qué es *minor* |
|---|---|---|---|
| 1.0.0 | 2026-09-09 | El contrato inicial: los cinco tipos de `data/v1/`. | — |
| 1.1.0 | 2026-09-12 | `dia` suma `domingo`; `modalidad` suma `virtual` y `laboratorio`; `comisiones[].desde/hasta` opcionales; `sede: null` con cualquier modalidad; `comisiones[].id` libre. | Extender un enum no invalida ningún archivo que ya esté publicado: todo documento `1.0.0` sigue siendo válido bajo `1.1.0`. Lo que sí cambia es el lector, que tiene que saber dibujar los dos valores nuevos. |

Los dos valores de 1.1.0 salieron de la corrida real del scraper del **2026-09-12**, no de una
previsión:

- **61.27 Análisis de Coyuntura Económica** dicta, en sus cuatro comisiones, un bloque **en
  domingo** (`Domingo 13:00 - 14:00` en la A) con modalidad «Virtual asincrónica», sin aula ni
  sede, además del bloque presencial de la semana en la Sede Distrito Financiero. El enum de
  `dia` decía que el domingo no existía.
- **25.20 Análisis de Señales y Sistemas Digitales**, comisión K, publica `Miércoles 15:00 -
  18:00` con modalidad **«Virtual»** a secas: el SGA no dice si es sincrónica y no se supone.

El scraper mapea «Domingo» → `domingo`, «Virtual» → `virtual` y «Presencial - SDR» →
`presencial`; los dos casos están congelados en
`tests/fixtures/deben-pasar/horarios-domingo-virtual.json`.

La corrida completa del **2026-09-13** (472 filas) agregó a 1.1.0, antes de publicar nada:

- **`modalidad: laboratorio`**: «Aula externa: Laboratorio» en 25 cursos (Física I/II/III,
  Química, Electrónica…): una práctica de laboratorio sin código de aula ITBA ni sede. Tiene
  hora fija: la SPA la trata como presencial para los choques y la dibuja.
- **`sede: null` con cualquier modalidad**: 74.61, 32.57 com. N y 17.06 com. C publican bloques
  *presenciales* sin «Aula ITBA:» (el SGA no les asignó aula todavía). La regla «null solo si no
  es presencial» rechazaba datos correctos y se retiró de C3.
- **`comisiones[].desde` / `hasta`**, opcionales y siempre juntos: el SGA lista un mismo código
  con dos ediciones en fechas distintas dentro del cuatrimestre (81.73 Introducción a la IOT,
  03/08–11/09 y 14/09–23/10, las dos «comisión A»). El curso queda con la envolvente y cada
  edición con sus fechas; la segunda pasa a id `A.2`. C3 exige que vayan juntas, ordenadas y
  dentro del curso, y usa estas fechas —no las del curso— para las colisiones de aula y de
  docente.
- **`comisiones[].id` libre** (1–40 caracteres): el SGA publica `Inglés`, `Única`, `Intensivo`,
  `C - MECÁNICA y NAVAL`; el patrón corto anterior los rechazaba.
- El nombre del curso va **sin la anotación de fechas** que el detalle agrega («(Seminario -
  03/08/2026 - 11/09/2026)», «(Anual - 01/03/2026 - 31/12/2026)»): repite `desde`/`hasta`.

Los casos están congelados en `tests/fixtures/deben-pasar/horarios-laboratorio-ediciones.json`
(93.41, 17.06 y 81.73 tal como los publica el SGA).
- **Colisión de aula breve = aviso** (`colision-de-aula-breve`): 74.61 «Current AI techniques for
  scientific discovery» es un intensivo de una semana (24/08–28/08, lunes a viernes 08–13) en
  aulas que 92.03 com. D y 82.17 com. A ocupan todo el cuatrimestre. Lo publica el SGA así. Si
  los dos dictados comparten **7 días o menos** de calendario, C3 avisa y publica; con más,
  sigue siendo error (es lo que detecta un bloque movido a un aula ocupada). Fixture:
  `tests/fixtures/deben-pasar/horarios-intensivo-en-aula-ocupada.json`.

## Cómo agregar un campo

1. Un PR aparte, solo con el cambio de schema y su fixture; nunca junto a una carga de datos.
2. El campo nuevo es **opcional**: los archivos que ya están en el repositorio siguen validando.
3. Suba el `contrato` de los archivos afectados en **minor** (`1.0.0` → `1.1.0`).
4. Agregue el campo a `schemas/v1/<tipo>.schema.json` con su `description` de una línea, la
   fila correspondiente en este documento y una fixture en `tests/fixtures/deben-pasar/`.
5. Si el campo apareció porque un validador lo rechazó, la fixture que lo motivó entra en el
   mismo PR: es la única manera de que el falso positivo no vuelva.

## Cómo cambiar la forma

Un cambio incompatible —renombrar un campo, quitarlo, volver escalar algo que era array— es
**major**: crea `data/v2/` y `schemas/v2/`, y **no toca `v1`**. Las dos versiones conviven
hasta que la SPA deje de leer la vieja. Es lo que evita que dentro de tres años alguien
«simplifique» `aulas` a un string y rompa Álgebra Lineal.

Ese corte lo custodia C1: un archivo de `v1/` que declare un major distinto de 1 es el error
`contrato-incompatible`. Sin esa regla el archivo atraviesa los gates, se publica, y el único
que lo rechaza es el navegador del visitante, que solo sabe leer el major 1.
