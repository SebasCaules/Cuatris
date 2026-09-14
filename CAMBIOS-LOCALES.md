# Cambios locales respecto del planner de StudyVaults

Registro de lo que Cuatris cambió **dentro de los directorios que se espejan** desde
StudyVaults (`components/planner/`, `lib/planner/`, `lib/url-state/`, `packages/ui/`).
`npm run sync` los pisa: cada entrada de esta lista hay que portarla a StudyVaults o
reaplicarla después del sync. Cuando una entrada ya esté en StudyVaults, se borra de acá.

Base sincronizada: árbol de trabajo de `StudyVaultsITBA/site` del 2026-09-13 ~02:45 (commit
`4c5d1af` + cambios sin commitear de la sesión «Planificador de cursada ITBA»).

## 1. Guardar o cargar progreso desde cualquier vista (retirado en §14)

- `components/planner/ProgresoModal.tsx` (nuevo): modal con el bundle `.json` portable del
  planner (el mismo que exporta el IOModal del Plan de cursada), con resumen de lo que
  contiene, confirmación destructiva y acuse.
- `components/planner/IOModal.tsx`: `ImportConfirm`, `ImportDone`, `summarize` e
  `ImportSummary` pasan a exportarse (los reusa el modal nuevo). Sin cambios de comportamiento.
- `components/planner/Sidebar.tsx`: prop opcional `onProgreso`; botón `side__util` «Guardar o
  cargar progreso» antes del pie.
- `components/planner/PlannerApp.tsx`: estado `progresoOpen`, monta el modal, pasa
  `onProgreso` al rail; el banner de primer uso suma el link «o cargá un progreso guardado»
  (`.first-run__load`).
- `components/planner/planner.css`: reglas `.first-run__load`, `.prog-modal`,
  `.prog-modal__stats`.

Por qué: el estado vive solo en `localStorage`; sin una entrada global, cambiar de navegador
o venir desde el planner de StudyVaults obligaba a marcar todo de nuevo (el export estaba
solo en el Plan de cursada, detrás de «Importar / Exportar»).

## 2. Plegado de años: dos casillas seguidas plegaban una sola

- `components/planner/views/CuatriView.tsx`: los años recién completados esperan en un
  `useRef<Set>` en vez del closure del `setTimeout`; el cleanup del effect cancela el timer
  pero no lo pendiente, así dos años completados en menos de 260 ms se pliegan los dos.

## 3. Título de la pestaña por vista

- `components/planner/PlannerApp.tsx`: `document.title = "<vista> · <sitio>"` en cada cambio
  de vista (`VIEW_TITLES`); el sufijo sale del título con el que llegó la página. Un
  `MutationObserver` sobre `<head>` lo reaplica cuando la metadata streameada de Next lo
  pisa tras hidratar. En StudyVaults daría «Mis materias · StudyVaults ITBA».

## 4. `title=` → Tooltip (solo en PlannerApp)

- `components/planner/PlannerApp.tsx`: la × del banner y el botón de mostrar el rail usan
  `<Tooltip>` en vez de `title=` (regla del autor). El resto de los `title=` del planner
  (~60) queda como en StudyVaults, donde se está haciendo esa migración.

## 5. Varias carreras (2026-09-13)

El planner deja de estar atado a Informática: hay un plan por carrera de grado del ITBA
(bajado del SGA) y un selector en la barra. Las horas y los finales son compartidos.

- `lib/planner/types.ts`: `Plan` suma `carrera`, `planId`, `periodoLabel`, `areaReq`,
  `minorReq`, `tituloFinal`, `noPlanificables`; `Horario.conjunto`.
- `lib/planner/model.ts`: `PLAN`, `byId`, `NO_PLANIFICABLES` y `AREA_COLOR` pasan a ser
  mutables y se reemplazan **in place** con `loadPlan(plan)`; `onPlanChange(fn)` avisa a los
  módulos con tablas derivadas. Colores automáticos (`AREA_PALETTE`) para áreas sin curar.
- `lib/planner/minors.ts`: `MINORS` se rearma al cambiar de plan; `Minor.req` y
  `minorReqOf(area)` (créditos por bloque, `Plan.areaReq`, o `minorReq`/14); siglas
  automáticas para los bloques de electivas del SGA.
- `lib/planner/url-state.ts`: las áreas válidas se leen del plan activo (no al importar).
- `lib/planner/persist.ts`: claves por carrera (`setPersistCarrera`: Informática conserva
  las históricas, las demás llevan prefijo `c:<CODIGO>:`), preferencia `plan_carrera_v1`
  (`loadCarreraPref`/`saveCarreraPref`), `carrera` en el bundle exportado.
- `lib/planner/carreras.ts` (nuevo): registro, `carreraPedida(params)` (URL → preferencia →
  default), `fetchPlan` (import() diferido, cacheado) y `activarCarrera`. Lee
  `lib/planner/carreras/index.ts`, que genera `scripts/build-planner-data.mjs`.
- `components/planner/carreraContext.ts`, `CarreraSwitch.tsx` y `CarreraPicker.tsx` (nuevos):
  contexto de carrera activa, el selector de la barra (menú propio, carreras sin plan
  deshabilitadas con tooltip) y la pantalla de elección de la primera visita (tarjetas;
  marca las carreras con progreso guardado, `tieneProgreso` en persist.ts). (En §14 el
  selector deja la barra: la lista pasa a `CarreraLista.tsx`, dentro del menú de perfil.)
- `components/planner/PlannerApp.tsx`: no hay carrera por defecto. Al montar resuelve la
  pedida (`?carrera=` → preferencia guardada); sin ninguna, `PlannerInner` muestra el
  `CarreraPicker` con la barra reducida a la marca. Con carrera, carga su plan y remonta
  `PlannerProvider` con `key={carrera}`; no hidrata ni escribe hasta entonces. `cambiar()`
  escribe `?carrera=` y la preferencia.
- `components/planner/ViewNav.tsx`: `NavTools` monta `CarreraSwitch` (hasta §14).
- `components/planner/Topbar.tsx`, `views/PlanView.tsx`, `views/CombinadorView.tsx`,
  `ViewTools.tsx`: las constantes derivadas de `PLAN` (créditos electivos, totales, período
  de los horarios) se leen en el render; `MinorsModal.tsx`, `Sidebar.tsx`, `ViewTools.tsx`,
  `PlanView.tsx` usan `minorReqOf`/`Minor.req` en vez de `MINOR_REQ`.
- `components/planner/DetailDrawer.tsx`: obligatorias sin año/cuatrimestre (planes con listas
  planas) no muestran «Año null».
- **Materias anuales** (`Plan.anuales`; Informática: 72.45 Proyecto Final, 12 cr en un año
  continuo). `lib/planner/model.ts`: `ANUALES`/`esAnual`, y 72.45 deja de ser «no
  planificable». `lib/planner/optimize.ts`: el optimizador las ubica como dos mitades en
  cuatrimestres consecutivos (`PlacedMateria.parte`, `m.creditos` a la mitad, sigla `PF¹`/`PF²`,
  sin paridad), exigiendo lugar en los dos; las mitades no se compactan ni rebalancean sueltas
  y los dependientes van después de la segunda. `components/planner/state.tsx`: al hidratar,
  las anuales pendientes entran al pool guardado (antes no existían ahí).
- `components/planner/planner.css`: reglas `.carrera*` y `.mnr-th-req`.

Fuera del espejo, lo que alimenta esto: `data/plan/sga-carreras/` + `bajar-carreras.py`,
`data/plan/carreras/`, `data/plan/horarios/` (contrato 1.1.0), `scripts/build-carreras-data.mjs`
y el `build-planner-data.mjs` reescrito (un JSON por carrera + horarios convertidos).

## 6. Optimizador: orden del plan de estudios y comisiones por idas a la facultad

- `lib/planner/optimize.ts`: las obligatorias se colocan en el orden nominal de su plan
  (año/cuatrimestre) y en cada cuatrimestre sólo entran las que están a lo sumo
  `ORDEN_VENTANA` (2) cuatrimestres por delante de la obligatoria pendiente más temprana; si
  con esa ventana no entra ninguna, se abre de a un año (nunca deja un cuatrimestre vacío).
  Vale al colocar, compactar y rebalancear. Electivas y materias fijadas no participan.
- `lib/planner/time.ts`: `viajesDe(coms)` cuenta las idas a la facultad (bloques
  presenciales del mismo día y sede pegados o con menos de `VIAJE_GAP_MIN` = 120 min de
  espera cuentan una; cambio de sede o virtual/asincrónico no). `optimize.ts`: `chooseCom`
  y `resolveComs` eligen por idas › días › espera › orden de cátedra, y siempre prefieren
  una comisión sin superposición si existe (con «evitar superposiciones» apagado la materia
  entra igual con la menos mala). `views/CombinadorView.tsx`: las opciones se ordenan
  primero por idas.

## 7. Arrastre entre cuatrimestres: el carrusel corre solo

- `components/planner/views/PlanView.tsx` (`startDrag`): cerca de los bordes de la pista (96 px,
  o más allá) el carrusel se desplaza de forma continua (hasta ~1.400 px/s) y el cuatri
  destino se recalcula aunque el puntero esté quieto; durante el arrastre la pista lleva
  `is-dragging` (sin scroll-snap: con snap cada avance volvía a la misma tarjeta).
- `components/planner/planview.css`: regla `.pv-track.is-dragging`.

## 8. Elegir carrera: la tarjeta vuela hasta el selector (2026-09-14)

- `components/planner/carreraVuelo.ts` (nuevo): al tocar una tarjeta del selector de primera
  visita, una copia fija «despega» (la original se oculta) y, cuando el planner ya montó con
  esa carrera, «aterriza» sobre el botón del selector de la barra: la caja transiciona
  posición y medida y las caras (tarjeta → botón) se cruzan; el botón real queda oculto hasta
  que la copia lo cubre y aparece con un realce breve. Fuera de React porque el árbol se
  remonta (`key`) en el medio. Sin destino en 2,5 s (carga fallida) se cancela y la tarjeta
  vuelve; con `prefers-reduced-motion` no hay vuelo.
- `CarreraPicker.tsx` (`despegar` al hacer clic), `CarreraSwitch.tsx` (`aterrizar` al montar,
  ref en el botón), `PlannerApp.tsx` (`cancelar` si falla la carga), `planner.css`
  (`.cvuelo*`, `.carrera__btn.is-recien`). Desde §14 el destino es el icono de perfil
  (`PerfilMenu`): la caja termina redonda y la cara de llegada es ese icono.
- `planner.css`: la fila de tipo · plan · «progreso guardado» de la tarjeta hace wrap en vez
  de desbordar (`.cpick__meta`).
- `components/planner/Tooltip.tsx`: el ref del disparador se lee de `props.ref` (React 19
  avisaba por consola al leer `element.ref`).

## 9. Plan de cursada: cuántos cuatrimestres se ven en el carrusel

- `views/PlanView.tsx`: segmentado 2 · 3 · 4 en la fila de pestañas (solo en Calendario);
  el `Carousel` recibe `cols` y lo pone como `--pv-cols` en la pista. Preferencia guardada
  en `plan_cols_v1` (una sola clave para todas las carreras: `lib/planner/persist.ts`,
  `loadPlanCols`/`savePlanCols`).
- `planview.css`: `.pv-track > .pv-sem` toma el ancho de `--pv-cols`; `.pv-seg--cols`; con
  menos de 1000 px vuelven los dos por pantalla y el selector se oculta.

## 10. Plan de cursada: sin plegado de primera corrida, Calendario por default, 24 créditos

- `views/PlanView.tsx`: con 0 aprobadas ya no se muestra el resumen plegado («Plan completo
  de la carrera… Ver toda la carrera»): el plan se ve entero de entrada. Se quitó
  `showFullCareer`/`careerFolded` y el bloque `.pv-firstrun*` de `planview.css`. La pestaña
  inicial es siempre Calendario (antes Roadmap con más de 6 cuatrimestres).
- `state.tsx` y `persist.ts`: los topes por default de créditos y materias por cuatrimestre
  salen del plan de estudios: el cuatrimestre nominal más cargado (`topeNominal()` en
  `model.ts`; Informática: 27 cr y 6 materias, por el 2.º cuatrimestre de 1.º año). Con
  menos, el optimizador no podía reproducir ni la grilla nominal. Un tope guardado que es
  uno de los defaults viejos (18/24 cr, 5 materias) y queda por debajo del nominal se sube
  al hidratar (`heredarTope`); un `.json` sin ese dato (0) también toma el nominal.
- `planner.css`: `.rmap-stop__card` con `box-sizing:border-box` — con `height:100%` +
  padding en content-box la tarjeta desbordaba la celda y pisaba la fila de abajo.

## 11. Correlativa 93.75 → 72.25 / 72.27 con transición (2026-09-14)

- Datos (`data/plan/`, que el sync trae de `StudyVaultsITBA/Electivas/` — **portar allá**):
  `obligatorias.csv`, `obligatorias.json` y `data.js` suman `93.75` (Métodos Numéricos
  Avanzados) a las correlativas de `72.25` Simulación de Sistemas y `72.27` Sistemas de
  Inteligencia Artificial, con sus aristas; `Plan-S10-Rev23.md` lo anota (nota ¹). Editados a
  mano: regenerar con `electivas.py`/`build-data.py` pisaría curaduría posterior de
  `electivas.json`/`data.js` (electivas que no están en el CSV). El SGA ya muestra la
  correlativa (`data/plan/carreras/S.json`).
- `lib/planner/correlativasVigencia.ts` (nuevo): correlativas con transición
  (`rigeDesde`): la carrera aprueba excepciones durante 2026 para cursar 72.25/72.27 sin
  haber cursado 93.75 y rendir su final sin haberla aprobado; desde 2027 rige plena.
- `lib/planner/finalesData.ts`: `CORRELATIVAS_FINAL` suma `72.25`/`72.27` ← `93.75`;
  `correlativasFinal`/`finalHabilitado` aceptan el año calendario del llamado y no exigen
  una correlativa con excepción vigente ese año. `views/FinalesCombinadorView.tsx` pasa
  `year` (febrero cae en el año siguiente: febrero 2027 ya la exige).
- `DetailDrawer.tsx` + `planner.css` (`.dr-corr-nota`): aviso bajo los chips de
  correlativas (también en el HTML exportado).

## 12. Inglés I/II: requisito señalado en su cuatrimestre, no una materia del plan

- `scripts/build-planner-data.mjs`: `REQUISITO_RE` (`/^ingl[eé]s\b/i`) → `Plan.requisitos`
  (también dentro de `noPlanificables`), para el plan curado de Informática y para los del SGA.
  `lib/planner/types.ts` (`requisitos`), `lib/planner/model.ts` (`REQUISITOS`, `esRequisito`;
  al recargar el plan entran a `NO_PLANIFICABLES`, así no van al pool ni al optimizador).
- `views/PlanView.tsx`: `reqByIdx` ubica cada requisito no aprobado en el cuatrimestre donde
  el plan pone las obligatorias de su misma etapa nominal (año/cuatri del plan de estudios;
  el último de ellos); si esa etapa ya pasó, en el primer cuatri planificado; sin ubicación
  nominal, en el último. `ReqLine` lo dibuja en la tarjeta del Calendario (bajo el
  calendario) y en la del Roadmap: casilla punteada + nombre + «aprobado para este cuatri»,
  con tooltip y clic al detalle. Desaparece al marcarlo aprobado en «Materias».
- `planview.css`: `.pv-reqs`, `.pv-req*` (dos líneas en la tarjeta angosta del Roadmap).

## 13. `NAV_VIEWS` en un módulo de datos

- `lib/planner/navViews.ts` (nuevo): las etiquetas y tooltips de las vistas, sin
  «use client», para que la portada (server component) dibuje las mismas pestañas como links
  a `/planificar/?view=…`. `components/planner/ViewNav.tsx` las importa de ahí y las
  re-exporta.

## 14. Perfiles: varias configuraciones guardadas en el navegador (2026-09-14)

- `lib/planner/persist.ts`: cada perfil es un espacio de claves. El principal (id `""`,
  «Principal») usa las claves históricas tal cual; los demás las mismas con el prefijo
  `p:<id>:` delante del de carrera (`p:<id>:c:K:plan_aprobadas_v3`), y su propia
  `plan_carrera_v1`. Registro global `plan_perfiles_v1` (`{activo, perfiles[]}`).
  `setPersistPerfil`, `loadPerfiles`, `crearPerfil(nombre, desde)` (copia todas las claves
  del perfil de origen), `renombrarPerfil`, `activarPerfil`, `borrarPerfil`/`vaciarPerfil`.
  `plan_cols_v1` sigue global (preferencia de pantalla).
- `PlannerApp.tsx`: al montar apunta la persistencia al perfil activo antes de resolver la
  carrera; `cambiarPerfil(id)` activa el perfil, carga la carrera que tenga guardada (o
  muestra el selector) y remonta el árbol (`key` = perfil + carrera). `carreraContext.ts`
  expone `perfil`, `perfiles`, `cambiarPerfil`, `refrescarPerfiles`.
- `PerfilMenu.tsx` (nuevo): avatar clásico (`IconAvatar`, silueta rellena de cabeza y busto
  recortada por un círculo lleno del color del perfil) en la esquina derecha de la barra
  (también con el selector de carrera), a la derecha del toggle de tema, y panel propio en
  secciones: quién (perfil activo y carrera); CARRERA, que se cambia ahí mismo con la lista
  en línea (`CarreraLista.tsx`, extraída de `CarreraSwitch.tsx`, que se elimina junto con
  `NavTools`); COLOR del perfil (muestras de `lib/planner/perfilColores.ts`, hex en datos;
  tiñe el icono de la barra, la cabecera y la marca de la fila vía `--pf`;
  `colorearPerfil` en persist.ts); PERFILES (tocar = activar; lápiz para renombrar y tacho
  clásico —`IconBin`, con tapa y ranuras: el cono fino de `IconTrash` no se leía— para
  borrar, con confirmación en línea; se borra cualquiera, también el principal, y sin
  ninguno `loadPerfiles` crea «Nuevo perfil» vacío; «Guardar como perfil nuevo» copia la
  configuración actual y la activa; «Nuevo perfil vacío» arranca de cero y pide la
  carrera); y «Referencias» al pie. Texto mínimo: las explicaciones van en tooltips.
  `planner.css`: `.pmenu*`, `.clist`.
- Se eliminó `ProgresoModal.tsx` (guardar/cargar el progreso como .json desde la barra) y el
  link «o cargá un progreso guardado» del banner de primer uso; el .json de preferencias
  sigue en Importar / Exportar del Plan de cursada (`IOModal`). `PlannerChrome` pasa a
  `(nav, tools, perfil)` (tools hoy vacío) y `Header` (standalone) ubica el toggle de tema y
  `perfil` a la derecha.
- `Topbar.tsx`: las pastillas «● N/total» de cursando usan el `Tooltip` del planner (antes
  `title=`): dicen qué materias se cursan y qué cambia al aprobarlas; el botón de copiar
  link también. `app/globals.css`: `.nav__inner` en border-box (desbordaba 48 px en angosto).

## 14b. Guardar el perfil (⌘S / Ctrl+S) y aviso de cambios sin guardar

- `lib/planner/persist.ts`: instantánea por perfil y carrera (`plan_guardado_v1`, el mismo
  bundle del .json): `saveSnapshot`, `loadSnapshot`, `firmaEstado`/`firmaDeBundle` (el
  bundle sin fecha ni `sideCollapsed`, para comparar). El borrador se sigue autoguardando.
- `components/planner/perfilGuardado.ts` (nuevo): `usePerfilGuardado()` → `sinGuardar`
  (firma actual ≠ guardada; un perfil en blanco nunca guardado no cuenta), `nuncaGuardado`,
  `fecha`, `atajo` (⌘S o Ctrl+S según plataforma), `guardar`, `descartar` (HYDRATE con la
  instantánea). `PlannerApp` registra el atajo (window keydown, `preventDefault` del guardar
  página) y muestra el aviso «Perfil guardado» (`.pv-toast--ok`, 1,8 s).
- `PerfilMenu.tsx`: punto coral en el avatar cuando hay cambios sin guardar (`is-dirty`,
  también en el tooltip), línea de estado bajo el nombre («Cambios sin guardar» / «Nunca
  guardado» / «Guardado 17:52» / «Sin cambios»), pill «Guardar ⌘S» al lado del nombre
  (brass con cambios; tilde y atajo cuando está al día) y, con cambios sobre una
  instantánea, «descartar» en la línea de estado, con confirmación. `planner.css`:
  `.pmenu__save`, `.pmenu__kbd`, `.pmenu__saved`, `.pmenu__txtlink`,
  `.pmenu__btn.is-dirty::after`; `planview.css`: `.pv-toast--ok`.

## 15. Plan de cursada: la fila de pestañas queda con el Recomendador (y 2 · 3 · 4)

- `views/PlanView.tsx`: se quitan de `.pv-tabs__actions` «Agregar electiva» (redundante con
  el buscador del panel de electivas), «Restablecer plan» (icono ambiguo, destructivo) e
  «Importar / Exportar» (el modal del documento del plan y del .json de preferencias), con
  su estado y helpers (`ResetConfirm`, `exportPlan`, `exportPrefs`, `importPrefsFromFile`).
  Queda el switch «Recomendador» y, en Calendario, el selector 2 · 3 · 4. La descarga de un
  cuatrimestre (calendario, imagen, programa) sigue en el menú «···» de cada tarjeta.
- `IOModal.tsx` eliminado (ya sin uso). CSS: `.pv-addelec`, `.pv-iconbtn*`, `.plan2-io__*`
  y la regla ACC-07 del botón destructivo.
- `app/globals.css` + `components/shell/Header.tsx`: con el menú de perfil, la barra lleva
  `cuatris-nav--app`: a todo el ancho, con el margen lateral del contenido
  (`clamp(16px,3vw,44px)`, variable `--nav-px`), así el tema y el perfil quedan en el borde
  derecho; el toggle de tema pasa a 32 px con icono de 15 px.

## 16. Capa de movimiento (`components/planner/motion.css`)

- `motion.css` (nuevo, lo importa `PlannerApp` después de `planner.css`): entradas
  escalonadas (tarjetas del selector de carrera, años y filas de «Materias», tarjetas del
  Calendario y del Roadmap, fila de pestañas y recomendaciones), pop al cambiar de estado
  (icono de `EstadoControl` y cifras de la barra de métricas, remontados con `key`), pulso
  del punto de «cursando», entrada del menú de perfil y de la lista de carreras, pulsación
  (`:active` scale .96) y flechas del carrusel. Todo bajo `prefers-reduced-motion:
  no-preference`; `fill-mode: backwards` para que al terminar manden los estilos normales.
- Índices para el escalonado: `CuatriView` (`--yi` por año, `--ri` por fila; `QRow` recibe
  `orden`), `PlanView` (`orden` en `SemCard` y `RoadmapStop` → `--i`), `CarreraPicker`
  (`--i`). `Topbar`: `<b className="statline__num" key={valor}>`. `EstadoControl`: el icono
  va en `.estado-ctl__ico` con `key={estado}`.
- Portada (fuera del espejo): `Reveal` de `@studyvaults/ui` en títulos de sección, pasos,
  tarjetas de datos y cierre (stagger 110 ms); barrido de brillo en el CTA, flotación suave
  de la tarjeta de muestra, flechas que avanzan al posarse, marcas que crecen; el icono del
  tema gira al posarse (`app/globals.css`).

## 17. Ajustes varios (2026-09-14, tarde)

- `Topbar.tsx`: la tira de métricas se muestra siempre (antes se escondía con 0 aprobadas
  y en un perfil nuevo parecía que faltaba); los tooltips de las pastillas de cursando
  quedan en dos líneas: «Al terminar la cursada (SDS · Cripto)» y la cifra que queda.
- `lib/planner/texto.ts` (nuevo): `normalizar` (minúsculas, sin tildes). Lo usan todos los
  buscadores: Materias/Electivas (`ViewTools`, `Sidebar`, `url-state` guardan la consulta
  normalizada; `CuatriView`, `ElectivasView` comparan normalizado), pool del plan
  (`PlanView`), `RefView`, `GrafoView` y `CombinadorView` (que ya tenía su `norm`).
- `views/PlanView.tsx`: en el panel «Materias del plan», bajo las obligatorias, un plegable
  «Quitadas del plan» lista las obligatorias pendientes que el usuario sacó, con
  «restablecer» por materia y «restablecer todas» (`PLAN_POOL_ADD`). CSS `.pool-out*`,
  `.pool-restore`.
- `views/PlanView.tsx` + `planview.css`: la «Vista previa» (hover sobre una electiva) pasa a
  la fila de pestañas, en el hueco entre Calendario/Plan/Minors y las acciones: antes
  flotaba a caballo del borde de esa barra.
- Portada: la barra es la misma que en el planner (a todo el ancho, `Header` sin modificador;
  `app/globals.css`) y lleva un avatar-link al planificador (`.ld-avatar`, mismo dibujo que
  `PerfilMenu`).

- Electivas (`cards.css`, `views/ElectivasView.tsx`): todas las cards miden igual (la
  grilla estira la fila, la fila de señales tiene alto fijo con las insignias de minor sin
  wrap, y la fila de acciones va abajo con alto mínimo); las marcadas (cursando, cursada,
  final aprobado) van primero, después el resto por código.

- `views/CuatriView.tsx` + `cards.css`: después del último año, una card «Electivas · las
  que marcaste» con las electivas con estado (cursando, cursada, final) en las mismas filas
  que las obligatorias (respeta búsqueda y filtros; se pliega como un año, `anio` -1).
- `planner.css`: el buscador del pool del plan ya no dibuja el anillo genérico de foco
  dentro de la caja (la caja lo muestra con `:focus-within`); el progreso de créditos
  electivos del panel de recomendaciones pasa a un bloque con cifra grande y «faltan N» en
  brass.

## Fuera de los directorios espejados (no lo toca el sync)

`app/` (portada en `/`, planner en `/planificar/`, manifest instalable, iconos PNG, título
de página), `components/shell/` (barra, pie, portada `Landing.tsx` + `landing.css`,
`LegacyRedirect.tsx` para los links viejos con query en `/`), `lib/content/slug.ts`,
`lib/site.ts`, `scripts/`, `run.sh`: son propios del standalone y no tienen equivalente que
portar.
