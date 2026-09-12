# W1.3 — Parsers del SGA (offline, contra HTML guardado)

## Ownership (solo estos archivos)

- `tools/cuatris/sga/__init__.py`, `tools/cuatris/sga/parsers.py`, `tools/cuatris/sga/normalizar.py`
- `tests/tools/test_sga_parsers.py`
- `tests/corpus/sga/*.html` (copias **anonimizadas** de `material-raw/02-sga/html/`:
  reemplaza `CAULES, SEBASTIAN` por `APELLIDO, NOMBRE` y verifica con `grep` que no queda
  ninguna aparición; copia solo los `.html`, no las carpetas `_files`)
- `docs/scraping-sga.md` (solo la parte «Qué extrae cada parser y en qué se ancla»; el
  instructivo completo lo escribe otro worker en la Ola 2 — deja el encabezado y esa sección)

No toques `cli.py`. No hagas ninguna petición de red: todo es offline.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` §1 (horarios) y §4 (vocabulario).
- `material-raw/02-sga/HALLAZGOS.md` **entero**: describe la plataforma (Wicket), la ruta a
  los horarios, el marcado de la pestaña Comisiones y los casos raros verificados.
- `entregables/02-plan-backend.md`: «Fase 3 — Scraper del SGA e instructivo» (solo esa sección).
- Los HTML: `oferta-materias.html` y `oferta-filtrada-nombreycuatri.html` (listado de cursos,
  paginado de a 20), `horarios-materia-multiples-comisiones.html` (Álgebra Lineal, 9
  comisiones), `horarios-materia-detalle*.html` (detalle de un curso: pestañas Comisiones,
  info y contenidos mínimos), `materias-carrera-info.html` (listado del plan; no lo parsees
  tú, es de W1.2).

## Entregables

1. **`parsers.parsear_listado(html) -> Listado`**: filas del listado de cursos con
   `codigo`, `nombre`, `departamento` (si está), `periodo`, y lo que el scraper en vivo
   necesita para navegar: el `href`/id del enlace al detalle de cada fila y los datos de
   paginación (página actual, total de páginas o de filas, y el id/URL del control «siguiente»
   tal como aparecen en el HTML). Devuelve dataclasses, no dicts sueltos.
2. **`parsers.parsear_comisiones(html) -> list[Comision]`** sobre la pestaña Comisiones:
   `id`, `cupo`, `ocupacion` (si el HTML lo muestra; anota qué fecha usar como `al` — si no
   hay fecha en el HTML, el campo queda `None` y el scraper pone la fecha de captura),
   `docentes`, `bloques` con `dia`, `desde`, `hasta`, `sede`, `modalidad`, `aulas` (lista:
   **dos aulas simultáneas producen dos elementos**, no un string).
3. **`parsers.parsear_curso(html_detalle) -> Curso`**: `codigo`, `nombre`, `departamento`,
   `desde`, `hasta` (fechas del dictado si figuran; si no, `None`), y llama a
   `parsear_comisiones` sobre la pestaña.
4. **`normalizar.py`**: mapeos `dia` (`Lunes`→`lunes`, …, sin acentos), `modalidad`
   (`Presencial`→`presencial`, `Virtual Sinc.`→`virtual_sincronica`, `Virtual
   Asinc.`→`virtual_asincronica`, `Blended`→`blended`), `sede` (`Rectorado`→`rectorado`,
   `SDT`→`sdt`, `SDF`→`sdf`), horas (`14:00` o `14` → `14:00`), fechas `dd/mm/yyyy` →
   `YYYY-MM-DD`. **Un valor no reconocido lanza `ValorDesconocido` con el texto original.**
5. **`parsers.a_contrato(cursos, periodo, capturado) -> dict`**: arma el JSON de horarios de
   CONTRATO-v1.md §1 (sin escribirlo; sin validarlo contra el schema, eso es de W1.1). Las
   claves de cada objeto exactamente como en el contrato; `sede: None` solo cuando la
   modalidad no es presencial; `dictado_conjunto: []`.
6. **Extractores Wicket** que el scraper en vivo va a necesitar: `extraer_formulario_login(html)
   -> (action, campos_ocultos)` (a partir del HTML de login que describe HALLAZGOS.md) y
   `extraer_ids_filtro(html)` (los ids `results:topToolbars:…` que rotan). Cada uno se ancla
   en atributos estables (nombre de campo, texto visible), **nunca en un id numérico fijo**;
   documenta el ancla en `docs/scraping-sga.md`.
7. **Tests** con el corpus: Álgebra Lineal → **9 comisiones y 31 bloques**, comisión B con
   `["003T", "004T"]` el miércoles, K con `["202R", "203R"]`, letras `A–H` y `K`; listado →
   cantidad de filas de la página y datos de paginación; `normalizar` → cada mapeo y el error
   ante un valor desconocido; `a_contrato` → las claves y tipos del contrato (compara contra
   un dict esperado, no contra el schema).

## Criterios de aceptación

- `.venv/bin/python -m pytest tests/tools/test_sga_parsers.py -q` verde; `ruff` limpio.
- `grep -R "CAULES" tests/corpus/sga` vacío.
- Los conteos 9/31 salen del HTML, no de un número escrito a mano: si el HTML dice otra
  cosa, reporta la discrepancia con HALLAZGOS.md en `notes` y devuelve `ok: false`.
