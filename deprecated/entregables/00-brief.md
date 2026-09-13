<!-- Pedido original del proyecto, tal como lo escribió el autor (2026-09-09). Se conserva
     textual como fuente de requisitos; las decisiones posteriores están en los demás
     entregables y en CLAUDE.md. -->

# Proyecto: Planificador de cursada (ITBA)

## Contexto para vos, Claude
Este es el brief inicial. No hay código todavía. Tu trabajo en esta sesión es
**planificar y construir**, no diseñar la UI: el diseño visual lo hace Claude Design
en paralelo (ver §8). Trabajá en español.

---

## 0. PRIMER PASO — material raw (bloqueante)
**Antes de escribir una sola línea de código o de plan**, hacé esto y frená:

1. Creá la estructura de carpetas donde voy a dejarte todo el material crudo que
   necesitás para arrancar. Definí vos los nombres exactos, pero como mínimo tiene que
   haber un lugar claro para:
   - **Los PDFs de materias del ITBA** (formato estándar, troncales y electivas) — de
     acá sale el scraper de §5.
   - **El material del SGA** (HTML guardado, exports, capturas de las pantallas de
     horarios) — de acá sale el instructivo de scraping de §4.
   - **El plan de estudios de la carrera** (materias, correlativas, créditos de
     electivas, cuatrimestre sugerido).
   - **Los horarios vigentes** en el formato en que existan hoy (Excel, PDF, capturas).
   - **Referencias** opcionales que quiera pasarte (páginas similares, capturas, notas).

2. Dejá en cada carpeta un `README.md` de pocas líneas diciendo qué va adentro y en qué
   formato lo preferís.

3. Escribime en el chat, **breve y claro, una línea por carpeta**, qué tengo que poner en
   cada una. Nada de párrafos largos.

4. **Esperá.** No avances con §1–§9 hasta que yo te confirme explícitamente que ya cargué
   todo el material. Si cuando vuelvo falta algo, decímelo y seguí esperando.

**No subas credenciales del SGA a ninguna carpeta**, y no me las pidas: si el scraping
necesita sesión autenticada, el instructivo debe explicar cómo la obtengo yo.

---

## 1. Objetivo
Una página para **planificar varios cuatrimestres de una carrera**. El usuario acomoda
materias troncales y electivas en los cuatrimestres futuros de la forma que le parezca
más óptima, y visualiza cómo le queda la cursada dentro de la enorme cantidad de
combinaciones posibles (correlativas, horarios que chocan, carga por cuatrimestre).
El valor central es **organizarse hacia el futuro**, no solo ver el cuatrimestre actual.

## 2. Stack y hosting
- **SPA en React**, hosteada en **GitHub Pages** (sitio estático, sin servidor propio).
- Consecuencia importante: lo que llamo "backend" en este brief **no es un servidor**.
  Es la capa de datos versionada en el repo + la automatización de GitHub Actions +
  las herramientas de CLI (Python) que la mantienen. Diseñá todo asumiendo que el
  runtime del usuario es solo el navegador leyendo JSONs estáticos.

## 3. Contrato de datos (primera entrega técnica)
Definí un **contrato estándar y versionado para los horarios de materias**. Los horarios
cambian cada cuatrimestre y hay que actualizarlos, así que el contrato tiene que:
- Ser explícito y documentado (schema formal: JSON Schema o equivalente).
- Estar versionado, para que un cambio de forma no rompa los datos viejos ni la página.
- Cubrir tanto materias troncales como electivas.
- Servir como la única fuente de verdad que consumen tanto la SPA como los validadores
  de CI.

## 4. Actualización de horarios (scraping del SGA)
1. **Instructivo bien claro** de cómo scrapear la página del SGA para obtener **todos
   los horarios de todas las materias**. Tiene que poder seguirlo alguien que llega al
   proyecto dentro de varios años sin contexto previo.
2. Con los datos ya en el formato del contrato, **cualquier usuario debe poder abrir un
   PR** y que se corran **automáticamente todos los chequeos pertinentes** para
   actualizar los horarios.
3. Este es un sistema pensado como **legacy que sobreviva muchos años**: los PRs deben
   ser **completamente autónomos y sólidos**. Un PR maligno o mal hecho **no puede
   tirar todo abajo**. Pensá en validación de schema, chequeos de integridad y
   consistencia, límites de cambio razonables, y todo lo que haga falta para que el
   merge sea seguro sin revisión humana experta.
4. Además de la carga masiva, tiene que ser posible **modificar una sola materia o unas
   pocas**, para cuando cambian horarios puntuales o hay algún caso particular.

## 5. Información de las materias (PDFs → JSON)
El ITBA publica un **PDF con formato estándar por cada materia**, sea electiva o
troncal. Los PDFs de ejemplo te los dejo en la carpeta de §0.
- Analizá el formato a partir de esos ejemplos.
- Armá un **scraper de PDFs en Python** que los convierta en **JSONs específicos**.
- Esos JSONs son los que la página usa para mostrar toda la información particular de
  cada materia.

## 6. Sugerencias de cambios desde la página
Para las dos features anteriores (horarios e información de materias), la página debe
tener un **apartado donde cualquier usuario sugiera cambios de forma interactiva** —
un horario corregido, un dato equivocado de la materia.
Esa información se procesa **automáticamente** y genera **exactamente el mismo tipo de
PR** definido en §4, con esos cambios. No un canal paralelo: el mismo camino, la misma
validación.

## 7. Log de PRs, rollback y consolidación
- **Todos los PRs quedan registrados en un log** que permita volver los datos de la
  página a un **punto temporal X**.
- Construí una **herramienta** que pueda **volver atrás y consolidar todo en ese punto**,
  para que un admin (yo) pueda **subsanar PRs malos o incompletos**.

## 8. Diseño — entregable: un prompt para Claude Design
El diseño lo hace **Claude Design**, no vos. Lo que necesito de vos es un
**prompt completo** para pasarle, que:
- Le explique la idea del proyecto lo suficiente como para devolver un
  **UI mockup completo, solo el layout**.
- Le indique trabajar **guiándome por pasos, como una agencia de diseño gráfico**:
  1. Primero proponer **varias paletas de colores** y **esperar mi OK** antes de seguir.
  2. Después proponer el widget que considere fundamental (por ejemplo el calendario),
     con **muchísimas versiones** — distintos diseños, formatos, de todo — **hasta que
     yo elija una**.
  3. Recién ahí determinar qué falta y completar el **UI mockup completo**.
- El prompt debe dejar claro que en cada etapa se detiene y espera mi aprobación.

## 9. Trabajo en paralelo y entregables
- **Mientras yo completo el armado del diseño con Claude Design**, vos armás
  **el plan de implementación completo del backend** (§2–§7).
- Cuando llegue la devolución de Claude Design, armás el **plan de integración
  fullstack en formato sprints**, con el **sprint 1 = MVP**.

### Orden esperado
0. Carpetas de material raw + guía breve de qué va en cada una → **frenar y esperar**.
1. Prompt para Claude Design (§8) — lo necesito primero para arrancar el diseño en
   paralelo.
2. Contrato de datos (§3).
3. Plan de implementación del backend completo (§4–§7).
4. Plan de integración fullstack en sprints, sprint 1 = MVP (§9) — después del diseño.
