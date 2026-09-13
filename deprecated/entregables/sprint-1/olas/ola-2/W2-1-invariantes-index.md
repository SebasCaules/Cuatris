# W2.1 — C3 invariantes y `cuatris indice actualizar`

## Ownership

- `tools/cuatris/validar/invariantes.py`, `tools/cuatris/indice.py`
- `tests/tools/test_invariantes.py`, `tests/tools/test_indice.py`
- `tests/fixtures/deben-fallar/c3-*.json`, `tests/fixtures/deben-pasar/c3-*.json`
- `data/index.json` **solo lo genera tu comando**; no lo edites a mano.
- `tools/cuatris/validar/__init__.py` (para enganchar C3 en `validar_archivo`, con un
  `contexto` opcional: plan y vocabulario) y, en `tools/cuatris/cli.py`, **solo** las funciones
  `_configurar_validar` / `_ejecutar_validar` (para agregar `--data <dir>` que carga ese
  contexto; por defecto `data/` si existe). El resto de `cli.py` es del orquestador.
- Convención de subcomandos (la real, de `cli.py`): el módulo `tools/cuatris/indice.py`
  expone `AYUDA`, `configurar(parser)` y `ejecutar(args) -> int`; el orquestador lo agrega a
  `MODULOS_EXTERNOS` de `cli.py` como `indice` (comando `cuatris indice actualizar`).

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` §1, §2, §4, §5 y §7.
- `entregables/02-plan-backend.md`: «C3 — Invariantes» (Fase 4) y la tabla de decisiones de
  forma de la Fase 1.
- El código que dejó la Ola 1: `tools/cuatris/validar/` (cómo se reportan hallazgos),
  `tools/cuatris/canon.py` (`hash_canonico`), las fixtures existentes.

## Entregables

1. **C3 para horarios**: `codigo` único; `(codigo, comision.id)` único; por bloque
   `desde < hasta`, ambos entre `07:00` y `23:00`, duración ≤ 8 h; `curso.desde/hasta` dentro
   del período; `sede` existe en `vocabulario.json` (se pasa por `contexto`; si no hay
   vocabulario, warning); `sede: null` solo si la modalidad no es presencial; **colisión de
   aula**: dos cursos distintos en la misma sede, aula, día y franja que se solapan, con
   períodos de curso que se solapan, excluyendo bloques no presenciales, `aulas: []`, y pares
   declarados en `dictado_conjunto` de cualquiera de los dos → ERROR; misma comisión en dos
   aulas simultáneas → válido; **colisión de docente** (mismo docente, mismo día, franjas
   solapadas, cursos distintos) → WARNING; `inscriptos > capacidad` → WARNING; código que no
   está en el plan (se pasa por `contexto`) → WARNING (pasa a error en Sprint 2, S-02).
2. **C3 para planes**: correlativas existentes; grafo acíclico (reporta el ciclo);
   `cuatrimestre_sugerido` nulo si y solo si `ciclo == "electiva"`; siglas de `minors[]`
   existentes; `creditos_requeridos ≤ creditos totales del plan`; unicidad de `codigo`;
   `titulos[].creditos` no decreciente entre intermedio y principal (warning si no).
3. **C3 para abreviaciones**: valores únicos (ERROR); todo código existe en el plan
   (ERROR); toda materia del plan tiene abreviación (WARNING).
4. **`cuatris indice actualizar --data data`**: recorre `data/v1/**`, calcula
   `hash_canonico` de cada archivo referido, actualiza `data/index.json` (crea entradas para
   archivos nuevos de `horarios/` leyendo `periodo` del propio archivo; conserva `publicado`,
   `horarios_esperados` y `actualizado` existentes; `--publicado YYYY-MM-DD` fija la fecha
   para las entradas nuevas). C1 ya comprueba los hashes: tu comando es el único que los
   escribe. Debe fallar ruidosamente si un archivo referido no existe.
5. **Fixtures**: `deben-fallar/c3-<regla>.json` por cada regla de error, `deben-pasar/c3-dictado-conjunto.json`
   (dos códigos comparten aula legítimamente), `c3-docente-repetido.json` (solo warning).
   Reutiliza los valores reales de las fixtures de la Ola 1; no inventes aulas nuevas.
6. **Tests**: cada regla con un caso que pasa y uno que falla; los siete casos raros de
   `horarios-casos-raros.json` **siguen pasando sin errores**; `indice actualizar` es idempotente.

## Criterios de aceptación

- `.venv/bin/python -m pytest tests/tools -q` verde (toda la suite, no solo la tuya); `ruff` limpio.
- `.venv/bin/cuatris validar data/v1/planes/S10-Rev23.json data/v1/abreviaciones.json` → 0.
- `.venv/bin/cuatris indice actualizar --data data && .venv/bin/cuatris validar data/index.json` → 0.
