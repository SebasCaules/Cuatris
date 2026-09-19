# EXEC_STATE — Mantenimiento comunitario de los datos

Rama `mantenimiento` (worktree `.claude/worktrees/mantenimiento`, creada desde
`main@907921c`). Cada etapa se hace en una rama corta `mant/N-*` desde `mantenimiento` y
vuelve con `merge --ff-only` tras pasar sus gates. Se mergea a `main` al cierre; push solo a
pedido del autor.

## Pasos

| Etapa | Estado | Commit | Notas |
|---|---|---|---|
| 0 · worktree, PLAN/EXEC_STATE | DONE | (este) | |
| 1 · `mant/1-validador` | TODO | | |
| 2 · `mant/2-triage` | TODO | | |
| 3 · `mant/3-workflows` | TODO | | |
| 4 · `mant/4-scraper` | TODO | | |
| 5 · `mant/5-finales` | TODO | | |
| 6 · `mant/6-docs-portada` | TODO | | |
| 7 · `mant/7-plataforma` | TODO | | |
| Prueba real de los workflows contra `mantenimiento` | TODO | | requiere pushear la rama (permiso del autor) |
| Cierre · merge a `main` | TODO | | push solo a pedido del autor |

## Decisiones durante la ejecución

- **E-01** `lib/planner/finalesFlags.ts` commiteado difiere del generado solo en el comentario
  de cabecera (rutas `Electivas/` → `data/plan/`): el dato es idéntico. Se resuelve en la
  etapa 5 al pasar la generación al build.
