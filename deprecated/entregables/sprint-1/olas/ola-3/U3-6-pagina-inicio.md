# U3.6 — `PaginaInicio` (13a: primer ingreso) y menú exportar / importar / borrar

## Ownership

- `app/src/paginas/PaginaInicio/**`, `app/src/componentes/MarcarAprobadas/**`,
  `app/src/componentes/PegarHistoria/**`, `app/src/componentes/MenuPlan/**` (código, CSS, tests)
- No toques `App.tsx` ni `BarraSuperior`: exporta `PaginaInicio` y `MenuPlan` (el
  orquestador conecta el menú «⋯» de la barra con `MenuPlan`).

## Lee

- `CLAUDE.md`; mockup `#13a` de `etapa3-mockup-v2.dc.html`; `entregables/05-plan-sprints.md`
  §3 (huecos: «marcar a mano» y «copia de seguridad»); `EXEC_STATE.md` gap G-02 y S-01.
- Código real: `app/src/estado/` (`cargarHistoria`, `marcarAprobada`, `exportar`, `importar`),
  `app/src/motor/parsearHistoria`, `primitivas`.

## Entregables

1. **`PaginaInicio`** (13a): título «Todavía no hay nada en tu plan», el párrafo del mockup,
   dos botones «Pegar historia académica» (primario) y «Marcar materias a mano», y debajo el
   componente elegido; nota final «Todo queda en este navegador. No hay cuenta ni servidor.»
   Un tercer enlace discreto «Importar un plan guardado».
2. **`PegarHistoria`**: área de texto con el marcador «PEGAR ACÁ · una materia por línea» y
   las tres líneas de ejemplo del mockup como placeholder; al pegar, `parsearHistoria`
   muestra un resumen «n aprobadas · m en curso · k líneas sin reconocer» con las líneas no
   reconocidas listadas para corregir a mano; botón «Usar esta historia» → `cargarHistoria`
   y navega a `#/plan`. Texto vacío o sin ningún código → «No encontré códigos de materia
   (por ejemplo 93.18)».
3. **`MarcarAprobadas`**: lista del plan agrupada por «Año N · Cuatrimestre M» (obligatorias,
   por `cuatrimestre_sugerido`) y una sección «Electivas»; casilla por materia con código en
   mono, nombre y créditos; buscador arriba que filtra; contador fijo «147 créditos · 31
   materias» que se actualiza; marcar una materia **no** marca sus correlativas
   automáticamente (se ofrece un enlace «marcar también sus correlativas» por fila cuando
   tiene alguna sin marcar); botón «Listo» → navega a `#/plan`.
4. **`MenuPlan`** (acciones del menú «⋯» de la barra y del enlace de importar): «Exportar
   plan» descarga `cuatris-plan-<fecha>.json` (`exportar()` del estado, Blob + enlace);
   «Importar plan» abre un selector de archivo, valida con `importar()` y muestra el error
   exacto si no es válido (versión más nueva, JSON roto) sin tocar el plan actual; «Borrar
   todo» pide confirmación («Se borra el plan de este navegador. Exportalo antes si querés
   conservarlo.») y limpia el estado.
5. **Tests**: pegar el texto de ejemplo del mockup reconoce 3 aprobadas; una línea sin
   código aparece como no reconocida; marcar 72.31 muestra el enlace de correlativas y al
   usarlo marca 93.58 y 72.03; el contador suma créditos reales del plan; exportar produce
   JSON válido que `importar` acepta; importar un JSON con `version: 99` muestra error y no
   cambia el estado.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build` verde.
- Compara contra `#13a` y anota diferencias en `notes`.
