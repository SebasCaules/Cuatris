# Datos de ejemplo — fixtures de prueba, no son datos publicables

Estos archivos existen **solo para los tests** de `app/src/datos/` y del cascarón. Nunca se
copian a `data/` del repositorio ni se publican.

Todo valor literal sale de `entregables/sprint-1/CONTRATO-v1.md` o de `data/`; no hay datos
inventados:

| Archivo | De dónde sale |
|---|---|
| `v1/horarios/2026-2C.json` | El curso `93.18` es el ejemplo completo de §1, textual (período, fuente, comisión `A`, cupo, ocupación, docentes y bloque). |
| | El segundo curso es `72.45 Proyecto Final` (código y nombre de §2). Su comisión `B` se arma **combinando literales de §1**: `dia` del enum, `14:00`–`16:00`, `sede: "rectorado"`, `modalidad: "presencial"`, `aulas: []`. Esa combinación es sintética: sirve para tener dos cursos y dos comisiones, y por eso `fuente.sistema` es `"manual"`, no `"sga"`. |
| `v1/planes/S10-Rev23.json` | Títulos, electivas, minors y la materia `72.45` son el ejemplo de §2, textual. Solo hay una materia: el contrato no publica las filas completas de ninguna otra, y se decidió no completarlas a ojo. |
| `v1/abreviaciones.json` | Forma de §3. La única clave es `72.45`, la única materia de este plan; su valor `"PF"` sale de `data/v1/abreviaciones.json`. El ejemplo textual de §3 (`72.42`, `72.44`) no se puede usar aquí: son códigos que este plan no tiene, y C3 los rechaza con `abreviacion-sin-materia`. |
| `v1/vocabulario.json` | Ejemplo de §4 **sin `sdf`**: N0-9 dejó el vocabulario en las dos sedes observadas en el material (`rectorado`, `sdt`), y `sdf` entra cuando aparezca en una captura. Un corpus más permisivo que `data/` convierte la regla C3 `sede-desconocida` en dos reglas distintas según quién la corra. |
| `index.json` | Forma de §5, con los `hash` recalculados sobre el contenido canónico real de los archivos de arriba. |

Que `93.18` aparezca en los horarios y no en el plan es intencional y válido: los horarios
del SGA traen todas las carreras, y en el Sprint 1 un código fuera del plan es un *warning*
(CONTRATO-v1 §7), no un error.

Todos los archivos están en forma canónica (`sort_keys`, `indent=2`, UTF-8, `LF`, salto final)
y pasan `cuatris validar --data app/src/datos/ejemplo …` sin errores: este corpus tiene forma
de documento del contrato, así que el contrato también lo manda. Si cambia alguno de estos
archivos hay que rehacer los hashes con
`cuatris indice actualizar --data app/src/datos/ejemplo`.

## Quién depende de estos valores

Cambiar un literal de este corpus rompe tests que viven **fuera** de esta carpeta. Antes de
tocar un archivo de aquí, corra `cd app && npm test -- --run` (no alcanza con `npm run
typecheck`, que no ejecuta vitest) y revise:

| Archivo | Qué afirma sobre este corpus |
|---|---|
| `app/src/datos/cargar.test.ts` | Afirma valores literales: los códigos de los cursos, los ids de comisión, la carrera y los minors del plan, las claves de `abreviaciones` y los ids de `sedes`. |
| `app/src/App.test.tsx` | Monta el cascarón contra `servidor.ts` y espera la pantalla que sale de estos datos. |
| `app/src/contrato/tipos.test.ts` | Solo `satisfies` de tipo: lo comprueba `npm run typecheck`. |
