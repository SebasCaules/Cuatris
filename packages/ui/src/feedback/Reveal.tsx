"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type Ref } from "react";
import { cn } from "../cn";

/**
 * Reveal — aparición al hacer scroll: agrega `.in-view` al entrar al
 * viewport (vía IntersectionObserver). Respeta `prefers-reduced-motion`
 * (aparece de inmediato) y usa `delay` para escalonar (stagger), seteando
 * la custom property `--reveal-delay`. La etiqueta del wrapper se elige
 * con `as`.
 *
 * @example
 *   <Reveal>Bloque que aparece al entrar en pantalla</Reveal>
 *   <Reveal as="li" delay={120}>Item escalonado</Reveal>
 */
export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Retraso del stagger en ms → custom property `--reveal-delay`. */
  delay?: number;
  /** Etiqueta del contenedor. Por defecto `div`. */
  as?: "div" | "section" | "li" | "article";
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            setInView(true);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as Ref<never>}
      className={cn("reveal", inView && "in-view", className)}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
