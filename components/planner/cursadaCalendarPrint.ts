// CSS de impresión del calendario semanal compartido (CursadaCalendar): las
// mismas clases `cmbcal*` que en pantalla, con colores literales sobre papel
// blanco y sin animaciones ni hover. Lo inyectan los documentos exportados del
// Plan de cursada (PDF / imagen) cuando la grilla viene del componente.
// El color de cada bloque llega inline como `--blk` (hex de la paleta).
export const CURSADA_CALENDAR_PRINT_CSS = `
  .cg-shared .cmbcal{border:1px solid #d9d2ca;border-radius:9px;overflow:hidden;background:#fff;page-break-inside:avoid;break-inside:avoid;font-family:Georgia,"Times New Roman",serif}
  .cg-shared .cmbcal__head{display:grid;border-bottom:1px solid #d9d2ca}
  .cg-shared .cmbcal__corner{border-right:1px solid #e3d9cf}
  .cg-shared .cmbcal__day{padding:7px 5px;text-align:center;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5a4d45;border-right:1px solid #e3d9cf;display:flex;align-items:center;justify-content:center;gap:5px}
  .cg-shared .cmbcal__day:last-child{border-right:none}
  .cg-shared .cmbcal__day i{font-style:normal;font-size:8.5px;color:#fff;background:#d2754f;border-radius:999px;min-width:14px;padding:1px 4px;line-height:1.3}
  .cg-shared .cmbcal__day.is-free{color:#8a7d73}
  .cg-shared .cmbcal__body{display:grid;position:relative}
  .cg-shared .cmbcal__gutter{position:relative;border-right:1px solid #e3d9cf}
  .cg-shared .cmbcal__hour{position:relative;box-sizing:border-box}
  .cg-shared .cmbcal__hour span{position:absolute;top:-6px;right:6px;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9px;color:#8a7d73}
  .cg-shared .cmbcal__col{position:relative;border-right:1px solid #e3d9cf}
  .cg-shared .cmbcal__col:last-child{border-right:none}
  .cg-shared .cmbcal__col.is-free{background:repeating-linear-gradient(135deg,transparent,transparent 9px,#f1ece5 9px,#f1ece5 10px)}
  .cg-shared .cmbcal__cell{box-sizing:border-box;border-top:1px solid #ece5dc}
  .cg-shared .cmbcal__cell:first-child{border-top:none}
  .cg-shared .cmbcal__freelbl{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9.5px;letter-spacing:.3em;text-transform:uppercase;color:#b3a89e}
  .cg-shared .cmbcal-blk{position:absolute;left:3px;right:3px;box-sizing:border-box;border-radius:6px;overflow:hidden;background:color-mix(in srgb,var(--blk) 22%,#fff);border:1px solid color-mix(in srgb,var(--blk) 45%,#fff);border-left:3px solid var(--blk);padding:4px 6px;display:flex;flex-direction:column;gap:1px;min-height:0}
  .cg-shared .cmbcal-blk__abbr{font-family:Georgia,"Times New Roman",serif;font-weight:bold;font-size:12px;line-height:1.12;color:#2b211c;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--abbr-lines,2);overflow:hidden;overflow-wrap:break-word;min-width:0}
  .cg-shared .cmbcal-blk__time{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:9.5px;color:#5a4d45;line-height:1.2}
  .cg-shared .cmbcal-blk__room{font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:8.5px;color:#8a7d73;margin-top:auto}
  .cg-shared .cmbcal-blk.is-conf{border-color:#9c3b2e;border-left-color:#9c3b2e;box-shadow:0 0 0 1px #9c3b2e}
  .cg-shared .cmbcal-blk.is-conf::after{content:"se pisa";position:absolute;top:3px;right:4px;font-family:"SFMono-Regular",Menlo,Consolas,monospace;font-size:8px;color:#9c3b2e;letter-spacing:.04em}
  .cg-shared .cmbcal--compact .cmbcal__day{padding:5px 3px;font-size:8.5px;gap:3px}
  .cg-shared .cmbcal--compact .cmbcal__hour span{font-size:8px;right:5px}
  .cg-shared .cmbcal--compact .cmbcal-blk{padding:2px 4px;border-radius:5px;gap:1px;left:2px;right:2px}
  .cg-shared .cmbcal--compact .cmbcal-blk__abbr{font-size:10px}
  .cg-shared .cmbcal--dense .cmbcal-blk__abbr{font-size:11px}
  .cg-shared .cmbcal--dense .cmbcal-blk__time{font-size:9px}
`;
