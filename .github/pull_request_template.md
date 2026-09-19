<!-- Esta plantilla es para quien abre el PR. Borrá lo que no aplique. -->

## Qué cambia

<!-- Una línea. Si es una corrección de horarios: período, código y comisión. -->

## De dónde sale el dato

<!--
Obligatorio para cualquier cambio en data/plan/. El único origen válido es el SGA o el
material oficial de la universidad: la pantalla de Comisiones, el plan de estudios, la
planilla de finales. Un dato sin fuente no entra, aunque sea correcto.
-->

## Comprobaciones

- [ ] `npm run datos:validar` pasa sin errores (los avisos no bloquean).
- [ ] El PR toca **solo** archivos de datos (`data/plan/horarios/`, `carreras.json`,
      `carreras/`, `sga-carreras/`, `finales-*.csv`): así el bot lo mergea solo. Si toca otra
      cosa, más abajo explico por qué.

<!--
Qué pasa después: el bot valida, comenta y etiqueta. Una corrección chica se mergea sola en
minutos; un cuatrimestre, un plan o una planilla nuevos esperan 72 h por si alguien objeta.
Todo lo demás lo revisa una persona. Detalle en CONTRIBUTING.md.
-->
