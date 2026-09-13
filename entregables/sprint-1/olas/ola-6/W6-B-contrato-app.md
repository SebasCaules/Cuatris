# W6-B — Contrato 1.1.0: `domingo` y `virtual` en el schema, los docs y la app

## Por qué

La corrida real del scraper (2026-09-12) trajo dos valores que el contrato no representaba:

- **61.27** tiene en sus cuatro comisiones un bloque **en domingo** (`Domingo 13:00 - 14:00`,
  modalidad «Virtual asincrónica», sin aula ni sede) además de un bloque presencial en la
  Sede Distrito Financiero. El enum `dia` decía «`domingo` no existe».
- **25.20** comisión K tiene un bloque `Miércoles 15:00 - 18:00` con modalidad **«Virtual»** a
  secas: el SGA no dice si es sincrónica y no se asume. El enum `modalidad` no lo tenía.

Decisión N0-28: el contrato pasa a **1.1.0** (extender un enum es un cambio *minor*: los
lectores viejos no rompen, pero tienen que aprender el valor nuevo). El scraper (W6-A, en
paralelo) ya emite `domingo`, `virtual` y `contrato: "1.1.0"`.

## Ownership

`schemas/v1/horarios.schema.json`, `docs/contrato.md`, `entregables/sprint-1/CONTRATO-v1.md`,
`app/src/**` (incluido `app/src/contrato/generado/` vía `npm run tipos`),
`tests/tools/test_esquema.py`, `tests/tools/test_invariantes.py`, `tests/fixtures/deben-pasar/`
(agregar un fixture). **No toques** `tools/`, `tests/tools/test_sga_*.py`, `tests/corpus/`,
`docs/scraping-sga.md` (son de W6-A, que trabaja en paralelo).

## Lee

`CLAUDE.md`; `entregables/sprint-1/ENV.md`; `entregables/sprint-1/CONTRATO-v1.md` (§1 horarios
y la nota sobre `sabado`); `docs/contrato.md`; el schema; `app/src/motor/horarios.ts` (`DIAS`
y cómo `sabado` va «al pie de la tarjeta»), `app/src/componentes/GrillaSemanal/`,
`app/src/componentes/FichaMateria/FichaMateria.tsx` (mapas de etiquetas), y todo lo que
`grep -rn "sabado\|virtual_sincronica\|modalidad" app/src` devuelva.

## Entregables

1. **Schema**: `dia` suma `domingo` al final; `modalidad` suma `virtual` (description: «Virtual
   sin especificar si es sincrónica, tal como lo publica el SGA»). Nada más cambia.
2. **Docs**: en `docs/contrato.md` y `CONTRATO-v1.md`, las tablas de `dia` y `modalidad`; la
   nota «`domingo` no existe» se reemplaza por el caso real (61.27, bloques virtuales
   asincrónicos en domingo, corrida del 2026-09-12); una sección/entrada de versiones que diga
   qué agregó 1.1.0 y por qué es *minor*. El scraper mapea «Virtual» → `virtual` y «Domingo» →
   `domingo`; «Presencial - SDR» → `presencial` (lo documenta W6-A en su instructivo; aquí basta
   la fila del enum).
3. **Fixture real** en `tests/fixtures/deben-pasar/`: un archivo de horarios `1.1.0` con **61.27
   y 25.20 tal como los publica el SGA** (datos reales, no inventados):
   - 61.27, comisiones A–D, docentes `Yañez, Esteban Hernan` / `Rottenschweiler, Sergio
     Gabriel` / `Maria Fernanda, Tamborini` / `Park, Leonardo Fernando` / `Abayu, Jorge
     Alejandro` (A y B); C: `Rottenschweiler…`, `Maria Fernanda, Tamborini`, `Abayu…`, `Añes,
     Pablo Blas`; D: `Rottenschweiler…`, `Maria Fernanda, Tamborini`, `Curvale, Ernesto Manuel`,
     `Abayu…`, `Añes, Pablo Blas`. Bloques: A = domingo 13:00–14:00 `virtual_asincronica`
     sede `null` aulas `[]` + miércoles 19:00–21:00 presencial `sdf` `["801F"]`, cupo 48,
     inscriptos 41; B = domingo 12:00–13:00 asinc. + jueves 19:00–21:00 `sdf` `["702F"]`,
     24/24; C = domingo 14:00–15:00 asinc. + jueves 16:00–18:00 `sdf` `["401F"]`, 48/48;
     D = domingo 12:00–13:00 asinc. + miércoles 16:00–18:00 `sdf` `["301F"]`, 41/33.
   - 25.20, comisión K, docentes `DI SANZO, BRUNO` / `Jacoby, Daniel` / `BEADE, NICOLAS
     AGUSTÍN` / `Bergerman, Matías`; bloques miércoles 15:00–18:00 `virtual` sede `null`
     aulas `[]` + viernes 19:00–22:00 `blended` `sdt` `["102T"]`; cupo 24, inscriptos 17.
   - Nombres de materia y departamento: **no los inventes**; toma los del plan
     (`data/v1/planes/S10-Rev23.json`) si los códigos están, y si alguno no está, usa el
     nombre tal como aparece en `.cuatris-cache/2026-2C-61.27.html` / `-25.20.html`
     (`<h3>` y filas de la cabecera del detalle; ese directorio es local y no se copia).
     Período: `2026-2C`, `desde 2026-07-26`, `hasta 2026-12-31`, `fuente.capturado`
     `2026-09-12`, `ocupacion.al` `2026-09-12`. Forma canónica (`cuatris fmt`). Debe pasar
     `.venv/bin/cuatris validar --data data <fixture>` y el test que recorre `deben-pasar/`.
4. **Tests de Python**: en `test_esquema.py`, `domingo` y `virtual` válidos; un valor fuera del
   enum sigue rechazado. Si `test_invariantes.py` asume algo sobre los días (por ejemplo que
   `sabado` es el último), ajústalo.
5. **App**:
   - `cd app && npm run tipos` para regenerar `app/src/contrato/generado/horarios.ts`.
   - Todos los mapas `Record<Dia, …>` y `Record<Modalidad, …>` que `typecheck` marque:
     `motor/horarios.ts` (`DIAS`: `domingo` al final, mismo tratamiento que `sabado`: al pie de
     la tarjeta, después de sábado; y la etiqueta larga), `GrillaSemanal`, `ModalComisiones/
     textos.ts`, `PanelAgregar/resultados.ts`, `FichaMateria` (`virtual: "Virtual"`),
     `ListaConflictos`, `PaginaCursada`, y cualquier otro. Etiquetas en el registro del mockup
     (voseo donde hable al estudiante; «Dom» / «domingo» / «DOM» siguiendo el patrón de `sabado`).
   - Motor: comprueba cómo se tratan las modalidades en choques y en la grilla (`grep -rn
     "asincronica" app/src/motor`). `virtual` se trata **como `virtual_sincronica`** (tiene hora
     fija: cuenta para choques y se dibuja); `virtual_asincronica` sigue como hoy. Si el motor
     dibuja u omite por modalidad, el caso nuevo queda cubierto por un test.
   - Un bloque en `domingo` se dibuja al pie como los de sábado (test con Testing Library sobre
     `GrillaSemanal` usando un bloque domingo `virtual_asincronica`, sede `null`: no debe
     romper el render por la sede nula).
   - `app/src/datos/ejemplo/` **no** cambia (sigue en `1.0.0` y es válido).
6. **Gates**: `cd app && npm run typecheck && npm run lint && npm test -- --run && npm run build`;
   Python: `.venv/bin/python -m pytest tests/tools/test_esquema.py tests/tools/test_invariantes.py tests/tools/test_validar.py -q`
   (o los archivos que existan con esos nombres; lista los que corriste). El suite completo de
   Python puede fallar en `test_sga_*` mientras W6-A trabaja: no es tuyo, repórtalo en `notes`.

## Retorno

Formato de build de `ENV.md`, con los comandos exactos y los resultados reales en `testsRun`.
