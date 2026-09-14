"use client";

// Tooltip reutilizable del planner.
//   · Abre con hover (tras un delay) o con foco de TECLADO del disparador
//     (:focus-visible); cierra al salir, al perder el foco, al hacer clic o
//     tocar el disparador, o con Esc. El foco que llega por un clic no abre:
//     dejaba la burbuja pegada sobre el botón recién tocado aunque el cursor ya
//     no estuviera encima. Y si se abrió por hover, un movimiento del puntero
//     fuera del disparador la cierra igual (el disparador pudo re-renderizarse
//     o moverse sin que llegue el mouseleave).
//   · Se pinta por portal en <body> con position:fixed y se reubica para no
//     salirse del viewport (ARRIBA por default —así nunca tapa lo que viene
//     después del disparador, que suele ser lo próximo a tocar—, abajo si arriba
//     no entra o quedaría bajo la navbar fija; horizontal clampeado a 8px de
//     los bordes).
//   · Accesible: la burbuja es role="tooltip" y el disparador la referencia con
//     aria-describedby; el disparador puede ser cualquier elemento enfocable.
//   · Static-export safe: no toca document/window hasta que hay DOM montado.
// Estética: tokens del planner (panel, line-2, shadow-2, mono) — cero hex.
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const GAP = 9;
const MARGIN = 8;

type Placement = "top" | "bottom";

export function Tooltip({
  content,
  children,
  delay = 260,
  placement = "top",
  width = 236,
}: {
  /** Contenido de la burbuja (texto o nodos; admite <b>). */
  content: ReactNode;
  /** Disparador: UN elemento (botón, enlace, span enfocable). */
  children: ReactElement<Record<string, unknown>>;
  /** ms de hover antes de abrir (el foco abre al instante). */
  delay?: number;
  /** Lado preferido (por default arriba); se invierte si no entra en el viewport. */
  placement?: Placement;
  /** Ancho de la burbuja en px. */
  width?: number;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // cómo se abrió: por hover (se cierra si el puntero se va) o por teclado
  const viaKeyboard = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number; side: Placement }>({
    x: 0,
    y: 0,
    side: placement,
  });

  useEffect(() => setMounted(true), []);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback(
    (immediate: boolean) => {
      clear();
      if (immediate) setOpen(true);
      else timer.current = setTimeout(() => setOpen(true), delay);
    },
    [delay],
  );
  const hide = useCallback(() => {
    clear();
    setOpen(false);
  }, []);

  useEffect(() => clear, []);

  // Esc cierra mientras está abierto (y devuelve nada: el foco no se mueve).
  // Abierto por hover: cualquier puntero fuera del disparador también cierra
  // (cubre el caso en que el disparador se re-renderiza o se mueve y el
  // mouseleave nunca llega); un pointerdown en cualquier lado, ídem.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const onMove = (e: PointerEvent) => {
      if (viaKeyboard.current) return;
      const t = triggerRef.current;
      if (!t || !t.isConnected || !t.contains(e.target as Node)) hide();
    };
    const onDown = () => hide();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, hide]);

  // Posición: medir disparador + burbuja y clampear al viewport. Se recalcula
  // al abrir y ante scroll/resize (la burbuja es fixed: sigue al disparador).
  const place = useCallback(() => {
    const t = triggerRef.current;
    const b = bubbleRef.current;
    if (!t || !b) return;
    const r = t.getBoundingClientRect();
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // la navbar del sitio es fija y va por encima: arriba solo si queda debajo de ella
    const navH =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--nav-h"),
      ) || 0;
    let side: Placement = placement;
    const fitsBelow = r.bottom + GAP + bh <= vh - MARGIN;
    const fitsAbove = r.top - GAP - bh >= navH + MARGIN;
    if (side === "bottom" && !fitsBelow && fitsAbove) side = "top";
    if (side === "top" && !fitsAbove && fitsBelow) side = "bottom";
    const y = side === "bottom" ? r.bottom + GAP : r.top - GAP - bh;
    let x = r.left + r.width / 2 - bw / 2;
    x = Math.max(MARGIN, Math.min(x, vw - MARGIN - bw));
    setPos({ x, y, side });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const child = children;
  const childProps = child.props;
  const trigger = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      // React 19: el ref del disparador viene como prop (leer `element.ref`
      // avisa por consola y va a desaparecer)
      const prev = childProps.ref;
      if (typeof prev === "function") prev(node);
      else if (prev && typeof prev === "object")
        (prev as { current: HTMLElement | null }).current = node;
    },
    "aria-describedby": [childProps["aria-describedby"], open ? id : null]
      .filter(Boolean)
      .join(" ") || undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      (childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
      viaKeyboard.current = false;
      show(false);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e);
      hide();
    },
    onPointerDown: (e: React.PointerEvent) => {
      (childProps.onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(e);
      // tocar el disparador es actuar, no pedir ayuda: se cierra ya
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
      // solo el foco visible (teclado) abre; el que deja un clic, no
      const el = e.currentTarget as Element;
      if (typeof el.matches === "function" && !el.matches(":focus-visible")) return;
      viaKeyboard.current = true;
      show(true);
    },
    onBlur: (e: React.FocusEvent) => {
      (childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e);
      hide();
    },
  });

  const style: CSSProperties = {
    position: "fixed",
    left: pos.x,
    top: pos.y,
    width,
    zIndex: 1200, // sobre la navbar (1000) y los modales del planner (1100)
  };

  return (
    <>
      {trigger}
      {mounted &&
        open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            className={"planner pv-tooltip pv-tooltip--" + pos.side}
            style={style}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}

export default Tooltip;
