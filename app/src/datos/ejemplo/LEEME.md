# Datos de ejemplo — fixtures de prueba, no son datos publicables

Estos archivos existen **solo para los tests** de `app/src/datos/` y del cascarón. Nunca se
copian a `data/` del repositorio ni se publican.

Todo valor literal sale de `entregables/sprint-1/CONTRATO-v1.md`; no hay datos inventados:

| Archivo | De dónde sale |
|---|---|
| `v1/horarios/2026-2C.json` | El curso `93.18` es el ejemplo completo de §1, textual (período, fuente, comisión `A`, cupo, ocupación, docentes y bloque). |
| | El segundo curso es `72.45 Proyecto Final` (código y nombre de §2). Su comisión `B` se arma **combinando literales de §1**: `dia` del enum, `14:00`–`16:00`, `sede: "rectorado"`, `modalidad: "presencial"`, `aulas: []`. Esa combinación es sintética: sirve para tener dos cursos y dos comisiones, y por eso `fuente.sistema` es `"manual"`, no `"sga"`. |
| `v1/planes/S10-Rev23.json` | Títulos, electivas, minors y la materia `72.45` son el ejemplo de §2, textual. Solo hay una materia: el contrato no publica las filas completas de ninguna otra, y se decidió no completarlas a ojo. |
| `v1/abreviaciones.json` | Ejemplo de §3, textual. |
| `v1/vocabulario.json` | Ejemplo de §4, textual. |
| `index.json` | Forma de §5, con los `hash` recalculados sobre el contenido canónico real de los archivos de arriba. |

Que `93.18` aparezca en los horarios y no en el plan es intencional y válido: los horarios
del SGA traen todas las carreras, y en el Sprint 1 un código fuera del plan es un *warning*
(CONTRATO-v1 §7), no un error.

Todos los archivos están en forma canónica (`sort_keys`, `indent=2`, UTF-8, `LF`, salto final).
