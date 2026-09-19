# `tools/` — el scraper de horarios del SGA

`cuatris sga bajar` baja del SGA la oferta de un cuatrimestre entera (todas las carreras de
grado: cursos, comisiones, días, horas, aulas, sedes, modalidades, docentes y cupos) y la
escribe como `data/plan/horarios/<AAAA>-<n>C.json`, en el contrato 1.1.0 que valida el gate
de los PR (`scripts/datos/`). Es lo que hay que correr **una vez por cuatrimestre**, cuando
el SGA publica la oferta; el resto (validar, abrir el PR, mergear, publicar) lo hace el
repositorio solo (ver `CONTRIBUTING.md`, receta «Cargar un cuatrimestre nuevo»).

Viene del proyecto anterior (`deprecated/tools/cuatris/sga`, con su historia en
`deprecated/docs/scraping-sga.md`, que sigue siendo la referencia larga: anclajes de cada
parser, diagnóstico pantalla por pantalla). Acá está lo que hace falta para correrlo.

## Qué es el SGA y qué hace falta

El **SGA** (`https://sga.itba.edu.ar`) es el sistema académico del ITBA. Es la única fuente de
horarios: no hay API ni exportación, y los horarios solo aparecen dentro de cada curso
(pestaña «Comisiones»), así que un cuatrimestre son ~500 peticiones. La cuenta es la
institucional (estudiantes y docentes); el scraper la pide al arrancar y **no la guarda en
ningún lado**: ni en disco, ni en el log, ni en el repositorio.

Por eso el scraper **no corre en CI** (el repositorio no tiene secretos, y un chequeo que
dependa del SGA en vivo se convierte en un bloqueo el día que cambie una pantalla): lo corre
una persona en su máquina y lo que entra al repositorio es el JSON, por un PR.

## Instalar

Python 3.11 o más nuevo y Node (para el validador). Desde la raíz del repositorio:

```bash
python3 -m venv tools/.venv
tools/.venv/bin/pip install -e "tools[dev]"
```

Deja `tools/.venv/bin/cuatris`. Las dependencias son `httpx` y `beautifulsoup4` (más `pytest`
y `ruff` con `[dev]`).

## Correr

```bash
export SGA_USUARIO=tu.usuario      # la contraseña no se exporta: se escribe cuando la pide
```

Primera corrida, **siempre con `--limite 3` y la salida fuera de `data/`**: baja tres cursos
y escribe el archivo entero, para ver en un minuto si el login, los filtros, la paginación y
el parseo siguen funcionando. Con `--limite` las fechas del período salen solo de esos
cursos, así que el archivo sirve para probar, no para publicar.

```bash
tools/.venv/bin/cuatris sga bajar --anio 2027 --cuatrimestre 1C --limite 3 --salida /tmp/prueba.json
```

Barrido completo (unos diez minutos a una petición por segundo; la salida por defecto es
`data/plan/horarios/<periodo>.json`):

```bash
tools/.venv/bin/cuatris sga bajar --anio 2027 --cuatrimestre 1C
```

Al terminar corre el validador del repositorio (`node scripts/datos/validar.mjs`) sobre el
archivo: si hay errores, lo mueve a `.cuatris-cache/<periodo>.invalido.json` (fuera de
`data/`) y sale con 1. Si pasa, queda listo para el PR:

```bash
git checkout -b horarios-2027-1C
git add data/plan/horarios/2027-1C.json
git commit -m "Horarios 2027-1C"
git push -u origin horarios-2027-1C     # y abrir el PR en GitHub
```

| Opción | Para qué |
|---|---|
| `--anio`, `--cuatrimestre` | El período (`1C` o `2C`); juntos forman `periodo.id` y el nombre del archivo |
| `--salida` | Otro archivo de salida (por defecto `data/plan/horarios/<periodo>.json`) |
| `--limite N` | Solo los primeros N cursos (prueba) |
| `--desde-cero` | Borra el checkpoint del período y vuelve a bajar todo |
| `--ritmo` | Peticiones por segundo; por defecto **1.0**. No lo subas: es la infraestructura de la universidad |
| `--nivel` | Nivel del filtro del listado; por defecto `Grado` |
| `--guardar-html` | Ante un error, vuelca la respuesta problemática en `.cuatris-cache/` para compararla con `tools/tests/corpus/sga/` |
| `--verboso` | Muestra cada petición y cada redirección (el log las trae siempre) |
| `--cache` | Directorio del checkpoint, los volcados y los descartes; por defecto `./.cuatris-cache` |

## Cuando se corta o falla

- **Cada curso bajado se guarda en el acto** en `.cuatris-cache/<periodo>.jsonl`. Si se corta
  la red, vence la sesión o se cierra la terminal, se vuelve a correr **el mismo comando** y
  se saltea lo ya bajado.
- **Una corrida junta todos los errores.** Un curso que no se entiende (un valor nuevo del
  SGA, otra forma de cupo) no frena el barrido: se anota, se sigue con los demás y al final
  se informan todos juntos; lo armado queda en `.cuatris-cache/<periodo>.parcial.json`. Se
  corrige el parser (`tools/cuatris/sga/`) y se vuelve a correr: solo se repiten los fallidos.
- **El log** `.cuatris-cache/<periodo>.log` trae cada petición con hora, con el identificador
  de sesión tapado: se puede pegar en un issue.
- **Si el SGA devuelve su pantalla de error** («El sistema halló un error inesperado…»), el
  barrido se recupera solo reabriendo el listado. Si cinco cursos seguidos fallan así, corta:
  es el SGA, no un curso; se espera unos minutos y se vuelve a correr.
- **Si el SGA cambió una pantalla**, los parsers (`parsers.py`) fallan con
  `EstructuraInesperada` y dicen qué esperaban. `--guardar-html` deja el HTML recibido para
  compararlo con el corpus de `tools/tests/corpus/sga/`; el anclaje de cada parser está
  explicado en `deprecated/docs/scraping-sga.md`, sección «Qué extrae cada parser y en qué se
  ancla». Un HTML nuevo, anonimizado, va al corpus con su test.

## El plan de estudios de las carreras

`data/plan/bajar-carreras.py` reutiliza el cliente de este paquete para bajar del SGA el
listado de carreras y el plan de cada una (Académica → Carreras), anonimizado, a
`data/plan/sga-carreras/`, y corre `npm run carreras` para regenerar `data/plan/carreras.json`
y `data/plan/carreras/<CODIGO>.json`:

```bash
tools/.venv/bin/python data/plan/bajar-carreras.py            # todas; --solo S I K para algunas
```

## Tests

Los parsers se prueban contra HTML reales del SGA, anonimizados (`tools/tests/corpus/sga/`),
sin red; el scraper completo, contra un SGA falso en memoria. Los corre `ci.yml`.

```bash
tools/.venv/bin/python -m pytest tools/tests -q
tools/.venv/bin/ruff check tools
```
