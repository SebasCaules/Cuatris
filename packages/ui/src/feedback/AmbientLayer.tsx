"use client";

import { useEffect, useRef } from "react";

/**
 * AmbientLayer — capa ambiental que va detrás de todo el contenido:
 * gradiente animado (CSS) + campo de partículas liviano (canvas 2D).
 * Lee los colores por tema desde las custom properties `--particle-*`,
 * relee al evento `sv:themechange`, cap ~30fps, pausa con la pestaña
 * oculta y respeta `prefers-reduced-motion`.
 *
 * A diferencia del original (que decidía con `usePathname` si estaba en
 * el home), acá se controla con la prop `disabled`: si está activa, el
 * componente devuelve `null` y no arranca el canvas.
 *
 * @example
 *   <AmbientLayer />
 *   <AmbientLayer disabled={isHome} />
 */
export interface AmbientLayerProps {
  /** Si es true, no renderiza nada ni arranca el canvas. Por defecto false. */
  disabled?: boolean;
}

export function AmbientLayer({ disabled = false }: AmbientLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (disabled) return; // deshabilitado: sin ambient
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      canvas.style.display = "none";
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const COUNT = 46;
    let w = 0;
    let h = 0;
    let pts: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      blue: boolean;
    }[] = [];
    let raf = 0;
    let last = 0;

    const COL = {
      blue: "rgba(146,207,242,0.55)",
      coral: "rgba(244,124,89,0.50)",
      link: "rgba(255,255,255,0.14)",
    };
    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      const b = cs.getPropertyValue("--particle-blue").trim();
      const c = cs.getPropertyValue("--particle-coral").trim();
      const l = cs.getPropertyValue("--particle-link").trim();
      if (b) COL.blue = b;
      if (c) COL.coral = c;
      if (l) COL.link = l;
    }
    readColors();

    function resize() {
      if (!canvas || !ctx) return;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function seed() {
      pts = [];
      for (let i = 0; i < COUNT; i++) {
        pts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          r: Math.random() * 1.6 + 0.6,
          blue: Math.random() > 0.32, // coral minoría (acento); azul domina
        });
      }
    }
    function step(ts: number) {
      raf = requestAnimationFrame(step);
      if (ts - last < 33) return; // ~30fps
      last = ts;
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;
        ctx.strokeStyle = COL.link;
        ctx.lineWidth = 0.6;
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 16000) {
            ctx.globalAlpha = 1 - d2 / 16000;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.blue ? COL.blue : COL.coral;
        ctx.fill();
      }
    }
    function start() {
      resize();
      seed();
      cancelAnimationFrame(raf);
      last = 0;
      raf = requestAnimationFrame(step);
    }
    start();

    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(start, 180);
    };
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("sv:themechange", readColors);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("sv:themechange", readColors);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [disabled]);

  if (disabled) return null;

  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient__grad" />
      <canvas className="ambient__canvas" ref={canvasRef} />
    </div>
  );
}

export default AmbientLayer;
