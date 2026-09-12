/**
 * Contexto de React para el `PlanUsuario`: `useReducer` + persistencia.
 *
 * Sin librería de estado: un reductor puro y un contexto alcanzan para un solo
 * documento.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";

import type { PlanUsuario } from "../contrato/tipos";
import {
  guardarConRetardo,
  leer,
  RETARDO_GUARDADO_MS,
  type LecturaAlmacenada,
} from "./almacenamiento";
import {
  planUsuarioInicial,
  reducir,
  type AccionPlan,
  type PlanUsuarioCorrupto,
} from "./planUsuario";

export interface ContextoPlanUsuario {
  plan: PlanUsuario;
  despachar: Dispatch<AccionPlan>;
  /** No nulo si había un plan guardado ilegible; el original sigue en disco. */
  errorGuardado: PlanUsuarioCorrupto | null;
  /** Copia textual de lo que había en disco, para poder exportarlo. */
  crudoGuardado: string | null;
  /**
   * Acepta perder el plan corrupto y vuelve a habilitar el guardado.
   *
   * Hasta que se llama, el original se queda intacto en disco y nada de lo que
   * el usuario haga se persiste: es la regla dura del §6 del contrato («nunca
   * se descarta un plan guardado sin exportarlo antes»). La interfaz solo la
   * llama después de ofrecer la descarga.
   */
  descartarGuardado: () => void;
}

const Contexto = createContext<ContextoPlanUsuario | null>(null);

function estadoInicial(lectura: LecturaAlmacenada): PlanUsuario {
  return lectura.estado === "listo" ? lectura.plan : planUsuarioInicial();
}

export interface PropsProveedor {
  children: ReactNode;
  /** Solo para los tests: evita tocar `localStorage`. */
  lecturaInicial?: LecturaAlmacenada;
  /** Solo para los tests: acorta o alarga el debounce. */
  retardoGuardadoMs?: number;
}

export function ProveedorPlanUsuario({
  children,
  lecturaInicial,
  retardoGuardadoMs = RETARDO_GUARDADO_MS,
}: PropsProveedor) {
  const [lectura] = useState<LecturaAlmacenada>(
    () => lecturaInicial ?? leer(),
  );
  const [plan, despachar] = useReducer(reducir, lectura, estadoInicial);
  const [descartado, setDescartado] = useState(false);

  // Si lo guardado está corrupto no se escribe nada: el original se queda en
  // disco hasta que el usuario lo exporte o acepte perderlo.
  const corrupto = lectura.estado === "corrupto" && !descartado;
  const puedeGuardar = !corrupto;

  useEffect(() => {
    if (!puedeGuardar) {
      return;
    }
    return guardarConRetardo(plan, retardoGuardadoMs);
  }, [plan, retardoGuardadoMs, puedeGuardar]);

  const descartarGuardado = useCallback(() => {
    setDescartado(true);
  }, []);

  const valor = useMemo<ContextoPlanUsuario>(
    () => ({
      plan,
      despachar,
      errorGuardado:
        corrupto && lectura.estado === "corrupto" ? lectura.error : null,
      crudoGuardado:
        corrupto && lectura.estado === "corrupto" ? lectura.crudo : null,
      descartarGuardado,
    }),
    [plan, lectura, corrupto, descartarGuardado],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePlanUsuario(): ContextoPlanUsuario {
  const valor = useContext(Contexto);
  if (valor === null) {
    throw new Error(
      "usePlanUsuario se usó fuera de <ProveedorPlanUsuario>.",
    );
  }
  return valor;
}
