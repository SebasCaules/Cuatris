# Horarios del SGA (contrato 1.1.0)

Un archivo por período, `<AAAA>-<1|2>C.json`, tal como lo emite el scraper de `tools/`
(`cuatris sga bajar`): todos los cursos de grado del catálogo del SGA, sin filtrar por
carrera, con comisiones, bloques (día, hora, aulas, sede, modalidad), docentes, cupo e
inscriptos. El esquema de referencia es `deprecated/schemas/v1/horarios.schema.json` y su
documentación `deprecated/docs/contrato.md`; lo que el gate exige está en
`scripts/datos/horarios.mjs`.

`scripts/build-planner-data.mjs` toma el período más nuevo, lo convierte al formato del
planner (`Horario` / `Comision` / `Slot` de `lib/planner/types.ts`) y lo recorta a las
materias de cada carrera al generar `lib/planner/carreras/<CODIGO>.json`.

**Cualquiera puede agregar el cuatrimestre siguiente o corregir uno por PR**: la receta está
en `CONTRIBUTING.md`. Un archivo nuevo tiene que ser el período siguiente al más nuevo de
esta carpeta.

| Archivo | Cursos | Capturado |
|---|---|---|
| `2026-2C.json` | 461 | 2026-09-13 |

Un cuatrimestre nuevo lo puede cargar cualquiera con el scraper de `tools/`: ver `CONTRIBUTING.md`.
