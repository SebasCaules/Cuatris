# Capturas del SGA — Académica → Carreras

Las baja `data/plan/bajar-carreras.py` (login con la cuenta del autor, en su máquina; las
credenciales no se guardan) y ya las deja anonimizadas; también se pueden guardar a mano
(`Cmd+S` → «Página web, completa»; la carpeta `_files/` no hace falta). Las lee
`scripts/build-carreras-data.mjs` (`npm run carreras`) y emite `data/plan/carreras.json` y
`data/plan/carreras/<CODIGO>.json`.

```bash
python3 data/plan/bajar-carreras.py          # pide usuario y contraseña; ~20 peticiones
```

| Archivo | Pantalla del SGA |
|---|---|
| `carreras.html` | Académica → Carreras, filtro Nivel = `Grado` (el listado completo) |
| `<CODIGO>-planes.html` | En esa lista, icono **Ver detalles** de la carrera: `Listado de Planes de estudio` (nombre, versión, activo desde/hasta), uno por fila |
| `<CODIGO>-plan.html` | En ese listado, **Ver detalles** del plan más nuevo (mayor «Activo desde»): `Detalle de Planes de estudio` con los bloques (ciclos, electivas por área, orientaciones), sus materias y los títulos otorgados |

`CODIGO` es el de la columna Código: `S`, `I`, `K`, `BIO`, `LAES`… No hace falta «Ver títulos»:
la página del plan ya trae los títulos al pie. `debug/` (fuera de git) guarda pantallas
inesperadas para diagnosticar.

Antes de guardar, reemplazar el nombre del usuario de la barra superior
(`APELLIDO, NOMBRE` en las capturas de este directorio): el repositorio es público.
Las URLs cifradas que quedan en el HTML caducan con la sesión y no sirven para nada.
