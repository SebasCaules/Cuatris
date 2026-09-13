/* =========================================================================
   SGA ITBA · SCRAPER COMPLETO DE HORARIOS (consola, sin Chrome MCP)
   -------------------------------------------------------------------------
   Genera el mismo horarios.json que usa la página de electivas.

   GOTCHA IMPORTANTE (descubierto a los golpes):
   El SGA es GeneXus y sus URLs encriptadas (detalle/paginación) van caducando
   a medida que navegás: después de ~80 fetches acumulados, los links viejos
   devuelven páginas vacías. Además, fetches EN PARALELO corrompen el estado
   de sesión. Por eso este script:
     - Scrapea SECUENCIAL (1 a la vez), nunca en paralelo.
     - Trabaja en CHUNKS y guarda el progreso en localStorage.
     - Es RE-EJECUTABLE: si quedan materias, recargás la página (F5) y volvés
       a pegar el script; retoma donde quedó. Cuando termina, descarga el JSON.

   USO:
   1. Académica > Cursos > "Listado de Cursos" en el SGA, logueado.
   2. Asegurate de que el listado muestre el período que querés scrapear
      (acá: Segundo Cuat. 2026). El script igual filtra por PERIODO/ANIO.
   3. F12 > Console > pegar este archivo > Enter.
   4. Si dice "incompleto: recargá (F5) y volvé a pegar", hacelo.
   5. Al terminar baja horarios.json a tu carpeta de Descargas.

   CONFIG: CHUNK = cuántas materias por corrida (mantener <= 25 por el decay).
           PERIODO/ANIO = filtro de período. El progreso se cachea con una clave
           namespaced por período+año, así re-scrapear otro cuatrimestre NO se
           mezcla con lo ya bajado (cada período tiene su propio caché).
           TARGETS = códigos a scrapear. Vaciá el array [] para scrapear TODAS
           las materias ofrecidas (tarda mucho más, varias recargas).
   ========================================================================= */
(async () => {
  const CHUNK = 22;
  const PERIODO = 'Segundo';  // filtra "Segundo Cuat." ; poné '' para no filtrar
  const ANIO = '2026';        // poné '' para no filtrar por año
  const TARGETS = [
    // --- Obligatorias que me faltan ---
    '72.41','72.42','93.75','72.27','72.43','72.44','72.20','12.83','72.45','72.98','94.23','94.52',
    // --- Electivas ---
    '10.07','10.09','11.36','16.04','16.50','16.57','16.82','22.48','23.15','25.04','61.08','61.11',
    '61.13','61.50','71.48','72.22','72.23','72.29','72.46','72.49','72.50','72.51','72.52','72.53',
    '72.54','72.55','72.58','72.59','72.60','72.61','72.65','72.66','72.67','72.68','72.69','72.70',
    '72.71','72.72','72.73','72.74','72.75','72.77','72.78','72.79','72.80','72.82','72.84','72.85',
    '72.86','72.87','72.88','72.89','72.90','72.92','72.94','72.95','72.96','72.97','73.21','73.22',
    '73.23','73.30','73.40','73.50','73.60','73.61','73.62','73.63','73.64','73.65','73.66','73.80',
    '73.81','73.82','73.84','73.89','73.98','81.13','81.14','81.16','81.57','81.74','82.08','82.18',
    '82.21','94.26','94.42','94.62','94.64','94.65','94.92',
  ];

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
  console.log('⏳ Crawleando el listado...');
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
  while (nx && pages < 40) { if (seen.has(nx)) break; seen.add(nx); const p = parseList(await fetchDoc(nx)); if (!p.rows.length) break; all = all.concat(p.rows); nx = p.next; pages++; await sleep(60); }
  console.log(`   ${all.length} cursos en ${pages} páginas.`);
  // Diagnóstico: períodos presentes en el listado. Si no ves "Segundo Cuat.",
  // ajustá PERIODO arriba al rótulo exacto que aparezca acá.
  console.log('   Períodos en el listado:', [...new Set(all.map(c => c.periodo))]);

  // ---- 2) Estado persistente (sobrevive a F5; namespaced por período+año) ----
  const STORE = `__sga_done_${PERIODO || 'all'}_${ANIO || 'all'}`;
  const done = JSON.parse(localStorage.getItem(STORE) || '{}');          // codigo -> registro
  const want = TARGETS.length ? new Set(TARGETS) : null;                 // null = todas
  const seenCod = new Set();
  const queue = all.filter(c => c.detailHref
      && (!PERIODO || c.periodo.includes(PERIODO)) && (!ANIO || c.anio === ANIO)
      && (!want || want.has(c.codigo)) && !done[c.codigo]
      && !seenCod.has(c.codigo) && seenCod.add(c.codigo));

  const totalGoal = (want ? [...want] : [...new Set(all.map(c => c.codigo))]).length;
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
    console.log(`\n🔁 INCOMPLETO: faltan ${remaining}. Recargá la página (F5) y volvé a pegar el script.`);
  } else {
    const data = Object.values(done);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'horarios.json'; a.click();
    try { copy(JSON.stringify(data)); console.log('📋 También copiado al portapapeles (pegá en horarios.json).'); } catch {}
    console.log(`\n✅ LISTO: ${data.length} materias. Descargado horarios.json. (Para reempezar: localStorage.removeItem("${STORE}"))`);
  }
})();
