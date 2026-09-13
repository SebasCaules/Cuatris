# U3.4 — `ModalComisiones` (13d: elegir comisión con vista previa)

## Ownership

- `app/src/componentes/ModalComisiones/**` (código, CSS, tests)

## Lee

- `CLAUDE.md`; mockup `#13d` de `etapa3-mockup-v2.dc.html`; `entregables/05-plan-sprints.md`
  §2 (fila 13d) y §3 (hallazgo 7: orden de comisiones).
- Código real: `app/src/motor/` (`ordenarComisiones`, `choques`, `cambiosDeSede`),
  `app/src/estado/` (`agregarMateria`, `elegirComision`, `asignarColor`),
  `app/src/componentes/GrillaSemanal` (vista previa) y `primitivas` (Modal, Boton, Etiqueta,
  Glifo).

## Entregables

1. **`ModalComisiones`** (`props`: `periodo`, `codigo`, `fijada?: codigo` —la otra materia
   del choque cuando se llega desde «Resolver»—, `alCerrar`): `Modal` de 1060 px con título
   «93.18 Álgebra Lineal · elegir comisión» y subtítulo mono «9 comisiones · ordenadas por
   compatibilidad con tu 1.º 2026».
2. **Lista** (izquierda): las comisiones ordenadas por `ordenarComisiones`; cada tarjeta con
   «Comisión A», cupo a la derecha (`◐ cupo 48 / 48` en ámbar si está llena), una línea por
   bloque en mono («Lun 14–16 · 001R Rectorado»), y la **línea de consecuencias**: «▲ choque
   lun 15–16 · ◐ llena», «✓ sin choques · ↕ 2 sedes», «✓ sin choques»; botón «Elegir» (o
   «Elegida», relleno ladrillo, si es la actual). Se muestran las 4 primeras; el resto
   colapsado en «D · E · F · G · H — 5 comisiones más» que se expande al clic.
3. **Vista previa** (derecha): «Tu 1.º 2026 con la comisión B» + línea de resultado
   («✓ el choque del lunes desaparece» / «▲ sigue el choque del lunes» / «✓ sin choques»)
   + `GrillaSemanal` **recalculada con la comisión bajo el cursor** (hover) o, sin hover, con
   la elegida o la primera. Si hay `fijada`, la línea de resultado se refiere a ella.
4. **Elegir**: `agregarMateria` si no estaba + `elegirComision`; asigna color si es nueva;
   cierra el modal. Elegir una llena está permitido (advertencia en la línea, no bloqueo).
5. **Sin comisiones publicadas**: mensaje y botón «Agregar sin comisión» (agrega sin elegir).
6. **Tests** con la fixture de casos raros (93.18 con 9 comisiones) y un `planUsuario` con
   72.44 com. S en el período: el orden pone antes las comisiones sin choque; la comisión A
   muestra «▲ choque lun 15–16 · ◐ llena»; el hover sobre B cambia la vista previa y la línea
   de resultado; «Elegir» actualiza el estado; el colapsado muestra «5 comisiones más» y se
   expande.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- Compara contra `#13d` con los datos reales y anota diferencias en `notes`.
