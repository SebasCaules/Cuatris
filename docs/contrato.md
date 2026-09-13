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
| `comisiones[].id` | string `^[A-Za-z0-9][A-Za-z0-9._-]{0,7}$` | opaco: sin orden ni contigüidad |
| `comisiones[].cupo.capacidad` | entero >= 0, opcional | estable; separado del dato volátil |
| `comisiones[].ocupacion` | `{inscriptos, al}`, opcional | volátil; `inscriptos > capacidad` es warning |
| `comisiones[].docentes` | array de strings | requerido, puede ser `[]` |
| `comisiones[].bloques` | array | puede ser `[]` si todavía no hay horario publicado |
| `bloques[].dia` | enum | `lunes`…`sabado`, sin acentos; `domingo` no existe |
| `bloques[].desde` / `hasta` | hora | `desde < hasta`, entre 07:00 y 23:00, y nunca más de 8 h seguidas (C3) |
| `bloques[].sede` | string o `null` | id de `vocabulario.json`; `null` solo si no es presencial |
| `bloques[].modalidad` | enum | `presencial`, `virtual_sincronica`, `virtual_asincronica`, `blended` |
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
