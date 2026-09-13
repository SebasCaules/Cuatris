# Plan de estudios S10-Rev23: de dónde sale cada dato

`data/v1/planes/S10-Rev23.json` no se edita a mano: lo produce `cuatris plan importar` cruzando
`Plan S10-Rev23.xlsx` (hojas `Obligatorias` y `Electivas`), el listado de 163 materias del SGA
(`materias-carrera-info.html`) y su tabla de títulos (`oferta-carrera-info-titulos.html`). Las
fuentes viven en `material-raw/`; la copia anonimizada para los tests, en `tests/corpus/plan/`.

## Campo por campo

| Campo | Sale de | Detalle |
|---|---|---|
| `codigo` | SGA | Las 163 del listado, en el orden en que el SGA las publica. |
| `nombre` | SGA | Es el nombre que también usa `entregables/03-abreviaciones-materias.csv`. |
| `creditos` | SGA, salvo decisión a mano | Difiere del Excel en dos materias y ahí decide quien corre el comando; ver abajo. |
| `ciclo` | Excel | `basico` y `profesional` por bloque del Excel; el resto es `electiva` (las 85 de la hoja `Electivas` y las 34 que solo están en el SGA). |
| `cuatrimestre_sugerido` | Excel | `(año - 1) * 2 + cuatrimestre` del encabezado `Año N - Cuatrimestre M`; `null` para electivas. |
| `creditos_requeridos` | Excel (vigentes), SGA (las otras 34) | La celda vacía del Excel se completa con el SGA (0 en los cuatro casos). |
| `correlativas` | Excel (vigentes), SGA (las otras 34) | Cada código debe existir entre las 163 y el grafo debe ser acíclico. |
| `minors` | Excel | Una `X` (o `x`) en la columna del minor; la celda vacía no suma y cualquier otra marca aborta. Vacío para obligatorias y para las que solo están en el SGA. |
| `vigente` | Excel | `true` para las 129 del Excel; `false` para las 34 que solo están en el SGA. |
| `titulos[].creditos` | SGA | 147 / 192 / 243, leídos del HTML; `id`, nombres y `requiere_ciclos` son los de `CONTRATO-v1.md` §2. |
| `electivas.creditos_requeridos` y `minors[].creditos_minimos` | Excel | 27 (verificado contra el SGA) y 14, de la nota al pie de `Obligatorias`. |

## La regla de `vigente` y los casos raros de las fuentes

El Excel es un subconjunto del SGA: sus 129 entradas (44 obligatorias + 85 electivas) están entre
las 163, que se cargan igual para que un plan viejo resuelva; la SPA ofrece solo las vigentes.

- **Error de tipeo del minor.** El Excel encabeza «Arqitectura de Software»; se carga como
  «Arquitectura de Software», sigla `ARQ` (`MINORS_POR_ENCABEZADO`); si el ITBA lo corrige aborta.
- **Fila repetida.** `73.82` aparece dos veces en `Electivas`, idénticas salvo la marca del minor
  `CD`; se unen. Si difirieran en otro campo, aborta.
- **Las «orientaciones» no son títulos.** El HTML lista cuatro «Orientación» de 0 créditos,
  reemplazadas por los minors; solo entran «Intermedio» y «Principal». De `Bachiller` el SGA solo
  publica los 192 créditos: su `requiere_ciclos` sale de `CONTRATO-v1.md` §2.

## Diferencias entre el Excel y el SGA

Los créditos difieren en **72.23** «Diseño y Construcción de Compiladores» (Excel 6 / SGA 1) y
**72.70** «Modelos e Imágenes Fractales» (Excel 3 / SGA 1). El importador **no elige**: aborta
nombrándolas, y quien corre el comando decide cada una con `--creditos-decididos CODIGO=CREDITOS`
(tiene que ser el del Excel o el del SGA). Se publica el del **Excel** (6 y 3): el plan de
estudios es la autoridad sobre cuánto vale una materia para el título, y «1 crédito» en el
listado del SGA no es un valor plausible para ninguna de las dos (decisión N0-6 del Sprint 1;
conviene reclamarlo al ITBA). Una diferencia nueva, o una de estas que deje de diferir, también
aborta.

`creditos_requeridos` difiere en ocho y gana el Excel (Excel / SGA): `72.27` 140/120, `72.20` 0/171,
`72.98` 192/144, `72.79` 0/144, `73.60` 140/0, `81.13` 140/0, `81.14` 120/0, `81.16` 140/0.
`correlativas` difiere en diez y gana el Excel: `72.41`, `72.71`, `72.88`, `81.57` y `73.40` cambian
orden o conjunto; `72.25` y `72.27` llevan `93.75` solo en el SGA; `94.52` y `72.79` la tienen solo
en el Excel; `73.30` apunta a `72.35` y el SGA a `72.38`. El nombre difiere en doce y gana el SGA:
`72.65`, `72.82`, `72.84`, `72.90`, `73.30`, `73.40`, `73.80`, `73.89`, `81.57`, `81.74`, `82.21`,
`94.65`. El comando imprime las cuatro listas al correr.

**Abortan la importación**: encabezados distintos; un bloque sin título de ciclo; una materia debajo
del pie «Materias Electivas»; una columna o una marca de minor desconocidas; una correlativa
inexistente; un ciclo en el grafo; una diferencia de créditos sin decidir, con un valor ajeno a las
fuentes o para una materia que ya no difiere; que los ciclos no cierren con Analista o Ingeniero/a;
que falte la tabla de títulos.

## Cómo regenerar el archivo cuando el ITBA publique un plan nuevo

1. Guardar el Excel nuevo en `material-raw/03-plan-de-estudios/` y volver a bajar del SGA
   `materias-carrera-info.html` y `oferta-carrera-info-titulos.html`.
2. Correr, desde la raíz: `cuatris plan importar --excel <xlsx> --sga <materias.html> --titulos
   <titulos.html> --creditos-decididos 72.23=6 --creditos-decididos 72.70=3 --salida
   data/v1/planes/S10-Rev23.json`. Ante una diferencia de créditos nueva, decidirla y agregar
   otro `--creditos-decididos`; los mismos valores viven en `CREDITOS_DECIDIDOS` de
   `tests/tools/test_plan.py`, así que se tocan los dos lugares a la vez.
3. Leer el resumen de diferencias que imprime el comando y actualizar este documento.
4. Actualizar `tests/corpus/plan/` (reemplazar `CAULES, SEBASTIAN` por `APELLIDO, NOMBRE`,
   comprobar con `grep -R CAULES tests/corpus/plan`) y correr los tests de `test_plan.py`.
5. Si cambian los códigos, regenerar las abreviaciones: `cuatris abreviaciones exportar`,
   completar `correccion` en las materias nuevas y `cuatris abreviaciones importar`.

`data/v1/vocabulario.json` se regenera con `cuatris plan vocabulario --html material-raw/02-sga/html
--salida data/v1/vocabulario.json`: saca las sedes de los tokens `Aula ITBA: <aula> #----> <sede>` y
aborta ante una marca `#--` con otra forma, para que un cambio del SGA no deje sedes afuera en
silencio. Hoy los HTML guardados solo traen `Rectorado` y `SDT`; `SDF` se nombra en `HALLAZGOS.md`
pero no está en ningún HTML y no se escribe hasta que haya una captura que la traiga: C3 valida
`bloques[].sede` contra este archivo, así que rechazará un horario con `sdf` hasta entonces.
