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

- `views/PlanView.tsx` + `planview.css`: el bloque de resumen del plan habla todo del final
  del plan (etiqueta «Al final del plan»): créditos electivos que junta el plan sobre los que
  pide el título («3 / 27 cr · faltan 24») y los minors. Antes mezclaba «créditos hasta hoy»
  con minors proyectados; el «hoy» ya está en la barra de métricas.

## 18. Optimizador del plan: búsqueda en cartera, cota inferior y motivos (2026-09-14)

Antes, «Recibirte antes» quedaba 1 o 2 cuatrimestres por encima del óptimo en seis carreras
(Informática con «Evitar superposiciones», Industrial, Electrónica, Ciencias Aplicadas,
Petróleo, Química): la ventana del orden nominal (§6) y la colocación greedy en un solo
orden no encontraban el plan corto cuando una materia crítica quedaba trabada por
superposiciones o por un requisito de créditos que le deja una única ventana (94.23).

- `lib/planner/optimize.ts`: `searchPlacement` prueba varias colocaciones y se queda con la
  mejor por un vector lexicográfico (`scoreOf`: sin ubicar › egreso › cuatrimestres usados ›
  apartamiento del orden nominal › idas › días; para «dias», días e idas van antes):
  la nominal con ventana (la de siempre), la de HOLGURA (`latestStarts`: el último
  cuatrimestre en el que cada materia puede arrancar sin correr el egreso, hacia atrás por
  dependientes con paridad y anuales; sin ventana) y, si ninguna toca la cota inferior,
  hasta `SEARCH_RESTARTS` = 48 reinicios con la prioridad de holgura perturbada (semilla
  fija: mismo input, mismo plan). `lowerBoundLast`: ASAP sin topes (punto fijo con
  acumulación optimista de créditos) + cota de capacidad; sale como `PlanResult.minLast`.
  Los tres métodos comparten el egreso mínimo: «dias» y «balance» sólo cambian el criterio
  secundario (antes «dias» podía terminar más tarde por la compactación restringida).
- Esqueleto memoizado (`searchSkeleton`, clave = firma del input, LRU de 8, se vacía con
  `onPlanChange`): el recomendador simula ~90 planes con el mismo esqueleto y paga la
  búsqueda una vez. Relleno de electivas con cuatro órdenes y reintento de las obligatorias
  que el esqueleto no ubicó (créditos que recién se juntan con electivas); la mezclada corre
  con `MIXED_RESTARTS` = 8.
- Horizonte adaptable: 14 cuatrimestres y, si quedan afuera materias que un horizonte más
  largo sí ubica (topes muy bajos, muchas fijadas), hasta 42. Antes con «máx. 2 materias»
  la mitad de la carrera quedaba «sin ubicar».
- `PlanResult.unplacedWhy` (`explainUnplaced`): por qué no entra cada materia
  («correlativa» fuera del plan o que tampoco entra, «creditos» inalcanzables con el pool,
  «sinLugar»). `views/PlanView.tsx` lo usa en las observaciones y en el aviso «no entra en
  ningún cuatrimestre» (que ya no manda a subir los topes cuando el problema es otro).
- Rendimiento: `comConflict` memoizado por par de comisiones (`conflicts`, WeakMap) y, en
  `lib/planner/time.ts`, `isAsync` y `toMin` memoizados. Naval desde cero con superposiciones
  (el peor caso, 48 reinicios sin tocar la cota): 736 → 116 ms; mediana de la matriz de
  escenarios 0,2 ms, p99 18 ms.
- Verificación: `scripts/optimizer-check/` (`npm run check:optimizador`, con `tsx` como
  devDependency): invariantes de todo plan (cobertura, correlativas, créditos, paridad,
  topes, superposiciones —también contra comisiones fijadas—, anuales), cota inferior,
  solver de referencia con reinicios aleatorios (nunca mejor que el optimizador),
  independencia del orden del pool y consistencia «dias»/«balance» nunca más tarde que
  «cuatris», sobre 16 carreras × 20 escenarios × 3 métodos × 2 topes × 2 modos.
- Tras la auditoría adversarial (2026-09-14, noche):
  - `hasFreeCom` mira sólo la comisión fijada por el usuario cuando la hay: antes, con
    «Evitar superposiciones», una materia con comisión fijada entraba si CUALQUIER otra
    comisión suya estaba libre y después se colocaba la fijada pisando a una vecina
    (preexistente; 101/172 planes con superposición en el muestreo del auditor).
  - Orden canónico del pool (`mats` por código): el plan no depende de en qué orden se
    agregaron o restablecieron las materias (el ruido de los reinicios se asigna por
    posición y el memo lo enmascaraba).
  - Horizonte inicial ≥ lo que piden las fijadas (una anual fijada en el índice 13 necesita
    el 14 para su segunda mitad; antes quedaba con una sola mitad y sin aviso).
    `MAX_PLAN_CUATRIS` pasa a 42 (`lib/planner/consts.ts`) y es el tope del horizonte; los
    selects «fijar en» de `PlanView` ofrecen hasta un cuatrimestre después del último usado
    (`fixRange`) y el arrastre acepta cualquier índice del plan (antes descartaba en silencio
    los ≥ 14 aunque mostrara feedback verde).
  - `optimizePlan(…, { quick: true })` para el recomendador: la mezclada corre sin reinicios
    y se saltea cuando el relleno ya toca la cota. Recomendador: 7–190 ms (antes hasta 740).
  - `explainUnplaced` «creditos» compara contra lo aprobado más TODO el pool sin la materia
    (antes, contra lo colocado: con topes mínimos culpaba a los créditos por una materia que
    quedó afuera por el tope).
- «Evitar superposiciones» apagado = tolerar choques sólo si acortan el plan (antes ignoraba
  el horario y dejaba choques gratuitos): el plan sin choques es candidato y gana si termina
  igual; los choques van en el vector justo después del egreso; compactar y rebalancear
  nunca crean uno; `repairOverlaps` mueve cada materia que se pisa a otro cuatrimestre del
  mismo rango con comisión libre. Caso que lo motivó: fin de carrera con PF, SIA, Redes,
  GPI y seis electivas: Cuántica (una sola comisión) se pisa con Redes en el 1.º y con SIA
  en el 2.º, así que con «evitar» el plan da 3 cuatrimestres y sin evitar, 2 con un choque
  de una hora (antes, 2 con tres choques).
- Paridad con evidencia (`parityOf`): la del plan de estudios es la grilla nominal; si el
  horario publicado muestra la materia dictada en el otro cuatrimestre, se dicta en los dos
  y no restringe. Redes (5/1) figura en la oferta del 2.º cuatrimestre 2026: puede ir en un
  2.º. En Informática, 23 de 41 obligatorias con horario están en ese caso. Con eso el plan
  de fin de carrera del ejemplo (PF, SIA, Redes, GPI + seis electivas) cierra en 2
  cuatrimestres SIN superposiciones (Redes y SIA juntas en el 2.º, Cuántica en el 1.º), que
  es lo que el usuario armaba a mano fijando SIA. La UI (`PlanView`: arrastre, vista previa,
  aviso de paridad) y el check usan la misma noción; el aviso de una fijada en la otra
  paridad ahora aclara «no hay horario publicado del N.º».
- Paridad como preferencia (2026-09-14, noche): sin evidencia del otro cuatrimestre, poner
  una materia fuera de su cuatrimestre nominal es un SUPUESTO que el plan sólo asume si
  acorta el egreso (cuenta en el vector después de los choques). Colocaciones de holgura
  «blandas» (`softParity`) y un tercio de los reinicios lo permiten; `repairParity` (con
  movimiento directo, reelección de comisiones e intercambio 1-1) devuelve a su cuatrimestre
  lo que no hizo falta; una fase de limpieza con paridad dura apuntada al egreso conseguido
  busca el mismo plan sin supuestos; corte por estancamiento (`STAGNATION` = 20 reinicios sin
  mejorar). Motivo: el ITBA admite en marzo y agosto y la oferta del 2.º 2026 incluye TODAS
  las obligatorias de 1.º de Informática (y de I, K, L, LAES, LN, M, Q, BIO); con Cuántica
  fijada en el 2.º, el plan de fin de carrera cierra en 2 cuatrimestres poniendo SIA en el
  1.º, que era lo que el autor esperaba. `PlanView`: «N fuera de su cuatrimestre» junto al
  egreso (tooltip con cada supuesto) y observación por materia («verificá en el SGA que se
  dicte; si no, fijala en un 2.º»). El check exige que los supuestos sólo aparezcan cuando
  acortan el plan respecto de la referencia con paridad dura.
- Orden por holgura por cuatrimestre (`PlaceOrder.at(i)`): primero lo urgente
  (`latestStart` ≤ i), después las atadas a una paridad, y entre iguales holgura, camino
  crítico y FFD; los reinicios apuntan a «un cuatrimestre menos que el mejor conocido» y
  vienen en tres sabores (holgura con ruido, sin prioridad de paridad, casi al azar).
- `vaciarUltimo`: intercambio 1-1 entre el último cuatrimestre y uno previo (x entra donde
  estaba y, e y se muda a otro con lugar), revalidando el plan entero; resuelve los casos con
  topes justos y electivas donde la compactación (que sólo adelanta) no alcanzaba.
- `resolveComs`: decide primero las materias con menos comisiones y presupuesto de 20 000
  nodos (con seis materias de hasta ocho comisiones agotaba los 4000 sin encontrar una
  asignación que existía).
- «Evitar superposiciones» es absoluto: una materia fijada a un cuatrimestre donde todas sus
  comisiones se pisan con lo ya fijado ahí (ni reeligiendo comisiones, `resolveComs`) queda
  SIN UBICAR con motivo `superposicion` (observación: «la fijaste en 2c-27 pero ahí se pisa
  con Cuántica…»; el aviso ofrece la alternativa «Con superposiciones»). Antes se colocaba
  igual con la comisión «menos mala» y el plan mostraba un choque con el switch encendido.
  Excepción: un cuatrimestre finalizado (historia del usuario) se respeta tal cual. La 2.ª
  mitad de una anual también exige comisión libre en su cuatrimestre (`cabeSegundaMitad`).
  El check ya no exime a las fijadas: con «evitar», cero choques salvo en finalizados
  (sondeo aparte: 360 planes al azar con fijadas y comisiones fijadas, 0 choques).
- `PlanResult.delayed` (`explainDelays`): con «evitar» encendido, qué materia queda más
  tarde sólo por el horario y con quién se pisa en cada cuatrimestre anterior;
  `planOverlaps(items)` lista los choques de un plan con el momento («jue 18:00–19:00»,
  «lun 19:00, cambio de sede»). El check agrega: sin evitar nunca termina más tarde ni
  deja choques cuando evitándolos termina igual.

## 19. Plan de cursada: el objetivo se elige junto a «Evitar superposiciones» (2026-09-14)

- `views/PlanView.tsx`: el segmentado «Optimizar para» sale del plegable «Cómo se armó este
  plan» (donde no se encontraba) y pasa a la fila de parámetros, con rótulo «Objetivo», al
  lado del switch de superposiciones: los dos envuelven juntos (`.pv-field-group`, son «cómo
  se arma», no parámetros). Segmentado de tres (`.pv-seg--obj`): el elegido se despliega
  (icono + nombre, en brass) y los otros dos quedan como icono con tooltip
  (`OPT_METHODS[].objetivo`); ancho fijo para que la fila no se reacomode bajo el cursor.
  Iconos: birrete (recibirte antes), calendario (menos días), balanza (carga pareja).
- `lib/planner/optimize.ts`: etiquetas de `OPT_METHODS` («Menos días» en vez de «Menos días de
  campus») y objetivos redactados como promesa («Misma fecha de egreso, …»).
- Resultado del plan: «mínimo posible» junto a la cantidad de cuatrimestres cuando el egreso
  coincide con `PlanResult.minLast` (tooltip: no hay plan más corto con estas restricciones);
  la nota «Cómo se armó este plan» explica el objetivo elegido, la cota y el criterio
  secundario.
- `planview.css`: `.pv-config` con `grid-template-columns: minmax(0,1fr) fit-content(52%)`:
  con muchos minors (Industrial: nueve) el resultado aplastaba los parámetros a una columna;
  ahora las pastillas envuelven. El banner se apila por debajo de 1100 px (antes 980): con
  cinco campos más el switch, lado a lado envolvía en tres o cuatro filas.
- Resultado del plan: con «Evitar superposiciones» encendido y un plan alternativo más corto
  permitiéndolas, una línea «Con superposiciones: 2c-27 · 1 choque» (tooltip con cada choque
  y su horario; clic apaga el switch). Con el switch apagado, «N superposiciones» junto a
  la cantidad de materias, con el detalle en tooltip. Observaciones: la materia retrasada
  sólo por el horario dice en qué cuatrimestres se pisa y con quién.
- Tras la auditoría adversarial: `aria-label` y roving tabindex con flechas/Home/End en los
  radios del objetivo; `box-sizing: border-box` en `.pv-seg--obj` (medía 42 px, no 34);
  «mínimo posible» en `--accent-text` (contraste AA); hover de los iconos con fondo
  visible; la observación distingue correlativa que falta en el plan, que está en el plan
  pero tampoco entra, o que no figura en el plan de estudios (con concordancia de número);
  el consejo de apagar «Evitar superposiciones» sólo si está encendido; la cota teórica no se
  cita con materias sin ubicar; con «Carga pareja» la nota habla de rebalanceo, no de
  compactación.
## 20. Combinadores: «Mi progreso» compartido y finales sin progreso (2026-09-14)

Los dos combinadores (horarios y finales) sirven al que planifica con su progreso y al que
solo quiere combinar: comparten un modo y un buscador, y el de finales ya no depende de tener
cursadas marcadas.

- **Un solo modo.** `state.comboSolo` («ignorar mi progreso», clave `plan_combo_solo_v1`)
  pasa a valer para los dos combinadores. En la UI es el switch **«Mi progreso»**
  (`components/planner/ProgresoSwitch.tsx`, nuevo: mismo dibujo que el «Recomendador» del
  plan, reglas `.prog-switch*` al final de `planner.css`, tooltip del `Tooltip` sin
  InfoTip ni `title=`), primer control del cluster derecho de la barra en las dos vistas.
  **Sin progreso marcado (ni aprobadas ni cursando) no se muestra**: los dos modos serían
  iguales y el que solo combina no necesita el control. Exporta `hayProgreso` y
  `usaProgreso` (`!comboSolo && hayProgreso`). Quien tenía «Ignorar mi progreso» prendido
  en horarios ve también el combinador de finales en modo libre (mismo flag): el switch
  apagado, con su tooltip, es la vía de vuelta.
- **Buscador compartido, en el panel lateral.** `components/planner/MateriaPicker.tsx`
  (nuevo): el picker del combinador de horarios, ahora en UNA columna (búsqueda sin tildes,
  Obligatorias por año · cuatrimestre y después Electivas por nombre, grupo atenuado de
  coincidencias no agregables, sin resultados, hint bajo el buscador), parametrizado
  (`candidatos`, `fantasmas`, `fantasmaNota`, `added`, `onToggle`, `tag`, `meta`, `hint`,
  `rowTitle`, `placeholder`, `inputRef`). Vive **dentro del panel lateral de cada vista** —
  el de «Sugeridas» en horarios y el de «Finales pendientes» en finales — y su lista
  scrollea ahí (`.mpick`, tope `min(64vh, 600px)`): el calendario nunca se desplaza. Importa
  `combinador.css` (las reglas `.cmb9-*` y `.mpick*` viven ahí; se fueron el picker a todo
  el ancho `.cmb9-pickcols` y el resumen sticky `.cmb9-pickersum`). `anioLabel` se exporta
  desde el componente. La consulta vive en el componente (se limpia al cerrar el buscador).
- **Finales sin progreso** (`views/FinalesCombinadorView.tsx`, `finales.css`): la lista de
  pendientes es derivados del progreso ∪ `finales.extra` (`lib/planner/types.ts`; nuevo
  `Set` con los finales agregados a mano; acciones `FINALES_EXTRA_ADD` /
  `FINALES_EXTRA_REMOVE` en `state.tsx` — quitar borra también su asignación). Con «Mi
  progreso» activo los extra entran sujetos a las correlativas de final (candado) y no se
  ofrecen los finales ya aprobados (el hint del buscador avisa cuántos hay); con el switch
  apagado, o sin progreso, la lista es solo `extra`, sin correlativas y sin el chip
  «cursando» («Para combinar — Período» en vez de «Se pueden rendir»). Los derivados no se
  quitan (reflejan el progreso); los agregados tienen × (`.fin__srow-x`, tooltip «Quitar de
  la lista»). El buscador se abre desde «+ Agregar» en la cabecera del panel (`.fin__add`) y
  reemplaza la lista dentro del mismo panel (`.fin__side-picker`; «Listo» vuelve a la lista;
  al abrirlo a pedido la caja recibe el foco); con la lista vacía queda abierto solo. El
  estado vacío «Ir a Mis materias» desaparece (y su CSS `.fin__empty*`). Sobre el × la nota
  de la fila se calla (`:has`), para no mostrar dos burbujas.
  Sin finales en la lista no se muestra el resumen. Los extra siguen en el buscador con ✓
  (solo se ocultan los derivados). Las materias que no rinden final aparecen atenuadas
  («no rinde final»).
- **Horarios** (`views/CombinadorView.tsx`, `combinador.css`): el switch «Ignorar mi
  progreso» + InfoTip del header se reemplaza por `ProgresoSwitch` (se van `.cmb9-solowrap`
  y `.cmb9-solo`); el picker inline a todo el ancho (que empujaba el calendario bajo el
  pliegue, con el resumen sticky «Ver semana» como parche) pasa a `MateriaPicker` dentro del
  panel lateral: con el buscador abierto el panel muestra «Materias · N con horario» en vez de
  «Sugeridas», y el calendario se queda donde está; el panel se muestra también en el estado
  vacío y en «sin solución». La invitación «＋ Elegí las materias a cursar» enfoca la caja
  de búsqueda. «Sumar a mi plan» se gatea por contenido (ninguna aprobada en la selección)
  en vez de por el modo: con `comboSolo` persistido y sin progreso el switch no existe y el
  botón tiene que seguir apareciendo. En las dos vistas, el buscador forzado por lista vacía
  queda abierto a pedido al elegir el primer ítem (antes se cerraba solo).
- **Persistencia** (`lib/planner/persist.ts`): `PersistedFinales.extra?: string[]`; se
  serializa solo si no está vacío, así la firma de las instantáneas guardadas antes no
  cambia (no aparece «cambios sin guardar»); `parseFinales` lo lee tolerante.
  `perfilGuardado.ts`: `enBlanco` también mira `finales.extra` (un perfil nunca guardado con
  finales agregados a mano cuenta como «sin guardar»).

## 21. Mapa de correlativas v2 (2026-09-14, noche)

Rediseño y reconstrucción completos de la vista «Mapa de correlativas» bajo una sola idea:
describir lo mínimo y que todo sea interactivo (plan en `docs/planes/mapa-correlativas/`).
Sin leyenda, pistas, contador ni porcentaje de zoom: cada estado se lee por forma y color
(los mismos glifos y colores que `EstadoControl`) y, al posarse, por un tooltip o por la
tarjeta de la materia.

- `lib/planner/layoutGraph.ts` (reescrito): `computeGraphLayout(plan, { electivas })` es puro
  (recibe el plan; solo `import type`) y parte de TODAS las materias, aisladas incluidas.
  Columnas por cuatrimestre nominal (año solo si falta el cuatrimestre; camino más largo si
  no hay nada), electivas un cuatrimestre después de su última correlativa y nunca antes de
  la columna donde el plan nominal acumula los créditos que piden; pasada de validez (toda
  arista va a la derecha; las columnas más allá del plan nominal no llevan cabecera);
  mediana por posición normalizada más una transposición geométrica del espinazo; espinazo
  de obligatorias arriba (misma fila con la capa de electivas encendida o apagada) y
  electivas colgando de un riel, en sub-columnas de 14; planes con año pero sin
  cuatrimestre (LCA) parten cada año en tantas columnas como su cadena más larga.
  `GraphLayout` cambia de forma: `GraphNode` suma `col/w/h`; `GraphColumn` pasa a
  `{index, x (borde izquierdo; antes era el centro), cx, width, year, top|null, sub|null}`;
  se agregan `bands`, `spineBottom` y `hasElectivas` (electivas en el lienzo); se quitan
  `nodeW/nodeH/headerH` (las medidas viven en `GRAPH_METRICS`); `computeGraphLayout(plan,
  { electivas })` reemplaza a `computeGraphLayout()` sin argumentos.
- `components/planner/grafo/` (nuevo): `useViewport.ts` (pan acotado, rueda —también en
  líneas y ctrl+rueda del trackpad—, pinch, tap/doble tap, `fitAll`/`frame`/`centerOn`,
  piso de escala que sigue al encuadre, transformación imperativa;
  `fitTransform`/`zoomAtPoint` puras), `grafoModel.ts` (adyacencia, cadena aguas arriba/abajo, `statusOf` con la misma
  verdad que `isAvailable` + `estadoOf`, frontera, búsqueda, vecinos por teclado),
  `GrafoStage.tsx` (SVG: bandas de año, cabeceras, riel, aristas en dos tonos, nodos con
  los glifos de `EstadoControl`), `GrafoCard.tsx` (tarjeta de hover/fijada con «Requiere»,
  «Habilita», `EstadoControl` y «Ver detalle»), `GrafoControls.tsx` (acercar, alejar, ver
  todo, ir a donde estoy — con `Tooltip`, sin `title=`) y `GrafoMinimap.tsx`. «Cursando» va
  en slate/`--link` como en el resto del planner; los textos de estado usan variantes de
  texto (`--status-*-text`, `--link`, `--accent-text`).
- `views/GrafoView.tsx` (reescrito): chips «Electivas» (capa, persistida) y «Cursables»
  (foco) con el mismo `vtools__chip` de «Materias»; búsqueda en vivo (Enter centra y fija;
  si solo coinciden electivas, enciende la capa); hover = cadena (necesita en tinta,
  destraba en acento) + tarjeta; clic = fijar; doble clic o «Ver detalle» = `DetailDrawer`
  (antes el clic abría el drawer); Esc suelta; roving tabindex con flechas; encuadre inicial
  en la frontera (primer cuatrimestre con obligatorias pendientes).
- `components/planner/grafo.css` (reescrito): todo por tokens, cero hex.
- `lib/planner/persist.ts`: `plan_grafo_electivas_v1` (`loadGrafoElectivas`/
  `saveGrafoElectivas`), preferencia de pantalla global.
- Fuera del espejo: `scripts/test-grafo-*.mts` (`npm run test:grafo`, regenera los datos y
  corre los tres; Node ≥ 22.18 con type stripping, `engines` en `package.json`; `tsconfig`
  con `allowImportingTsExtensions`).

## 22. Plan de cursada: «Te recibís en» cuenta las electivas que faltan (2026-09-15)

Con las obligatorias marcadas y ninguna electiva agregada, el resultado decía «Te recibís
en 1.º cuat. 2028 · mínimo posible» aunque el título pide 27 créditos de electivas que el
plan no tenía: la fecha era la de terminar las obligatorias, no la de recibirse.

- `lib/planner/optimize.ts`: `electivasFaltantes(approved, mats)` mide los créditos de
  electivas que el título pide y que ni lo aprobado ni el pool cubren, como demanda GENÉRICA
  (créditos, la menor cantidad de materias que los junta —las electivas candidatas de más
  créditos primero— y el crédito mayor). `lowerBoundLast(…, extra)` la suma a la cota: sus
  créditos entran en la acumulación optimista desde el segundo cuatrimestre y su carga en la
  cota de capacidad, así sigue siendo inferior sea cual sea la electiva que después se
  elija. `optimizePlan` la devuelve como `PlanResult.minLastTitulo` (con el horizonte
  máximo) junto a `electivasFaltan`; `minLast` no cambia (sigue siendo la cota del pool y lo
  que apuntan los reinicios). `lib/planner/model.ts`: `electivasReq()` (los créditos
  electivos del plan activo, antes duplicado en `PlanView` y `Topbar`).
- `views/PlanView.tsx`: mientras falten créditos electivos, el rótulo pasa a «Te recibís no
  antes de» y la fecha es `max(último cuatrimestre del plan, minLastTitulo)`; la línea de
  abajo suma «faltan N cr de electivas» (tono de aviso, tooltip: cuántos pide el título,
  cuántos junta el plan, la cota y que la fecha exacta depende de cuáles se agreguen).
  «Mínimo posible» sólo con los créditos electivos cubiertos; «Cómo se armó este plan» dice
  la cota con las electivas en vez de «coincide con la cota mínima». Estado vacío (todas las
  obligatorias aprobadas, sin electivas): «Te faltan N créditos de electivas para el título:
  agregá electivas al plan…».
- `scripts/optimizer-check/run.ts`: sin déficit `minLastTitulo === minLast`; con déficit,
  dos muestras de electivas reales (con horario) que lo cubren nunca terminan antes de la
  cota.
- Electivas sugeridas (`lib/planner/recommend.ts`, `suggestFill`): con los créditos sin
  cubrir, el resultado ofrece «Con electivas sugeridas: 2c-28 · 8 materias» (mismo trazo que
  «Con superposiciones»; tooltip con cada electiva, sus créditos y su cuatrimestre, y la
  fecha con ellas; un clic las agrega todas al pool). La elección recorre las
  recomendaciones en su orden y también con los créditos primero (menos materias cuando lo
  que aprieta es el tope de materias), toma electivas hasta juntar los créditos, simula el
  plan con todas juntas y descarta las que no entran; gana el orden que termina antes y, a
  igual egreso, con menos materias. El estado vacío (todo aprobado) lleva el botón «Sugerir
  electivas · N materias». El aviso «Ninguna electiva entra sin alargar la carrera» ya no
  sale con el plan vacío (sin plan, toda electiva «abre» el primer cuatrimestre).
  `planview.css`: `.pv-result__alt` pasa a `inline-block` para envolver como texto en
  columnas angostas. El check verifica que la sugerencia cubre el déficit, entra entera y
  termina donde dice.

## 23. Plan de cursada: «Otras combinaciones» (2026-09-15)

Recorrer las demás formas de repartir las mismas materias del plan sin correr el egreso: una
materia en otro cuatrimestre, o dos intercambiadas.

- `lib/planner/optimize.ts`: `planAlternatives(PL, approved, fixedCom, base, limit)` prueba
  cada movimiento de una materia libre (no fijada, no anual) a otro cuatrimestre del plan y
  cada intercambio de dos materias libres de cuatrimestres distintos; vale si el plan sigue
  siendo válido —correlativas, dependientes, créditos requeridos (`feasible`), paridad dura
  (sin supuestos nuevos), topes y comisiones sin superposiciones (reeligiendo las del
  cuatrimestre con `resolveComs` si hace falta)— y no termina más tarde ni suma
  superposiciones. Distintas por distribución (no por comisiones), ordenadas por el vector
  del optimizador (`scoreOf`), hasta 24; presupuesto de 900 evaluaciones (`ALT_BUDGET`).
  Cada `PlanAlternative` trae el `PlanResult` con sus `items`, `accBefore` y `delayed`, y
  `changes` (código, de, a). Costo típico: 1–10 ms.
- `views/PlanView.tsx`: en el resultado, el enlace «Otras combinaciones» (mismo trazo que
  «Con superposiciones») abre un paso a paso `‹ 2 / 9 ›` (1 = la del optimizador) con qué
  cambia en cada una («Der → 1c-28 · POD → 1c-27»), «Usar esta» y ×. La combinación elegida
  se ve en el plan entero como vista previa (`R` pasa a ser la alternativa: tarjetas,
  resumen, observaciones, arrastre, exportación); el carrusel corre hasta los cuatrimestres
  que cambian. Cualquier cambio del plan vuelve a la del optimizador y las combinaciones se
  rehacen sobre el plan nuevo. «Usar esta» (`commitAlt`) fija la combinación con los menos
  pines que la reproducen: las materias movidas y, si el optimizador arma otra cosa a igual
  egreso, también las que él cambia de lugar, hasta que coincide (verificado con
  `optimizePlan`). Editar el plan mientras se ve una combinación (arrastrar, fijar desde el
  roadmap o «Materias del plan», finalizar un cuatrimestre) la fija primero
  (`onBeforeChange` en `RoadmapStop` y `PlanPool`): lo que se tiene delante es lo que se
  edita. `planview.css`: `.pv-combos*`.
- `scripts/optimizer-check/run.ts`: cada combinación cumple las invariantes del plan, no
  termina más tarde, no suma superposiciones ni supuestos de paridad, no repite otra ni el
  plan base, y cambia una o dos materias.
- Pasada «más silencio» sobre el banner del plan (`/impeccable quieter`, 2026-09-15): las
  tres acciones del egreso («Con superposiciones 2c-27 · 1 choque», «Con electivas
  sugeridas …», «N combinaciones más») salían pegadas en una sola línea y con tres valores
  en acento compitiendo con la fecha. Ahora son una fila de chips en silencio
  (`.pv-result__acts`: hairline, sin relleno, valor en tinta, envuelve a 46ch); las
  combinaciones se calculan por adelantado sobre valores diferidos (mediana 0,7 ms, máximo
  ~60 ms) para mostrar cuántas hay y no ofrecer nada cuando no hay ninguna; el paso a paso
  vive en la misma fila y «Usar esta» es su único acento, suave (`--brass-soft`). Además:
  el objetivo elegido pasa de relleno sólido a tinte suave con texto de acento (el switch
  queda como único acento sólido de la fila), «Al final del plan» toma la voz de las demás
  etiquetas (`--faint`), «faltan N» de la tira queda en `--muted` (la línea del egreso ya
  lo dice en tono de aviso), «cubiertos» y «mínimo posible» usan `--status-go-text` (texto
  de estado, no `--sage` ni acento). El resultado se apila por debajo de 700 px (antes
  560): con la fila de acciones, las dos columnas no dejaban lugar a la barra de créditos.

## 24. Plan de cursada: el banner en tres líneas (2026-09-15)

Pasada de compactación (`/impeccable polish`, con permiso para reacomodar): el panel de
configuración medía 345 px a 600 px de ancho y 222 px en escritorio; queda en 231 y 124.

- `views/PlanView.tsx` / `planview.css`: el panel es una columna de tres líneas, la
  información arriba y los controles abajo. (1) Veredicto: icono + «Te recibís en» + fecha
  (lo único grande) + tamaño del plan y marcas (`.pv-verdict`, `.pv-mark`), todo en una
  frase que envuelve, con el chip «Sugerir 8 electivas · 2c-28» al lado de «faltan 27 cr de
  electivas». (2) «Al final del plan»: créditos electivos y minors en una línea que envuelve
  (`.pv-strip`). (3) Tras una divisoria, los parámetros sin rótulos encima: «desde 1.º cuat.
  2027» (el select dentro de una pastilla con prefijo, `.pv-ctl`), «− máx. 6 mat. +» y
  «− máx. 27 cr +» (`NumField` con `prefix`: el rótulo queda `sr-only`), el objetivo (sin
  «Objetivo» encima; el elegido en tinte suave) y el switch, con el chip «Con superposiciones
  2c-27 · 1 choque» pegado al switch que lo habilita. Los chips comparten `.pv-chip`.
- El paso a paso de combinaciones («⇄ N combinaciones más» → `‹ 2 / 9 ›`, qué cambia, «Usar
  esta», ×) se muda a la fila de pestañas, junto a las columnas 2 · 3 · 4: cambia lo que se
  ve abajo, como ellas, y la fila es sticky. En angosto (≤ 700 px) el chip omite «más».
- Sin las reglas responsive del grid anterior (`.pv-result*`, apilado a 1100/700 px): tres
  líneas que envuelven no necesitan reacomodo; a 375 px los dos topes comparten línea.
- La línea «Al final del plan» queda en «Minors · CD 0/14 · IRV 0/14 …» (sigla y créditos;
  nombre y «al final del plan» en el tooltip; las barritas y la barra de electivos se van):
  los créditos electivos ya los dice el veredicto —«faltan 27 cr de electivas» o, cubiertos,
  la marca «electivas cubiertas» (`--status-go-text`, tooltip)— y el recomendador. Sin
  minors en el plan, la línea no aparece.
- Panel de recomendaciones (`planner.css`): piso de 420 px de alto en el layout espejado
  (≥ 1080 px). Con un tablero corto (roadmap de dos cuatrimestres) el panel absoluto
  quedaba en un par de filas con scroll, como si se hubiera roto. Además, `recs`, `baseR` y
  `altR` recalculan también cuando cambia `lockedIdx` (finalizar o reabrir un cuatrimestre
  sin pines que soltar no los actualizaba).

## Fuera de los directorios espejados (no lo toca el sync)

`app/` (portada en `/`, planner en `/planificar/`, manifest instalable, iconos PNG, título
de página), `components/shell/` (barra, pie, portada `Landing.tsx` + `landing.css`,
`LegacyRedirect.tsx` para los links viejos con query en `/`), `lib/content/slug.ts`,
`lib/site.ts`, `scripts/`, `run.sh`: son propios del standalone y no tienen equivalente que
portar.
