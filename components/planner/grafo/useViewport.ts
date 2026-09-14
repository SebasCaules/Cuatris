"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Hook de viewport del mapa de correlativas: paneo, zoom (rueda, botones,
 * pinch de dos dedos), tap/doble tap y encuadres (ver todo, framear un
 * rectángulo, centrar un punto).
 *
 * La transformación se aplica de forma IMPERATIVA sobre el atributo
 * `transform` de un <g> SVG — nunca dispara un render de React durante un
 * arrastre, una rueda o un pinch, algo esencial con ~100 nodos en el DAG (un
 * setState por pointermove sería visiblemente lento). Todo el estado de
 * navegación vive en refs; el único estado de React es `ready`, que pasa a
 * true recién después del primer encuadre (evita el parpadeo de un frame sin
 * encuadrar antes de medir el viewport).
 *
 * Static-export safe: todo acceso a window/document/ResizeObserver ocurre
 * dentro de useEffect o de manejadores de evento — nunca en el cuerpo del
 * componente ni al importar el módulo.
 */

export interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

export interface ContentRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewportApi {
  viewportRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<SVGGElement | null>;
  get(): Transform;
  /** clamp de escala + aplica + notifica */
  set(t: Transform): void;
  /** anclado al centro; marca interacción */
  zoomBy(factor: number): void;
  /** encuadra todo (FIT_PAD 40); sticky ante resize */
  fitAll(): void;
  frame(
    rect: ContentRect,
    opts?: { scale?: number; align?: "center" | "left-third" },
  ): void;
  /** centra un punto, escala ≥ minScale */
  centerOn(x: number, y: number, minScale?: number): void;
  /** contenido → px del viewport */
  toScreen(x: number, y: number): { x: number; y: number };
  /** notifica en rAF tras cada cambio */
  subscribe(cb: (t: Transform) => void): () => void;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
  /** primer encuadre aplicado (estado React) */
  ready: boolean;
}

export interface ViewportOptions {
  /** tamaño del contenido */
  width: number;
  height: number;
  /** encuadre inicial (lo define la vista) */
  initialFrame: (api: ViewportApi) => void;
  /** clic limpio (sin arrastre > 5 px) */
  onTap?: (target: Element, e: PointerEvent) => void;
  /** dos taps en < 320 ms sobre el mismo target */
  onDoubleTap?: (target: Element, e: PointerEvent) => void;
}

export const VIEWPORT_LIMITS = {
  MIN_SCALE: 0.25,
  MAX_SCALE: 2.4,
  FIT_MIN_SCALE: 0.06,
  FIT_PAD: 40,
} as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Distancia euclídea entre dos puntos de pantalla (para medir el pinch). */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Encuadre que contiene contentW×contentH dentro de vw×vh con `pad` px de
 * margen, centrado. El piso/techo de escala son parámetros — no las
 * constantes del módulo — para que la misma función sirva al "ver todo"
 * normal (piso MIN_SCALE) y a fitAll(), que necesita poder bajar hasta
 * FIT_MIN_SCALE cuando el DAG es mucho más grande que cualquier zoom legible:
 * la garantía es que el contenido NUNCA queda más grande que la vista.
 */
export function fitTransform(
  contentW: number,
  contentH: number,
  vw: number,
  vh: number,
  pad: number,
  minScale: number,
  maxScale: number,
): Transform {
  const w = Math.max(1, contentW);
  const h = Math.max(1, contentH);
  const availW = Math.max(1, vw - 2 * pad);
  const availH = Math.max(1, vh - 2 * pad);
  const scale = clamp(Math.min(availW / w, availH / h), minScale, maxScale);
  return {
    scale,
    tx: (vw - w * scale) / 2,
    ty: (vh - h * scale) / 2,
  };
}

/**
 * Transformación resultante de aplicar `factor` de zoom anclado al punto de
 * pantalla (px,py): ese punto queda fijo en pantalla (el contenido crece o
 * encoge alrededor de él). Es la matemática que comparten rueda, pinch y los
 * botones +/− — sólo cambia de dónde sale (px,py) y `factor`.
 */
export function zoomAtPoint(
  t: Transform,
  px: number,
  py: number,
  factor: number,
  minScale: number,
  maxScale: number,
): Transform {
  const scale = clamp(t.scale * factor, minScale, maxScale);
  const k = scale / t.scale;
  return {
    scale,
    tx: px - (px - t.tx) * k,
    ty: py - (py - t.ty) * k,
  };
}

export function useViewport(opts: ViewportOptions): ViewportApi {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<SVGGElement | null>(null);

  // Las funciones imperativas de más abajo se crean UNA sola vez (ver el
  // useMemo de `api`) y de ahí en más nunca vuelven a ejecutar el cuerpo del
  // hook: para que igual vean el width/height o el onTap más recientes, nunca
  // leen `opts` directamente sino `optsRef.current`, actualizado en cada
  // render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // La transformación real vive en un ref: panear/zoomear NO debe disparar un
  // render de React (con ~100 nodos sería notoriamente lento). Se aplica a
  // mano sobre el atributo `transform` del <g> del stage.
  const tf = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });
  // Una vez que el usuario paneó, hizo zoom (rueda, botones o pinch), el
  // encuadre automático de mount/resize deja de tocar la vista: a partir de
  // ahí es SU vista.
  const userInteracted = useRef(false);
  // Sticky: si el último encuadre pedido fue "ver todo" (fitAll), un resize
  // vuelve a pedir "ver todo" en vez de repetir el encuadre inicial de la
  // vista. Se apaga al framear algo puntual (frame/centerOn) — esos ya no son
  // "ver todo" — o al interactuar.
  const wantFit = useRef(false);

  const [readyState, setReadyState] = useState(false);

  // ---------- aplicar transformación + notificar (una vez por frame) ----------
  const subscribers = useRef(new Set<(t: Transform) => void>());
  const notifyScheduled = useRef(false);

  function scheduleNotify() {
    if (notifyScheduled.current) return;
    notifyScheduled.current = true;
    requestAnimationFrame(() => {
      notifyScheduled.current = false;
      const snapshot: Transform = { ...tf.current };
      subscribers.current.forEach((cb) => cb(snapshot));
    });
  }

  function applyDom() {
    const g = stageRef.current;
    if (!g) return;
    const { tx, ty, scale } = tf.current;
    g.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
  }

  // Único punto de escritura de `tf`: clampea la escala al piso que
  // corresponda (MIN_SCALE para todo lo manual; FIT_MIN_SCALE sólo cuando lo
  // llama fitAll, que necesita poder bajar más para garantizar cero overflow
  // del DAG completo) y dispara DOM + notificación a suscriptores.
  function applyInternal(next: Transform, floor: number) {
    tf.current = {
      scale: clamp(next.scale, floor, VIEWPORT_LIMITS.MAX_SCALE),
      tx: next.tx,
      ty: next.ty,
    };
    applyDom();
    scheduleNotify();
  }

  // ---------- API imperativa ----------
  function get(): Transform {
    return { ...tf.current };
  }

  function set(t: Transform) {
    applyInternal(t, VIEWPORT_LIMITS.MIN_SCALE);
  }

  // Zoom anclado al CENTRO del viewport — a diferencia de la rueda, que ancla
  // al cursor, acá no hay una posición de mouse que tenga sentido preservar:
  // es el que usan los botones +/−.
  function zoomBy(factor: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    userInteracted.current = true;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const next = zoomAtPoint(
      tf.current,
      vw / 2,
      vh / 2,
      factor,
      VIEWPORT_LIMITS.MIN_SCALE,
      VIEWPORT_LIMITS.MAX_SCALE,
    );
    applyInternal(next, VIEWPORT_LIMITS.MIN_SCALE);
  }

  function fitAll() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    const { width, height } = optsRef.current;
    wantFit.current = true;
    const next = fitTransform(
      width,
      height,
      vw,
      vh,
      VIEWPORT_LIMITS.FIT_PAD,
      VIEWPORT_LIMITS.FIT_MIN_SCALE,
      VIEWPORT_LIMITS.MAX_SCALE,
    );
    applyInternal(next, VIEWPORT_LIMITS.FIT_MIN_SCALE);
  }

  function frame(
    rect: ContentRect,
    o?: { scale?: number; align?: "center" | "left-third" },
  ) {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    const scale = o?.scale ?? tf.current.scale;
    const align = o?.align ?? "center";
    let tx: number;
    if (align === "left-third") {
      // El borde izquierdo del rect va a un tercio del ancho del viewport;
      // si correr ese ancla el ancho de una columna más hacia la izquierda
      // todavía deja sitio (no la saca de pantalla), se corre — así la
      // columna anterior (ya cursada) queda visible de referencia sin
      // robarle protagonismo a la frontera. `rect.w` hace de proxy del
      // ancho de "una columna": es lo único de lo que dispone esta función.
      const third = vw / 3;
      const shifted = third - rect.w * scale;
      const leftPx = shifted >= 0 ? shifted : third;
      tx = leftPx - rect.x * scale;
    } else {
      tx = vw / 2 - (rect.x + rect.w / 2) * scale;
    }
    const ty = vh / 2 - (rect.y + rect.h / 2) * scale;
    // Framear algo puntual ya no es "ver todo": el próximo resize debe volver
    // a pedir el encuadre inicial de la vista, no un fitAll.
    wantFit.current = false;
    applyInternal({ scale, tx, ty }, VIEWPORT_LIMITS.MIN_SCALE);
  }

  function centerOn(x: number, y: number, minScale?: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    const scale =
      minScale !== undefined ? Math.max(tf.current.scale, minScale) : tf.current.scale;
    wantFit.current = false;
    applyInternal(
      { scale, tx: vw / 2 - x * scale, ty: vh / 2 - y * scale },
      VIEWPORT_LIMITS.MIN_SCALE,
    );
  }

  function toScreen(x: number, y: number): { x: number; y: number } {
    const { scale, tx, ty } = tf.current;
    return { x: x * scale + tx, y: y * scale + ty };
  }

  function subscribe(cb: (t: Transform) => void): () => void {
    subscribers.current.add(cb);
    return () => {
      subscribers.current.delete(cb);
    };
  }

  // Encuadre automático compartido por mount, resize y cambio de contenido:
  // si el último pedido explícito fue "ver todo" se repite tal cual (sticky);
  // si no, se delega en el encuadre que define la vista (frontera, overview
  // legible, etc. — la vista decide, el hook sólo orquesta cuándo llamarlo).
  function autoFrame(api: ViewportApi) {
    if (wantFit.current) fitAll();
    else optsRef.current.initialFrame(api);
  }

  // ---------- puntero: pan, pinch, tap y doble tap ----------
  // Punteros activos (dedo o mouse) por id: con 1 activo es pan; con 2, pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ down: false, moved: false, x0: 0, y0: 0, tx0: 0, ty0: 0 });
  // Snapshot del gesto de pinch anterior (distancia + punto medio en
  // pantalla): cada nuevo frame se expresa como "factor respecto del
  // anterior", no respecto del inicio del gesto.
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const lastTap = useRef<{ target: Element; code: string | null; time: number } | null>(
    null,
  );

  function nodeCodeFromTarget(t: EventTarget | null): string | null {
    const el = (t as Element | null)?.closest?.("[data-code]");
    return el ? el.getAttribute("data-code") : null;
  }

  function handleTap(target: Element, native: PointerEvent) {
    const code = nodeCodeFromTarget(target);
    const now = performance.now();
    const last = lastTap.current;
    // Doble tap: mismo elemento (o misma sigla [data-code]) dentro de 320 ms.
    const isDouble =
      !!last &&
      now - last.time < 320 &&
      (last.target === target || (code !== null && code === last.code));
    if (isDouble) {
      // Se consume: un tercer toque empieza una secuencia nueva, no un
      // "triple tap".
      lastTap.current = null;
      optsRef.current.onDoubleTap?.(target, native);
    } else {
      lastTap.current = { target, code, time: now };
      optsRef.current.onTap?.(target, native);
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no-op: algunos punteros sintéticos no soportan captura */
    }
    if (pointers.current.size === 1) {
      drag.current = {
        down: true,
        moved: false,
        x0: e.clientX,
        y0: e.clientY,
        tx0: tf.current.tx,
        ty0: tf.current.ty,
      };
    } else if (pointers.current.size === 2) {
      // Segundo dedo: arranca el pinch. El pan de un solo dedo se cancela acá
      // (down:false) para que el pointerup final no lo confunda con un tap.
      drag.current.down = false;
      const pts = [...pointers.current.values()];
      pinch.current = {
        dist: dist(pts[0], pts[1]),
        mx: (pts[0].x + pts[1].x) / 2,
        my: (pts[0].y + pts[1].y) / 2,
      };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2) {
      const pts = [...pointers.current.values()].slice(0, 2);
      const d = dist(pts[0], pts[1]);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const vp = viewportRef.current;
      if (pinch.current && vp) {
        const r = vp.getBoundingClientRect();
        const factor = d / pinch.current.dist;
        userInteracted.current = true;
        const lmx = mx - r.left;
        const lmy = my - r.top;
        const plmx = pinch.current.mx - r.left;
        const plmy = pinch.current.my - r.top;
        // Primero se panea por el desplazamiento del punto medio (los dos
        // dedos "arrastran" el mapa) y recién después se hace zoom anclado al
        // NUEVO punto medio: así el contenido que estaba bajo los dedos sigue
        // bajo los dedos, se hayan separado o juntado.
        const panned: Transform = {
          ...tf.current,
          tx: tf.current.tx + (lmx - plmx),
          ty: tf.current.ty + (lmy - plmy),
        };
        const zoomed = zoomAtPoint(
          panned,
          lmx,
          lmy,
          factor,
          VIEWPORT_LIMITS.MIN_SCALE,
          VIEWPORT_LIMITS.MAX_SCALE,
        );
        applyInternal(zoomed, VIEWPORT_LIMITS.MIN_SCALE);
      }
      pinch.current = { dist: d, mx, my };
      return;
    }

    if (!drag.current.down) return;
    const dx = e.clientX - drag.current.x0;
    const dy = e.clientY - drag.current.y0;
    if (!drag.current.moved && Math.hypot(dx, dy) > 5) {
      drag.current.moved = true;
      userInteracted.current = true;
      viewportRef.current?.classList.add("is-panning");
    }
    if (drag.current.moved) {
      applyInternal(
        {
          scale: tf.current.scale,
          tx: drag.current.tx0 + dx,
          ty: drag.current.ty0 + dy,
        },
        VIEWPORT_LIMITS.MIN_SCALE,
      );
    }
  }

  function endPointer(e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    pointers.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }

    if (pinch.current && pointers.current.size < 2) {
      // Se soltó un dedo del pinch: si queda uno, retoma el pan desde SU
      // posición actual (no desde donde había empezado el gesto original) —
      // así no hay salto. `moved:true` evita que ese remanente se lea como
      // un tap si se levanta enseguida.
      pinch.current = null;
      const rest = [...pointers.current.values()];
      if (rest.length === 1) {
        drag.current = {
          down: true,
          moved: true,
          x0: rest[0].x,
          y0: rest[0].y,
          tx0: tf.current.tx,
          ty0: tf.current.ty,
        };
      }
    }

    if (pointers.current.size === 0) {
      const wasTap = drag.current.down && !drag.current.moved;
      viewportRef.current?.classList.remove("is-panning");
      drag.current.down = false;
      if (wasTap && !cancelled) {
        handleTap(e.target as Element, e.nativeEvent);
      }
    }
  }

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => endPointer(e, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => endPointer(e, true),
  };

  // ---------- API estable ----------
  // Estas funciones sólo leen refs (nunca `opts` ni estado de render), así que
  // la instancia capturada en el primer render sigue siendo válida para
  // siempre: no hace falta recrearla, y por eso puede vivir en un useMemo con
  // deps vacías sin quedar jamás "pegada" a datos viejos.
  const api = useMemo<ViewportApi>(() => {
    const core: ViewportApi = {
      viewportRef,
      stageRef,
      get,
      set,
      zoomBy,
      fitAll,
      frame,
      centerOn,
      toScreen,
      subscribe,
      handlers,
      ready: false,
    };
    return core;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El objeto expuesto sólo cambia de identidad cuando `ready` cambia (una
  // vez, de false a true): así los componentes que lo desestructuran ven el
  // valor nuevo sin que cada pan/zoom recree el objeto entero.
  const fullApi = useMemo<ViewportApi>(
    () => ({ ...api, ready: readyState }),
    [api, readyState],
  );

  // Referencia siempre al día del api completo: los efectos la usan para
  // invocar `initialFrame` sin tener que reconstruir el objeto a mano.
  const apiRef = useRef(fullApi);
  apiRef.current = fullApi;

  // Encuadre inicial (doble rAF: el primero deja que el layout mida el
  // viewport recién montado; el segundo ya encuadra con el tamaño final) +
  // ResizeObserver que reencuadra mientras el usuario no haya tomado control.
  // Todo dentro de useEffect → nunca corre en SSR/build (static-export safe).
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      autoFrame(apiRef.current);
      raf2 = requestAnimationFrame(() => {
        autoFrame(apiRef.current);
        setReadyState(true);
      });
    });
    let ro: ResizeObserver | null = null;
    const vp = viewportRef.current;
    if (vp && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        if (!userInteracted.current) autoFrame(apiRef.current);
      });
      ro.observe(vp);
    }
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoom con rueda: listener NATIVO con {passive:false} — React adjunta sus
  // propios manejadores como pasivos y ahí preventDefault() no tiene efecto;
  // sin este listener nativo la página scrollearía en vez de hacer zoom.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const factor = Math.pow(1.0016, -e.deltaY);
      userInteracted.current = true;
      const next = zoomAtPoint(
        tf.current,
        e.clientX - r.left,
        e.clientY - r.top,
        factor,
        VIEWPORT_LIMITS.MIN_SCALE,
        VIEWPORT_LIMITS.MAX_SCALE,
      );
      applyInternal(next, VIEWPORT_LIMITS.MIN_SCALE);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de contenido (p. ej. se prende/apaga la capa de electivas y cambia
  // el alto del layout): si el usuario no tomó control se reencuadra con la
  // misma lógica que el resize; si ya interactuó, se respeta su
  // transformación tal cual quedó — no se le mueve el piso bajo los pies.
  const didMountSize = useRef(false);
  useEffect(() => {
    if (!didMountSize.current) {
      didMountSize.current = true;
      return;
    }
    if (!userInteracted.current) autoFrame(apiRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.width, opts.height]);

  return fullApi;
}
