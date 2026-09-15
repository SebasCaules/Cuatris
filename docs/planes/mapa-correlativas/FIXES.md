# FIXES — Mapa de correlativas v2 (fixes diferidos y tareas sugeridas)

| S | Fix | Superficie | Origen | Cuándo |
|---|---|---|---|---|
| S-01 | Puntos de área/minor en los nodos de electivas (mismo `AREA_COLOR` que `MinorBadge`) y el área en la tarjeta | GrafoStage, GrafoCard | F0 (fuera de alcance) | a pedido |
| S-02 | Portar el mapa v2 a StudyVaults (`site/components/planner`, `site/lib/planner`) | StudyVaults | F0 | a pedido del autor |
| S-03 | Dato de Ingeniería Electricista: 31.27 «Mecanismos y Elementos de Máquinas» pide la correlativa 31.17, que no está en el plan (queda bloqueada para siempre; el mapa la marca «no está en el plan de esta carrera»). Verificar en el SGA y corregir `data/plan/carreras/E.json` | datos | auditoría (DATOS-7) | cuando el autor revise el SGA |
| S-04 | Pasar `nodeById` de la vista al stage (hoy cada uno arma el mismo Map por layout) | GrafoStage, GrafoView | auditoría (DOCS-8) | a pedido |

## Chips spawneados

(ninguno)
