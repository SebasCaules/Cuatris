# DESIGN.md — Paleta de colores del Plan de cursada (planner StudyVaults)

> Documento de referencia de la **paleta** que usa la vista «Plan de cursada» del planner
> (`/electivas/planificar`): su calendario semanal, el roadmap por cuatrimestre, el control
> de estado de materias, los minors y el documento imprimible que exporta. Derivado del
> código vigente el 2026-09-12; no introduce valores nuevos. Los tokens generales del sitio
> viven en `_estandar/DESIGN.md` §12 — este archivo documenta cómo el plan de cursada los
> consume y cuáles son los únicos colores propios que agrega.

## 0. Principios

1. **Cero hex nuevos en CSS.** Toda la hoja del planner (`planner.css`, `planview.css`,
   `cards.css`, `rec-row.css`, `detail-drawer.css`) se resuelve por tokens del sitio
   («Technical Split»); el único literal es `--block-ink: #241208` (tinta sobre rellenos de
   color) y los `rgba(0,0,0,…)` de las sombras. Los colores conmutan por tema
   (`[data-theme="dark" | "light"]`) sin que el planner sepa de temas.
2. **Los hex propios viven en datos, no en estilos.** Solo hay tres familias con valor
   propio: la **paleta de materias** (12 pasteles, `PALETTE`), los **colores de minor**
   (`AREA_COLOR`) y la **paleta del documento imprimible** (`exportPlan.ts`, en papel).
3. **Un estado = un color en todo el planner.** «Cursada — falta final» es siempre ámbar,
   «final aprobado» verde, «promocionada» teal, «conflicto / se pisa» rojo, tanto en el
   control tri‑estado como en pills, chips, bordes o calendario.
4. **El tinte nunca es texto.** Los colores de materia, de minor y los `--status-*` se usan
   como relleno a baja opacidad, borde, barra o punto (umbral no‑texto 3:1). Cuando el
   estado se lee como texto, se usa la variante `--status-*-text` (AA 4.5:1). Sobre un
   relleno sólido de la paleta, el texto es siempre `--block-ink`.

## 1. Capa base del sitio (lo que el planner hereda)

Siete hex base; todos los neutros derivan por `color-mix`.

| Token | Hex | Rol en el plan de cursada |
|---|---|---|
| `--hex-coral` → `--accent` | `#F47C59` | Acento: CTA, foco de la vista, pill «recomendada», dot de **electiva** |
| `--hex-blue` → `--primary` | `#92CFF2` | Acento secundario: dot y código de **obligatoria**, links, focos |
| `--hex-brown` | `#241208` | Tinta profunda: `--block-ink`, sombras, scrim, texto en light |
| `--hex-brown-soft` | `#382519` | Superficies del tema oscuro |
| `--hex-zinc` | `#27272A` | Borde base |
| `--hex-gray` | `#A1A1AA` | Texto secundario (dark) |
| `--hex-white` | `#FFFFFF` | Texto principal (dark), paneles (light) |

## 2. Roles por tema (valores resueltos)

Los `color-mix` del sitio, calculados en sRGB. Estos son los colores que efectivamente se
pintan detrás del plan de cursada.

| Rol del sitio | Alias en `.planner` | Dark | Light |
|---|---|---|---|
| `--background` | `--bg`, `--bg-2` | `#4C3B30` | `#F6F6F5` |
| `--surface` | — | `#382519` | `#241208` (rol estructural) |
| `--surface-2` | `--panel` | `#58483E` | `#FFFFFF` |
| `--surface-3` | `--panel-2`, `--panel-3` | `#685950` | `#F2F1F0` |
| `--ink-strong` | `--ink` | `#FFFFFF` | `#241208` |
| `--text-primary` | `--ink-soft` | `#FFFFFF` | `#241208` |
| `--text-secondary` | `--muted`, `--faint` | `#A1A1AA` (3.4:1 sobre panel) | `#7C716B` (4.7:1 sobre blanco) |
| `--text-secondary-strong` | — | `#D9D9DD` (6.2:1) | `#6E635C` (5.2:1 sobre `--surface-3`) |
| `--hairline` | `--line` | blanco 10 % → `≈#695A51` sobre panel | marrón 12 % → `≈#E5E3E1` |
| `--hairline-strong` | `--line-2`, `--scroll` | blanco 18 % → `≈#766961` | marrón 20 % → `≈#D3D0CE` |
| `--border` | — | `#27272A` | `#E1E1E1` |
| `--accent` | `--brass` | `#F47C59` | `#F47C59` |
| `--accent-soft` | `--brass-soft`, `--selbg` | coral 16 % → `≈#715042` sobre panel | `#FDE7E1` |
| `--accent-text` | — | `#F47C59` | `#A5543A` (5.3:1) |
| `--primary` | `--slate` | `#92CFF2` | `#92CFF2` |
| `--primary-soft` | `--slate-soft` | azul 14 % → `≈#605B57` | `#E7F4FC` |
| `--link` / `--ring` | — | `#92CFF2` | `#617A89` (4.5:1) |

Derivados propios del planner (definidos una sola vez en `.planner`):

| Alias | Receta | Resuelto |
|---|---|---|
| `--brass-2` | `color-mix(in srgb, var(--accent) 80%, #fff)` | `#F6967A` — texto/números de acento (chips «horario», «final», stats) |
| `--block-ink` | literal | `#241208` — texto sobre rellenos sólidos (botón `--go`, bloques, checks) |
| `--scrim` | `color-mix(in srgb, #241208 55%, transparent)` | fondo de modales (`≈#36241A` sobre canvas dark) |
| `--topbar` | `color-mix(in srgb, var(--background) 86%, transparent)` | barra superior translúcida |
| `--ring` | `0 0 0 2px var(--background), 0 0 0 4px var(--accent)` | anillo de foco |
| `--shadow-1` / `--shadow-2` | `rgba(0,0,0,.04/.05)` · `rgba(0,0,0,.10/.12)` | elevación de tarjetas |

## 3. Semántica por tipo de materia

| Tipo | Color | Dónde |
|---|---|---|
| **Obligatoria** | `--slate` (azul `#92CFF2`) | borde izquierdo de `.card.t-obligatoria`, `.dot--ob`, código `.dr-code.ob`, `.pool-h__dot--ob`, `.qcard` |
| **Electiva** | `--brass` (coral `#F47C59`) | `.dot--el`, tag «horario», barra de progreso (`--brass → --brass-2`), CTA «Sumar a mi plan», chip «recomendada» |
| **Aprobada** (qcard) | `--sage` | borde izquierdo + opacidad .55 |

## 4. Estados semánticos (`--status-*`)

Los cuatro estados del sistema, con variante por tema. El planner los alias a
`--sage` (go) y `--oxblood` (caution); warn y promo se usan por su nombre.

| Estado | Alias | Dark (relleno/borde) | Dark (texto, `-text`) | Light (relleno = texto) | Significado en el plan |
|---|---|---|---|---|---|
| `go` | `--sage` | `#46A86E` | `#86D3A2` (4.9:1) | `#2E7D52` (5.0:1) | final aprobado · disponible · minor completo · «copiado» |
| `promo` | — | `#2F9F8F` | `#6FD0C1` (4.8:1) | `#16745C` (5.7:1) | promocionada (sin final) |
| `warn` | — | `#D8B279` | `#E0BE86` (4.9:1) | `#8A591C` (6.0:1) | **cursada — falta final** (ámbar unificado) |
| `caution` | `--oxblood` | `#D68F85` | `#EDB5AD` (4.9:1) | `#B23A28` (6.0:1) | conflicto / «se pisa» · quitar · restablecer |

Contrastes medidos sobre `--surface-2` (dark) y blanco (light). Los rellenos dark quedan
entre 2.7:1 y 4.4:1: sirven como borde/ícono/relleno, no como texto — por eso existe la
variante `-text`.

### 4.1 Control tri‑estado (`EstadoControl`)

| Clase | Texto (`--_c`) | Borde | Relleno | Resuelto dark / light |
|---|---|---|---|---|
| `.st-pending` | transparente | `--hairline-strong` | `--surface-2` | — |
| `.st-regular` | `--status-warn-text` | warn 55 % | `warn 16 % + --surface-2` | `#6C5947` / `#ECE4DB` |
| `.st-final` | `#FFF` | go 60 % | `go 85 %` | `#499A67` / `#4D916C` |
| `.st-promo` | `#FFF` | promo 60 % | `promo 82 %` | `#368F80` / `#408D79` |

### 4.2 Recetas de pills, chips y avisos

| Elemento | Texto | Borde | Fondo |
|---|---|---|---|
| `.pill.ok`, `.tag--ok`, `.prog-chip--promo`, `.mnr-cell.is-done` | `--status-go-text` | sage 34 % | sage 12–14 % |
| `.pill.bad`, `.prog-chip--asist` | `--status-caution-text` | oxblood 34 % | oxblood 11–14 % |
| `.pill.warn`, `.prog-chip--final`, `.tag--hor` | `--brass-2` | brass 38 % | `--brass-soft` |
| `.conflict`, `.rmap-*` de conflicto | `--status-caution-text` | oxblood 30 % + barra 3px `--oxblood` | oxblood 5–6 % |
| `.cmbcal-blk.is-conf` («se pisa») | `--status-caution-text` | `--oxblood` + anillo 1px | halo oxblood 30 % |
| `.plan2-recgrp__dot--ok / --warn / --bad` | — | — | `--sage` / `--brass-2` / `--oxblood` |

## 5. Paleta de materias (`PALETTE`, 12 pasteles)

`site/lib/planner/model.ts`. Doce tonos de hue nítido, uno cada 30° de la rueda, en un
orden que **salta de a 150°** para que dos materias consecutivas nunca caigan en hues
vecinos. El coral entra recién en la 9.ª posición para no competir con el marcado de
conflicto. Se asigna por índice de materia dentro del cuatrimestre
(`PALETTE[k % 12]`) y viaja al CSS por la custom property inline `--blk`.

| # | Hex | HSL | Nombre |
|---|---|---|---|
| 1 | `#7FB0E0` | 210° 61 % 69 % | azul |
| 2 | `#F0A878` | 24° 80 % 71 % | durazno |
| 3 | `#6FC7BD` | 173° 44 % 61 % | turquesa |
| 4 | `#F09AB8` | 339° 74 % 77 % | rosa |
| 5 | `#8FD08F` | 120° 41 % 69 % | verde |
| 6 | `#B8A5E8` | 257° 59 % 78 % | lavanda |
| 7 | `#F0CF7A` | 43° 80 % 71 % | amarillo |
| 8 | `#7FC3E8` | 201° 70 % 70 % | celeste |
| 9 | `#F0958F` | 4° 76 % 75 % | coral |
| 10 | `#6FD0A8` | 155° 51 % 63 % | menta |
| 11 | `#D99AD9` | 300° 45 % 73 % | orquídea |
| 12 | `#C0D489` | 76° 47 % 68 % | lima |

### 5.1 Recetas en pantalla (`--blk`)

| Superficie | Fondo | Borde | Barra izquierda | Sombra |
|---|---|---|---|---|
| Bloque del calendario `.cmbcal-blk` | `blk 18 % + --panel` | `blk 36 %` (1px) | `--blk` (3px) | `blk 22 %` · hover `34 %` |
| Aula en modo compacto `.cmbcal-blk__room` | `blk 26 % + --panel` | — | — | — |
| Materia del roadmap `.rmap-mat` | `blk 12 % + --panel-2` | `blk 28 %` | `--blk` (3px) | hover `blk 28 %` |
| Chip de materia (Combinador) | `--chip-c` | — | — | — |

Texto dentro del bloque: `--ink` (abreviatura), `--ink-soft` (horario), `--muted` (aula).
Los rellenos son diluidos a propósito: el color identifica, no domina.

Valores resueltos del relleno del bloque (18 %):

| Hex | Sobre panel dark (`#58483E`) | Borde dark (36 %) | Sobre panel light (`#FFFFFF`) |
|---|---|---|---|
| `#7FB0E0` | `#5F5B5B` | `#666D78` | `#E8F1F9` |
| `#F0A878` | `#735948` | `#8F6B53` | `#FCEFE7` |
| `#6FC7BD` | `#5C5F55` | `#60766C` | `#E5F5F3` |
| `#F09AB8` | `#735754` | `#8F666A` | `#FCEDF2` |
| `#8FD08F` | `#62604D` | `#6C795B` | `#EBF7EB` |
| `#B8A5E8` | `#69595D` | `#7B697B` | `#F2EFFB` |
| `#F0CF7A` | `#736049` | `#8F7954` | `#FCF6E7` |
| `#7FC3E8` | `#5F5E5D` | `#66747B` | `#E8F4FB` |
| `#F0958F` | `#73564D` | `#8F645B` | `#FCECEB` |
| `#6FD0A8` | `#5C6051` | `#607964` | `#E5F7EF` |
| `#D99AD9` | `#6F575A` | `#866676` | `#F8EDF8` |
| `#C0D489` | `#6B614C` | `#7D7A59` | `#F4F7EA` |

Sobre el hex **puro** (chips, puntos, barra), `--block-ink #241208` rinde entre 7.9:1 y
11.9:1 en los doce tonos: siempre AAA.

## 6. Minors (`AREA_COLOR`)

`site/lib/planner/model.ts`; se exponen como `--minor-color` inline (contrato `MinorBadge`) y
en la barra de progreso de la pestaña Minors.

| Área | Hex | HSL |
|---|---|---|
| Ciencia de Datos | `#85A2C2` | 211° 33 % 64 % |
| Imágenes y Realidad Virtual | `#C592AB` | 331° 31 % 67 % |
| Inteligencia Artificial | `#A9B27E` | 70° 25 % 60 % |
| Arquitectura de Software | `#A497C0` | 259° 25 % 67 % |

Recetas: pill `.minor-badge` = texto `--minor-color`, fondo `minor 16 %`, borde
`minor 42 %`; punto `.minor-dot` = relleno `--minor-color` + anillo `minor 45 %`; swatch del
sidebar y del modal de minors = fondo sólido `AREA_COLOR`; barra `.pv-minor-track > i`
= `--minor-color`. Fila de minor completo: fondo `sage 10 %`, check `--sage`.

Observación: como **texto** de la pill, los cuatro tonos quedan entre 2.0:1 y 3.0:1 sobre
su propio fondo (dark y light); su función es identificar, y el nombre del minor viaja en
texto normal al lado. Si se quisiera AA en la sigla, habría que oscurecer/aclarar por tema
como hacen los `--status-*-text`.

## 7. Documento imprimible (`exportPlan.ts`)

El export del plan (HTML autocontenido, pensado para papel) no hereda los tokens del sitio:
trae su propia paleta clara y **todo relleno es opaco** (hex ya mezclado con el papel, sin
`rgba`/`color-mix`), para que imprima igual en cualquier visor.

| Var | Hex | Rol |
|---|---|---|
| `--paper` | `#FBF8F4` | fondo del documento |
| `--panel` | `#FFFFFF` | tarjetas / grilla |
| `--ink` | `#2B211C` | texto principal |
| `--soft` | `#5A4D45` | texto secundario |
| `--muted` | `#8A7D73` | metadata, etiqueta «libre» |
| `--line` | `#E3D9CF` | bordes y celdas |
| `--coral` | `#D2754F` | acento (equivalente impreso del `#F47C59`) |
| `--slate` | `#5B7290` | acento secundario (obligatorias) |
| tinta de bloque | `#1D1611` (abreviatura) · `#3A2F28` (horario / aula) | 16.9:1 sobre papel; ≥ 11:1 sobre el bloque más claro |
| conflicto | `#A85644` | borde 2px + barra 4px del bloque que se pisa |

Bloques: `soften(color, k)` mezcla el hex de `PALETTE` con el papel dejando `k` de color —
fondo `k = .28`, borde `.58`, barra izquierda `.65`.

| Hex | Fondo (.28) | Borde (.58) | Barra (.65) |
|---|---|---|---|
| `#7FB0E0` | `#D8E4EE` | `#B3CEE8` | `#AAC9E7` |
| `#F0A878` | `#F8E2D1` | `#F5CAAC` | `#F4C4A3` |
| `#6FC7BD` | `#D4EAE5` | `#AADCD4` | `#A0D8D0` |
| `#F09AB8` | `#F8DEE3` | `#F5C1D1` | `#F4BBCD` |
| `#8FD08F` | `#DDEDD8` | `#BCE1B9` | `#B5DEB2` |
| `#B8A5E8` | `#E8E1F1` | `#D4C8ED` | `#CFC2EC` |
| `#F0CF7A` | `#F8EDD2` | `#F5E0AD` | `#F4DDA5` |
| `#7FC3E8` | `#D8E9F1` | `#B3D9ED` | `#AAD6EC` |
| `#F0958F` | `#F8DCD8` | `#F5BFB9` | `#F4B8B2` |
| `#6FD0A8` | `#D4EDDF` | `#AAE1C8` | `#A0DEC3` |
| `#D99AD9` | `#F1DEEC` | `#E7C1E4` | `#E5BBE2` |
| `#C0D489` | `#EAEED6` | `#D9E3B6` | `#D5E1AE` |

## 8. Reglas de uso

- **Acento**: `--brass` marca una sola cosa por superficie (el CTA, la pestaña activa, la
  pill «recomendada», el cuatrimestre con cap). Fondos de acento a 8–16 %
  (`brass 12 % + transparent` es la receta por defecto), bordes a 38–45 %.
- **Texto sobre color sólido**: siempre `--block-ink` (`#241208`) sobre `--brass`, `--sage`,
  `AREA_COLOR` y bloques; `#FFF` solo en los rellenos profundos del control tri‑estado
  (`go 85 %`, `promo 82 %`).
- **Texto de estado**: `--status-*-text`, nunca `--status-*` ni `--sage`/`--oxblood` como
  `color`. La única excepción histórica es `.share-btn.is-copied` (`--sage` como texto).
- **Materias**: el color se asigna por posición en el cuatrimestre, no por materia — dos
  cuatrimestres distintos pueden repetir el azul en su primera materia. El nombre
  (abreviatura) es el identificador; el color solo ayuda a seguir un bloque entre días.
- **Conflicto** siempre se marca por forma además de color: anillo/borde `--oxblood` +
  etiqueta «se pisa» (pantalla) o borde doble `#A85644` (papel).
- **Temas**: no escribir `[data-theme]` en el planner; todo conmuta por los tokens del
  sitio. Si un valor necesita recalibrarse en light, se hace en
  `site/packages/ui/src/styles/tokens.css`, no en el planner.
- **Sombras**: `rgba(0,0,0,…)` fijas (`--shadow-1/2`) en ambos temas; las sombras de color
  (`blk 22 %`, `brass 40 %`) solo en hover/CTA.

## 9. Dónde vive cada valor

| Familia | Archivo | Consumidores |
|---|---|---|
| Hex base, roles por tema, `--status-*`, `--vt-*` | `site/packages/ui/src/styles/tokens.css` | todo el sitio |
| Alias `.planner` (`--brass`, `--slate`, `--sage`, `--oxblood`, `--block-ink`, `--scrim`, motion, sombras) | `site/components/planner/planner.css` (`.planner{…}`, dos bloques) | todas las vistas del planner |
| Recetas del Plan de cursada (banner, roadmap, minors, chips) | `site/components/planner/planview.css` | `views/PlanView.tsx` |
| Bloques del calendario, EstadoControl, MinorBadge, pills | `site/components/planner/planner.css` | `CursadaCalendar.tsx`, `EstadoControl.tsx`, `MinorBadge.tsx` |
| `PALETTE` (12) y `AREA_COLOR` (4) | `site/lib/planner/model.ts` | `PlanView`, `CombinadorView`, `FinalesCombinadorView`, `Sidebar`, `MinorsModal`, `minors.ts`, `exportPlan.ts` |
| Paleta de papel + `soften()` | `site/lib/planner/exportPlan.ts` (`BASE_CSS`, `PAPER`) | export del plan y del combinador |

Cambiar un tono de `PALETTE` afecta a la vez pantalla (plan, combinador, finales) y papel;
cambiar un `--status-*` afecta a todo el sitio. Este archivo se actualiza en la misma
edición que cualquiera de esos valores.
