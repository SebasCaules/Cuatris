# U3.5 — `FichaMateria` (13e) y `MotivosBloqueo` (13f)

## Ownership

- `app/src/componentes/FichaMateria/**`, `app/src/componentes/MotivosBloqueo/**`,
  `app/src/paginas/PaginaMateria/**` (código, CSS, tests)
- No toques `App.tsx`: exporta `PaginaMateria` (lee el código de la ruta `#/materia/<codigo>`
  con `useRuta`).

## Lee

- `CLAUDE.md`; mockups `#13e` y `#13f` de `etapa3-mockup-v2.dc.html`;
  `entregables/05-plan-sprints.md` §2 (filas 13e, 13f) y §3 (huecos: «Mover a otro
  cuatrimestre» es de Sprint 2: deja el botón deshabilitado con `title`).
- Código real: `app/src/motor/` (`estadoMateria`, `motivosBloqueo`, `seDestrabaEn`,
  `habilita`, `creditosAlEmpezar`), `app/src/estado/`, `app/src/datos/` (abreviaciones,
  horarios del período), `primitivas`.

## Entregables

1. **`FichaMateria`** (`props`: `codigo`, `periodo?`): cabecera «72.41 · Base de Datos II»
   y línea mono «Sistemas Digitales y Datos · 6 créditos · troncal · 1.º 2026»
   (departamento del archivo de horarios si existe; si no, se omite; «troncal» =
   `ciclo != electiva`); chips de estado (● Cursando / ◇ Planificada / ✓ Aprobada / ○
   Disponible / ⊘ Bloqueada, «Comisión B», «◐ cupo 40 / 45»); columnas **CORRELATIVAS** (cada
   una con ✓ aprobada / ◇ planificada en X / ⊘ falta) y **HABILITA** (`habilita`), y a la
   derecha **HORARIO · COMISIÓN B** (bloques con barra del color de la materia: «Martes
   10:00–12:00 / 003T · SDT · Presencial») y **DOCENTES**. Pie con Boton primario «Cambiar de
   comisión» (abre `ModalComisiones` de U3.4 vía callback `alCambiarComision`), «Mover a otro
   cuatrimestre» (deshabilitado, `title="Llega en el Sprint 2"`), «Sugerir corrección»
   (deshabilitado, `title="Llega en el Sprint 3"`) y «Quitar del plan» (terciario, con
   confirmación en línea «¿Quitar 72.41 de 1.º 2026? Sí · No»).
2. **`MotivosBloqueo`** (13f) cuando `estadoMateria` es `bloqueada` para el período: tarjeta
   rayada «72.45 · Proyecto Final · ⊘ Bloqueada para 1.º 2026», **POR QUÉ** con una fila por
   motivo (⊘ «Requiere 160 créditos aprobados — tenés 147 al empezar», ⊘ «Correlativa 72.41
   Base de Datos II — la cursás en 1.º 2026», ✓ «Correlativa 72.11 Prog. Imperativa —
   aprobada»), y la caja verde «Se destraba en 2.º 2027 · Con lo que ya está en el plan llegás
   a N créditos y 72.41 queda aprobada.» con Boton «Planificar en 2.º 2027» que llama
   `agregarMateria(periodoDestrabe, codigo)` y navega a `#/plan` (el carrusel se mueve por el
   estado `periodoSeleccionado` que ya existe o que agregas en `notes` como pedido al
   orquestador). Si `seDestrabaEn` devuelve `null`: «No se destraba con lo planificado hasta
   ahora».
3. **`PaginaMateria`**: envuelve la ficha (y el bloqueo si corresponde) con un enlace «← Plan».
4. **Tests** con el plan real: 72.41 muestra 72.37 y 72.11 como correlativas y 72.45 / 72.20
   en «Habilita»; con una historia de 147 créditos, 72.45 muestra los motivos de 13f; «Quitar
   del plan» pide confirmación y luego quita del estado; el horario de la comisión elegida se
   lista con sede y modalidad.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- Compara contra `#13e` y `#13f` y anota diferencias en `notes`.
