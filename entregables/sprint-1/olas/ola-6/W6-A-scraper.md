# W6-A — Scraper: barrido intercalado con recuperación, valores nuevos, log a archivo, códigos repetidos

## Qué pasó en la corrida real (2026-09-12, 22:18–22:27, 472 filas en 24 páginas)

- Las 40 filas de las páginas 1 y 2 salieron: 37 cursos al checkpoint y 3 con valores que
  `normalizar` no conocía (25.20, 61.27, 73.67).
- Desde la fila 41 (la primera de la página 3) hasta la 472, **cada clic al detalle devolvió la
  página de error del SGA** (3611 bytes, una petición por curso):
  `<h3>El sistema halló un error inesperado.</h3>` y
  `<div id="notifications" class='backgroundBordered'><h4>Su pedido no pudo ser realizado. Por favor vuelva a intentarlo mas tarde.</h4></div>`.
  Está en `.cuatris-cache/2026-2C-10.01.html` (no tiene nombre de usuario: la barra superior
  viene vacía). Los tres detalles reales con valores nuevos están en
  `.cuatris-cache/2026-2C-25.20.html`, `-61.27.html`, `-73.67.html` (llevan
  `CAULES, SEBASTIAN` en la barra superior: **anonimizar** a `APELLIDO, NOMBRE` antes de
  copiar nada a `tests/corpus/sga/`).
- **Causa (decisión N0-24):** `ejecutar` hacía `list(recorrer_listado(...))`, o sea leía las 24
  páginas del listado antes de abrir un solo detalle. Wicket guarda las páginas con estado en un
  almacén por sesión de tamaño acotado (anillo FIFO en disco, ~10 MB); las ~70 páginas de
  detalle creadas mientras se visitaban las páginas 1 y 2 desalojaron a las páginas 3–24 del
  listado, que nadie había vuelto a tocar (las páginas 1 y 2 sobrevivieron porque cada clic
  sobre uno de sus enlaces las vuelve a almacenar). Un enlace a una página desalojada es
  «page expired» y el SGA lo muestra como su error genérico. Es exactamente lo que **no** pasa
  cuando se navega como una persona: se abre una página, se visitan sus 20 cursos, recién
  entonces se pide la siguiente.
- Además, 472 filas produjeron 461 archivos distintos: hay **códigos repetidos** en el listado
  (mismo código → mismo nombre de volcado). El armado final habría fallado por «más de un curso
  con el mismo código» después de 16 minutos de barrido.

## Ownership

`tools/cuatris/sga/{bajar.py,cliente.py,checkpoint.py,normalizar.py,parsers.py}`,
`tests/tools/test_sga_bajar.py`, `tests/tools/test_sga_cliente.py`,
`tests/tools/test_sga_parsers.py`, `tests/corpus/sga/` (solo **agregar** fixtures nuevos,
anonimizados), `docs/scraping-sga.md`. Nada más. **No toques** `schemas/`, `app/`,
`docs/contrato.md`, `tests/tools/test_esquema.py` ni `tests/fixtures/`: otro worker (W6-B)
agrega `domingo` y `virtual` al schema, a los docs del contrato y a la app en paralelo. Asume
que el enum los tendrá; en tus tests **no valides contra el schema** documentos que traigan
`domingo` o `virtual` (prueba la salida del parser y del normalizador, no `cuatris validar`).

## Lee

`CLAUDE.md`; `entregables/sprint-1/ENV.md` (reglas y formato de retorno); el código real de los
cinco módulos y de los tres tests; `docs/scraping-sga.md` entero (lo vas a editar);
`material-raw/02-sga/HALLAZGOS.md` §«Punto de entrada» y §«Wicket» si necesitas contexto.

## Entregables

### 1. Barrido intercalado (N0-24)

Reemplaza el par `recorrer_listado` + `list(...)` por un recorrido **página por página** en el
que los detalles de cada página se visitan **antes** de pedir la siguiente. Sugerencia de forma
(adáptala si encuentras algo más simple, pero conserva la semántica):

```python
class Barrido:
    """Recorre el listado filtrado, página por página, con enlaces siempre frescos."""
    pagina: int                 # número de la página actual, desde 1
    listado: parsers.Listado    # la página actual, con enlaces ya absolutos
    def abrir(self) -> None      # GET ENTRADA (con sesión) → enlace «Cursos» → filtrar_listado → página 1
    def siguiente(self) -> bool  # clic en «siguiente» de la página actual; False si no hay
    def reabrir(self) -> None    # vuelve a abrir el listado desde ENTRADA y pagina hasta `self.pagina`
    def fila(self, codigo: str, aparicion: int = 1) -> parsers.FilaListado  # fila fresca de la página actual
```

Reglas:
- El clic a «siguiente» sale siempre del HTML de la página actual (nunca de uno guardado antes).
- `MAXIMO_PAGINAS`, el ciclo del «siguiente» repetido y `--limite` se conservan.
- **Filtro roto, detectado en la página 1**: si ninguna fila de la primera página es del período
  pedido, se corta ahí con el mismo mensaje de hoy («el filtro no se aplicó»), no a los 16
  minutos.
- Los enlaces del listado se vuelven absolutos al parsear cada página (como hoy).

### 2. Período y anuales al final, desde el checkpoint (N0-24)

Con el barrido perezoso el intervalo del cuatrimestre no se conoce hasta el final, así que:
- El registro del checkpoint suma el bloque `"listado"` con lo que la fila del listado dijo del
  curso: `{"periodo": "2026-1C", "desde": "2026-03-16", "hasta": "2026-11-27"}` (período propio
  de la fila y fechas **sin recortar**). Formato final de la línea:
  `{"codigo": "41.34", "aparicion": 1, "curso": {…}, "listado": {…}, "periodo": "2026-2C"}`.
  `Checkpoint.agregar(codigo, curso, *, listado, aparicion=1)`. Registros viejos sin `listado`
  o sin `aparicion` siguen cargando (se tratan como propios del período y aparición 1).
- `Checkpoint.cargar()` sigue devolviendo `clave → curso` (la clave es `codigo` para la
  aparición 1 y `codigo#2`, `codigo#3`… para las siguientes); agrega `registros()` que devuelve
  los registros completos en orden.
- `separar_anuales` pasa a trabajar sobre registros: propios = `listado.periodo` igual al
  período de la corrida (o ausente); anuales = los demás. El intervalo sale de los propios; a
  los anuales se les recortan `curso["desde"]`/`curso["hasta"]` al intervalo (misma regla y
  mismo WARNING de hoy). Un curso ajeno que **no se solapa** ya no aborta la corrida: va a
  `fallidos` con el motivo de hoy, y el resto se escribe igual.
- `periodo_de_filas` → `periodo_de_registros` (mismo cálculo, sobre los cursos propios).
- `curso_a_contrato` no puede recibir el período real durante el barrido: refactoriza
  `parsers.a_contrato` en `curso_a_dict(curso, capturado)` + envoltorio, de modo que el
  checkpoint guarde el curso exactamente como va en `cursos[]`, con las fechas de la fila sin
  recortar. `a_contrato` sigue existiendo con la misma firma (lo usan tests y docs).

### 3. Página de error del SGA (N0-25)

En `cliente.py`: `pagina_de_error(html) -> bool` anclado en el `<h3>` cuyo texto normalizado
contiene «error inesperado» **o** en `div#notifications h4` con «no pudo ser realizado»
(cualquiera de los dos alcanza; se anclan los dos porque cada uno se rompe distinto). Nueva
excepción `PaginaVencida(ErrorSGA)`. `_con_sesion` la levanta después del control de sesión
vencida, con un mensaje que incluye método y URL **tapada** (`_sin_sesion`) y explique que la
página de Wicket a la que apuntaba el enlace ya no existe en la sesión; nunca el cuerpo.
Agrega `tests/corpus/sga/error-inesperado.html` recortado del real (sin nombre de usuario;
comprueba que no lo traiga) y úsalo en los tests del ancla.

### 4. Recuperación (N0-25)

En el bucle de cursos:
- `PaginaVencida` al abrir un detalle → WARNING «el SGA dio por vencida la página del listado;
  se reabre y se vuelve a la página k» → `barrido.reabrir()` → `fila = barrido.fila(codigo,
  aparicion)` → **un** reintento. Si vuelve a fallar con `PaginaVencida`, el curso va a
  `fallidos` con ese motivo y se sigue.
- Contador de cursos **consecutivos** irrecuperables: al llegar a 5 se aborta con `ErrorSGA`
  («el SGA responde su página de error a todo; espere unos minutos y vuelva a correr el mismo
  comando: el checkpoint conserva lo bajado»). Un curso que sale bien lo pone en 0.
- `PaginaVencida` al pedir «siguiente» → `reabrir()` (que ya deja la página actual) y un
  reintento del «siguiente»; si falla de nuevo, se propaga.
- La sesión vencida la sigue resolviendo el cliente (re-login). Tras un re-login las páginas de
  Wicket de la sesión anterior no existen: el clic siguiente cae en `PaginaVencida` y en esta
  misma recuperación. Verifícalo con un test.

### 5. Log a archivo, siempre (N0-26)

`configurar_registro(verboso, archivo: Path | None)`: consola en INFO (DEBUG con `--verboso`),
formato `%(message)s`, **a stdout** (para que `capsys.readouterr().out` de los tests siga
viendo el resumen); archivo `<cache>/<periodo>.log` en DEBUG, en modo append, con
`%(asctime)s %(levelname)s %(message)s` y una línea `=== corrida <fecha> <hora> ===` al
empezar. `httpx`/`httpcore` quedan en WARNING (regla del `jsessionid`). Los `print` de
`ejecutar` pasan a `REGISTRO.info` para que todo quede en los dos lados. La configuración tiene
que ser **idempotente** (los tests llaman a `ejecutar` varias veces en el mismo proceso):
marca los handlers que instalas y quítalos antes de volver a instalarlos; no dependas de
`basicConfig`. Un test comprueba que el archivo existe, tiene líneas DEBUG con las peticiones y
**no contiene ningún `jsessionid=` sin tapar**.

### 6. Valores nuevos del SGA (N0-28)

Vistos en los tres detalles reales (filas de la tabla Comisiones, texto plano):

- 25.20 com. K: `Miércoles 15:00 - 18:00 Aula externa: Virtual` · `Viernes 19:00 - 22:00 Aula
  ITBA: 102T #----> SDT Aula externa: Blended` · docentes `DI SANZO, BRUNO / Jacoby, Daniel /
  BEADE, NICOLAS AGUSTÍN / Bergerman, Matías` · cupo `17 / 24`.
- 61.27 com. A: `Domingo 13:00 - 14:00 Aula externa: Virtual asincrónica` · `Miércoles 19:00 -
  21:00 Aula ITBA: 801F #----> Sede Distrito Financiero Aula externa: Presencial` · cupo
  `41 / 48`; B: domingo 12–13 asinc. + jueves 19–21 702F SDF, `24 / 24`; C: domingo 14–15 +
  jueves 16–18 401F SDF, `48 / 48`; D: domingo 12–13 + miércoles 16–18 301F SDF, `33 / 41`.
- 73.67 com. A: `Jueves 10:00 - 13:00 Aula ITBA: 204R #----> Sede Rectorado Aula externa:
  Presencial - SDR` · `Roitberg, Esteban Gabriel` · `3 / 18`.

Cambios en `normalizar.py`:
- `DIAS`: `"Domingo": "domingo"` (el contrato 1.1.0 lo admite; corrige el comentario que decía
  que no existía).
- `MODALIDADES`: `"Virtual": "virtual"` (a secas: el SGA no dice si es sincrónica y **no se
  asume**), `"Presencial - SDR": "presencial"`.
- Regla general en `modalidad()`: si el texto no está en el mapa pero tiene la forma
  `<modalidad conocida> - <sufijo>`, se devuelve la modalidad conocida y se registra un
  WARNING con el texto completo y el sufijo ignorado, **una sola vez por texto distinto** (un
  barrido no puede escribir 500 veces la misma línea). Cualquier otra cosa sigue siendo
  `ValorDesconocido`.
- `parsers.CONTRATO = "1.1.0"` (la extensión de enums es un cambio *minor*; ajusta los tests
  que fijen `1.0.0`).

Fixtures nuevos en `tests/corpus/sga/`, anonimizados y recortados a lo necesario (la tabla de
comisiones y la cabecera del curso): `detalle-comisiones-25.20.html`, `-61.27.html`,
`-73.67.html`. Tests de `parsear_curso` sobre los tres: 61.27 → 4 comisiones, cada una con un
bloque `domingo` `virtual_asincronica` con `sede None` y `aulas ()` y otro presencial en `sdf`;
25.20 K → miércoles `virtual` (sede `None`) + viernes `blended` `sdt` `("102T",)`; 73.67 A →
jueves `presencial` `rectorado` `("204R",)`, y el WARNING del sufijo aparece en `caplog`.

### 7. Códigos repetidos en el listado (N0-27)

- El barrido cuenta las apariciones de cada código a lo largo de las páginas; la segunda
  aparición se visita también y se guarda con `aparicion=2` (clave `codigo#2`). WARNING al
  verla, con período, fechas, nivel y departamento de las dos filas.
- `armar_documento` fusiona por código: si los cursos son idénticos, queda uno; si los ids de
  comisión son disjuntos, se unen las comisiones (ordenadas por id), `desde` = mínimo,
  `hasta` = máximo, nombre y departamento de la primera aparición, con WARNING «93.18 aparece 2
  veces en el listado: se unen sus comisiones (A, B | C, D)»; si un mismo id trae contenido
  distinto, ese código va a `fallidos` con un motivo que muestre los dos ids en conflicto, y el
  resto se escribe igual. `armar_documento` devuelve entonces `(documento, fallidos_extra)` o
  recibe la lista de fallidos para agregarlos; elige lo más claro.

### 8. Resumen final

Al terminar (consola y log): filas del listado, códigos distintos y repetidos, cursos bajados
en esta corrida, cursos que ya estaban en el checkpoint, fallidos con su motivo, y la ruta del
`.parcial.json` cuando corresponde. Códigos de salida como hoy (`OK` / `HAY_ERRORES`).

### 9. Tests (con `SGAFalso`, sin red) — todos los existentes siguen verdes

- El orden de `sga.pedidos` demuestra que los detalles de la página 1 se piden **antes** que la
  página 2.
- Un enlace de detalle que devuelve la página de error dispara `reabrir()`: el falso sirve el
  error para la URL vieja y un listado nuevo cuyo enlace funciona; el curso termina en el
  checkpoint; se comprueba la secuencia de re-navegación (`/app2/` → Cursos → filtro → siguiente…
  hasta la página actual).
- Cinco cursos consecutivos irrecuperables → `ErrorSGA`, y el checkpoint conserva los buenos.
- Re-login seguido de `PaginaVencida` → recuperación.
- Período y anuales al final desde el checkpoint (un anual se recorta; un ajeno que no se solapa
  va a fallidos); filtro roto detectado en la página 1.
- Log: archivo creado, líneas DEBUG con las peticiones, ningún `jsessionid=` sin tapar.
- Código repetido: disjunto → fusión con WARNING; en conflicto → fallidos.
- `normalizar`: Domingo, Virtual, «Presencial - SDR», sufijo genérico con WARNING único.
- Los tres detalles reales parsean como se describe en §6.
- `.venv/bin/ruff check tools tests` limpio.

### 10. `docs/scraping-sga.md`

- «Cómo se corre»: el archivo de log (`.cuatris-cache/<periodo>.log`, qué trae, que no lleva
  el `jsessionid`), y que una corrida junta **todos** los errores por curso.
- Nueva subsección «Por qué el barrido va página por página» con la explicación de Wicket y la
  evidencia del 2026-09-12 (filas 1–40 bien, 41–472 «error inesperado»).
- «Cuando se corta»: la página de error, la recuperación automática, el tope de 5 consecutivos.
- «Los anclajes del scraper en vivo»: el ancla de la página de error.
- «Qué extrae cada parser»: `domingo`, `virtual`, el sufijo de modalidad, los códigos repetidos.

## Retorno

Formato de build de `ENV.md`. En `testsRun`, el comando exacto y el resultado real de
`.venv/bin/python -m pytest tests/tools -q` y de `ruff`. Si el suite falla en
`tests/tools/test_esquema.py` o `tests/tools/test_invariantes.py` por el enum (`domingo`,
`virtual`), es el trabajo en curso de W6-B: repórtalo en `notes`, no lo arregles.
