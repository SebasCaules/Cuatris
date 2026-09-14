"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PlannerProvider, usePlanner } from "./state";
import PlannerErrorBoundary from "./PlannerErrorBoundary";
import { CarreraContext } from "./carreraContext";
import CarreraPicker from "./CarreraPicker";
import { cancelar as cancelarVuelo } from "./carreraVuelo";
import { activarCarrera, carreraPedida, CARRERA_URL_KEY } from "@/lib/planner/carreras";
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
  saveCarreraPref,
  loadCarreraPref,
  loadPerfiles,
  activarPerfil,
  setPersistPerfil,
  type Perfil,
} from "@/lib/planner/persist";
import { readParams, writeParams } from "@/lib/url-state/core";
import { decodePlannerUrl, encodePlannerUrl } from "@/lib/planner/url-state";
import { llamadoVigente } from "@/lib/planner/finalesData";
import Topbar from "./Topbar";
import { ViewNav } from "./ViewNav";
import PerfilMenu from "./PerfilMenu";
import { Tooltip } from "./Tooltip";
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
import "./motion.css";

const VIEWS = {
  cuatri: CuatriView,
  elect: ElectivasView,
  combo: CombinadorView,
  plan: PlanView,
  grafo: GrafoView,
  finales: FinalesCombinadorView,
  ref: RefView,
} as const;

// Título de la pestaña del navegador por vista: en una app de una sola ruta el
// historial y las pestañas abiertas se distinguen por acá, no por la URL.
const VIEW_TITLES: Record<keyof typeof VIEWS, string> = {
  cuatri: "Materias y electivas",
  elect: "Materias y electivas",
  combo: "Combinador de horarios",
  plan: "Plan de cursada",
  grafo: "Mapa de correlativas",
  finales: "Combinador de finales",
  ref: "Referencias de materias",
};

/** Chrome del sitio alrededor de la navegación del planner: recibe la nav de
 *  vistas, herramientas (hoy ninguna: carrera y referencias viven en el menú
 *  de perfil) y el menú de perfil (esquina derecha) y devuelve la barra
 *  superior. Sin chrome, la nav se dibuja como tira propia arriba del contenido. */
export type PlannerChrome = (nav: ReactNode, tools: ReactNode, perfil: ReactNode) => ReactNode;

function PlannerInner({
  chrome,
  listo,
  carrera,
}: {
  chrome?: PlannerChrome;
  /** PlannerApp ya resolvió qué carrera va (o que no hay ninguna). */
  listo: boolean;
  /** carrera cargada; null = todavía no eligió → se muestra el selector. */
  carrera: string | null;
}) {
  const { state, dispatch } = usePlanner();
  // con carrera cargada y plan en PLAN: el planner de verdad
  const activo = listo && carrera != null;

  // document.title = "<vista> · <sitio>". El sufijo se toma del título con el
  // que llegó la página (lo que haya después del primer " · ", o todo si no
  // hay separador), así funciona igual en el portal y en el standalone.
  // Next streamea la metadata y vuelve a escribir <title> después de montar:
  // el MutationObserver sobre <head> reaplica el nuestro cada vez que lo pisan
  // (sin bucle: solo escribe cuando difiere).
  const titleSuffix = useRef<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (titleSuffix.current == null) {
      const t = document.title;
      const i = t.indexOf(" · ");
      titleSuffix.current = i >= 0 ? t.slice(i + 3) : t;
    }
    const want = `${VIEW_TITLES[state.view]} · ${titleSuffix.current}`;
    const apply = () => {
      if (document.title !== want) document.title = want;
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [state.view]);

  // hidratar desde localStorage tras montar (SSR no tiene localStorage), y
  // encima la vista/navegación que traiga la URL (mismo effect, mismo tick:
  // HYDRATE_URL corre sobre el estado que acaba de dejar HYDRATE, así la
  // intención explícita del link pisa lo persistido en esas mismas claves
  // antes de que el effect de escritura de abajo pueda correr).
  // Espera a `activo`: hasta que PlannerApp resolvió qué carrera va (y hay
  // una), no se hidrata ni se escribe nada en nombre de ninguna.
  useEffect(() => {
    if (!activo) return;
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
    // `?view=elect` (enlace viejo): la vista es «Materias» y se baja hasta la
    // sección de electivas, que es lo que ese enlace prometía.
    if (url.view === "elect")
      requestAnimationFrame(() =>
        document.getElementById("electivas")?.scrollIntoView({ block: "start" }),
      );
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
  }, [dispatch, activo]);

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

  // La navegación vive en la barra superior del sitio (sin rail izquierdo):
  // los controles que colgaban del rail (búsqueda, filtros, minors, reset) van
  // en la cabecera de la vista que los usa (ViewTools).
  const nav = <ViewNav />;
  const tools = null;
  // perfil (con la carrera adentro): siempre en la barra, también con el
  // selector de primera visita
  const perfilMenu = <PerfilMenu />;

  // Banner de primer uso: usuario sin nada marcado y que no lo cerró. Se va
  // solo al marcar la primera materia (approved.size > 0) o con la ×.
  const showIntro =
    activo && state.hydrated && state.approved.size === 0 && !state.introDismissed;

  // Sin carrera elegida (primera visita): el selector ocupa el lugar de la
  // vista; nada del planner tiene sentido hasta entonces. Mientras PlannerApp
  // resuelve la carrera (SSR y primer render), el cuerpo queda vacío: así ni
  // se ve otra carrera ni se hidrata nada de más.
  // Sin carrera no hay vistas ni herramientas que valgan: la barra queda con
  // la marca sola y el selector es la página.
  if (!activo) {
    return (
      <div className="planner planner--topnav">
        <h1 className="sr-only">Planificador de cursada</h1>
        {chrome ? (
          chrome(null, null, listo ? perfilMenu : null)
        ) : (
          <div className="vnav-strip">{listo && perfilMenu}</div>
        )}
        <div className="shell">
          <div className="main">{listo && <CarreraPicker />}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="planner planner--topnav">
      <h1 className="sr-only">Planificador de cursada</h1>
      {chrome ? (
        chrome(nav, tools, perfilMenu)
      ) : (
        <div className="vnav-strip">
          {nav}
          {tools}
          {perfilMenu}
        </div>
      )}
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
          <Tooltip content="No volver a mostrar esta guía" width={170}>
            <button
              type="button"
              className="first-run__x"
              aria-label="Cerrar esta guía"
              onClick={() => dispatch({ type: "DISMISS_INTRO" })}
            >
              ×
            </button>
          </Tooltip>
        </div>
      )}
      <div className="shell">
        <div className="main">
          <View />
        </div>
      </div>
      <DetailDrawer />
      <FichaReader />
    </div>
  );
}

/** Elige la carrera y monta el planner con su plan. El primer render (SSR y
 *  cliente) no muestra ninguna carrera; al montar se apunta la persistencia
 *  al perfil activo, se resuelve la carrera pedida (?carrera= → preferencia
 *  guardada del perfil), se trae su plan si hace falta y se monta el árbol
 *  con `key`: PLAN/byId ya apuntan al plan nuevo y la persistencia a sus
 *  claves, así todo (estado, memos, vistas) se calcula para ese perfil y esa
 *  carrera. Sin carrera pedida, PlannerInner muestra el selector. */
export default function PlannerApp({ chrome }: { chrome?: PlannerChrome }) {
  const [carrera, setCarrera] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<string>("");
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);

  useEffect(() => {
    // perfil activo primero: de él salen la carrera guardada y las claves
    const reg = loadPerfiles();
    setPersistPerfil(reg.activo);
    setPerfil(reg.activo);
    setPerfiles(reg.perfiles);
    const pedida = carreraPedida(readParams());
    if (!pedida) {
      setListo(true);
      return;
    }
    let vivo = true;
    setCargando(pedida);
    activarCarrera(pedida)
      .then(() => {
        if (!vivo) return;
        // la URL siempre dice qué carrera se ve (recargar o compartir el link
        // la reproduce), también cuando salió de la preferencia guardada
        writeParams((p) => p.set(CARRERA_URL_KEY, pedida));
        setCarrera(pedida);
      })
      .catch((e) => console.warn("[planner] no se pudo cargar la carrera", pedida, e))
      .finally(() => {
        if (vivo) {
          setCargando(null);
          setListo(true);
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  const refrescarPerfiles = useCallback(() => {
    setPerfiles(loadPerfiles().perfiles);
  }, []);

  // Cambiar de perfil: la persistencia pasa a sus claves y la carrera es la
  // que ese perfil tenga guardada (ninguna → selector). La URL deja de decir
  // la carrera anterior. El árbol se remonta por `key` (perfil + carrera).
  const cambiarPerfil = useCallback(
    async (id: string) => {
      if (id === perfil || cargando) return;
      activarPerfil(id);
      setPerfil(id);
      setPerfiles(loadPerfiles().perfiles);
      const pref = loadCarreraPref();
      if (!pref) {
        writeParams((p) => p.delete(CARRERA_URL_KEY));
        setCarrera(null);
        return;
      }
      setCargando(pref);
      try {
        await activarCarrera(pref);
        writeParams((p) => p.set(CARRERA_URL_KEY, pref));
        setCarrera(pref);
      } catch (e) {
        console.warn("[planner] no se pudo cargar la carrera", pref, e);
        writeParams((p) => p.delete(CARRERA_URL_KEY));
        setCarrera(null);
      } finally {
        setCargando(null);
      }
    },
    [perfil, cargando],
  );

  const cambiar = useCallback(
    async (codigo: string) => {
      if (codigo === carrera || cargando) return;
      setCargando(codigo);
      try {
        await activarCarrera(codigo);
        saveCarreraPref(codigo);
        writeParams((p) => p.set(CARRERA_URL_KEY, codigo));
        setCarrera(codigo);
      } catch (e) {
        console.warn("[planner] no se pudo cargar la carrera", codigo, e);
        cancelarVuelo(); // la tarjeta vuelve a su lugar
      } finally {
        setCargando(null);
      }
    },
    [carrera, cargando],
  );

  return (
    <CarreraContext.Provider
      value={{ codigo: carrera, cargando, cambiar, perfil, perfiles, cambiarPerfil, refrescarPerfiles }}
    >
      <PlannerErrorBoundary>
        <PlannerProvider key={`${perfil}/${carrera ?? "-"}`}>
          <PlannerInner chrome={chrome} listo={listo} carrera={carrera} />
        </PlannerProvider>
      </PlannerErrorBoundary>
    </CarreraContext.Provider>
  );
}
