# Contrato de datos v1 — decisiones cerradas (N0) para el Sprint 1

Este documento fija las **formas exactas** que los workers implementan. Lo que no está aquí se
decide en `02-plan-backend.md` (Fase 1); si ambos difieren, manda este archivo y se anota la
diferencia en `EXEC_STATE.md`.

## Convenciones globales

- Todo archivo de datos lleva `"contrato": "1.0.0"` (SemVer, string). El corte de
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
| `comisiones[].id` | string `^[A-Z0-9]{1,4}$` | opaco; único por curso (C3); sin chequeo de orden |
| `comisiones[].cupo` | objeto `{capacidad: int ≥ 0}`, **opcional** | estable |
| `comisiones[].ocupacion` | objeto `{inscriptos: int ≥ 0, al: fecha}`, **opcional** | volátil; `inscriptos > capacidad` es warning |
| `comisiones[].docentes` | array de strings | requerido, puede ser `[]`; colisión de docente = warning |
| `bloques[].dia` | enum `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado` | sin acentos; `domingo` no existe |
| `bloques[].desde/hasta` | hora | `desde < hasta`, entre `07:00` y `23:00`, y a lo sumo **8 h** de duración (C3: `bloque-demasiado-largo`, error) |
| `bloques[].sede` | string o `null` | id de `vocabulario.json`; `null` solo si la modalidad no es presencial |
| `bloques[].modalidad` | enum `presencial`, `virtual_sincronica`, `virtual_asincronica`, `blended` | el scraper mapea `Presencial`, `Virtual Sinc.`, `Virtual Asinc.`, `Blended`; otro valor = error ruidoso |
| `bloques[].aulas` | array de strings `^[0-9A-Za-z][0-9A-Za-z .\-]{0,15}$` | requerido, puede ser `[]` (virtual o sin asignar); dos aulas simultáneas es válido |

Nota sobre `sabado`: el plan original proponía «sábado» como caso negativo; se cambia porque
un día real que el schema rechaza es un falso positivo crónico (amenaza A10). El caso negativo
de día pasa a ser `domingo`. La grilla de la SPA dibuja lunes–viernes y lista los bloques de
sábado al pie de la tarjeta.

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
