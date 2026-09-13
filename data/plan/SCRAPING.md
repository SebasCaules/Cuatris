# Scraping de horarios del SGA (sin Chrome MCP)

Confirmado: **se puede scrapear el SGA con puro `fetch()` desde la consola del navegador**, sin extensiones ni Chrome MCP. La cookie de sesión viaja sola en peticiones del mismo origen.

## Cómo está armado el SGA
Es una app **GeneXus**. La cadena para llegar al horario de una materia:

```
Listado de Cursos (24 pág, 20 c/u)  →  "Ver Detalles" (icono col. Acciones)
        →  pestaña "Comisiones"  →  tabla [Comisión | Horarios | Profesores | Cupo]
```

La celda *Horarios* concatena bloques `Día HH:MM - HH:MM` + aula. Eso es lo que se parsea.

## ⚠️ El gran gotcha: las URLs caducan
Las URLs encriptadas de GeneXus (detalle y paginación) están atadas a un puntero
de sesión y **van caducando con la cantidad de navegaciones** (~80 fetches y los
links viejos empiezan a devolver páginas vacías). Además **los fetches en paralelo
corrompen el estado de sesión**. Por eso el scraper:

- Va **secuencial** (1 request a la vez), nunca en paralelo.
- Trabaja en **chunks** y guarda progreso en `localStorage`.
- Es **re-ejecutable**: si quedan materias, recargás (F5) y volvés a pegar; retoma.

## Scripts
- **`scrape-sga-quick-test.js`** — pegás en la consola del *Listado de Cursos* y
  scrapea las primeras 3 materias para comprobar que funciona (10 segundos).
- **`scrape-sga-full.js`** — scraper completo. Genera y descarga `horarios.json`
  con las materias de la lista `TARGETS` (obligatorias faltantes + electivas).
  Vaciá `TARGETS = []` para scrapear **todas** las materias ofrecidas.
- **`scrape-sga-all.js`** — scraper del **catálogo entero**: recorre todas las
  páginas del listado y baja **todas** las materias (sin `TARGETS`, sin filtro de
  período por defecto) a `horarios-all.json`. Son ~400 materias → contá ~15
  recargas (el script imprime cuántas faltan en cada corrida). Caché namespaced
  propio (`__sga_all_all_all`), así no pisa el de `scrape-sga-full.js`.

### Elegir el cuatrimestre
Arriba de `scrape-sga-full.js` están `PERIODO` y `ANIO`. El filtro compara con
`periodo.includes(PERIODO)`, así que `'Primer'` / `'Segundo'` alcanza. Al arrancar,
el script imprime **`Períodos en el listado: [...]`**: si el rótulo no coincide
(p. ej. el SGA muestra `"2do Cuat."`), ajustá `PERIODO` a lo que aparezca ahí.

El progreso se cachea en `localStorage` con una clave **namespaced por período+año**
(`__sga_done_Segundo_2026`), así re-scrapear otro cuatrimestre nunca se mezcla con
lo ya bajado. Para reempezar un período: `localStorage.removeItem("__sga_done_Segundo_2026")`.

## Resultado: `horarios.json`
Una entrada por materia ofrecida (Primer Cuat. 2026):

```json
{
  "codigo": "72.41", "nombre": "Base de Datos II",
  "depto": "Sistemas Digitales y Datos",
  "periodo": "Primer Cuat.", "anio": "2026",
  "comienzo": "01/03/2026", "fin": "25/07/2026",
  "tipo": "obligatoria",
  "comisiones": [
    { "comision": "S",
      "slots": [ { "dia": "Lunes", "desde": "18:00", "hasta": "21:00", "aula": "..." } ],
      "profesores": "...", "cupo": "49 / 49" }
  ]
}
```

Scrapeado el 2026-06-13: **56 materias, 68 comisiones, 85 bloques horarios.**
No tienen grilla semanal (intensivos/async, o no ofrecidas): `72.98` Práctica
Laboral y `94.52` Inglés II (no figuran en el listado).
