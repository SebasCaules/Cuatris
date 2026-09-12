# 04 — Diseño (importado de Claude Design)

Exportación del proyecto **«Turno 5 UI mockups»**
(`claude.ai/design/p/1d7f02be-68c5-4c7a-8082-e7f4fb16cfc4`), tal como quedó el 2026-09-12.
Se descargó por la API del propio editor y se quitaron únicamente los scripts que el
editor inyecta para la vista previa; el contenido es el original.

| Archivo | Qué contiene | Decisión que registra |
|---|---|---|
| `etapa1-paletas.dc.html` | Turnos 1–5: cinco paletas, cruces, ficha completa | **Paleta 4a «Arena y ladrillo»** (turno 5): roles claro/oscuro, 8 estados con glifo, 10 colores de materia |
| `etapa2-widget.dc.html` | Turnos 6–9: doce widgets, seis tratamientos del choque, cuatro fusiones | **Widget 7a «cuatrimestre compacto»** con el choque según **9d** (tramo exclusivo + corte rayado + lista al pie con «Resolver») |
| `etapa3-mockup-v1.dc.html` | Turnos 10–12: primer mockup, vistas de 2/3/4+ cuatrimestres, carrusel vs. scroll | **Carrusel horizontal (12a)**; la grilla nunca se sacrifica por caber |
| `etapa3-mockup-v2.dc.html` | Turno 13: **mockup final, 10 pantallas (13a–13j)**; turno 14: marca de minor | **Pantallas de referencia para la SPA**; marca de minor **14b** (chip de contorno con la sigla) aplicada en 13c |
| `support.js` | Runtime genérico del formato `.dc.html` (no es código del proyecto) | — |
| `tokens.md` | Tokens extraídos de los archivos: colores, tipografía, métricas de la grilla | Fuente para `tokens.css` de la SPA |

## Cómo verlos

Los `.dc.html` cargan `./support.js` por ruta relativa y las fuentes IBM Plex desde Google
Fonts, así que hay que servirlos, no abrirlos con doble clic:

```bash
python3 -m http.server 8766 --directory entregables/04-diseno
```

y luego `http://127.0.0.1:8766/etapa3-mockup-v2.dc.html#13b` (el ancla salta a la pantalla).

## Las diez pantallas del mockup v2

| Id | Pantalla | Ancho |
|---|---|---|
| 13a | Primer ingreso · plan vacío (pegar historia académica / marcar a mano) | 1280 |
| 13b | Plan completo · carrusel con dos cuatrimestres y el tercero asomando | 1280 |
| 13c | Buscar y agregar materia (panel derecho, filtros, chips de minor) | 1280 |
| 13d | Elegir comisión (lista comparable + vista previa recalculada) | 1060 |
| 13e | Ficha de materia | 560 |
| 13f | Materia bloqueada por correlativas («se destraba en…») | 560 |
| 13g | Carrusel en el tramo futuro (sin horarios publicados) | 1280 |
| 13h | Plan con choques sin resolver (banner + lista, caso ↕ de sedes) | 1280 |
| 13i | Progreso · títulos, electivas y minors | 1280 |
| 13j | Sugerir corrección de datos | 520 |

Lo que el mockup **no** cubre y queda anotado en el plan de sprints: versión móvil, modo
oscuro aplicado a las pantallas (la paleta sí lo define), el flujo «marcar materias a mano»,
«mover a otro cuatrimestre», y qué abre exactamente «Resolver».
