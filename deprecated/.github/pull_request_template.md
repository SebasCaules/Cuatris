<!-- Esta plantilla es para quien abre el PR. Borre lo que no aplique. -->

## Qué cambia

<!-- Una línea. Si es una corrección de horarios, diga el período, el código y la comisión. -->

## De dónde sale el dato

<!--
Obligatorio para cualquier cambio en `data/`. El único origen válido es el SGA o el material
oficial de la carrera: enlace a la pantalla de Comisiones, captura, o el PDF de la materia.
Un dato sin fuente no entra, aunque sea correcto.
-->

## Comprobaciones

- [ ] `cuatris fmt --check` pasa sobre los archivos que toco (forma canónica del contrato).
- [ ] `cuatris validar` pasa sobre esos archivos.
- [ ] El PR toca **solo** archivos de datos, o explica más abajo por qué toca otra cosa.
- [ ] Si corrijo un falso positivo de algún validador, agrego el caso como fixture permanente
      en `tests/fixtures/deben-pasar/` **en este mismo PR**.

## Notas para quien revise

<!--
Si el cambio no es evidente, deje acá las dos o tres verificaciones concretas que alcanzan
para aprobarlo, por ejemplo: «abrir la pantalla de Comisiones de 93.18 y confirmar que la
comisión K va los lunes 08:00 en el aula 202R».
-->
