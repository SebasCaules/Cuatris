# Ola 4 — Auditoría final adversarial del Sprint 1

La última red antes del veredicto. Auditores horizontales (una dimensión cada uno, no una
unidad), refutación independiente de cada finding alto o medio, fix de lo confirmado,
re-corrida de todos los gates y smoke con datos reales. Los veredictos los adjudica N0.

## Dimensiones

| Id | Dimensión | Qué mira | Cómo lo refuta |
|---|---|---|---|
| A1 | Seguridad del pipeline de datos y de CI | `.github/workflows/*`, `CODEOWNERS`, `tools/cuatris/validar/{triage_pr,guardarrailes}.py`, `vendor/`, ausencia de secretos; los vectores A1–A14 de `entregables/02-plan-backend.md` (Fase 4) uno por uno | Intenta construir un PR que pase el gate sin ser datos (workflow reescrito, symlink, JSON profundo, HTML en un nombre, `__proto__`); revisa que `pull_request_target` nunca ejecute nada del PR |
| A2 | Fidelidad del contrato | `schemas/v1/*`, `entregables/sprint-1/CONTRATO-v1.md`, `data/v1/*`, `app/src/contrato/`, `docs/contrato.md` | Busca campos que existan en uno y no en otro, enums distintos, reglas documentadas que ningún validador aplica (y viceversa) |
| A3 | Reglas del dominio | `app/src/motor/**` contra el plan real y las reglas del ITBA: títulos por ítems (Analista = todo el ciclo básico incluidos los de 0 cr), minors de 14, `creditos_requeridos`, correlativas optimistas, choques, ↕ | Escribe escenarios nuevos con datos reales (no los de los tests existentes) y comprueba a mano el resultado esperado |
| A4 | Interfaz contra el mockup y accesibilidad | Recorre en el navegador (`npm run dev` con `data/` real): 13a → marcar aprobadas → 13b → agregar (13c) → elegir comisión (13d) → ficha (13e) → conflicto (13h) → resolver → exportar/importar; teclado y `aria-*` en carrusel, modal y panel; registro de los textos (voseo consistente) | Cada desviación estructural del mockup y cada control muerto es finding; un texto en tú/usted dentro de la interfaz es finding medio |
| A5 | Calidad de los tests | `tests/tools/**`, `app/src/**/*.test.*`: mocks tautológicos, tests sin aserción real, casos raros no cubiertos, tests que pasan con el código roto (muta una regla y comprueba que algún test cae) | Tres mutaciones a mano en motor y en el validador; si ningún test cae, finding alto |
| A6 | Scraper y operación | `tools/cuatris/sga/**`, `docs/scraping-sga.md`, `docs/ci.md`, `README.md`, `CLAUDE.md`: ¿puede alguien sin contexto correr el scraper, cargar un período y publicarlo? | Sigue el instructivo literalmente en seco (sin credenciales) y anota cada paso que falta, sea ambiguo o mienta |

## Reglas para los auditores

- Solo lectura. Findings con `severity`, `detail` (archivo:línea y reproducción), `fix`
  propuesto de una línea.
- **No re-litigar** lo adjudicado: las decisiones N0-0…N0-14 y la tabla S-nn de
  `EXEC_STATE.md` son cosa juzgada; un finding que las repita se descarta.
- Prefiere un finding reproducible a diez opiniones.

## Refutación

Por cada finding alto o medio, un refutador independiente intenta demostrar que es falso o
irrelevante. Por defecto, si no reproduce la evidencia exacta, el finding queda **REFUTADO**.
Solo lo CONFIRMADO se corrige.

## Cierre

1. Fix de todo lo confirmado, por clúster de archivos, sin salirse del clúster.
2. Gates completos: `pytest`, `ruff`, `guardarrailes`, `indice`, `validar --data data`,
   `typecheck`, `lint`, `vitest`, `build`.
3. Smoke con datos reales (N0): recorrido del MVP en el navegador con el período real bajado
   por el autor; si todavía no existe, con la fixture de casos raros publicada como período
   de prueba en una rama.
4. Veredicto en `EXEC_STATE.md`: cero altas abiertas; bajas a S-nn.
