"use client";

import { useEffect, useRef } from "react";
import { PlannerProvider, usePlanner } from "./state";
import PlannerErrorBoundary from "./PlannerErrorBoundary";
import {
  loadPersisted,
  saveApproved,
  saveCombo,
  saveComboParams,
  saveComboSolo,
  saveFinalDone,
  saveCursando,
  saveFinalesCombo,
  saveFixedCom,
  saveIntroDismissed,
  saveLocked,
  saveLockPins,
  savePlanOpts,
  savePlanPool,
  saveSidebar,
  saveView,
} from "@/lib/planner/persist";
import { readParams, writeParams } from "@/lib/url-state/core";
import { decodePlannerUrl, encodePlannerUrl } from "@/lib/planner/url-state";
import { llamadoVigente } from "@/lib/planner/finalesData";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import DetailDrawer from "./DetailDrawer";
import FichaReader from "./FichaReader";
import CuatriView from "./views/CuatriView";
import ElectivasView from "./views/ElectivasView";
import CombinadorView from "./views/CombinadorView";
import PlanView from "./views/PlanView";
import GrafoView from "./views/GrafoView";
import FinalesCombinadorView from "./views/FinalesCombinadorView";
import RefView from "./views/RefView";
import "./planner.css";

const VIEWS = {
  cuatri: CuatriView,
  elect: ElectivasView,
  combo: CombinadorView,
  plan: PlanView,
  grafo: GrafoView,
  finales: FinalesCombinadorView,
  ref: RefView,
} as const;

function PlannerInner() {
  const { state, dispatch } = usePlanner();

  // hidratar desde localStorage tras montar (SSR no tiene localStorage), y
  // encima la vista/navegación que traiga la URL (mismo effect, mismo tick:
  // HYDRATE_URL corre sobre el estado que acaba de dejar HYDRATE, así la
  // intención explícita del link pisa lo persistido en esas mismas claves
  // antes de que el effect de escritura de abajo pueda correr).
  useEffect(() => {
    const persisted = loadPersisted();
    dispatch({ type: "HYDRATE", payload: persisted });
    const url = decodePlannerUrl(readParams());
    dispatch({ type: "HYDRATE_URL", payload: url });
    // CPT-14: sin `?view=` explícito en la URL, retomar la última vista
    // guardada (post-hidratación, mismo tick que HYDRATE/HYDRATE_URL → sin
    // flash extra). El deep-link SIEMPRE gana; la primera visita no tiene clave
    // persistida → se conserva el default (cuatri) que ya trae el estado.
    if (!url.view && persisted.view)
      dispatch({ type: "SET_VIEW", view: persisted.view });
    // Sin finales guardados (primera visita), abrir el combinador en el llamado
    // vigente en vez del default fijo del estado inicial, que envejece. Va acá
    // y no en `initialFinales()` a propósito: depende de la fecha del sistema y
    // el sitio es static export — calcularlo en el render rompería la
    // hidratación (server y cliente darían llamados distintos).
    if (!persisted.finales) {
      const { periodo, anio } = llamadoVigente();
      dispatch({ type: "SET_FINALES_PERIODO", periodo });
      dispatch({ type: "SET_FINALES_ANIO", anio });
    }
  }, [dispatch]);

  // ---- F02: Atrás/Adelante cierra y reabre drawer/ficha en vez de salir ----
  // Tres piezas que se coordinan vía refs (no hace falta más estado/re-render):
  //   - prevDrawerRef/prevFichaRef: valor anterior de esas dos claves, para
  //     detectar en el effect de escritura si ESTE tick fue una transición
  //     abrir/cerrar (null↔valor) — la única razón para `push`.
  //   - hydratedOnceRef: la primerísima corrida del effect de escritura tras
  //     hidratar (montaje, o recarga con ?drawer=X) sólo está "asentando" lo
  //     que ya trae la URL/localStorage — no es una transición del usuario, así
  //     que nunca debe contar como push aunque drawerCode pase de null a algo.
  //   - fromPopRef: lo prende el listener de popstate antes de despachar la
  //     reconciliación; el effect de escritura que se dispara en consecuencia
  //     lo lee para forzar `replace` (el browser ya movió la entrada de
  //     historial — reescribir la URL en el mismo tick es un no-op; un `push`
  //     acá duplicaría entrada) y lo limpia. El `setTimeout` es red de
  //     seguridad: si el popstate reconcilia a un estado idéntico al actual,
  //     ninguna de las claves observadas cambia, el effect de escritura no
  //     vuelve a correr, y el flag quedaría pegado en `true` forzando
  //     `replace` en el próximo cambio real que sí debería empujar.
  const prevDrawerRef = useRef<string | null>(null);
  const prevFichaRef = useRef<string | null>(null);
  const hydratedOnceRef = useRef(false);
  const fromPopRef = useRef(false);

  // Reconcilia el estado del planner con la entrada de historial activa en
  // Atrás/Adelante (ambos disparan `popstate`). Gateado en `hydrated`: no hay
  // nada que reconciliar antes de la hidratación inicial.
  useEffect(() => {
    if (!state.hydrated) return;
    const onPopState = () => {
      fromPopRef.current = true;
      const u = decodePlannerUrl(readParams()); // valida igual que al montar
      // view/search/areas/filtros/combo: HYDRATE_URL alcanza (semántica
      // "undefined = mantener" ya existente). No es 100% fiel para el caso
      // "la clave está en su default y por eso la URL destino la omite" (ahí
      // se mantendría el valor viejo en vez de volver al default), pero
      // mantiene el resto del viaje atrás/adelante coherente sin duplicar la
      // lógica de defaults de encodePlannerUrl acá.
      dispatch({ type: "HYDRATE_URL", payload: u });
      // drawer/ficha necesitan las acciones explícitas: HYDRATE_URL NO cierra
      // cuando la clave está ausente (undefined = mantener), que es
      // exactamente el caso "atrás hasta antes de abrir" que hay que cubrir.
      if (u.drawerCode) dispatch({ type: "OPEN_DRAWER", code: u.drawerCode });
      else dispatch({ type: "CLOSE_DRAWER" });
      if (u.fichaCode) dispatch({ type: "OPEN_FICHA", code: u.fichaCode });
      else dispatch({ type: "CLOSE_FICHA" });
      setTimeout(() => {
        fromPopRef.current = false;
      }, 0);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [state.hydrated, dispatch]);

  // reflejar vista/navegación en la URL (reload y compartir link reproducen
  // la vista); gateado en `hydrated` para no pisarla con defaults antes de
  // haber leído lo que traía. `push` SOLO cuando drawer/ficha ABREN en este
  // tick (null→valor): así Atrás cierra en un paso. El CIERRE usa `replace`
  // (no `push`): si empujáramos también al cerrar, Atrás reabriría el drawer
  // recién cerrado en vez de salir. `replace` al cerrar limpia la URL y cubre
  // bien el caso "link compartido que aterriza con el drawer abierto". El
  // resto (view/search/filtros/combo, switch de drawer A→B, o cualquier
  // escritura disparada por el popstate) también usa `replace` — no ensucia el
  // back stack por cada tecla del buscador ni por cada filtro.
  useEffect(() => {
    if (!state.hydrated) return;

    const isSettling = !hydratedOnceRef.current; // primer write post-hidratar
    const drawerOpened =
      !isSettling && prevDrawerRef.current == null && state.drawerCode != null;
    const fichaOpened =
      !isSettling && prevFichaRef.current == null && state.fichaCode != null;
    const mode: "push" | "replace" =
      !fromPopRef.current && (drawerOpened || fichaOpened)
        ? "push"
        : "replace";

    writeParams((p) => encodePlannerUrl(state, p), mode);

    prevDrawerRef.current = state.drawerCode;
    prevFichaRef.current = state.fichaCode;
    hydratedOnceRef.current = true;
    fromPopRef.current = false;
  }, [
    state.view,
    state.search,
    state.areasOn,
    state.fDisp,
    state.fHor,
    state.combo,
    state.drawerCode,
    state.fichaCode,
    state.hydrated,
  ]);

  // persistir solo después de hidratar (si no, pisa datos del usuario con defaults)
  useEffect(() => {
    if (state.hydrated) saveView(state.view);
  }, [state.view, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveApproved(state.approved);
  }, [state.approved, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveFinalDone(state.finalDone);
  }, [state.finalDone, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveCursando(state.cursando);
  }, [state.cursando, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveCombo(state.combo);
  }, [state.combo, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) savePlanPool(state.plan.pool, state.plan.fixed);
  }, [state.plan.pool, state.plan.fixed, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveLocked(state.plan.lockedIdx);
  }, [state.plan.lockedIdx, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveLockPins(state.plan.lockPins);
  }, [state.plan.lockPins, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveFinalesCombo(state.finales);
  }, [state.finales, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveComboParams(state.comboParams);
  }, [state.comboParams, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveComboSolo(state.comboSolo);
  }, [state.comboSolo, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveFixedCom(state.fixedCom);
  }, [state.fixedCom, state.hydrated]);
  useEffect(() => {
    if (state.hydrated)
      savePlanOpts({
        start: state.plan.start,
        maxCred: state.plan.maxCred,
        maxMat: state.plan.maxMat,
        avoid: state.plan.avoid,
        method: state.plan.method,
        capCredByIdx: [...state.plan.capCredByIdx],
        capMatByIdx: [...state.plan.capMatByIdx],
      });
  }, [
    state.plan.start,
    state.plan.maxCred,
    state.plan.maxMat,
    state.plan.avoid,
    state.plan.method,
    state.plan.capCredByIdx,
    state.plan.capMatByIdx,
    state.hydrated,
  ]);
  useEffect(() => {
    if (state.hydrated) saveSidebar(state.sideCollapsed);
  }, [state.sideCollapsed, state.hydrated]);
  useEffect(() => {
    if (state.hydrated) saveIntroDismissed(state.introDismissed);
  }, [state.introDismissed, state.hydrated]);

  const View = VIEWS[state.view];

  // CPT-03: solo "Mis materias" y "Electivas" cuelgan controles del rail
  // (búsqueda/filtros/minors). En las otras 5 vistas el rail solo navega, así
  // que pasa a modo compacto (más angosto) y le devuelve ese ancho al contenido
  // —la navegación nunca desaparece; colapsar sigue disponible como reclamo total—.
  const railHasControls = state.view === "cuatri" || state.view === "elect";

  // Banner de primer uso: usuario sin nada marcado y que no lo cerró. Se va
  // solo al marcar la primera materia (approved.size > 0) o con la ×.
  const showIntro =
    state.hydrated && state.approved.size === 0 && !state.introDismissed;

  return (
    <div
      className={
        `planner${state.sideCollapsed ? " side-collapsed" : ""}` +
        (railHasControls ? "" : " rail-nav-only")
      }
    >
      <h1 className="sr-only">Planificador de electivas</h1>
      <Topbar />
      {showIntro && (
        <div className="first-run" role="note">
          <p className="first-run__txt">
            <b>Empezá por acá:</b> marcá las materias que ya aprobaste — un
            toque = cursada (✓), dos = final aprobado (✓✓). El resto del
            planner se arma solo.
          </p>
          {state.view !== "cuatri" && (
            <button
              type="button"
              className="first-run__go"
              onClick={() => dispatch({ type: "SET_VIEW", view: "cuatri" })}
            >
              Marcar mis aprobadas
            </button>
          )}
          <button
            type="button"
            className="first-run__x"
            aria-label="Cerrar esta guía"
            title="No volver a mostrar"
            onClick={() => dispatch({ type: "DISMISS_INTRO" })}
          >
            ×
          </button>
        </div>
      )}
      <div className="shell">
        <Sidebar />
        <div className="main">
          <View />
        </div>
      </div>
      {state.sideCollapsed && (
        <button
          type="button"
          className="side__reveal"
          aria-label="Mostrar el panel de control"
          title="Mostrar panel"
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path
              d="M9.5 6.5 15 12l-5.5 5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <DetailDrawer />
      <FichaReader />
    </div>
  );
}

export default function PlannerApp() {
  return (
    <PlannerErrorBoundary>
      <PlannerProvider>
        <PlannerInner />
      </PlannerProvider>
    </PlannerErrorBoundary>
  );
}
