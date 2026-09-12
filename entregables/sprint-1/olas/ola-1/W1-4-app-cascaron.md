# W1.4 — Cascarón de la SPA: Vite + React + TS, tokens, fuentes, datos, estado, enrutado

## Ownership

- Todo `app/**` (es tuyo por completo en esta ola). Nada fuera de `app/`.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` §1–§6 (todas las formas; §6 es el
  estado del usuario).
- `entregables/05-plan-sprints.md` §4 «Arquitectura de la SPA» y §2 (solo la fila 13b, para
  saber qué regiones tiene la pantalla).
- `entregables/04-diseno/tokens.md` **entero**.
- Para ver el aspecto: `entregables/04-diseno/README.md` explica cómo servir los mockups;
  mira 13a y 13b en `etapa3-mockup-v2.dc.html` (sección `#13b`).

## Entregables

1. **Proyecto** `app/` con Vite 5+, React 18, TypeScript 5 estricto, vitest +
   @testing-library/react + jsdom, ESLint mínimo (typescript-eslint, react-hooks). Scripts:
   `dev`, `build`, `preview`, `test`, `typecheck`, `lint`. `base` de Vite sale de la variable
   `VITE_BASE` (por defecto `/`; en Pages será `/Cuatris/`). Sin react-router, sin librería de
   estado, sin framework de componentes, sin CSS-in-JS: **CSS plano con variables** y un
   archivo `.css` por componente.
2. **`app/src/estilos/tokens.css`**: todas las variables de `tokens.md` (roles claro y
   oscuro con `prefers-color-scheme` y `data-tema`, diez colores de materia como
   `--materia-0…9`, tipografía `--fuente-texto`/`--fuente-mono`, radios, escala de la grilla
   `--hora-px`). `app/src/estilos/base.css`: reset breve, `body` con fondo y fuente.
3. **Fuentes vendorizadas** en `app/src/fuentes/`: Newsreader (variable, `ital,opsz,wght`,
   400–600) y JetBrains Mono (variable, `wght` 400–700), subconjuntos latín y latín extendido,
   en woff2, **con sus archivos de licencia OFL al lado**, y `fuentes.css` con los
   `@font-face` (`font-display: swap`). Descárgalas de Google Fonts o de los repositorios
   oficiales; anota en `notes` de dónde y la versión. Nada de `<link>` a Google Fonts.
4. **Tipos del contrato** en `app/src/contrato/tipos.ts`, escritos a mano a partir de
   CONTRATO-v1.md (interfaces `Horarios`, `Curso`, `Comision`, `Bloque`, `Plan`, `Materia`,
   `Titulo`, `Minor`, `Abreviaciones`, `Vocabulario`, `Indice`, más `PlanUsuario` del §6).
   Enums como uniones de literales. (En la Ola 2 se generan desde los schemas; deja un
   comentario que lo diga.)
5. **Carga de datos** `app/src/datos/cargar.ts`: `cargarIndice()`, `cargarPlan(id)`,
   `cargarHorarios(periodo)`, `cargarAbreviaciones()`, `cargarVocabulario()`, todas relativas
   a `import.meta.env.BASE_URL + "data/"` y con `?v=<hash>` tomado del índice; `periodoActivo(indice, hoy)`
   con la regla del §5 (activo / vista previa / próximo). Si `contrato` tiene un major
   distinto de 1 → lanza `ContratoIncompatible` con mensaje para la pantalla «los datos son
   más nuevos que la aplicación». **Servidor de desarrollo**: un plugin de Vite que sirva el
   directorio `../data` del repositorio bajo `/data/` (con `server.fs.allow`); en el build no
   se copia nada (lo hace el workflow de deploy). Crea `app/src/datos/ejemplo/` con un índice,
   un plan y un archivo de horarios **mínimos y válidos** para los tests (dos cursos, dos
   comisiones; valores tomados del ejemplo de CONTRATO-v1.md, sin inventar más).
6. **Estado del usuario** `app/src/estado/`: `PlanUsuario` con `useReducer` + contexto,
   persistencia en localStorage bajo `cuatris.plan_usuario` (debounce corto), migraciones por
   `version` (función `migrar(desconocido) -> PlanUsuario` que valida forma y versión y lanza
   ante datos corruptos, sin borrar el original), acciones mínimas: `cargarHistoria`,
   `marcarAprobada`, `agregarMateria(periodo, codigo)`, `quitarMateria`, `elegirComision`,
   `moverMateria`, `asignarColor` (por orden de agregado, 0–9, cíclico), `setVisibles`.
   `exportar() -> string` (JSON canónico) e `importar(texto)` con validación.
7. **Enrutado por hash** `app/src/rutas.ts`: hook `useRuta()` que parsea
   `#/plan`, `#/progreso`, `#/materia/<codigo>`; navegación por `location.hash`.
8. **Cascarón visual** `app/src/App.tsx` + componentes `BarraSuperior` (nombre de la
   carrera, `plan S10-Rev23 · ITBA`, pestañas Plan/Progreso, campo de búsqueda inerte, botón
   «Sugerir corrección» inerte), `Disposicion` con las tres regiones de 13b (barra, zona
   principal, panel derecho fijo), y marcadores de posición con el texto de la sección
   correspondiente del mockup. Estados de carga y de error de datos (`ContratoIncompatible`,
   red caída) como pantallas simples con los tokens.
9. **Tests** (vitest): estado (reducer, persistencia, migración, exportar/importar ida y
   vuelta), carga (fetch simulado con `app/src/datos/ejemplo/`, `periodoActivo` en sus tres
   casos, `ContratoIncompatible`), rutas, y un test de render del cascarón.

## Criterios de aceptación

- `cd app && npm ci && npm run typecheck && npm run lint && npm test -- --run && npm run build`
  todo verde; el `dist/` no contiene referencias a `fonts.googleapis.com`.
- `VITE_BASE=/Cuatris/ npm run build` produce rutas de assets bajo `/Cuatris/`.
- Con `npm run dev`, `http://localhost:5173/data/index.json` responde si existe
  `data/index.json` en la raíz del repositorio (para probarlo, crea uno temporal desde el
  ejemplo y bórralo después; no dejes archivos fuera de `app/`).
