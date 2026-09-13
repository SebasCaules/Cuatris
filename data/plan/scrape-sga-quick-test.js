/* =========================================================================
   SGA ITBA · TEST RÁPIDO DE SCRAPING POR CONSOLA
   -------------------------------------------------------------------------
   Objetivo: comprobar en 10 segundos que se puede scrapear el SGA con puro
   fetch() desde la consola, SIN Chrome MCP ni extensiones.

   USO:
   1. Logueate en https://sga.itba.edu.ar y entrá a Académica > Cursos >
      "Listado de Cursos" (la tabla con Cód./Materia/.../Acciones).
   2. Abrí la consola (F12 > Console).
   3. Pegá TODO este archivo y Enter.
   4. Mirá la salida: imprime materia + comisiones + horarios de los primeros
      3 cursos del listado. Si ves días y horas => el scraping funciona.

   Cómo funciona: el listado es una app GeneXus; el horario vive en
   detalle ("Ver Detalles", icono de la col. Acciones) > pestaña "Comisiones".
   Todo se obtiene con fetch() porque son links GET del mismo origen y la
   cookie de sesión viaja sola.
   ========================================================================= */
(async () => {
  const DAYS = 'Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo';

  const parseSlots = (text) => {
    const re = new RegExp('(' + DAYS + ')\\s+(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})', 'g');
    const ms = []; let m;
    while ((m = re.exec(text))) ms.push({ dia: m[1], desde: m[2], hasta: m[3], idx: m.index, end: re.lastIndex });
    return ms.map((c, i) => ({
      dia: c.dia, desde: c.desde, hasta: c.hasta,
      aula: text.slice(c.end, i + 1 < ms.length ? ms[i + 1].idx : text.length).replace(/\s+/g, ' ').replace(/#----?>/g, '·').trim()
    }));
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
      out.push({ comision: com, slots: parseSlots(c[1].textContent.replace(/\s+/g, ' ').trim()), cupo: c[3].textContent.replace(/\s+/g, ' ').trim() });
    });
    return out;
  };

  const fetchDoc = async (url) =>
    new DOMParser().parseFromString(await (await fetch(url, { credentials: 'include' })).text(), 'text/html');

  // Tomar las primeras 3 filas del listado actual
  const table = [...document.querySelectorAll('table')].sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length)[0];
  const rows = [...table.querySelectorAll('tr')]
    .map(tr => [...tr.querySelectorAll('td')])
    .filter(tds => tds.length >= 12 && /^\d\d\.\d\d$/.test(tds[0].textContent.trim()))
    .slice(0, 3);

  for (const tds of rows) {
    const codigo = tds[0].textContent.trim();
    const nombre = tds[1].textContent.trim();
    const detailHref = tds[11].querySelector('a[href]')?.href;
    if (!detailHref) { console.log(`${codigo} ${nombre}: sin link de detalle`); continue; }
    const det = await fetchDoc(detailHref);
    const comA = [...det.querySelectorAll('a')].find(a => a.textContent.trim() === 'Comisiones');
    if (!comA) { console.log(`${codigo} ${nombre}: sin pestaña Comisiones`); continue; }
    const com = parseComisiones(await fetchDoc(new URL(comA.getAttribute('href'), detailHref).href));
    console.log(`\n📚 ${codigo} — ${nombre}`);
    com.forEach(c => console.log(`   Com ${c.comision} (${c.cupo}): ` + c.slots.map(s => `${s.dia} ${s.desde}-${s.hasta}`).join(' | ')));
  }
  console.log('\n✅ Si arriba ves días y horarios, el scraping por consola FUNCIONA.');
})();
