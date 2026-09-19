# Cómo actualizar los datos de Cuatris

Los horarios, los planes de estudio y las fechas de finales que muestra el sitio viven en
este repositorio, en `data/plan/`. **Cualquiera puede actualizarlos por PR**, sin pedirle
nada a nadie: un bot valida el cambio, lo comenta, lo etiqueta y lo mergea solo cuando
corresponde; después el sitio se publica. No hace falta permiso de escritura, solo una cuenta
de GitHub (y, para los horarios y los planes, una cuenta del SGA).

Cuando falta un dato, el propio repositorio lo pide: aparece un issue con la etiqueta
[`ayuda-necesaria`](https://github.com/SebasCaules/Cuatris/issues?q=is%3Aopen+label%3Aayuda-necesaria)
y la receta correspondiente de esta página. Si viste un dato mal en el sitio y no querés
armar el PR, avisá con el formulario «Un dato está mal» (el link está en el pie del sitio).

## Qué se puede cambiar por PR

| Dato | Archivo | Fuente oficial |
|---|---|---|
| Horarios de un cuatrimestre (todas las carreras) | `data/plan/horarios/<AAAA>-<1\|2>C.json` | SGA → Académica → Cursos → Comisiones |
| Plan de estudios de una carrera | `data/plan/carreras/<CODIGO>.json` + `data/plan/carreras.json` (+ el HTML del SGA en `data/plan/sga-carreras/`) | SGA → Académica → Carreras |
| Fechas de finales de un llamado | `data/plan/finales-<AAAA>-<julio\|diciembre\|febrero>.csv` | Planilla oficial de finales (Google Sheet de la universidad) |

Solo esos archivos. Un PR que toque cualquier otra cosa (código, workflows, el plan curado
de Informática `data/plan/data.js`) necesita la revisión del autor: no se mergea solo.

## Qué pasa con el PR

1. Al abrirlo, corre el gate (`PR de datos`): clasifica el diff, copia **solo** los archivos
   de datos a una cuarentena, corre el validador (`npm run datos:validar`) y el mismo build
   que hace el deploy. Nada que venga del PR se ejecuta.
2. El bot deja **un comentario** (que actualiza en cada push) con el resultado, una tabla
   de qué cambia y una etiqueta con la clase:
   - `datos-menor` — una corrección chica (hasta 5 cursos, sin quitar ninguno; hasta 10
     materias de un plan; hasta 10 filas de una planilla): **se mergea sola en minutos**.
   - `datos-mayor` — un cuatrimestre, un plan o una planilla nuevos, o una modificación
     grande: **se mergea sola a las 72 h** si nadie objeta (etiqueta `esperando`). Un push
     nuevo reinicia la espera.
   - `necesita-humano` — todo lo demás (archivos fuera de la lista, bajas, cambios masivos,
     un cuatrimestre que no es el siguiente al último publicado): lo revisa una persona.
3. Si la validación falla, el comentario dice qué regla y en qué archivo. Se corrige y se
   pushea: el gate vuelve a correr solo.
4. Al mergearse, el sitio se publica en unos minutos.

Los umbrales están en `scripts/datos/politica.json`; las reglas, en `scripts/datos/*.mjs`.

## Antes de abrir el PR

```bash
npm ci
npm run datos:validar          # 0 errores; los avisos no bloquean
npm run datos:fmt              # si un JSON no está en forma canónica, lo reescribe
```

Los JSON van en **forma canónica** (claves ordenadas, dos espacios, LF, salto final, UTF-8
sin BOM): `npm run datos:fmt` la produce y el gate la exige, para que los diffs se lean.

## Las recetas

### Corregir un horario, un aula o un docente

1. Abrí `data/plan/horarios/<periodo>.json` y buscá el curso por `codigo` (`"72.44"`).
2. Corregí el dato en la comisión (`comisiones[].bloques[]`: `dia`, `desde`, `hasta`,
   `sede`, `aulas`, `modalidad`; `docentes`; `cupo`/`ocupacion`) tal como lo muestra el SGA.
   Vocabulario: días en minúsculas y sin acento (`miercoles`), horas `HH:MM`, sedes `sdf` /
   `rectorado` / `sdt` (o `null` sin aula), modalidades `presencial`, `blended`, `virtual`,
   `virtual_sincronica`, `virtual_asincronica`, `laboratorio`.
3. `npm run datos:fmt && npm run datos:validar`, commit, PR. En el PR, decí de dónde sale el
   dato (la pantalla de Comisiones del SGA). Clase `datos-menor`: se mergea sola.

### Cargar un cuatrimestre nuevo

Hace falta una cuenta del SGA, Python 3.11+ y Node. El scraper está en `tools/`
([`tools/README.md`](tools/README.md) tiene el detalle):

```bash
python3 -m venv tools/.venv && tools/.venv/bin/pip install -e "tools[dev]"
export SGA_USUARIO=tu.usuario                       # la contraseña se escribe cuando la pide
tools/.venv/bin/cuatris sga bajar --anio 2027 --cuatrimestre 1C --limite 3 --salida /tmp/prueba.json   # prueba de un minuto
tools/.venv/bin/cuatris sga bajar --anio 2027 --cuatrimestre 1C                                        # ~10 min
```

Deja `data/plan/horarios/2027-1C.json` ya validado. Commit del archivo, PR. Tiene que ser
**el cuatrimestre siguiente** al último publicado y traer una cantidad de cursos parecida
(±30 %): clase `datos-mayor`, se mergea sola a las 72 h. El sitio muestra siempre el
cuatrimestre más nuevo que exista.

### Actualizar el plan de estudios de una carrera

Cuando el SGA publica un plan nuevo (o corrige uno). Con la misma cuenta y el mismo entorno:

```bash
tools/.venv/bin/python data/plan/bajar-carreras.py --solo S      # una carrera; sin --solo, todas
```

Baja las pantallas del SGA a `data/plan/sga-carreras/` (anonimizadas) y regenera
`data/plan/carreras.json` y `data/plan/carreras/S.json`. Commit de los tres, PR. Un plan
nuevo o una carrera nueva es `datos-mayor`; una corrección de pocas materias, `datos-menor`.

Para una corrección puntual (una correlativa, un crédito) se puede editar el JSON a mano:
`bloques[].secciones[].materias[]` con `codigo`, `nombre`, `creditos`, `creditosReq` y
`correlativas` (códigos del mismo plan, sin ciclos).

> El plan de **Informática** que usa el sitio sale de `data/plan/data.js` (curado en
> StudyVaults), no de `carreras/S.json`. Ese archivo lo mantiene el autor.

### Archivar una planilla de finales

No hace falta cuenta de nada.

1. Abrí la planilla oficial del llamado (el Google Sheet que publica la universidad) y
   exportala como CSV: Archivo → Descargar → Valores separados por comas.
2. Guardala como `data/plan/finales-<AAAA>-<mes>.csv`, donde `<mes>` es `julio`,
   `diciembre` o `febrero` y `<AAAA>` el año calendario de las mesas
   (`finales-2027-febrero.csv` para el llamado de febrero de 2027). **El nombre manda**: las
   filas con fechas de otro mes se descartan.
3. `npm run datos:validar`, commit, PR. Una planilla nueva es `datos-mayor`; corregir unas
   filas de una existente, `datos-menor`.

## Qué revisa el validador

Todo `data/plan`, no solo lo que el PR toca. Errores (bloquean): JSON inválido o no
canónico, claves duplicadas, campos desconocidos o con el tipo equivocado, códigos o fechas
mal formados, período incoherente con el nombre del archivo, cursos fuera del período,
bloques invertidos o fuera de 07:00–23:00, dos cursos distintos en la misma aula a la misma
hora, correlativas cíclicas o materias repetidas en un plan, una planilla cuyo nombre no
coincide con sus fechas, datos personales (correos, teléfonos, legajos). Avisos (no
bloquean): sobrecupo, docentes en dos cursos a la vez, sedes que no están en el vocabulario,
cursos que no figuran en ningún plan, fechas ilegibles en una planilla.

Cada regla tiene un id (`colision-de-aula`, `finales-periodo`…) que aparece en el
comentario del bot y se busca tal cual en `scripts/datos/`. Si una regla rechaza un dato que
es real, es un falso positivo: abrí un issue con el caso, y la corrección de la regla va con
ese caso como fixture permanente en `scripts/datos/test/fixtures/`.
