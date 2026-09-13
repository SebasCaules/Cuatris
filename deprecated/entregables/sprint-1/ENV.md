# ENV — entorno compartido para todos los workers del Sprint 1

Lee esto entero antes de tu tarea. Es corto a propósito; lo que referencia, léelo solo en la
parte indicada.

## Proyecto

Cuatris: planificador de cursada del ITBA. SPA React en GitHub Pages, sin servidor; los datos
son JSON versionados en el repositorio; una CLI en Python los mantiene. Raíz del repositorio:
`/Users/sebastiancaules/Desktop/Projects/Cuatris`. **Lee `CLAUDE.md` en la raíz** (reglas del
proyecto) y `entregables/sprint-1/CONTRATO-v1.md` (formas exactas de los datos).

Referencias, solo la parte que se indique en tu tarea:
- `entregables/02-plan-backend.md` — plan de backend (Fases 0–6).
- `entregables/05-plan-sprints.md` — §2 inventario de pantallas, §4 arquitectura de la SPA.
- `entregables/04-diseno/tokens.md` — colores, tipografía, métricas.
- `material-raw/02-sga/HALLAZGOS.md` — cómo es el HTML del SGA y los casos raros reales.
- `material-raw/` — fuentes crudas (PDFs, HTML, Excel). **Nunca se copia al repo sin
  anonimizar**: los HTML traen `CAULES, SEBASTIAN` en la barra superior; reemplazar por
  `APELLIDO, NOMBRE` antes de guardarlos en `tests/corpus/`.

## Stack y herramientas

- **Python 3.11+** (local: 3.12 en `.venv/bin/python`, ya creado con las dependencias
  instaladas). CLI con `argparse` (stdlib). Dependencias permitidas: `fastjsonschema`,
  `beautifulsoup4`, `openpyxl`, `httpx`; dev: `pytest`, `ruff`. Ninguna otra sin devolver
  `blocked` con la justificación. Paquete en `tools/cuatris/`; `tools/pyproject.toml` lo
  mantiene el orquestador: si necesitas declarar algo ahí, ponlo en `deps` del retorno.
- Tests de Python: `cd /Users/sebastiancaules/Desktop/Projects/Cuatris && .venv/bin/python -m pytest tests/tools -q`.
  Lint: `.venv/bin/ruff check tools tests`.
- **Node 20+** (local: 23). `app/` con Vite + React 18 + TypeScript 5 + vitest +
  @testing-library/react. **Sin framework de componentes, sin librería de estado, sin
  react-router** (enrutado por hash propio). Tests: `cd app && npm test -- --run`;
  `npm run typecheck`; `npm run build`.
- Git: **no hagas commits ni cambies de rama**. El orquestador commitea al cerrar la ola.

## Reglas duras

1. **No inventes datos.** Códigos, nombres, horarios, aulas, sedes y docentes salen de
   `material-raw/` o del contrato. Si un dato que necesitas no existe, devuelve `blocked`.
2. **Toca solo los archivos de tu ownership** (listados en tu tarea). Si necesitas cambiar
   otro archivo, descríbelo en `notes` y no lo toques.
3. **Español neutro** (tú/usted) en documentación, comentarios, mensajes de error y nombres
   de CLI (`cuatris validar`, no `validate`). Identificadores de código en español, sin
   acentos (`cargar_indice`, `parsearComisiones`). **Los textos de la interfaz** —los del mockup y
   los nuevos que haga falta escribir— van en el registro del mockup (voseo, dirigido a
   estudiantes del ITBA); un texto de interfaz en tú/usted es una inconsistencia, no una
   virtud.
4. **Nada de credenciales**: ni en código, ni en tests, ni en fixtures. Nada de llamadas al
   SGA real en tests.
5. **Falla ruidosamente**: un parser que encuentra algo que no reconoce lanza una excepción
   con el fragmento problemático; nunca produce un JSON con campos vacíos en silencio.
6. **Antes de declarar `ok: true`, corre los tests y pega el comando y el resultado real** en
   `testsRun`. Un test que no corriste no cuenta.

## Formato de retorno (build)

```json
{ "files": ["ruta/relativa", "…"],
  "deps": ["paquete==versión que necesito declarado en pyproject o package.json"],
  "testsRun": "comando exacto → resumen real (p. ej. 14 passed)",
  "ok": true,
  "notes": "decisiones que tomaste, supuestos, diferencias con las fuentes",
  "blocked": "" }
```

`blocked` no vacío = no pudiste terminar; explica la pregunta exacta o el dato que falta.

## Formato de retorno (verificación)

```json
{ "verdict": "VERDE" | "ROJO",
  "findings": [ { "severity": "alta" | "media" | "baja", "detail": "qué falla, con archivo:línea y cómo lo reprodujiste" } ],
  "testsPass": true }
```

ROJO si hay al menos un finding `alta`. El verificador **no edita archivos**.
