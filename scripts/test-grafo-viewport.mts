// Done-test de components/planner/grafo/useViewport.ts (U2, PLAN.md §2.3).
//
// Sólo prueba las dos funciones puras exportadas (fitTransform, zoomAtPoint):
// el hook en sí (pan, pinch, tap) necesita DOM real y se verifica con
// `npm run typecheck` + smoke manual en el navegador. Node 23 con type
// stripping nativo corre el .ts importándolo con extensión explícita — el
// archivo no puede tener imports en runtime salvo "react" (que Node resuelve
// desde node_modules sin problema).
//
// Ejecutar: node scripts/test-grafo-viewport.mts

import {
  fitTransform,
  zoomAtPoint,
  VIEWPORT_LIMITS,
} from "../components/planner/grafo/useViewport.ts";

let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`OK   ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const EPS = 1e-6;
const close = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;

// ---------- fitTransform: centra el contenido ----------
{
  // Contenido de 400×200 en un viewport de 800×600, pad 40 → limitado por el
  // ancho (400/720 < 200/520): el contenido queda centrado en ambos ejes.
  const t = fitTransform(400, 200, 800, 600, 40, 0.06, 2.4);
  const availW = 800 - 80;
  const availH = 600 - 80;
  const expectedScale = Math.min(availW / 400, availH / 200);
  check(
    "fitTransform: escala = min(anchoDisp/anchoContenido, altoDisp/altoContenido)",
    close(t.scale, expectedScale),
    `scale=${t.scale} esperado=${expectedScale}`,
  );
  const cx = t.tx + (400 * t.scale) / 2;
  const cy = t.ty + (200 * t.scale) / 2;
  check(
    "fitTransform: centra horizontalmente",
    close(cx, 400),
    `centro x=${cx}`,
  );
  check(
    "fitTransform: centra verticalmente",
    close(cy, 300),
    `centro y=${cy}`,
  );
}

// ---------- fitTransform: respeta el piso (FIT_MIN_SCALE) ----------
{
  // Contenido enorme (10.000×10.000) en un viewport chico: la escala "natural"
  // sería ínfima; el piso la levanta a FIT_MIN_SCALE.
  const t = fitTransform(
    10_000,
    10_000,
    600,
    400,
    VIEWPORT_LIMITS.FIT_PAD,
    VIEWPORT_LIMITS.FIT_MIN_SCALE,
    VIEWPORT_LIMITS.MAX_SCALE,
  );
  check(
    "fitTransform: escala nunca baja del piso dado",
    t.scale >= VIEWPORT_LIMITS.FIT_MIN_SCALE - EPS,
    `scale=${t.scale}`,
  );
}

// ---------- fitTransform: respeta el techo (maxScale) ----------
{
  // Contenido minúsculo en un viewport grande: la escala "natural" sería
  // gigante; el techo la limita a maxScale.
  const t = fitTransform(10, 10, 2000, 2000, 40, 0.06, 2.4);
  check(
    "fitTransform: escala nunca supera el techo dado",
    close(t.scale, 2.4),
    `scale=${t.scale}`,
  );
}

// ---------- zoomAtPoint: mantiene fijo el punto anclado ----------
{
  const t0 = { scale: 1, tx: 10, ty: -20 };
  const anchorX = 150;
  const anchorY = 220;
  // Punto de CONTENIDO bajo el ancla, antes de zoomear.
  const contentX = (anchorX - t0.tx) / t0.scale;
  const contentY = (anchorY - t0.ty) / t0.scale;

  for (const factor of [1.5, 0.6, 3, 1 / 3]) {
    const t1 = zoomAtPoint(t0, anchorX, anchorY, factor, 0.1, 10);
    const screenX = contentX * t1.scale + t1.tx;
    const screenY = contentY * t1.scale + t1.ty;
    check(
      `zoomAtPoint: el punto anclado no se mueve en pantalla (factor=${factor})`,
      close(screenX, anchorX) && close(screenY, anchorY),
      `screen=(${screenX},${screenY}) esperado=(${anchorX},${anchorY})`,
    );
  }
}

// ---------- zoomAtPoint: clamp en los extremos ----------
{
  const t0 = { scale: 1, tx: 0, ty: 0 };
  const min = 0.5;
  const max = 2;

  const zoomedOut = zoomAtPoint(t0, 100, 100, 0.0001, min, max);
  check(
    "zoomAtPoint: clamp al piso cuando el factor achica demasiado",
    close(zoomedOut.scale, min),
    `scale=${zoomedOut.scale}`,
  );

  const zoomedIn = zoomAtPoint(t0, 100, 100, 1000, min, max);
  check(
    "zoomAtPoint: clamp al techo cuando el factor agranda demasiado",
    close(zoomedIn.scale, max),
    `scale=${zoomedIn.scale}`,
  );

  // Incluso clampeado, el punto anclado sigue fijo (el clamp se aplica antes
  // de calcular tx/ty, no después).
  const screenX = (100 - t0.tx) / t0.scale * zoomedOut.scale + zoomedOut.tx;
  check(
    "zoomAtPoint: el ancla sigue fija aun clampeando la escala",
    close(screenX, 100),
    `screenX=${screenX}`,
  );
}

// ---------- VIEWPORT_LIMITS: valores del contrato (§2.3) ----------
{
  check(
    "VIEWPORT_LIMITS: valores exactos del contrato",
    VIEWPORT_LIMITS.MIN_SCALE === 0.25 &&
      VIEWPORT_LIMITS.MAX_SCALE === 2.4 &&
      VIEWPORT_LIMITS.FIT_MIN_SCALE === 0.06 &&
      VIEWPORT_LIMITS.FIT_PAD === 40,
    JSON.stringify(VIEWPORT_LIMITS),
  );
}

if (failed > 0) {
  console.log(`\n${failed} verificación(es) fallida(s).`);
  process.exit(1);
} else {
  console.log("\nOK — todas las verificaciones de useViewport pasaron.");
}
