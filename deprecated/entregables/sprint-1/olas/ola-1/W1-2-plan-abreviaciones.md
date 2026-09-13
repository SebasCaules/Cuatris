# W1.2 — `cuatris plan importar` y `cuatris abreviaciones importar|exportar`

## Ownership (solo estos archivos)

- `tools/cuatris/plan.py`, `tools/cuatris/abreviaciones.py`
- `data/v1/planes/S10-Rev23.json`, `data/v1/abreviaciones.json`, `data/v1/vocabulario.json`
- `tests/tools/test_plan.py`, `tests/tools/test_abreviaciones.py`
- `tests/corpus/plan/Plan S10-Rev23.xlsx`, `tests/corpus/plan/materias-carrera-info.html`
  (copia **anonimizada**: reemplaza `CAULES, SEBASTIAN` por `APELLIDO, NOMBRE`; verifica con
  `grep` que no queda ninguna aparición),
  `tests/corpus/plan/oferta-carrera-info-titulos.html` (ídem)
- `docs/plan-de-estudios.md`

No toques `cli.py` (es de W1.1): expón en tu módulo una función
`configurar_subcomando(subparsers)` para `plan` y otra para `abreviaciones`; el orquestador
las registra. Escribe los JSON con la forma canónica de CONTRATO-v1.md (`sort_keys`, indent 2,
`ensure_ascii=False`, `\n` final) usando tu propia función local, sin depender de `canon.py`.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` §2, §3 y §4 (planes, abreviaciones,
  vocabulario).
- `entregables/02-plan-backend.md`: «Abreviaciones de materias», «Campos que pide el diseño»
  y «Reconciliación de las dos fuentes del plan — resuelto».
- Fuentes: `material-raw/03-plan-de-estudios/Plan S10-Rev23.xlsx` (hojas `Obligatorias` y
  `Electivas`), `material-raw/02-sga/html/materias-carrera-info.html` (listado de 163
  materias del SGA con código, nombre y créditos), `material-raw/02-sga/html/oferta-carrera-info-titulos.html`
  (títulos y créditos), `entregables/03-abreviaciones-materias.csv` (UTF-8 con BOM;
  columnas `codigo,nombre,abreviacion_propuesta,correccion,nota`).

## Qué hay en el Excel (verificado)

- `Obligatorias`: bloques `Ciclo Básico ( Título otorgado: Analista … ) Requisito: … 147
  créditos`, luego `Año N - Cuatrimestre M`, luego filas `['31.08 - Sistemas de
  Representación', 3, 0, '93.58 \xa072.03 \xa0']` = (materia, créditos, créditos requeridos,
  correlativas separadas por espacios y U+00A0). Después `Ciclo Profesional (Título Otorgado:
  Ingeniero en Informática) … 96 créditos`. Al pie: «Materias Electivas - Requisito:
  Completar 27 créditos» y la nota de los minors con mínimo de 14 créditos.
- `Electivas`: encabezado `Materia, Créditos, Créditos requeridos, Correlativas, Ciencia de
  Datos, Imágenes y Realidad Virtual, Inteligencia Artificial, Arqitectura de Software` (sic,
  con el error de tipeo) y una `X` en la columna del minor al que suma. Corrige el nombre del
  minor al cargar y documenta la corrección.

## Entregables

1. **`cuatris plan importar --excel <xlsx> --sga <html> --titulos <html> --salida data/v1/planes/S10-Rev23.json`**
   que produce el JSON de CONTRATO-v1.md §2:
   - 163 materias (las del listado del SGA), `vigente: true` para las 129 del Excel.
   - `ciclo`: `basico` (ciclo básico del Excel), `profesional`, `electiva` (hoja Electivas y
     las 34 que solo están en el SGA).
   - `cuatrimestre_sugerido` = `(año-1)*2 + cuatrimestre`; `null` para electivas.
   - `creditos_requeridos`, `correlativas` (validar que cada código exista en las 163; si no,
     error ruidoso con el código), `minors` (siglas `CD`, `IRV`, `IA`, `ARQ` según la columna),
     `creditos` (del SGA; si difiere del Excel, error ruidoso: no se elige en silencio).
   - `nombre`: el del SGA. Diferencias con el Excel → lista en `notes` del retorno y en
     `docs/plan-de-estudios.md`.
   - `titulos`, `electivas`, `minors` como en CONTRATO-v1.md §2; los créditos de los títulos
     se leen del HTML de títulos (147/192/243), no se escriben a mano.
   - Falla ruidosamente si el Excel cambia de forma (encabezados distintos, bloque sin título).
2. **`cuatris abreviaciones importar <csv> --salida data/v1/abreviaciones.json`** y
   **`cuatris abreviaciones exportar --plan <json> --abreviaciones <json> > csv`** (mismas
   columnas del CSV; `correccion` vacía; `nota` vacía). Reglas: gana `correccion` si no está
   vacía; unicidad de valores = error con los códigos en conflicto; todo código del CSV debe
   existir en el plan y toda materia del plan debe tener abreviación (error si falta).
   Exportar e importar sin cambios deja el JSON idéntico (test).
3. **`data/v1/vocabulario.json`** con las sedes que aparezcan en
   `material-raw/02-sga/html/*.html` (busca los tokens de sede en las tablas de comisiones:
   se esperan `Rectorado`, `SDT`, `SDF`; usa exactamente lo que encuentres, ids en minúsculas).
4. **Tests** con el corpus: conteos (163 / 129 / 44 obligatorias / 85 electivas vigentes),
   72.45 con `creditos_requeridos: 160` y `cuatrimestre_sugerido: 9`, 72.31 con correlativas
   `["93.58","72.03"]`, 16.50 con minor `CD` y correlativa `72.37`, minors de 14, títulos
   147/192/243, grafo de correlativas sin ciclos (test propio, aunque C3 lo repita en la Ola 2),
   ida y vuelta del CSV.
5. **`docs/plan-de-estudios.md`** (≤ 80 líneas): de dónde sale cada campo, la regla de
   `vigente`, las diferencias de nombre encontradas, el error de tipeo del minor, y cómo
   regenerar el archivo cuando el ITBA publique un plan nuevo.

## Criterios de aceptación

- Los tres JSON producidos están en forma canónica y se regeneran de forma idéntica al
  correr el comando dos veces.
- Tests verdes con `.venv/bin/python -m pytest tests/tools/test_plan.py tests/tools/test_abreviaciones.py -q`;
  `ruff` limpio.
- `grep -R "CAULES" tests/corpus/plan` no devuelve nada.
