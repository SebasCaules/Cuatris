# Prompt para Claude Design (§8)

**Cómo usar esto:** abre una sesión nueva de Claude Design y pega todo lo que está debajo
de la línea. Está escrito para que Claude Design se detenga en tres etapas y no avance sin
tu aprobación explícita. Si en la etapa 1 o 2 avanza solo, respóndele "detente, vuelve a la
etapa N" — el prompt ya lo autoriza a ser corregido así.

**Antes de pegarlo**, si quieres, agrega al final la sección opcional de referencias
visuales (está marcada como tal). Sin eso funciona igual.

---

Eres el equipo de diseño de este proyecto. Trabajas como una agencia de diseño gráfico:
presentas opciones, esperas la aprobación del cliente y recién después avanzas a la etapa
siguiente. El cliente soy yo. Trabajamos en español.

Tu entregable final es un **mockup de UI completo, solo layout**. No escribas código de
aplicación, no armes un design system documentado, no propongas arquitectura de
componentes. Layout, jerarquía visual, disposición y estados. Nada más.

# 1. Qué estamos construyendo

Una página para **planificar varios cuatrimestres de una carrera de ingeniería** en el
ITBA (Buenos Aires). El usuario es un estudiante que quiere acomodar las materias que le
faltan —troncales y electivas— a lo largo de los cuatrimestres que le quedan, de la forma
que le resulte más conveniente.

El valor central es **organizarse hacia el futuro**. No es un visor del cuatrimestre
actual: es una herramienta para decidir qué curso ahora, qué dejo para el año que viene, y
si ese orden cierra.

El problema real que resuelve es combinatorio. Un estudiante a mitad de carrera tiene entre
15 y 25 materias por delante, cada una con correlativas que la habilitan o la bloquean,
cada una dictada en horarios que pueden chocar entre sí, y un límite práctico de cuánta
carga aguanta por cuatrimestre. La cantidad de combinaciones válidas es enorme y hoy la
gente la resuelve con una planilla o con un papel.

# 2. Con qué datos reales se diseña

Usa estos datos en el mockup. Son reales, salidos del sistema académico del ITBA. **No uses
lorem ipsum ni nombres inventados**: un mockup con datos reales revela problemas de layout
que uno con texto de relleno esconde.

## Materias

Cada materia tiene código y nombre: `93.18 - Álgebra Lineal`, `72.44 - Criptografía y
Seguridad`, `72.41 - Base de Datos II`, `30.28 - Accionamientos Industriales`,
`72.75 - Aprendizaje Automático (Machine Learning)`, `61.27 - Análisis de Coyuntura
Económica`, `15.09 - Agile, Lean y Lean Six Sigma`.

Los nombres van de 8 a 55 caracteres. Los largos son frecuentes, no la excepción:
`Autómatas, Teoría de Lenguajes y Compiladores`, `Análisis de series de tiempo con
Inteligencia Artificial`, `Análisis funcional de aplicaciones informáticas`. El layout
tiene que sobrevivirlos.

Cada materia tiene además créditos (1, 3, 6, 9 o 12), un departamento
(`Sistemas Digitales y Datos`, `Ciencias Exactas y Naturales`, `Economía y Negocios`,
`Ambiente y Movilidad`, `Sistemas Complejos y Energía`, `Ciencias de la Vida`) y
correlativas, que son una lista de códigos: `72.41` requiere `72.37` y `72.11`.

## Comisiones y horarios

Una materia se dicta en una o varias comisiones, y cada comisión tiene varios bloques
semanales. Este es el caso pesado real, `93.18 - Álgebra Lineal`, que tiene **nueve
comisiones**:

```
Comisión A   Lunes     14:00–16:00   Aula 001R · Sede Rectorado · Presencial
             Miércoles 14:00–16:00   Aula 201T · SDT · Presencial
             Jueves    14:00–16:00   Aula 203R · Sede Rectorado · Presencial
             Docentes: Cabana, Adriana Elena · Peña, Nelly Haydee
             Cupo: 48 / 48

Comisión B   Lunes     12:00–14:00   Aula 007R · Sede Rectorado · Presencial
             Miércoles 10:00–12:00   Aula 003T · SDT · Presencial
             Miércoles 10:00–12:00   Aula 004T · SDT · Presencial
             Jueves    12:00–14:00   Aula 203R · Sede Rectorado · Presencial
             Cupo: 48 / 49
```

Observa dos cosas de la comisión B: se dicta **en dos aulas al mismo tiempo** el miércoles,
y la comisión A **cambia de sede** entre el lunes y el miércoles. Las comisiones se llaman
A, B, C, D, E, F, G, H y **K** — las letras no son contiguas.

Otros casos reales que el diseño tiene que poder mostrar:

```
72.44 - Criptografía y Seguridad
  Comisión S   Lunes 15:00–18:00 · Aula 002R · Sede Rectorado · Cupo 51 / 70

30.28 - Accionamientos Industriales
  Comisión A   Jueves  19:00–22:00 · Aula 003T · SDT · Blended
               Viernes 19:00–22:00 · Aula 101T · SDT · Presencial
               Cupo 3 / 24
```

Las modalidades son `Presencial`, `Blended` y `Virtual Sinc.`, y **pueden variar entre los
bloques de una misma comisión**, como en 30.28. Las sedes son `Sede Rectorado`, `SDT` y
`SDF`, y están a distancia real una de otra: dos bloques consecutivos en sedes distintas
son un problema para el estudiante, aunque no sean un choque de horario.

Las clases van de **08:00 a 21:00**, de lunes a viernes. No hay cursada de fin de semana.

## Créditos, títulos y orientaciones

La carrera de referencia es Ingeniería en Informática, plan S10-Rev23. El progreso se mide
en créditos acumulados y hay tres títulos escalonados:

| Título | Créditos |
|---|---|
| Analista en Tecnología Informática (intermedio) | 147 |
| Bachiller en Ingeniería (intermedio) | 192 |
| Ingeniero/a en Informática (principal) | 243 |

Además hay que sumar **27 créditos de electivas**, eligiéndolas de una lista de 120. Cuatro
orientaciones opcionales se obtienen concentrando electivas en un área: `Ciencia de Datos`,
`Imágenes y Realidad Virtual`, `Inteligencia Artificial` y `Arquitectura de Software`.

Algunas materias exigen un mínimo de créditos ya aprobados para poder cursarse, aparte de
las correlativas: `72.45 - Proyecto Final` pide 160 créditos, `72.20 - Redes de
Información` pide 171.

# 3. Los problemas de diseño a resolver

Esto es lo difícil del encargo. No los resuelvas todos ahora: son el criterio con el que
vamos a juzgar las propuestas.

**Dos escalas a la vez.** El usuario necesita ver la semana (¿me chocan los horarios?) y la
carrera entera (¿en qué orden pongo las materias de aquí a tres años?). Son dos vistas de
naturaleza distinta y las dos son centrales. Cómo conviven —pestañas, paneles, una contiene
a la otra, se alternan— es probablemente la decisión de layout más importante de todo el
proyecto.

**El futuro no tiene horarios.** Esto es clave y es lo que más se suele diseñar mal. El
sistema académico **solo publica los horarios del cuatrimestre vigente**. De los
cuatrimestres futuros se conoce el plan de estudios, las correlativas y los créditos, pero
**no existe el dato de qué día ni a qué hora se va a dictar cada materia**. Entonces el
cuatrimestre próximo se puede planificar con horarios reales, y los siguientes no. El
diseño tiene que mostrar honestamente esa diferencia, sin fingir precisión que no hay y sin
que el cuatrimestre de 2028 se vea como un error o como algo roto.

**Los estados de una materia.** Hay al menos seis y se tienen que distinguir de un vistazo:
aprobada, cursando ahora, planificada por el usuario en un cuatrimestre futuro, disponible
para cursar, bloqueada porque le faltan correlativas, y sin horario publicado todavía. No
alcanza con el color: el mockup tiene que funcionar para alguien que no distingue rojo de
verde.

**Elegir comisión.** Con nueve comisiones de Álgebra Lineal, cada una con tres o cuatro
bloques, elegir una reacomoda todo el calendario de la semana. El usuario necesita comparar
y decidir. Es un momento de interacción denso y merece su propia solución de layout.

**Los choques.** Dos bloques que se pisan es la señal más importante de toda la
herramienta. Tiene que ser imposible no verla. Y hay un caso intermedio que también
importa: bloques que no se pisan pero quedan pegados en sedes distintas.

**La densidad.** Un cuatrimestre típico son cinco a siete materias, con dos a cuatro
bloques cada una: hasta unos 25 bloques en una grilla de cinco días por trece horas. Y eso
es *un* cuatrimestre, cuando el usuario quiere ver varios.

**El cupo.** `48 / 48` significa que la comisión está llena. Es información que cambia
decisiones y hoy se pierde entre el resto.

# 4. Restricciones técnicas

- Aplicación web de una sola página, en React, servida como sitio estático. No hay
  servidor: el navegador lee archivos JSON. Todo lo que diseñes se resuelve del lado del
  cliente.
- Sin login ni cuentas de usuario. El plan del estudiante vive en su propio navegador.
- Interfaz en español.
- **Escritorio primero.** Es una herramienta de planificación: se usa sentado, con tiempo y
  con pantalla grande. Que funcione en celular está bien, pero no condiciona las decisiones
  de layout.
- Tiene que haber un lugar en la interfaz donde el usuario **sugiera una corrección** — un
  horario mal cargado, un dato equivocado de una materia. Es un flujo secundario pero
  existe y necesita su espacio en el mockup.

# 5. El proceso: tres etapas con aprobación

Trabajas en tres etapas. **Al final de cada una te detienes y esperas mi aprobación
explícita.** No avances porque te parezca que la respuesta es obvia, y no adelantes trabajo
de la etapa siguiente "por las dudas". Si te digo "vuelve a la etapa anterior", vuelves.

## Etapa 1 — Paletas de color

Preséntame **varias paletas** (entre cuatro y seis) para que elija una. De cada una quiero
ver:

- Las muestras de color con su rol asignado: fondo, superficie, texto, acento, y los
  colores de estado que este producto necesita (aprobada, planificada, bloqueada, choque).
- Una línea sobre el carácter que le da al producto y por qué encaja con una herramienta de
  planificación académica.
- Cómo se comporta en modo claro y en modo oscuro.
- Una muestra mínima aplicada: dos o tres bloques de horario en la paleta, para ver los
  colores haciendo el trabajo que van a hacer.

Ten en cuenta que este producto usa el color para codificar información, no solo para
decorar: una paleta que se vea bien pero no dé para seis estados distinguibles no sirve. Y
los estados tienen que ser distinguibles sin depender del color.

**Detente aquí y espera mi elección.** Puedo pedirte variantes de una paleta antes de
decidir.

## Etapa 2 — El widget fundamental

Elige tú cuál es el componente que define este producto y dime por qué. El candidato obvio
es el calendario semanal, pero si piensas que el corazón de la herramienta es otra cosa —el
tablero de cuatrimestres, el mapa de correlativas— argumenta y propón ese.

Sobre el que elijas, quiero **muchísimas versiones**. No cinco: apunta a doce o más, y que
sean genuinamente distintas entre sí, no la misma idea con otro borde. Varía el formato, no
los detalles. Algunas direcciones para separarlas de verdad:

- La orientación y la estructura: grilla clásica de días por horas, líneas de tiempo
  horizontales, columnas por día, vista de agenda en lista, formatos radiales o compactos.
- La unidad de la grilla: bloques de 30 minutos, de una hora, o proporcional a la duración
  real.
- La densidad: desde una versión muy compacta que muestre tres cuatrimestres a la vez hasta
  una expandida con docentes, aula, sede y cupo visibles.
- Qué información entra en un bloque y qué se esconde: hay materias con nombres de 55
  caracteres, muéstrame cómo las resuelves.
- Cómo se ve un choque, cómo se ve una comisión llena, cómo se ve un bloque sin horario
  conocido.
- Versiones que rompan el molde de la grilla semanal, si se te ocurre alguna que funcione.

Muéstramelas en un canvas donde las pueda comparar lado a lado, con un nombre corto cada
una.

**Detente aquí y espera que elija una.** Es muy probable que te pida iterar sobre dos o
tres antes de decidir, o que te pida cruzar el formato de una con la densidad de otra.

## Etapa 3 — El mockup completo

Recién ahora, con la paleta y el widget definidos, determina qué falta para que esto sea un
producto completo y arma el mockup de UI entero.

Tú defines el inventario de pantallas y regiones — es parte del encargo, no te lo voy a dar
hecho. Como mínimo tiene que quedar resuelto cómo el usuario ve su plan completo a lo largo
de los cuatrimestres, cómo busca y agrega una materia, cómo elige entre comisiones, cómo
consulta la información de una materia, cómo ve su progreso hacia los títulos y las
electivas, y cómo sugiere una corrección de datos.

Incluye los estados que no son el camino feliz: la primera vez que alguien entra y no tiene
nada cargado, un cuatrimestre futuro sin horarios disponibles, una materia bloqueada por
correlativas, un plan con choques sin resolver.

Entrégalo como artboards en un canvas, ordenados por flujo, con anotaciones breves donde
una decisión de layout necesite explicación.

# 6. Reglas del encargo

- Español en todo, incluida la interfaz del mockup.
- Solo layout. Sin código de aplicación, sin documentación de design system, sin
  arquitectura de componentes.
- Datos reales, los de la sección 2. Nada de relleno.
- En cada etapa, **presentas y esperas**. La aprobación es explícita o no existe.
- Si algo del encargo te resulta ambiguo y la respuesta cambiaría lo que diseñas,
  pregúntame antes de empezar la etapa. Si no cambia nada, elige tú y sigue.

Empieza por la etapa 1.

---

## Sección opcional: referencias visuales

Si quieres, agrega al final del prompt algo así:

> Como referencia, me gustan estas interfaces: [capturas o links, con una línea diciendo
> qué te gusta de cada una]. Hoy planifico con [planilla / papel / lo que uses] y lo que
> más me molesta es [...]. Mis restricciones reales de cursada son [no antes de las 10,
> trabajo martes y jueves, etc.].

Eso último —tus restricciones reales— vale bastante: hace que el mockup se diseñe alrededor
de un caso concreto en vez de uno genérico.
