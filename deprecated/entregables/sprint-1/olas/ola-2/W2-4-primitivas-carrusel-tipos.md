# W2.4 — Primitivas de interfaz, carrusel y tipos generados de los schemas

## Ownership

- `app/src/componentes/primitivas/**` (Boton, Chip, Campo, Etiqueta, Modal, PanelLateral,
  Nota, Glifo), `app/src/componentes/Carrusel/**`, `app/src/componentes/BarraSuperior/**`
  (reemplaza la de la Ola 1), `app/src/componentes/Disposicion/**`
- `app/scripts/generar-tipos.mjs`, `app/src/contrato/generado/**`, `app/src/contrato/tipos.ts`
  (puedes reemplazar los tipos a mano por reexportaciones de los generados), y el script
  `tipos` en `app/package.json` (única línea de `package.json` que puedes tocar, además de
  `devDependencies` para `json-schema-to-typescript`).
- Tests de cada componente junto a él.

No toques `app/src/motor/**` (W2.3) ni `app/src/estado/**`, `app/src/datos/**` de la Ola 1.

## Lee

- `CLAUDE.md`; `entregables/04-diseno/tokens.md` entero; `entregables/04-diseno/README.md`
  para servir los mockups y mirar **13b, 13c, 13d y 13h** en `etapa3-mockup-v2.dc.html`
  (barra superior, carrusel, panel derecho, modal, chips y botones).
- `entregables/05-plan-sprints.md` §2 (fila 13b) y §4.
- El código de la Ola 1 en `app/src/` (tokens, estado, rutas, cascarón).

## Entregables

1. **Tipos generados (S-03)**: `npm run tipos` corre `json-schema-to-typescript` sobre
   `../schemas/v1/*.schema.json` y escribe `app/src/contrato/generado/*.ts`
   (`bannerComment` en español, `additionalProperties: false`); `tipos.ts` reexporta esos
   tipos con los nombres que ya usa la app (`Horarios`, `Plan`, …) y conserva `PlanUsuario`
   (que no viene de un schema). Un test compara que los tipos generados aceptan las fixtures
   de `data/v1/` y `app/src/datos/ejemplo/` (basta un test de typecheck con `satisfies`).
   `typecheck` y `build` deben correr `tipos` antes (`pre` scripts).
2. **Primitivas** con los tokens, sin estilos en línea: `Boton` (primario ladrillo,
   secundario contorno, terciario texto; tamaños del mockup), `Chip` (relleno, contorno,
   seleccionado; el chip de minor 14b: contorno gris fino con la sigla en mono), `Campo`
   (texto y búsqueda; borde 1.5 px al foco), `Etiqueta` (mono 8.5–9 px para códigos, horas
   y aulas), `Nota` (la caja punteada de «sin horario publicado» y la de «horarios publicados
   hace n días»), `Glifo` (✓ ● ◇ ○ ⊘ — ▲ ◐ ↕ con `aria-label`), `Modal` (foco atrapado,
   Escape cierra, cierre con ✕, ancho por prop), `PanelLateral` (entra a la derecha como en
   13c, con cabecera y ✕).
3. **`Carrusel`**: recibe la lista de períodos y `visibles` (1|2|3), muestra flechas ‹ ›
   (deshabilitadas en los extremos), chips de período (activo relleno oscuro), texto
   «n de m visibles», barra de posición proporcional, y renderiza como hijos las tarjetas
   que le pasen (`render(periodo)`); expone `irA(periodo)` por ref o callback para que
   «Planificar en 2.º 2027» lo mueva. Teclado: flechas izquierda/derecha cuando tiene el foco.
   Las tarjetas tienen ancho fijo por `visibles` y **misma altura entre sí** (contenedor con
   `align-items: stretch`).
4. **`BarraSuperior`** definitiva: nombre de la carrera + `plan S10-Rev23 · ITBA` en mono,
   pestañas Plan/Progreso (por hash), campo de búsqueda con `onBuscar` (callback; la lógica
   la conecta la Ola 3), botón «Sugerir corrección» (callback), y un menú «⋯» con
   «Exportar plan», «Importar plan», «Borrar todo» (callbacks; sin lógica).
5. **`Disposicion`** definitiva: barra arriba; zona principal + panel derecho de ancho fijo
   (el panel se oculta bajo 1100 px y la zona principal ocupa todo; no hace falta más móvil
   en este sprint); región para el banner de conflictos arriba del carrusel (slot vacío).
6. Página de muestra `app/src/paginas/Muestrario.tsx` en `#/muestrario` con todas las
   primitivas en todos sus estados (sirve para la comparación visual contra el mockup).

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- Sin `style={{…}}` en los componentes (salvo variables CSS calculadas, p. ej. el ancho de
  tarjeta por `visibles`).
- `#/muestrario` muestra cada primitiva con los colores y tipografías de `tokens.md`; en
  `notes` deja las medidas que tuviste que ajustar por el cambio a Newsreader.
