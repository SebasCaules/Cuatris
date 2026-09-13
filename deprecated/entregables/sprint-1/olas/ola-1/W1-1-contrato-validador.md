# W1.1 — Contrato v1: schemas, `cuatris fmt`, `cuatris validar` (C1 + C2)

## Ownership (solo estos archivos)

- `schemas/v1/*.schema.json` (horarios, planes, abreviaciones, vocabulario, index)
- `tools/cuatris/__init__.py`, `tools/cuatris/cli.py`, `tools/cuatris/canon.py`,
  `tools/cuatris/validar/__init__.py`, `tools/cuatris/validar/triage.py`,
  `tools/cuatris/validar/esquema.py`, `tools/cuatris/validar/reporte.py`
- `tests/tools/test_canon.py`, `tests/tools/test_triage.py`, `tests/tools/test_esquema.py`
- `tests/fixtures/deben-pasar/**`, `tests/fixtures/deben-fallar/**`
- `docs/contrato.md`

`tools/pyproject.toml` ya existe (lo mantiene el orquestador): el paquete es `cuatris`, el
ejecutable `cuatris = "cuatris.cli:main"`. Regístrate en `cli.py` con subcomandos `fmt` y
`validar`; deja un punto de extensión claro para que otros workers agreguen subcomandos
(`plan`, `abreviaciones`, `sga`) sin tocar tus archivos: un registro `SUBCOMANDOS` al que cada
módulo aporta `(nombre, funcion_que_configura_el_subparser)`, con importación perezosa.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` **entero** (es tu especificación).
- `entregables/02-plan-backend.md`: secciones «Fase 1 — Contrato de datos» y, de la Fase 4,
  «C1 — Triage» y «C2 — JSON Schema» (busca los encabezados; no leas el resto).
- `material-raw/02-sga/HALLAZGOS.md`: la tabla de casos raros (para las fixtures).

## Entregables

1. **Schemas draft-07** para los cinco archivos del contrato, con `$id`, `title`,
   `description` en cada campo (una línea, en español neutro), `additionalProperties: false`,
   patrones y enums exactamente como dice CONTRATO-v1.md.
2. **`tools/cuatris/canon.py`**: `cargar(ruta) -> obj` (rechaza claves duplicadas con
   `object_pairs_hook`, rechaza BOM y CRLF con mensaje claro), `serializar(obj) -> str` (forma
   canónica), `esta_canonico(ruta) -> bool`, `hash_canonico(ruta) -> "sha256:…"`.
3. **`cuatris fmt <archivos…>`** reescribe en forma canónica; `--check` no escribe, sale con
   código 1 si algún archivo no está canónico y muestra un diff unificado corto.
4. **`cuatris validar <archivos…>`** corre C1 y C2 sobre cada archivo y muestra un reporte
   legible (una línea por hallazgo: `ERROR|WARNING archivo: mensaje`). Código de salida: 0 sin
   errores, 1 con errores, 2 si no pudo abrir un archivo. El tipo de archivo se deduce del
   path (`v1/horarios/`, `v1/planes/`, `v1/abreviaciones.json`, `v1/vocabulario.json`,
   `index.json`); `--tipo` lo fuerza.
   - **C1 (triage)**: tamaño máximo 8 MiB; profundidad máxima de anidamiento 12; claves
     duplicadas; caracteres de control (salvo `\n` en ningún string: los strings no llevan
     saltos de línea); overrides bidireccionales y caracteres de formato invisibles
     (U+200B–U+200F, U+202A–U+202E, U+2066–U+2069); claves `__proto__`, `constructor`,
     `prototype` en cualquier nivel; forma canónica byte a byte; si es `index.json`, cada
     `hash` coincide con el archivo referido (ruta relativa a `data/`).
   - **C2 (schema)** con `fastjsonschema`. El error de propiedad desconocida tiene mensaje
     propio: `campo desconocido «X» en <ruta> — si el dato es real, hay que actualizar el
     schema en un PR aparte`.
   - Un dato con **regex de correo, teléfono o legajo** (`\b\d{5,6}\b` precedido de «legajo»)
     en cualquier string = ERROR (privacidad).
5. **Fixtures**. `tests/fixtures/deben-pasar/horarios-casos-raros.json`: un archivo de
   horarios **con los siete casos raros reales** de HALLAZGOS.md, usando los valores reales
   que allí figuran (93.18 con la comisión B en 003T y 004T el miércoles, K en 202R y 203R,
   letras A–H y K, 72.44 con comisión «S», comisión que cambia de sede, 30.28 con
   modalidades mixtas, 15.09 con período corto, 23.05 y 25.66 homónimas, cupo 48/48). Si
   HALLAZGOS.md no da un valor concreto para algún caso, usa el mínimo necesario y anótalo en
   `notes`; no adornes. Más un fixture mínimo válido por cada uno de los otros cuatro tipos.
   `tests/fixtures/deben-fallar/`: un archivo por regla, con el nombre de la regla
   (`dia-domingo.json`, `hora-fuera-de-rango.json` → esta la rechaza C3 en la Ola 2, así que
   aquí solo `hora-mal-formada.json`, `codigo-sin-punto.json`, `campo-desconocido.json`,
   `clave-duplicada.json`, `fecha-con-hora.json`, `aulas-string.json`, `bidi-override.json`,
   `no-canonico.json`, `correo-en-docente.json`, `hash-incorrecto/` con un index y su archivo).
6. **Tests**: cada fixture de `deben-pasar` valida sin errores; cada uno de `deben-fallar`
   produce exactamente el error esperado; `fmt` es idempotente; `hash_canonico` es estable.
7. **`docs/contrato.md`** (≤ 120 líneas): un apartado por archivo con la tabla de campos y
   **la tabla de los siete casos reales con el ejemplo concreto de cada uno**, más el
   apartado «Cómo agregar un campo» (PR aparte, bump minor) y «Cómo cambiar la forma» (major
   = directorio `v2`).

## Criterios de aceptación

- `.venv/bin/python -m pytest tests/tools -q` verde; `.venv/bin/ruff check tools tests` limpio.
- `.venv/bin/cuatris validar tests/fixtures/deben-pasar/*.json` → salida 0.
- `.venv/bin/cuatris fmt --check tests/fixtures/deben-pasar/*.json` → salida 0.
- El fixture de casos raros valida **sin warnings de schema**: si tu schema rechaza uno de los
  siete casos, el schema está mal, no el caso.
