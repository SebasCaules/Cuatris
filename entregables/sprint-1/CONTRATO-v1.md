# Contrato de datos v1 — decisiones cerradas (N0) para el Sprint 1

Este documento fija las **formas exactas** que los workers implementan. Lo que no está aquí se
decide en `02-plan-backend.md` (Fase 1); si ambos difieren, manda este archivo y se anota la
diferencia en `EXEC_STATE.md`.

## Convenciones globales

- Todo archivo de datos lleva su `"contrato"` en SemVer (string); la versión vigente es
  **1.1.0** (§8) y los archivos `1.0.0` ya publicados siguen siendo válidos. El corte de
  compatibilidad es el directorio: C1 rechaza con `contrato-incompatible` cualquier archivo de
  `v1/` cuyo major no sea 1, porque un major distinto vive en `data/v2/` con `schemas/v2/`.
- **Forma canónica**: `json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"`,
  UTF-8 sin BOM, `LF`. Claves duplicadas en el JSON de entrada = error (usar
  `object_pairs_hook` al parsear). Es lo que produce `cuatris fmt` y lo que exige `--check`.
- Fechas `YYYY-MM-DD` (regex `^\d{4}-\d{2}-\d{2}$`, además válida como fecha: el regex es del
  schema y el calendario lo comprueba C1 con `fecha-invalida`). Horas `HH:MM`
  de 24 h. Códigos de materia: string `^\d{2}\.\d{2}$`. Período: string `^\d{4}-[12]C$`.
- JSON Schema **draft-07** (compatibilidad plena con `fastjsonschema` y con
  `json-schema-to-typescript`). `additionalProperties: false` en todos los objetos. `$id`:
  `https://sebascaules.github.io/Cuatris/schemas/v1/<nombre>.schema.json`.
- Enums cerrados: `dia`, `modalidad`, `cuatrimestre`, `tipo` de título, `ciclo`. `sede` se
  valida contra `vocabulario.json` en C3, no en el schema. **`aulas` nunca es enum.**

## 1. `data/v1/horarios/<periodo>.json`

```json
{
  "contrato": "1.0.0",
  "periodo": { "id": "2026-2C", "anio": 2026, "cuatrimestre": "2C",
               "desde": "2026-07-26", "hasta": "2026-12-31" },
  "fuente": { "sistema": "sga", "capturado": "2026-09-20" },
  "cursos": [{
    "codigo": "93.18",
    "nombre": "Álgebra Lineal",
    "departamento": "Ciencias Exactas y Naturales",
    "desde": "2026-07-26", "hasta": "2026-12-31",
    "dictado_conjunto": [],
    "comisiones": [{
      "id": "A",
      "cupo": { "capacidad": 48 },
      "ocupacion": { "inscriptos": 48, "al": "2026-09-09" },
      "docentes": ["Cabana, Adriana Elena", "Peña, Nelly Haydee"],
      "bloques": [{
        "dia": "lunes", "desde": "14:00", "hasta": "16:00",
        "sede": "rectorado", "modalidad": "presencial", "aulas": ["001R"]
      }]
    }]
  }]
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| `periodo.cuatrimestre` | enum `1C`, `2C` | `periodo.id` = `<anio>-<cuatrimestre>` (C3: `periodo-incoherente`) |
| `fuente.sistema` | enum `sga`, `manual` | `capturado`: fecha de la captura |
| `cursos[].codigo` | string código | única en el archivo (C3) |
| `cursos[].departamento` | string, **opcional** | tal como lo muestra el SGA |
| `cursos[].desde/hasta` | fecha | dentro del período (C3); períodos cortos son válidos |
| `cursos[].dictado_conjunto` | array de códigos | requerido, puede ser `[]`; todo código es un curso del mismo archivo (C3, warning) |
| `comisiones[].id` | string, 1–40 caracteres sin espacios en los bordes (`^\S(?:.{0,38}\S)?$`) | opaco, tal como lo publica el SGA (`A`, `K`, `S`, `Inglés`, `Única`, `Intensivo`, `C - MECÁNICA y NAVAL`); único por curso; `A.2` = segunda edición de `A` (1.1.0) |
| `comisiones[].desde` / `hasta` | fecha, **opcionales**, siempre juntos | solo si la comisión se dicta en fechas distintas de las del curso (dos ediciones bajo un código, 81.73); dentro del curso (C3) y son las fechas que C3 usa para colisiones |
| `comisiones[].cupo` | objeto `{capacidad: int ≥ 0}`, **opcional** | estable |
| `comisiones[].ocupacion` | objeto `{inscriptos: int ≥ 0, al: fecha}`, **opcional** | volátil; `inscriptos > capacidad` es warning |
| `comisiones[].docentes` | array de strings | requerido, puede ser `[]`; colisión de docente = warning |
| `bloques[].dia` | enum `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado`, `domingo` | sin acentos; `domingo` entró en el contrato **1.1.0** (§8) |
| `bloques[].desde/hasta` | hora | `desde < hasta`, entre `07:00` y `23:00`, y a lo sumo **8 h** de duración (C3: `bloque-demasiado-largo`, error) |
| `bloques[].sede` | string o `null` | id de `vocabulario.json`; `null` = el SGA no publica sede para el bloque (virtual, laboratorio, o presencial sin aula asignada: 74.61, 32.57 com. N, 17.06 com. C) |
| `bloques[].modalidad` | enum `presencial`, `virtual_sincronica`, `virtual_asincronica`, `virtual`, `laboratorio`, `blended` | el scraper mapea `Presencial` y `Presencial - SDR` → `presencial`; `Laboratorio` → `laboratorio` (práctica sin aula ITBA, 93.41); `Virtual Sinc.` → `virtual_sincronica`; `Virtual Asinc.` (también «Virtual asincrónica») → `virtual_asincronica`; `Virtual` a secas → `virtual`; `Blended` → `blended`. Otro valor = error ruidoso. `virtual` es «virtual sin decir si es sincrónica», tal como lo publica el SGA (**1.1.0**, §8) |
| `bloques[].aulas` | array de strings de 1 a 40 caracteres sin espacios en los bordes (`^\S(?:.{0,38}\S)?$`) | requerido, puede ser `[]` (virtual o sin asignar); dos aulas simultáneas es válido; **nunca enum**: el ITBA nombra las aulas como quiere |

Nota sobre `sabado` y `domingo`: el plan original proponía «sábado» como caso negativo; se
cambió porque un día real que el schema rechaza es un falso positivo crónico (amenaza A10). El
caso negativo pasó entonces a ser `domingo`… y la corrida real del scraper del **2026-09-12**
mostró que el domingo también existe: **61.27 Análisis de Coyuntura Económica** dicta en sus
cuatro comisiones un bloque `Domingo 13:00 - 14:00` (com. A) con modalidad «Virtual
asincrónica», sin aula ni sede, además del presencial de la semana en la Sede Distrito
Financiero. Por eso `domingo` entra en el enum en **1.1.0** (§8) y el caso negativo de día pasa
a ser un día mal escrito (`"sábado"` con acento; fixture `deben-fallar/dia-invalido.json`).
La grilla de la SPA dibuja lunes–viernes y lista los bloques de sábado y de domingo al pie de
la tarjeta.

## 2. `data/v1/planes/S10-Rev23.json`

```json
{
  "contrato": "1.0.0",
  "plan": "S10-Rev23",
  "carrera": "Ingeniería en Informática",
  "titulos": [
    { "id": "analista", "nombre": "Analista en Tecnología Informática", "tipo": "intermedio",
      "creditos": 147, "requiere_ciclos": ["basico"] },
    { "id": "bachiller", "nombre": "Bachiller en Ingeniería", "tipo": "intermedio",
      "creditos": 192, "requiere_ciclos": ["basico"] },
    { "id": "ingeniero", "nombre": "Ingeniero/a en Informática", "tipo": "principal",
      "creditos": 243, "requiere_ciclos": ["basico", "profesional"], "requiere_electivas": 27 }
  ],
  "electivas": { "creditos_requeridos": 27 },
  "minors": [
    { "sigla": "CD",  "nombre": "Ciencia de Datos", "creditos_minimos": 14 },
    { "sigla": "IA",  "nombre": "Inteligencia Artificial", "creditos_minimos": 14 },
    { "sigla": "IRV", "nombre": "Imágenes y Realidad Virtual", "creditos_minimos": 14 },
    { "sigla": "ARQ", "nombre": "Arquitectura de Software", "creditos_minimos": 14 }
  ],
  "materias": [{
    "codigo": "72.45", "nombre": "Proyecto Final", "creditos": 12,
    "ciclo": "profesional", "cuatrimestre_sugerido": 9,
    "creditos_requeridos": 160, "correlativas": [],
    "minors": [], "vigente": true
  }]
}
```

| Campo | Reglas |
|---|---|
| `titulos[].requiere_ciclos` | opcional; el título exige **todos los ítems** de esos ciclos aprobados, además de `creditos` |
| `titulos[].requiere_electivas` | opcional; créditos de electivas aprobadas |
| `materias[].ciclo` | enum `basico`, `profesional`, `electiva` |
| `materias[].cuatrimestre_sugerido` | entero 1–10 para obligatorias (`(año-1)*2 + cuatrimestre`); `null` para electivas |
| `materias[].creditos_requeridos` | entero ≥ 0; créditos aprobados necesarios para cursarla |
| `materias[].correlativas` | array de códigos; **todas deben existir en `materias`** y el grafo debe ser acíclico (C3) |
| `materias[].minors` | array de siglas de `minors[]`; vacío para obligatorias (C3: `minor-en-obligatoria`) |
| `materias[].vigente` | booleano: `true` para las 129 del Excel (44 obligatorias + 85 electivas), `false` para las 34 que solo están en el SGA |
| `materias[].nombre` | el del listado del SGA; si el Excel difiere, se anota en `notes` del worker, no se inventa |

Los ítems de 0 créditos (94.51 Inglés I, 94.52 Inglés II, 72.98 Práctica Laboral) son materias
normales con `creditos: 0`: cuentan como ítems de los títulos.

`Bachiller en Ingeniería`: el SGA solo publica los 192 créditos; `requiere_ciclos: ["basico"]`
es un supuesto razonable y queda documentado como tal en `docs/contrato.md`.

## 3. `data/v1/abreviaciones.json`

```json
{ "contrato": "1.0.0", "abreviaciones": { "72.42": "POD", "72.44": "Cripto" } }
```

Claves: código; valores: string de 1 a 24 caracteres, **únicos** (error duro). Se genera desde
`entregables/03-abreviaciones-materias.csv`: gana `correccion` si no está vacía, si no
`abreviacion_propuesta`.

## 4. `data/v1/vocabulario.json`

```json
{ "contrato": "1.0.0",
  "sedes": [ { "id": "rectorado", "nombre": "Rectorado" },
             { "id": "sdt", "nombre": "SDT" },
             { "id": "sdf", "nombre": "SDF" } ] }
```

`id`: minúsculas `^[a-z0-9_]+$`, es lo que va en `bloques[].sede`. `nombre`: el texto tal como
lo muestra el SGA; **no expandir siglas que no aparezcan expandidas en el material**.

**El ejemplo de tres sedes quedó superado por N0-9**: el vocabulario publicado lleva solo las
sedes observadas en el material (`rectorado`, `sdt`); `sdf` entra cuando aparezca en una
captura. Vale para `data/v1/vocabulario.json` y para el corpus de ejemplo de la app: un
vocabulario más permisivo que el publicado deja pasar en los tests una sede que el validador
rechaza sobre `data/`.

## 5. `data/index.json`

```json
{
  "contrato": "1.0.0",
  "actualizado": "2026-09-20",
  "planes": [ { "plan": "S10-Rev23", "archivo": "v1/planes/S10-Rev23.json", "hash": "sha256:…" } ],
  "abreviaciones": { "archivo": "v1/abreviaciones.json", "hash": "sha256:…" },
  "vocabulario":   { "archivo": "v1/vocabulario.json",   "hash": "sha256:…" },
  "horarios": [ { "periodo": "2026-2C", "archivo": "v1/horarios/2026-2C.json",
                  "publicado": "2026-09-20", "desde": "2026-07-26", "hasta": "2026-12-31",
                  "hash": "sha256:…" } ],
  "horarios_esperados": { "2027-1C": "2026-11" }
}
```

- Período **activo** = el que cumple `desde ≤ hoy ≤ hasta`; los de `desde > hoy` son vista
  previa; si no hay ninguno activo, la SPA muestra el próximo como vista previa.
- `hash` = `sha256:` + hex del contenido canónico del archivo; lo genera `cuatris index
  actualizar` y lo comprueba `cuatris validar` (C1). La SPA lo usa como `?v=` para la caché.
- `horarios_esperados`: `periodo → "YYYY-MM"`, curado a mano, opcional.

## 6. Estado del usuario en la SPA (`plan_usuario`, localStorage) — no es parte del contrato de datos

```ts
type PlanUsuario = {
  version: 1;
  plan: "S10-Rev23";
  historia: Record<Codigo, { estado: "aprobada" | "regular" | "cursando" }>;
  periodos: Record<PeriodoId, Array<{ codigo: Codigo; comision?: string }>>;
  colores: Record<Codigo, number>;        // índice 0–9 en la paleta, por orden de agregado
  sugerencias: Array<{ issue: number; fecha: string }>;
  preferencias: { visibles: 1 | 2 | 3 };
};
```

Clave de localStorage: `cuatris.plan_usuario`. Cambios de forma → `version: 2` con migración
explícita; nunca se descarta un plan guardado sin exportarlo antes.

## 7. Lo que queda para la Ola 2 y siguientes

- C3 completo (`tools/cuatris/validar/invariantes.py`): correlativas acíclicas y existentes;
  códigos de horarios: en el Sprint 1 un código que no está en el plan es **warning** (los
  horarios traen todas las carreras); pasa a error cuando exista `no-plan.json` (Sprint 2).
  Lo mismo con `dictado-conjunto-inexistente`: un código de `dictado_conjunto` que no es un
  curso del archivo es warning en el Sprint 1 y error cuando exista `no-plan.json`.
- `catalogo/<codigo>.json` (Sprint 2), `no-plan.json` (Sprint 2), evidencia (Sprint 3).

## 8. Versiones del contrato

El major lo custodia el directorio (`v1`); el campo `contrato` de cada archivo declara la
versión exacta. Agregar un valor a un enum es **minor**: ningún archivo ya publicado deja de
ser válido, pero todo lector tiene que aprender el valor nuevo (los mapas `Record<Dia, …>` y
`Record<Modalidad, …>` de la SPA dejan de compilar hasta que lo hagan).

| Versión | Fecha | Qué agregó | Por qué es *minor* |
|---|---|---|---|
| 1.0.0 | 2026-09-09 | Los cinco tipos de `data/v1/`. | — |
| 1.1.0 | 2026-09-12 | `dia` suma `domingo`; `modalidad` suma `virtual` y `laboratorio`; `comisiones[].desde/hasta` opcionales; `sede: null` con cualquier modalidad; `comisiones[].id` libre. | Extender un enum no invalida nada de lo publicado: un documento `1.0.0` es válido bajo `1.1.0`. Los lectores viejos no rompen, pero tienen que aprender los dos valores nuevos. |

Decisión **N0-28**. Los dos valores salieron de la corrida real del 2026-09-12, no de una
previsión:

- **61.27**, las cuatro comisiones, bloque virtual asincrónico en domingo (ver la nota de §1).
- **25.20 Análisis de Señales y Sistemas Digitales**, comisión K: `Miércoles 15:00 - 18:00` con
  modalidad **«Virtual»** a secas. El SGA no dice si es sincrónica y no se supone: el valor se
  guarda como lo publica la fuente.

El caso está congelado en `tests/fixtures/deben-pasar/horarios-domingo-virtual.json`, con los
datos tal como los publica el SGA. En la SPA, `virtual` se trata **como
`virtual_sincronica`** —tiene hora fija, cuenta para los choques y se dibuja en la grilla—;
`virtual_asincronica` sigue como estaba.

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
