# `app/` — la SPA de Cuatris

Vite + React 18 + TypeScript estricto. **Sin** framework de componentes, **sin** librería de
estado, **sin** react-router y **sin** CSS-in-JS: CSS plano con variables y un `.css` por
componente.

## Comandos

```bash
npm ci
npm run dev        # servidor de desarrollo; sirve además ../data bajo /data/
npm run typecheck
npm run lint
npm test -- --run
npm run build      # dist/
npm run preview
```

`base` de Vite sale de la variable de entorno `VITE_BASE` (por defecto `/`). En GitHub Pages
el sitio cuelga de `/Cuatris/`:

```bash
VITE_BASE=/Cuatris/ npm run build
```

## Mapa

| Ruta | Qué es |
|---|---|
| `src/contrato/tipos.ts` | Tipos del contrato de datos v1, a mano. En la Ola 2 se generan desde `schemas/v1/*.json`. |
| `src/datos/cargar.ts` | `cargarIndice`, `cargarPlan`, `cargarHorarios`, `cargarAbreviaciones`, `cargarVocabulario`, `periodoActivo`. Todo cuelga de `import.meta.env.BASE_URL + "data/"` y viaja con `?v=<hash>` del índice. |
| `src/datos/ejemplo/` | Fixtures de prueba. Ver su `LEEME.md`: no son datos publicables. |
| `src/estado/` | `PlanUsuario` (CONTRATO-v1 §6): reductor puro, migraciones, exportar/importar y persistencia en `localStorage` bajo `cuatris.plan_usuario`. |
| `src/rutas.ts` | Enrutado por hash: `#/plan`, `#/progreso`, `#/materia/<codigo>`. |
| `src/estilos/` | `tokens.css` (paleta 4a «Arena y ladrillo», claro y oscuro) y `base.css`. |
| `src/fuentes/` | Newsreader y JetBrains Mono vendorizadas en woff2, con sus OFL. La aplicación **no** pide nada a Google Fonts en tiempo de ejecución. |
| `src/componentes/` | Cascarón: `BarraSuperior`, `Disposicion`, `Marcador`, `PantallaEstado`. |

Los datos **no** se copian en el build: el workflow de despliegue coloca `data/` junto al
sitio. En desarrollo, un plugin de `vite.config.ts` sirve `../data` bajo `/data/`.

Los textos de la interfaz siguen el mockup (`entregables/04-diseno/etapa3-mockup-v2.dc.html`),
que está en voseo a propósito porque le habla a estudiantes del ITBA. El resto —comentarios,
documentación, nombres— va en español neutro.
