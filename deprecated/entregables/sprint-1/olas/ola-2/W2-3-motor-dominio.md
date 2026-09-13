# W2.3 — Motor de dominio de la SPA (TypeScript puro, sin React)

## Ownership

- `app/src/motor/**` (código y tests), `app/src/motor/fixtures/**`

No toques nada fuera de `app/src/motor/`. Usa los tipos de `app/src/contrato/tipos.ts` tal
como están; si te falta un tipo, defínelo dentro de `motor/` y anótalo en `notes`.

## Lee

- `CLAUDE.md`; `entregables/sprint-1/CONTRATO-v1.md` §1, §2, §3, §6.
- `entregables/05-plan-sprints.md` §2 (tabla pantalla → lógica de dominio, y la lista del
  «Motor de dominio») y §3 (hallazgos 1, 2, 7, 8).
- Datos reales para tests: `data/v1/planes/S10-Rev23.json`, `data/v1/abreviaciones.json`,
  `tests/fixtures/deben-pasar/horarios-casos-raros.json` (impórtalos por ruta relativa desde
  los tests; no los copies).

## Entregables (funciones puras, cada una con tests)

1. `creditosAprobados(historia, plan)`, `itemsAprobados(...)`.
2. `creditosAlEmpezar(periodo, planUsuario, plan)`: aprobados + suma de lo planificado en
   períodos anteriores (simulación optimista; orden cronológico de `PeriodoId`).
3. `estadoMateria(codigo, periodo, planUsuario, plan, horarios?)` →
   `aprobada | cursando | planificada | disponible | bloqueada`, y
   `motivosBloqueo(...)` → lista tipada: `{tipo: "correlativa", codigo, estado: "falta" |
   "planificada_en", periodo?}` y `{tipo: "creditos", requeridos, tienes}`; una correlativa
   planificada en un período **anterior** cuenta como aprobada (optimista), en el mismo
   período o posterior bloquea.
4. `seDestrabaEn(codigo, planUsuario, plan)` → primer período (desde el actual, hasta 12
   períodos adelante) en que `motivosBloqueo` queda vacío, o `null`.
5. `choques(periodo, planUsuario, horarios)` → pares de bloques de materias distintas del
   mismo período que se solapan (mismo día, `desde < otroHasta && otroDesde < hasta`, con
   períodos de curso que se solapan), con la comisión elegida de cada materia; sin comisión
   elegida no hay bloques. `cambiosDeSede(...)` → bloques consecutivos (`hasta == desde`
   del siguiente, mismo día) en sedes distintas, marcados ↕, no bloquean.
6. `progresoTitulos(planUsuario, plan)`: por título `{alcanzado, creditos, requeridos,
   faltanItems: Codigo[], estimado: PeriodoId | null}` donde `estimado` es el período en que
   la simulación optimista cumple **ítems y créditos**; Analista exige todos los ítems del
   ciclo básico (incluidos los de 0 créditos).
7. `electivas(planUsuario, plan)` → `{aprobados, planificados, requeridos: 27, lista}`;
   `minors(planUsuario, plan)` → por minor `{sigla, nombre, creditos, minimos: 14, faltan}`.
8. `ordenarComisiones(codigo, periodo, planUsuario, horarios)` → comisiones con
   `{id, choques: n, cupoLleno, cambiosDeSede: n, consecuencias: string[]}` ordenadas: sin
   choques primero, luego con cupo antes que llenas, luego menos cambios de sede, luego `id`.
9. `habilita(codigo, plan)` → materias que la tienen como correlativa.
10. `buscar(texto, plan, abreviaciones, horarios?)` → por código, nombre (sin acentos ni
    mayúsculas), abreviación y docente; devuelve códigos ordenados por relevancia (código
    exacto > prefijo > abreviación > nombre > docente).
11. `parsearHistoria(texto, plan)` (S-01, versión tolerante): por línea, código por regex
    `\d{2}\.\d{2}`, estado por palabra clave (`aprobad`, `regular`, `cursand`; sin palabra →
    `aprobada`); devuelve `{reconocidas, noReconocidas: string[]}`. Sin muestra real del SGA,
    tests solo sobre el formato del mockup (`93.18 Álgebra Lineal 9 Aprobada`).

## Tests obligatorios (escenario del mockup, con datos reales del plan)

- Historia con las materias del ciclo básico aprobadas → Analista alcanzado; 72.45 bloqueada
  por créditos y por 72.41; al planificar 72.41 en un período y contar los créditos, `seDestrabaEn`
  devuelve el período correcto.
- 93.18 comisión A vs 72.44 comisión S el lunes → un choque; con otra comisión de 93.18 sin
  solapamiento → cero choques (usa las comisiones reales de la fixture).
- Comisión B de 93.18 con dos aulas simultáneas **no** cuenta como choque consigo misma.
- `ordenarComisiones` respeta los cuatro criterios en ese orden.
- `buscar("pod")` encuentra 72.42 por abreviación; `buscar("cripto")` 72.44.
- Los siete casos raros no producen excepciones en ninguna función.

## Criterios de aceptación

- `cd app && npm run typecheck && npm run lint && npm test -- --run` verde.
- Ninguna importación de React ni del DOM dentro de `motor/`.
