# Horarios del SGA (contrato 1.1.0)

Un archivo por período, tal como lo emite el scraper del proyecto anterior
(`deprecated/tools/cuatris/sga`, comando `cuatris sga bajar`): todos los cursos de grado
del catálogo del SGA, sin filtrar por carrera, con comisiones, bloques (día, hora, aulas,
sede, modalidad), docentes, cupo e inscriptos. El esquema está en
`deprecated/schemas/v1/horarios.schema.json` y su documentación en `deprecated/docs/contrato.md`.

`scripts/build-planner-data.mjs` toma el período más nuevo, lo convierte al formato del
planner (`Horario` / `Comision` / `Slot` de `lib/planner/types.ts`) y lo recorta a las
materias de cada carrera al generar `lib/planner/carreras/<CODIGO>.json`.

| Archivo | Cursos | Capturado |
|---|---|---|
| `2026-2C.json` | 461 | 2026-09-13 |
