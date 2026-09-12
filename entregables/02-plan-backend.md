# Plan de implementación del backend — Cuatris (§2–§7)

## Contexto

Cuatris es un planificador de cursada del ITBA: una SPA en React sobre GitHub Pages que
permite acomodar materias troncales y electivas a lo largo de los cuatrimestres futuros,
viendo correlativas, choques de horario y carga por cuatrimestre.

No hay servidor. Lo que el brief llama "backend" es la capa de datos versionada en el
repositorio, la automatización de GitHub Actions y las herramientas de CLI que la mantienen.
El runtime del usuario es el navegador leyendo JSONs estáticos.

El requisito que domina el diseño es la **longevidad**: el proyecto tiene que seguir
funcionando dentro de muchos años, con gente que llega sin contexto y sin un mantenedor
experto. El criterio de éxito cuando algo se rompa es que el proyecto degrade a *datos
viejos pero correctos*, nunca a *datos malos* ni a *sitio caído*.

Este plan cubre §2 a §7. La interfaz la está diseñando Claude Design en paralelo; el plan de
sprints fullstack (§9) se arma cuando llegue esa devolución.

### Decisiones tomadas

- **Repositorio público**, requisito de §4 para que cualquiera abra PRs.
- **`material-raw/` queda fuera del repositorio.** Solo entra un corpus de test curado y
  anonimizado.
- **Sugerencias desde la página (§6): Issue prellenado.** Cero infraestructura, cero
  secretos en el navegador.
- **Auto-merge por niveles.** Correcciones puntuales solas; cargas masivas con aprobación.
- **Todo en Python, con dependencias vendorizadas.** Ver la nota al final de la Fase 4.

### Hallazgos que condicionan el diseño

De `material-raw/02-sga/HALLAZGOS.md`, verificados contra el sistema real:

- El SGA corre sobre Apache Wicket con URLs cifradas. **El único punto de entrada estable es
  `https://sga.itba.edu.ar/app2/`.** Los ids de componente (`toolbars:3366:filters:…`)
  cambian entre despliegues y se extraen del HTML en cada corrida.
- El SGA exige sesión autenticada. **El scraper no puede correr en CI**: corre local, con
  las credenciales de quien tenga cuenta del ITBA, y el resultado entra por PR.
- **Los horarios solo existen dentro de cada curso.** El listado de 472 cursos no los trae:
  un barrido completo son ~500 peticiones.
- **"Ocupación de Aulas" no identifica la materia**, así que no sirve como fuente; pero sí
  como validador cruzado (comprobé 8 de 8 bloques de Álgebra Lineal contra la grilla).
- Casos reales que un validador ingenuo rechazaría: comisión en **dos aulas simultáneas**;
  letras de comisión **no contiguas** (A–H y luego K); comisión que **cambia de sede** entre
  días; **modalidades distintas** entre bloques de una misma comisión; materias homónimas
  con distinto código; **períodos cortos**; cupo lleno (48/48).

## Arquitectura

```
cuatris/
├─ app/                    SPA (Vite + React + TS) — fuera del alcance de este plan
├─ data/
│  ├─ index.json           qué cuatrimestre está activo, y desde cuándo
│  ├─ CHANGELOG.jsonl      log append-only de cambios mergeados (§7)
│  └─ v1/
│     ├─ planes/S10-Rev23.json
│     ├─ horarios/2026-2C.json
│     ├─ catalogo/72.44.json
│     ├─ evidencia/2026-2C/ocupacion-2026-09-07.json
│     ├─ abreviaciones.json  nombre corto curado a mano, por materia
│     ├─ no-plan.json      códigos válidos que no están en ningún plan cargado
│     └─ vocabulario.json  sedes y aulas conocidas
├─ schemas/v1/             JSON Schema 2020-12
├─ tools/cuatris/          CLI en Python: contrato, pdf, sga, validar, sugerencias, historia
├─ vendor/                 wheels de las dependencias, para CI sin red
├─ tests/
│  ├─ corpus/              PDFs y HTML reales, anonimizados
│  └─ fixtures/{deben-pasar,deben-fallar}/
├─ docs/                   instructivo de scraping, contrato, runbook, política
└─ .github/{workflows,CODEOWNERS}
```

```
PDFs oficiales ──► parser (§5) ──┐
SGA (local) ─────► scraper (§4) ─┼──► JSON canónico ──► PR ──► CI ──► main ──► deploy ──► SPA
página ──────────► Issue (§6) ───┘                              └──► CHANGELOG.jsonl (§7)
```

---

## Fase 0 — Cimientos

`git init` y primer push a **[`SebasCaules/Cuatris`](https://github.com/SebasCaules/Cuatris)**
(ya creado: público, vacío, rama `main`; el sitio quedará en
`https://sebascaules.github.io/Cuatris/`), licencia, `.gitignore` excluyendo `material-raw/`.

Paquete Python en `tools/`, Python 3.11+, un ejecutable `cuatris` con subcomandos.
Dependencias **solo de Python puro**, para que la vendorización sea un wheel `none-any` por
paquete: `fastjsonschema`, `beautifulsoup4`, `openpyxl`, `httpx`; `ruff` y `pytest` para
calidad. *(Ajuste del Sprint 1, gap G-05: `pydantic`, `jsonschema`, `selectolax` y `pdfplumber`
traen extensiones compiladas; la librería de PDF se elige en el Sprint 2.)*

Corpus en `tests/corpus/`: los 6 PDFs de materias y los HTML del SGA que sirven de fixture
(`oferta-materias`, `horarios-materia-multiples-comisiones`,
`horarios-materia-detalle-comisiones`, `materias-carrera-info`, un `aulas-*`). **Antes de
commitearlos hay que reemplazar `CAULES, SEBASTIAN` por un marcador**: aparece en la barra
superior de todos los HTML guardados.

**Configuración de plataforma.** Es lo primero y lo único que un PR no puede tocar:

- Ruleset en `main`: PR obligatorio, checks requeridos, sin force-push, historial lineal,
  **incluyendo administradores**.
- `CODEOWNERS` sobre `/.github/**`, `/tools/**`, `/schemas/**`, `/vendor/**`,
  `/tests/fixtures/**`, `/politica.json` y **`/data/v1/planes/**`**, con revisión de code
  owner obligatoria. Esto hace que "el PR modifica su propio validador" sea **imposible por
  plataforma**, no por acierto del código. Es la defensa que vuelve relevantes a todas las
  demás.
- Permiso por defecto del `GITHUB_TOKEN`: solo lectura.
- "Require approval for first-time contributors" activo.
- **Cero secretos en el repositorio.** Solo `GITHUB_TOKEN` y OIDC para Pages. Un PAT o una
  clave de App caducan al año y matan la autonomía sin que nadie se entere.

---

## Fase 1 — Contrato de datos (§3)

Es el cimiento. Se entrega junto con su validador: un schema sin validador no es un
contrato.

### Versionado

- **La ruta**: `data/v1/…`. Un cambio incompatible crea `data/v2/` y **no toca `v1`**.
- **El campo `contrato`** en cada archivo, en SemVer. Patch es documentación; minor agrega
  campos opcionales; major implica directorio nuevo.
- `data/index.json` dice qué archivos existen, con qué versión, y **desde qué fecha de
  calendario cada cuatrimestre está activo**.

### Publicar no es activar

Agregar `horarios/2027-1C.json` es automatizable; que la SPA lo use como cuatrimestre por
defecto lo decide `index.json` por fecha, no por la presencia del archivo. Hasta esa fecha
se muestra como vista previa.

Cierra el vector "subo un cuatrimestre inventado y la SPA lo adopta por convención de
nombre", y de paso convierte cada carga masiva en un canario con usuarios reales antes de
ser la fuente oficial.

### Entidad principal

```json
{
  "contrato": "1.0.0",
  "periodo": { "anio": 2026, "cuatrimestre": "2C",
               "desde": "2026-07-26", "hasta": "2026-12-31" },
  "cursos": [{
    "codigo": "93.18",
    "nombre": "Álgebra Lineal",
    "departamento": "Ciencias Exactas y Naturales",
    "desde": "2026-07-26", "hasta": "2026-12-31",
    "dictado_conjunto": [],
    "comisiones": [{
      "id": "A",
      "cupo": { "capacidad": 48 },
      "ocupacion": { "inscriptos": 48, "al": "2026-09-09" },
      "docentes": ["Cabana, Adriana Elena", "Peña, Nelly Haydee"],
      "bloques": [{
        "dia": "lunes", "desde": "14:00", "hasta": "16:00",
        "sede": "rectorado", "modalidad": "presencial",
        "aulas": ["001R"]
      }]
    }]
  }]
}
```

Siete decisiones de forma, cada una obligada por un caso real. Son la razón de ser de esta
fase: sin ellas, la mitad de los validadores de la Fase 4 rechaza datos correctos.

| Decisión | Caso que la obliga |
|---|---|
| `aulas` es **array** | 93.18 com. B: miércoles 10:00–12:00 en 003T **y** 004T |
| `sede` y `modalidad` van **en el bloque** | 93.18 com. A cambia de sede; 30.28 mezcla Blended y Presencial |
| `desde`/`hasta` van **en el curso** | 15.09 va del 18/09 al 16/10, no todo el cuatrimestre |
| `id` de comisión es **string opaco** | Existen A–H y K; 72.44 usa "S". Sin chequeos de orden ni contigüidad |
| `codigo` es **string**, única identidad | `"93.18"` no es decimal; y 23.05 y 25.66 comparten nombre |
| `cupo` (estable) separado de `ocupacion` (volátil) | Permite que dos scrapeos independientes produzcan el mismo hash: habilita la corroboración entre dos personas de la Fase 4 |
| `dictado_conjunto` explícito | Dos códigos que comparten aula legítimamente, para que no cuente como colisión |

Fechas siempre `YYYY-MM-DD` plano, sin hora ni zona horaria: un `T00:00:00Z` produce
corrimientos de un día en la corroboración por fecha.

**Enums**: `dia` y `modalidad` cerrados; `sede` cerrado con `vocabulario.json` editable;
**`aulas` nunca enum** — patrón libre, porque el ITBA abre aulas nuevas y un enum ahí
significa que el CI rechaza datos correctos hasta que alguien actualice el schema.

`additionalProperties: false` en todo, pero con una clase de error propia: *"campo
desconocido X — si es real, hay que actualizar el schema en un PR aparte"*. Es un falso
positivo aceptado a conciencia: la alternativa, aceptar campos desconocidos, es un canal de
contrabando hacia el render.

### Serialización canónica

`cuatris fmt` produce la única forma válida: claves ordenadas, indentación de 2, `LF`, salto
final, UTF-8 sin escapar acentos, **sin claves duplicadas**.

No es cosmética. Hace los diffs legibles para un revisor sin contexto, impide maquillar la
magnitud de un cambio con reordenamientos, y elimina el truco de `{"cupo": 48, "cupo": 0}`,
donde el humano lee una cosa y el parser usa otra.

### Abreviaciones de materias

Cada materia lleva una `abreviacion`: el nombre corto con el que la gente realmente la
llama — POD, Cripto, PAW, EDA. Es lo que va en los bloques del calendario, donde
"Autómatas, Teoría de Lenguajes y Compiladores" no entra de ninguna manera.

**Vive en un archivo curado aparte, `data/v1/abreviaciones.json`**, no dentro de
`catalogo/<codigo>.json`. La razón es concreta: el catálogo lo **genera** el parser de PDFs,
así que un campo editado a mano ahí se pierde en la próxima corrida del parser. El archivo
curado se mantiene solo, y el build lo une por código al servir la materia. Para el contrato
público de la materia, `abreviacion` es un campo más; para el pipeline, es la única parte de
la información de materia que **no** se deriva de una fuente oficial.

El ciclo de curaduría es un CSV de ida y vuelta:

```
cuatris abreviaciones exportar > abreviaciones.csv   # codigo, nombre, propuesta, correccion, nota
cuatris abreviaciones importar abreviaciones.csv     # aplica y reserializa
```

`correccion` vacía significa que la propuesta queda como está; con contenido, gana la
corrección. La columna `codigo` no es decorativa: **seis nombres se repiten en códigos
distintos** (tres "Sistemas Embebidos", dos "Cloud Computing", dos "Programación Funcional",
dos "Sistemas Tolerantes a Fallas", dos "Procesamiento del Lenguaje Natural", dos
"Introducción a la realidad aumentada"), así que el nombre no alcanza para volver a pegar la
corrección en la materia correcta.

La primera tanda ya está propuesta y entregada como `entregables/03-abreviaciones-materias.csv`,
con las 163 materias del plan S10-Rev23.

La unicidad de `abreviacion` es **error duro**, porque las 163 abreviaciones ya son únicas
por construcción. Seis nombres se repiten en códigos distintos, y la regla que los desempata
es: **la versión que está en la lista vigente del plan conserva la abreviación limpia; las
demás llevan su código entre paréntesis**. Así `Cloud` es 82.08 y `Cloud (72.64)` es la
descontinuada. Cuando las dos están vigentes —el caso de Sistemas Tolerantes a Fallas—
ambas llevan código.

El desempate no es arbitrario: sale de comparar las dos fuentes del plan (ver abajo).

### Campos que pide el diseño

Al cruzar el mockup aprobado (`04-diseno/`) con las fuentes aparecieron datos que la SPA
necesita y que el contrato debe llevar desde la primera versión:

- **`planes/S10-Rev23.json`**, por materia: `ciclo` (básico / profesional / electiva),
  `cuatrimestre_sugerido`, `creditos_requeridos` (72.45 exige 160 créditos aprobados),
  `correlativas`, `minors` (siglas a las que suma la electiva) y `vigente`. A nivel plan:
  `titulos` con `{nombre, tipo, creditos, requiere_items}` —Analista en Tecnología
  Informática 147, Bachiller en Ingeniería 192, Ingeniero/a en Informática 243, verificados en
  la página de títulos del SGA—, `electivas_requeridas: 27` y `minors` con
  `{sigla, nombre, creditos_minimos: 14}`. Los minors son cuatro y el mínimo de 14 créditos
  sale del Excel oficial; el mockup mostraba 18 como relleno.
- **`index.json`**: `publicado` (fecha) por archivo de horarios, para «horarios publicados
  hace n días»; `horarios_esperados` por período futuro, curado a mano, para «salen en
  noviembre de 2026»; y `hash` por archivo, para invalidar la caché del navegador.
- Los títulos se evalúan **por ítems**, no solo por créditos: Analista exige aprobar todo el
  ciclo básico, e Inglés I/II y Práctica Laboral valen 0 créditos pero son ítems.

El contrato de horarios no cambia: el diseño consume exactamente lo que ya define.

### Documentación

`docs/contrato.md`: cada campo, su porqué, y **la tabla de arriba con el ejemplo real de
cada caso**. Es lo que evita que dentro de tres años alguien "simplifique" `aulas` a un
string y rompa Álgebra Lineal.

---

## Fase 2 — Parser de PDFs (§5)

Va antes que el scraper: es autocontenido, no necesita credenciales y valida el contrato de
punta a punta rápido.

Los 6 PDFs de muestra son nativos y comparten **exactamente las mismas 11 secciones**,
delimitadas por `➢`. Detalles del formato ya detectados:

- El `➢` viene a veces seguido de un espacio de ancho cero (U+200B) y a veces de uno normal.
- Campos vacíos son normales: 82.21 no tiene horas de laboratorio y el número no está.
- `Carrera de:` es una lista separada por `/` con separadores dobles
  (`… / / Ingeniería en Informática`) que puede ocupar varias líneas.
- Encabezado y carga horaria son pares etiqueta/valor en dos columnas.

`cuatris pdf parsear <archivo>` emite el JSON de catálogo ya validado. Tests con golden
files para los 6 PDFs conocidos.

El parser **falla ruidosamente** si no encuentra las 11 secciones. Un PDF con formato nuevo
tiene que romperlo, no producir un JSON con campos vacíos que después contamina los datos
publicados.

---

## Fase 3 — Scraper del SGA e instructivo (§4.1)

### El scraper

`cuatris sga bajar --anio 2026 --cuatrimestre 2C`

1. Entra por `https://sga.itba.edu.ar/app2/` y guarda las tres cookies (`JSESSIONID`,
   `AWSALB`, `AWSALBCORS` — `AWSALB` mantiene la afinidad con la instancia del balanceador,
   sin ella se pierde la sesión).
2. Lee el `action` del formulario **del HTML recibido** y postea `user`, `password`,
   `login`. Credenciales por variable de entorno o prompt; **nunca en disco ni en el
   repositorio**.
3. Navega a Cursos, filtra por nivel/período/año y pagina de a 20 sobre 472 cursos. Los
   nombres de campo y los ids de componente **se extraen del HTML en cada corrida**.
4. Por cada curso abre el detalle y la pestaña Comisiones, y parsea los bloques.
5. **Captura también la evidencia**: la grilla de Ocupación de Aulas para K fechas
   muestreadas, normalizada a `data/v1/evidencia/<cuatri>/ocupacion-<fecha>.json` como
   bitmap de franjas de 30 minutos por aula.

Con ~500 peticiones el scraper tiene que ser **reanudable**: checkpoint por curso, para que
un corte de red o un vencimiento de sesión no obligue a empezar de cero. Rate limit
conservador y `User-Agent` identificable: es el sistema de la universidad.

### Por qué la evidencia se captura acá y no en CI

CI no tiene credenciales y no puede tenerlas. Pero además, si el gate hiciera una llamada en
vivo al SGA, el día que el ITBA cambie esa pantalla el CI empieza a fallar y **no se mergea
nunca más nada**. Capturándola local y commiteándola, la verificación en CI es 100 %
offline y determinista.

### El instructivo — `docs/scraping-sga.md`

El brief pide que lo pueda seguir alguien que llega dentro de varios años. Eso significa
documentar **cómo re-derivar los selectores** cuando dejen de funcionar, no solo cuáles son
hoy:

- Qué es el SGA, cómo se obtiene cuenta, por qué el scraping no corre en CI.
- El recorrido con capturas: Académica → Cursos → lupa → Comisiones.
- La plataforma: Wicket, URLs cifradas, por qué solo `/app2/` es estable, por qué los ids
  rotan.
- Para cada dato: qué selector se usa hoy, **en qué se ancla** (por ejemplo, "el `<div>` que
  contiene un `<span>` con el nombre del día") y cómo verificar que sigue valiendo.
- Diagnóstico cuando falle: guardar el HTML, compararlo contra el fixture del corpus, qué
  mirar.
- Cómo cargar el resultado: `cuatris fmt`, `cuatris validar`, abrir el PR.

---

## Fase 4 — Validación y blindaje de PRs (§4.2, §4.3, §4.4)

Tres principios ordenan todo:

1. **Los datos son bytes, nunca código.** Ningún archivo que venga de un PR se ejecuta. El
   validador, los schemas y los workflows salen **siempre de la rama base**.
2. **Separación de privilegios por job.** El job que toca bytes hostiles no tiene ningún
   permiso. El job que puede mergear nunca abre un archivo del PR.
3. **Degradación elegante.** El modo de falla aceptable es "no se mergea nada". El
   inaceptable es "se mergea cualquier cosa" o "el sitio muere".

### Las amenazas que importan

| # | Vector | Por qué importa |
|---|---|---|
| A1 | Ejecución de código del PR en un job con token de escritura | Toma total del repositorio y del sitio |
| A2 | El PR modifica los propios controles (`tools/`, `schemas/`, `.github/`) | Desactiva todo lo demás, en silencio y para siempre |
| A3 | Inyección por el camino Issue → PR | Igual que A1, y **sin necesidad de fork ni permisos**: basta abrir un issue |
| A4 | Bypass del check requerido (el PR edita el workflow que lo produce) | El gate existe pero no gatea |
| A5 | XSS o contaminación de prototipo vía contenido de datos | Robo de sesión en el dominio del sitio |
| A6 | Corrupción masiva de buena fe: el scraper se cortó y el archivo pasa de 472 a 61 cursos | **El escenario más probable de todos** |
| A7 | Corrupción dirigida y sigilosa: mover un bloque, dos líneas de diff | Invisible para cualquier umbral de magnitud |
| A8 | Erosión por goteo: 40 PRs de 5 cursos cada uno | Esquiva todos los límites por PR |
| A9 | DoS: archivo enorme, JSON de profundidad extrema, regex catastrófica | Git es inmutable: el repo queda inflado para siempre |
| A10 | **Bloqueo permanente del pipeline**, o falsos positivos crónicos hasta que alguien desactive las defensas "porque molestan" | La amenaza más probable a cinco años |
| A11 | Publicar un cuatrimestre falso que la SPA adopta por convención | Datos inventados servidos como oficiales |
| A12 | Symlinks, submódulos, LFS, colisión de mayúsculas en rutas | Escape del allowlist de rutas |
| A13 | Trojan Source: bidi overrides y homoglifos en códigos | El diff dice una cosa y el archivo otra |
| A14 | PII o material con copyright que queda inmutable en el historial público | No se puede borrar; un DMCA baja el repo entero |

A2 es la primera que hay que matar, porque hace irrelevantes a todas las demás — y se mata
con CODEOWNERS, en la Fase 0, no con código.

### Las capas, de barata a cara

Cada una asume que pasó la anterior, y ninguna capa cara toca datos que una barata podría
haber rechazado.

**C1 — Triage (~2 s, sin instalar nada).** Clasificación por ruta *y por modo de git*:
rechazar symlinks, submódulos, punteros LFS, cambios en `.gitattributes`, y rutas que
colisionen en minúsculas. Solo se acepta como clase `DATOS` lo que matchee exactamente el
patrón de rutas permitidas; todo lo demás se etiqueta `necesita-humano` y corta. Techos
duros de tamaño y de profundidad de anidamiento; claves duplicadas son error; sin
caracteres de control ni bidi overrides; campos clave (`codigo`, `dia`, `sede`, `aulas`)
restringidos a ASCII; claves `__proto__`/`constructor`/`prototype` prohibidas en cualquier
nivel. Regex de mail, teléfono y legajo → error duro. Forma canónica byte a byte.

**C2 — JSON Schema (~2 s).** Schemas en **draft-07** validados con `fastjsonschema`
(Python puro, vendorizado como wheel): el job instala desde `vendor/` con `--no-index`, sin
red. *(Ajuste del Sprint 1, gap G-03: la idea original de validadores precompilados y un job
que los recompile venía del mundo Ajv; en Python el schema es el artefacto y no hace falta.)*

**C3 — Invariantes (~2 s).** Grafo de correlativas **acíclico** (un ciclo cuelga al
planificador: es "tirar todo abajo" en su forma literal). Todo código de horarios existe en
un plan o en `no-plan.json`. `desde < hasta`, duración razonable, dentro del rango horario.
**Colisión de aula**: dos cursos distintos no pueden estar en la misma sede, aula, día,
franja y fecha — excluyendo bloques no presenciales, aulas sin asignar y grupos declarados
en `dictado_conjunto`. **Colisión de docente: warning, nunca error** (los homónimos y los
titulares nominales en varias comisiones son reales). `inscriptos == capacidad` es válido;
`inscriptos > capacidad` es warning, porque el sobrecupo existe. Unicidad solo por `codigo`
y `(codigo, comision)`, **nunca por nombre**.

**C4 — Diff semántico y magnitud del cambio (~3 s).** Comparación entidad por entidad
contra la base, no textual. Cada campo tiene un nivel de riesgo: bajo (docentes, ocupación,
catálogo), medio (día, horas, sede, modalidad, aulas, altas), alto (código, créditos,
correlativas, **cualquier baja**, cualquier cambio en `planes/`).

El **presupuesto acumulado de siete días** contra A8 no necesita ninguna base de datos: se
deriva de *trailers* que el bot escribe en cada commit squash, y `git log --since=7.days`
lo reconstruye. El rastro de auditoría *es* el estado.

Además, **deriva de vocabulario**: si más del 5 % de las aulas del archivo no existen en la
base, warning y escalamiento — detecta que el scraper cambió de nomenclatura.

**C5 — Corroboración con Ocupación de Aulas (~5 s, offline).** Es la capa con más valor y
la que hay que diseñar con más honestidad.

- **Dirección única: los datos declarados deben aparecer ocupados en la grilla. Nunca al
  revés**, porque la grilla incluye otras carreras y eventos.
- **La evidencia corrobora existencia, jamás ausencia.** Una baja nunca recibe crédito de
  evidencia: si no, bastaría con enviar una grilla vacía para justificar borrados.
- **Prueba de coherencia**: la grilla enviada tiene que corroborar al menos el 95 % de los
  bloques que *ya están en `main`* para esas fechas. Detecta capturas viejas, de otra sede o
  mal parseadas.
- **Feriados sin calendario de feriados**: si una fecha tiene menos del 20 % de la ocupación
  mediana del lote, se descarta entera. Un `feriados.json` se pudre en tres años.
- **Umbral, no perfección**: cobertura ≥ 95 %; los bloques no corroborados solo bloquean si
  están entre los que el PR toca.
- **Muestreo consciente de fechas**: al menos dos fechas dentro del período propio de cada
  bloque, para no gritar "no corroborado" sobre una materia de período corto.

**Qué compra y qué no.** Contra errores honestos es casi perfecto: es una fuente distinta,
generada por otro sistema. Contra un atacante decidido **no prueba nada**, porque los datos
de `main` son públicos y puede sintetizar una grilla coherente con su propia mentira. Lo
que sí hace es obligarlo a producir dos artefactos consistentes entre sí y dejar uno
**falsable**: cualquiera con credenciales puede recapturar y refutarlo. No hay que
venderlo como más de lo que es.

El reemplazo real de la revisión experta para carga masiva es la **replicación
independiente**: dos capturas de cuentas distintas cuyo hash canónico coincide. Esto es
posible precisamente por la separación `cupo` / `ocupacion` de la Fase 1 — si `inscriptos`
entrara al hash, dos scrapeos separados por cinco minutos nunca coincidirían.

Si la evidencia falta, el PR **no falla**: baja la confianza, y menos confianza **reduce**
el tamaño de cambio permitido, nunca lo amplía. Si la pantalla desaparece en 2030, se
cambia un interruptor en `politica.json`, bajo CODEOWNERS.

### Los workflows

**`pr-datos.yml` — el gate autoritativo.** Dos jobs con permisos distintos:

- `validar-datos`, con **`permissions: {}`** — token sin ningún alcance. Hace checkout del
  código de la **rama base**, trae los archivos del PR a un directorio en cuarentena y corre
  el validador. Es el único job que toca bytes hostiles, y no puede hacer nada con ellos.
- `decidir`, con permiso de escritura solo sobre pull requests. **Nunca abre un archivo del
  PR**: re-pide la lista de archivos a la API y reaplica el allowlist de rutas por su
  cuenta. Aborta si el SHA del PR cambió desde que se validó. Trata cualquier conclusión que
  no sea éxito —incluido `skipped` y `cancelled`— como falla. Y **habilita auto-merge, no
  mergea**, para que la protección de rama siga siendo la última línea aunque este job tenga
  un bug.

El disparador es `pull_request_target`, no `pull_request`. Es contraintuitivo y vale la pena
explicarlo, porque el instinto es al revés:

> Con `pull_request`, el archivo de workflow que corre **sale del PR**: un atacante lo
> reescribe como un `exit 0` con el mismo nombre de job y el check requerido queda verde.
> Con `pull_request_target`, el workflow y el validador salen **siempre de la rama base** y
> el PR no puede tocarlos. El precio habitual de `pull_request_target` es el token de
> escritura, y ese precio se paga poniendo `permissions: {}` en el job que toca los bytes.
> Como además no hay ningún secreto en el repositorio, no queda nada que robar.

**`ci-codigo.yml`** — con `pull_request`, que acá sí es lo correcto: corre el código del PR
para los tests, en un sandbox de solo lectura y sin secretos. Es donde vive la suite que
congela los casos reales.

**`sugerencia-a-pr.yml`** — el camino más peligroso, detallado en la Fase 5.

**`deploy.yml`** — revalida `main` completo, corre un smoke test que carga los datos reales
y calcula tres cursadas de prueba, construye y publica por OIDC. **Si la validación falla no
hay deploy, y Pages sigue sirviendo el último deploy exitoso.** Ese es el rollback
automático y sale gratis: un merge malo por un bug del gate no llega a producción.

**`centinela.yml`** — diario: revalida `main` desde cero (atrapa el caso "dos PRs válidos
por separado, inválidos juntos") y audita que todo commit reciente sobre rutas de CODEOWNERS
haya tenido revisión de un code owner humano. Si algo falla, abre un issue en vez de dejar
que todo se congele en silencio.

Sobre los workflows corre además un puñado de guardarraíles de treinta líneas: que todos
declaren `permissions` explícito, que ningún `run:` interpole `${{ github.event.* }}`, que
ninguna acción de terceros esté sin fijar a un SHA, que no haya referencias a secretos.

### La política de auto-merge

Se mergea solo si se cumple **todo**: clase `DATOS` pura verificada contra la API,
validación en éxito, forma canónica, cero errores en C1–C3, magnitud dentro de los límites,
presupuesto semanal disponible, confianza de evidencia suficiente para el riesgo del cambio,
sin etiquetas de espera, y el SHA sin cambiar.

| Tipo de cambio | Auto-merge si | Justificación |
|---|---|---|
| **Corrección puntual de horarios** | ≤ 5 cursos, ≤ 40 bloques, **0 cursos dados de baja** | 5 sobre 472 es el 1 %. Una corrección real toca uno; cinco permite un lote del mismo día sin abrir cinco PRs |
| **Carga masiva, archivo nuevo** | Cantidad de cursos dentro de ±30 % de la mediana histórica; ≥ 95 % de bloques corroborados; ventana de espera de 7 días, o 24 h si hay una segunda captura independiente con hash coincidente | Ocurre dos veces por año: una ventana de una semana no cuesta nada y da tiempo a que alguien mire |
| **Reemplazo de un archivo existente** | Nunca automático si cambia más del 20 % de los cursos | Durante el cuatrimestre, un cambio así es indistinguible de un scraper roto |
| **Catálogo** | ≤ 5 archivos | Sin fuente de corroboración, pero el daño es acotado: no afecta la planificación |
| **Plan de estudios** | **Nunca.** CODEOWNERS obligatorio | Cambia una o dos veces por década y afecta la carrera de todos. Exigir un humano cada cinco años cuesta cero |
| **Presupuesto de 7 días** | ≤ 30 cursos en total, ≤ 10 por autor | Convierte el goteo de "sin límite" a "6 % por semana con rastro público" |

Cuando escala, "humano" **no significa experto**: significa alguien con permiso de merge y
sin contexto. Para que eso funcione, el bot deja el trabajo hecho: una tabla legible del
diff semántico (nunca JSON crudo), una lista de tres verificaciones concretas *("abrí la
pantalla de Comisiones de 93.18, confirmá que la comisión K va los lunes 08:00 en el aula
202R")*, y el enlace a la fuente oficial.

### Los falsos positivos son el riesgo real

A10 —que alguien se canse y desactive las defensas— es la amenaza más probable a cinco años,
y los falsos positivos son cómo llega. Los siete casos raros reales van como fixtures en
`tests/fixtures/deben-pasar/`, y la regla de proceso es que **cada falso positivo que
aparezca se agrega como fixture permanente en el mismo PR que ajusta el chequeo**. Ese
directorio está bajo CODEOWNERS para que no se pueda achicar.

Dos falsos positivos que el diseño genera a propósito y hay que amortiguar:

- **Forma canónica**: dispara en todos los PRs hechos a mano. El error trae el parche
  aplicable en el comentario, y un comando `/formatear` lo arregla desde la rama base.
- **Campo desconocido**: dispara el día que el ITBA agregue un campo. Lleva una etiqueta
  propia y un mensaje que dice explícitamente que probablemente sea legítimo.

### Edición puntual (§4.4)

`cuatris editar horario --periodo 2026-2C --codigo 93.18 --comision A`

Carga el archivo, aplica el cambio, reserializa canónicamente y deja un diff de pocas
líneas — que es justamente lo que hace que ese PR califique para auto-merge.

### Nota sobre el lenguaje

El diseño de validación pide **cero dependencias y cero red en el gate**, porque instalar
paquetes en el job que valida es exactamente el vector A15. La solución más común para eso
es compilar los schemas con Ajv y commitear el JavaScript resultante.

Elijo no hacerlo: dos lenguajes en un proyecto que tiene que mantener gente sin contexto es
un costo permanente mayor que el beneficio. En su lugar, **las dependencias de Python van
vendorizadas como wheels en `vendor/`** y el CI instala con `--no-index`. Misma propiedad —
sin red, sin resolución de dependencias, reproducible— en un solo lenguaje. `vendor/` va
bajo CODEOWNERS.

---

## Fase 5 — Sugerencias desde la página (§6)

La SPA no puede abrir un PR: es estática y no puede tener un token. El camino es un Issue
prellenado, y es **la superficie más peligrosa del proyecto**, porque abrir un issue no
requiere fork ni permisos: es la barrera de entrada más baja de los tres caminos.

1. En la página, el usuario corrige un dato en un formulario que ya conoce la forma del
   contrato, así que la sugerencia nace bien tipada.
2. La página abre `issues/new?template=sugerencia.yml&…` con los campos cargados.
3. Un workflow parsea el bloque, lo aplica y abre **el mismo tipo de PR** que una corrección
   manual, con la misma validación.

Tres reglas lo hacen seguro:

- **El payload es una intención, nunca un diff.** Se valida contra un vocabulario acotado de
  operaciones (`mover_bloque`, `corregir_aula`, `corregir_docente`, `campo_catalogo`), y el
  bot **recompone el archivo canónicamente desde la base más la operación**. Nunca escribe
  contenido crudo del issue en un archivo, y nunca usa un string del issue como ruta: la
  ruta se deriva de un código que matcheó la regex estricta *y* cuyo archivo ya existe.
- **Nada de interpolación**: el contenido del issue llega solo por variables de entorno,
  jamás dentro de un `run:`.
- **El PR del bot no goza de confianza especial**: pasa por el mismo gate. Con límite de
  cinco por autor por día.

Si el bloque no parsea o el cambio no valida, el workflow comenta en el Issue explicando qué
está mal y **no abre PR**.

**Trampa a documentar en mayúsculas dentro del propio workflow:** un PR creado con el token
de Actions **no dispara** workflows de `pull_request`. Sin resolverlo, el PR del bot queda
sin checks para siempre y, con protección de rama, imposible de mergear. La salida es
disparar la validación explícitamente sobre ese SHA desde el mismo workflow. La alternativa
—un token personal— queda descartada: caduca al año y mata la autonomía.

---

## Fase 6 — Log, rollback y consolidación (§7)

### El log

`data/CHANGELOG.jsonl`, append-only, una línea por PR de datos mergeado: número, sha, fecha,
archivos, registros afectados, procedencia y autor.

El historial de git ya es un log, pero uno materializado hace que "¿cómo estaban los datos
el 1 de agosto?" sea una lectura de archivo en vez de un recorrido de historia.

### Las herramientas de admin

```
cuatris historia ver --hasta 2026-08-01          # qué había en esa fecha
cuatris historia revertir --pr 123               # deshace un PR puntual, revalidando
cuatris historia consolidar --desde X --hasta Y  # colapsa un rango a un estado revisado
```

Todas trabajan **hacia adelante**: generan un commit nuevo que restaura el estado, nunca
reescriben la historia. En un repositorio público con forks, reescribir historia rompe a
todo el mundo.

`revertir` no es un `git revert` a ciegas: reconstruye el estado de los registros afectados
y lo vuelve a validar, para que deshacer un PR malo no introduzca uno peor.

Acceso restringido por CODEOWNERS. Se documenta en `docs/runbook.md`, junto con el
procedimiento de romper el vidrio: qué hacer si el CI se rompió y hay que mergear igual.

---

## Verificación

- **Abreviaciones**: el CSV exportado y reimportado sin cambios deja el JSON idéntico;
  las 163 materias tienen abreviación y ninguna queda vacía tras la importación.
- **Contrato**: los schemas validan los ejemplos, y una batería de casos negativos comprueba
  que rechacen lo que deben (día domingo —`sabado` es válido, ver gap G-04—, hora fuera de
  rango, código mal formado, correlativa inexistente, ciclo de correlativas).
- **Parser de PDFs**: golden files para los 6 PDFs. Un PDF deliberadamente roto tiene que
  hacerlo fallar, no producir un JSON incompleto.
- **Scraper**: tests contra los HTML del corpus, sin red. El fixture de Álgebra Lineal tiene
  que producir **9 comisiones y 31 bloques**, con la comisión B en dos aulas el miércoles.
- **Validadores**: para cada regla, un caso que pasa y uno que falla. Y explícitamente, **los
  siete casos raros reales tienen que pasar**: son la prueba de que no hay falsos positivos.
- **Blindaje**: un PR de prueba que intente tocar `tools/` tiene que ser rechazado; uno que
  borre el 30 % de los cursos tiene que escalar; uno con un nombre de materia que contenga
  HTML tiene que ser rechazado.
- **Extremo a extremo**: correr el scraper contra el SGA real una vez, generar el PR,
  verificar que el CI lo apruebe y que la SPA levante los datos.
- **Rollback**: mergear un PR malo a propósito en una rama, revertirlo con la herramienta y
  comprobar que los datos vuelven exactamente al estado anterior.

## Fuera de alcance

- La SPA (`app/`): la diseña Claude Design y se planifica en §9.
- Datos de carreras distintas de Ingeniería en Informática. El contrato soporta varias desde
  el día uno y los horarios que baja el scraper son de todas, pero el único plan cargado es
  S10-Rev23.
- Cualquier servicio con estado propio. Si algo necesita un servidor, no entra.

## Reconciliación de las dos fuentes del plan — resuelto

Las dos fuentes parecían contradecirse: `Plan S10-Rev23.xlsx` lista 85 electivas y la página
del SGA lista 120. **No se contradicen: el Excel es un subconjunto estricto del SGA.** Lo
verifiqué código por código — las 129 entradas del Excel (44 obligatorias más 85 electivas)
están todas en las 163 del SGA, sin una sola excepción.

La lectura es que el SGA arrastra el histórico —incluidas materias descontinuadas— y el
Excel es el recorte vigente para Informática. De ahí sale la regla:

- **`planes/S10-Rev23.json` carga las 163**, para que un plan viejo siga resolviendo.
- Cada materia lleva un booleano **`vigente`**, verdadero para las 129 del Excel.
- La SPA ofrece por defecto solo las vigentes, y muestra las otras únicamente si el
  estudiante ya las tiene aprobadas.

Ese mismo campo es el que desempata las abreviaciones en conflicto.

Queda un detalle menor: el archivo del ITBA trae "Arqitectura de Software" con un error de
tipeo en el nombre de la orientación. Se normaliza en la carga y se documenta.
