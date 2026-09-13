/* =========================================================================
   SGA ITBA · SCRAPER DE *TODAS* LAS MATERIAS DEL LISTADO (consola, sin Chrome MCP)
   -------------------------------------------------------------------------
   Recorre TODAS las páginas del "Listado de Cursos" y scrapea TODAS las
   materias que aparezcan (no hay lista de objetivos: baja el catálogo entero).
   Misma arquitectura probada que scrape-sga-full.js:
     - SECUENCIAL (1 request a la vez): los fetches en paralelo corrompen la sesión.
     - En CHUNKS, con progreso en localStorage → RE-EJECUTABLE: si quedan materias,
       recargás la página (F5) y volvés a pegar el script; retoma donde quedó.
     - Caché NAMESPACED por período+año, así no se mezcla con otras corridas.

   GOTCHA del SGA (GeneXus): las URLs encriptadas caducan tras ~80 fetches dentro
   de la MISMA sesión de página (el F5 resetea el contador). Por eso cada corrida
   gasta: ~(páginas del listado) + CHUNK*2 fetches. Con CHUNK=25 y ~20 páginas son
   ~70 fetches por corrida, debajo del límite. Como el catálogo completo son
   ~400 materias, contá ~15 recargas (el script te dice cuántas faltan).

   USO:
   1. Académica > Cursos > "Listado de Cursos" en el SGA, logueado.
   2. F12 > Console > pegar este archivo > Enter.
   3. Cuando diga "INCOMPLETO: recargá (F5)", hacelo y volvé a pegar. Repetir.
   4. Al terminar baja `horarios-all.json` a tu carpeta de Descargas.

   CONFIG: CHUNK   = materias por corrida (mantener <= 28 por el decay).
           PERIODO = '' scrapea todos los períodos del listado. Poné 'Primer' o
                     'Segundo' para filtrar (compara con periodo.includes()).
           ANIO    = '' sin filtro de año; o p. ej. '2026'.
           OUT     = nombre del archivo descargado.
   Para reempezar de cero: borrá la clave que imprime el script al terminar,
   o corré  localStorage.removeItem('__sga_all_all_all').
   ========================================================================= */
(async () => {
  const CHUNK = 25;
  const PERIODO = '';         // '' = todos los períodos del listado
  const ANIO = '';            // '' = sin filtro de año
  const OUT = 'horarios-all.json';
  const MAX_PAGES = 40;       // tope de seguridad para la paginación

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DAYS = 'Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo';
  const fetchDoc = async (url) =>
    new DOMParser().parseFromString(await (await fetch(url, { credentials: 'include' })).text(), 'text/html');

  const parseSlots = (text) => {
    const re = new RegExp('(' + DAYS + ')\\s+(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})', 'g');
    const ms = []; let m;
    while ((m = re.exec(text))) ms.push({ dia: m[1].replace('Miercoles','Miércoles').replace('Sabado','Sábado'), desde: m[2], hasta: m[3], idx: m.index, end: re.lastIndex });
    return ms.map((c, i) => ({ dia: c.dia, desde: c.desde, hasta: c.hasta,
      aula: text.slice(c.end, i + 1 < ms.length ? ms[i + 1].idx : text.length).replace(/\s+/g, ' ').replace(/#----?>/g, '·').trim().slice(0, 90) }));
  };
  const parseComisiones = (doc) => {
    const cand = [...doc.querySelectorAll('table')]
      .filter(t => t.textContent.includes('Horario') && t.textContent.includes('Comisi'))
      .sort((a, b) => a.outerHTML.length - b.outerHTML.length)[0];
    if (!cand) return [];
    const out = [];
    cand.querySelectorAll('tr').forEach(tr => {
      const c = [...tr.children]; if (c.length < 4) return;
      const com = c[0].textContent.replace(/\s+/g, ' ').trim();
      if (!com || /Comisi/.test(com)) return;
      out.push({ comision: com, slots: parseSlots(c[1].textContent.replace(/\s+/g, ' ').trim()),
        profesores: c[2].textContent.replace(/\s+/g, ' ').trim().slice(0, 200), cupo: c[3].textContent.replace(/\s+/g, ' ').trim() });
    });
    return out;
  };

  // ---- 1) Crawl FRESCO del listado (paginando con el link ">") ----
  console.log('⏳ Crawleando el listado completo...');
  const parseList = (doc) => {
    const table = [...doc.querySelectorAll('table')].sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
    const rows = [];
    table && table.querySelectorAll('tr').forEach(tr => {
      const tds = [...tr.querySelectorAll('td')]; if (tds.length < 12) return;
      const codigo = tds[0].textContent.trim(); if (!/^\d\d\.\d\d$/.test(codigo)) return;
      rows.push({ codigo, nombre: tds[1].textContent.trim(), depto: tds[3].textContent.trim(),
        periodo: tds[4].textContent.trim(), anio: tds[5].textContent.trim(),
        comienzo: tds[6].textContent.trim(), fin: tds[7].textContent.trim(),
        detailHref: tds[11].querySelector('a[href]')?.href || null });
    });
    const next = [...doc.querySelectorAll('a')].find(a => a.textContent.trim() === '>');
    return { rows, next: next ? next.href : null };
  };
  let r = parseList(document), all = r.rows.slice(), nx = r.next, pages = 1; const seen = new Set([location.href]);
  while (nx && pages < MAX_PAGES) { if (seen.has(nx)) break; seen.add(nx); const p = parseList(await fetchDoc(nx)); if (!p.rows.length) break; all = all.concat(p.rows); nx = p.next; pages++; await sleep(60); }
  console.log(`   ${all.length} cursos en ${pages} páginas.`);
  console.log('   Períodos en el listado:', [...new Set(all.map(c => c.periodo))]);

  // ---- 2) Estado persistente (sobrevive a F5; namespaced por período+año) ----
  const STORE = `__sga_all_${PERIODO || 'all'}_${ANIO || 'all'}`;
  const done = JSON.parse(localStorage.getItem(STORE) || '{}');          // codigo -> registro
  const seenCod = new Set();
  const queue = all.filter(c => c.detailHref
      && (!PERIODO || c.periodo.includes(PERIODO)) && (!ANIO || c.anio === ANIO)
      && !done[c.codigo]
      && !seenCod.has(c.codigo) && seenCod.add(c.codigo));

  const totalGoal = [...new Set(all
      .filter(c => (!PERIODO || c.periodo.includes(PERIODO)) && (!ANIO || c.anio === ANIO))
      .map(c => c.codigo))].length;
  console.log(`   ${Object.keys(done).length}/${totalGoal} ya hechas. Faltan ${queue.length}.`);

  // ---- 3) Scrapear este chunk SECUENCIALMENTE ----
  const batch = queue.slice(0, CHUNK);
  for (const c of batch) {
    try {
      const det = await fetchDoc(c.detailHref);
      const comA = [...det.querySelectorAll('a')].find(a => a.textContent.trim() === 'Comisiones');
      const { detailHref, ...meta } = c;
      const com = comA ? parseComisiones(await fetchDoc(new URL(comA.getAttribute('href'), c.detailHref).href)) : [];
      done[c.codigo] = { ...meta, comisiones: com };
      console.log(`   ${com.length ? '✓' : '∅'} ${c.codigo} ${c.nombre}`);
    } catch (e) { console.warn(`   ✗ ${c.codigo}`, e.message); }
    await sleep(140);
  }
  localStorage.setItem(STORE, JSON.stringify(done));

  // ---- 4) ¿Terminamos? ----
  const remaining = queue.length - batch.length;
  if (remaining > 0) {
    const reloads = Math.ceil(remaining / CHUNK);
    console.log(`\n🔁 INCOMPLETO: faltan ${remaining} materias (~${reloads} recarga(s) más). Recargá la página (F5) y volvé a pegar el script.`);
  } else {
    const data = Object.values(done);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = OUT; a.click();
    try { copy(JSON.stringify(data)); console.log(`📋 También copiado al portapapeles (pegá en ${OUT}).`); } catch {}
    const conHor = data.filter(d => (d.comisiones || []).some(cm => (cm.slots || []).length)).length;
    console.log(`\n✅ LISTO: ${data.length} materias (${conHor} con grilla). Descargado ${OUT}. (Para reempezar: localStorage.removeItem("${STORE}"))`);
  }
})();
