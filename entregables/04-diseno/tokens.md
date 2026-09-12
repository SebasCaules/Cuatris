# Tokens de diseño — paleta 4a «Arena y ladrillo»

Extraídos de `etapa1-paletas.dc.html` (turno 5), `etapa2-widget.dc.html` (turno 7) y
`etapa3-mockup-v2.dc.html` (turno 13). Son la fuente de `app/src/estilos/tokens.css`.

## Roles base

| Rol | Claro | Oscuro |
|---|---|---|
| fondo | `#F1F0EB` | `#17161A` |
| superficie | `#FFFFFF` | `#22211F` |
| texto | `#1F1D1C` | `#F2EFE9` |
| acento (botón primario, enlaces, chip activo) | `#9C3D2E` (hover `#7A2E22`) | `#D4694F` |
| choque (contorno 2 px y ▲) | `#1F1D1C` | `#F2EFE9` |
| texto secundario | `#5F6B70` | — (derivar) |
| líneas de la grilla | `#DCD8D0` (hora en punto), `#DEDBD1` (columna) | — (derivar) |
| nota «sin horario» | borde `1.5px dotted #A2A79F`, fondo `#F9F8F4` | — |
| fondo del lienzo del editor (no usar en la app) | `#E9E7E1` | — |

## Diez colores de materia

Se asignan **por orden de agregado al plan** y quedan fijos para toda la carrera (el color
identifica la materia; el estado nunca cambia el color).

| # | Hex | Ejemplo del mockup |
|---|---|---|
| 1 | `#1F4E5F` | 93.18 Álgebra Lineal |
| 2 | `#9C3D2E` | 72.41 Base de Datos II |
| 3 | `#3D7183` | 15.09 Agile, Lean y Lean Six Sigma |
| 4 | `#A8762C` | 61.27 Análisis de Coyuntura |
| 5 | `#4A5578` | 72.75 Aprendizaje Automático |
| 6 | `#7D3F4F` | 72.44 Criptografía y Seguridad |
| 7 | `#2F7A6A` | 30.28 Accionamientos Industriales |
| 8 | `#8C4A32` | 72.20 Redes de Información |
| 9 | `#5F7A4A` | 72.45 Proyecto Final |
| 10 | `#4A4F55` | 93.26 Análisis de Series de Tiempo |

Bloque en la grilla: `border-left: 3px solid <color>; background: color-mix(in srgb, <color> 14%, #fff)`.
En modo oscuro: mismo matiz aclarado un 62 % para la barra y relleno al 34 % sobre la superficie.

## Estados (borde + glifo, nunca el relleno)

| Estado | Glifo | Borde |
|---|---|---|
| Aprobada | ✓ | — |
| Cursando | ● | lleno |
| Planificada | ◇ | guionado |
| Disponible | ○ | — |
| Bloqueada | ⊘ | rayado (`repeating-linear-gradient(135deg, #E2DDD6 0 3px, #F2EEE9 3px 6px)`) |
| Sin horario publicado | — | punteado |
| Choque | ▲ | contorno 2 px `#1F1D1C` + corte rayado en la hora que se pisa |
| Cupo lleno | ◐ | — |
| Cambio de sede entre bloques seguidos | ↕ | no bloquea |

## Tipografía

**Decisión (2026-09-12): la SPA usa las mismas fuentes que StudyVaults**
(`sebascaules.github.io/StudyVaults`), no las IBM Plex de los mockups. Los roles se conservan;
cambia la familia:

| Rol en el mockup | Familia en la SPA | Pesos | Variable CSS |
|---|---|---|---|
| Texto y títulos (`IBM Plex Sans`) | **Newsreader** (serif, con eje óptico) | 400 / 500 / 600 + itálicas | `--fuente-texto` |
| Datos, códigos, horarios, chips (`IBM Plex Mono`) | **JetBrains Mono** | 400 / 500 / 600 / 700 | `--fuente-mono` |

- Ambas son SIL OFL y están en Google Fonts; se **vendorizan** como woff2 (latín y
  latín extendido) en el repositorio. La SPA no depende de Google Fonts en tiempo de ejecución.
- Pilas de respaldo: `Newsreader, Georgia, "Times New Roman", serif` y
  `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- Newsreader tiene la altura de x más baja que IBM Plex Sans: las tallas del mockup (títulos
  600 11–12 px, cuerpo 400 10.5 px/1.5, bloques 500 8 px/1.1 con `line-clamp: 1`) se
  reajustan entre +0.5 y +1 px al implementar, validando contra la pantalla 13b. Las tallas
  del mono (8.5–9 px) se mantienen: JetBrains Mono y IBM Plex Mono son equivalentes en ancho.
- Con `font-optical-sizing: auto`, Newsreader usa su eje óptico solo; los títulos grandes
  salen más contrastados sin configurar nada.

## Grilla semanal (widget 7a)

- Días lunes–viernes; horas 08–22; **solo líneas en la hora en punto**, etiqueta centrada
  sobre su línea.
- Escala: **18 px por hora** con una tarjeta sola (turno 7); **15 px por hora** con dos
  tarjetas lado a lado (mockup v2). Es un token, no una constante.
- Bloque: nombre abreviado (`abreviacion`) + etiqueta de aula en mono; la etiqueta de aula se
  omite cuando el bloque dura menos de dos horas.
- Choque (9d): cada materia ocupa su tramo exclusivo; la franja compartida lleva el corte
  rayado con borde superior e inferior de 2 px; sin etiqueta en reposo, aparece al pasar el
  mouse; el registro estable es la lista «CONFLICTOS · n» al pie con «Resolver».
- Materia sin horario publicado: nunca desaparece, baja al pie de la tarjeta con borde
  punteado.
- Cuatrimestre sin horarios: misma tarjeta y misma altura; adentro, lista de materias con
  créditos y la nota de cuándo salen los horarios.

## Radios y bordes

- Tarjetas 8 px, chips y campos 4 px, bloques 2 px.
- Borde de tarjeta `1px solid rgba(0,0,0,.1)`, sombra `0 2px 8px rgba(0,0,0,.07)`.
- Campo de búsqueda activo: `1.5px solid #1F1D1C`.
