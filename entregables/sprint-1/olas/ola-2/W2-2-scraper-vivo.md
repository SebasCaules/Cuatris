# W2.2 — Scraper del SGA en vivo e instructivo

## Ownership

- `tools/cuatris/sga/cliente.py`, `tools/cuatris/sga/bajar.py`, `tools/cuatris/sga/checkpoint.py`
- `tests/tools/test_sga_cliente.py`, `tests/tools/test_sga_bajar.py`
- `docs/scraping-sga.md` (completa el archivo que dejó W1.3; conserva su sección de parsers)
- `tools/cuatris/sga/__init__.py`: agrega `AYUDA`, `configurar(parser)` y `ejecutar(args)` (la
  convención real de `cli.py`) con la acción `bajar`; conserva las exportaciones de W1.3. El
  orquestador registra `sga` en `MODULOS_EXTERNOS` de `cli.py`.

**Prohibido**: pedir, guardar, imprimir o loguear credenciales; hacer peticiones al SGA real
desde tests; hardcodear ids de componente Wicket.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` §1 y §5.
- `material-raw/02-sga/HALLAZGOS.md` entero (plataforma, entrada estable, login, cookies,
  paginación, ruta a Comisiones).
- `entregables/02-plan-backend.md`: «Fase 3 — Scraper del SGA e instructivo» entera.
- `tools/cuatris/sga/parsers.py` y `normalizar.py` de la Ola 1: son tu única forma de leer HTML.

## Entregables

1. **`cliente.py`** sobre `httpx.Client` con `base_url="https://sga.itba.edu.ar"`, cookies
   persistentes (`JSESSIONID`, `AWSALB`, `AWSALBCORS`), `User-Agent`
   `Cuatris/0.1 (+https://github.com/SebasCaules/Cuatris)`, timeout 30 s, rate limit
   configurable (por defecto 1 petición/s), reintentos con espera creciente ante 5xx o
   timeout (máx. 3). `iniciar_sesion(usuario, clave)`: GET `/app2/`, extrae `action` y
   campos ocultos con `parsers.extraer_formulario_login`, POST, y comprueba que la sesión
   quedó autenticada por un ancla estable del HTML (documenta cuál); ante fallo, error claro
   sin volcar la respuesta entera. `sesion_vencida(html)` detecta el vencimiento y dispara un
   re-login transparente una vez.
2. **`bajar.py`**: `cuatris sga bajar --anio 2026 --cuatrimestre 2C --salida data/v1/horarios/2026-2C.json
   [--limite N] [--desde-cero] [--ritmo 1.0]`. Flujo: login → listado filtrado por nivel /
   período / año (los ids se extraen del HTML en cada corrida con `extraer_ids_filtro`) →
   paginación de a 20 hasta el final → por cada curso, detalle y pestaña Comisiones →
   `parsers.a_contrato` → escribe en forma canónica y **corre el validador C1–C3** sobre el
   resultado antes de terminar (importa `cuatris.validar`; si hay errores, deja el archivo con
   sufijo `.invalido.json` y sale con código 1). Credenciales: variables `SGA_USUARIO` y
   `SGA_CLAVE`; si faltan, `getpass` interactivo. `--limite N` baja solo N cursos (para la
   primera prueba real).
3. **`checkpoint.py`**: estado por curso en `.cuatris-cache/<periodo>.jsonl` (agrégalo a
   `.gitignore` reportándolo en `notes`; el orquestador lo commitea): una línea por curso
   bajado con su JSON; al reanudar, salta los ya hechos; `--desde-cero` lo borra. Un corte de
   red o de sesión nunca obliga a empezar de nuevo.
4. **Tests** con `httpx.MockTransport` y el corpus `tests/corpus/sga/`: login (extrae action
   y campos, envía cookies), paginación (dos páginas simuladas), detalle → contrato,
   reanudación (checkpoint con un curso ya bajado → no se vuelve a pedir), re-login ante
   sesión vencida, rate limit (con reloj simulado), y que `SGA_CLAVE` nunca aparece en logs
   ni en excepciones (test que provoca un error de login y busca la clave en el texto).
5. **`docs/scraping-sga.md`** completo, para alguien que llega dentro de años: qué es el SGA
   y cómo se obtiene cuenta; por qué el scraper no corre en CI; el recorrido con los nombres
   de las pantallas (Académica → Cursos → lupa → Comisiones); la plataforma (Wicket, URLs
   cifradas, por qué solo `/app2/` es estable, por qué los ids rotan); **para cada dato, el
   ancla que usa el parser y cómo verificar que sigue valiendo**; diagnóstico cuando falle
   (`--guardar-html` vuelca la respuesta problemática en `.cuatris-cache/` para compararla
   con el corpus); cómo cargar el resultado (`cuatris fmt`, `cuatris validar`, `cuatris index
   actualizar`, PR). Español neutro; comandos copiables; sin credenciales de ejemplo reales.

## Criterios de aceptación

- Suite completa verde; `ruff` limpio.
- `.venv/bin/cuatris sga bajar --help` muestra todas las opciones en español.
- Un test demuestra que con el corpus de Álgebra Lineal el archivo producido pasa
  `cuatris validar` sin errores.
- En `notes`: qué partes del flujo en vivo **no** pudiste probar sin credenciales y qué debe
  mirar el autor en la primera corrida con `--limite 3`.
