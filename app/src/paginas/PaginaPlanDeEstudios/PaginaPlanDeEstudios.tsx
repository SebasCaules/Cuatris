/**
 * Pestaña «Plan»: el plan de estudios completo (R1).
 *
 * Años 1 a 5 con sus dos cuatrimestres, y al final las electivas. Lo que ya se
 * aprobó se marca acá mismo, materia por materia o un año entero de un saque:
 * es la pantalla que reemplaza al paso «Marcar materias a mano» del primer
 * ingreso, que era una lista aparte que no se parecía al plan de nadie.
 *
 * La página no calcula reglas de dominio: `armado.ts` ordena el plan y el motor
 * cuenta los créditos de electivas. Acá solo se traduce entre la marca de la
 * interfaz y lo que guarda `historia`.
 *
 * Los textos son los del mockup, en voseo.
 */

import { useMemo, useState } from "react";

import { TarjetaAnio } from "../../componentes/TarjetaAnio";
import { TarjetaElectivas } from "../../componentes/TarjetaElectivas";
import {
  ESTADO_GUARDADO,
  marcaDeHistoria,
  type EstadoMarca,
} from "../../componentes/MarcaMateria";
import {
  PantallaCargando,
  PantallaError,
} from "../../componentes/PantallaEstado";
import { Nota } from "../../componentes/primitivas";
import type { Abreviaciones, Codigo, Plan, Sigla } from "../../contrato/tipos";
import { hoyIso, useDatos } from "../../datos/useDatos";
import { usePlanUsuario } from "../../estado/contexto";
import { electivas as progresoElectivas } from "../../motor";
import {
  aniosDelPlan,
  electivasDelPlan,
  filtrarElectivas,
} from "./armado";
import "./PaginaPlanDeEstudios.css";

export interface PropsPlanDeEstudios {
  plan: Plan;
  abreviaciones: Abreviaciones;
}

export function PlanDeEstudiosConDatos({
  plan,
  abreviaciones,
}: PropsPlanDeEstudios) {
  const { plan: planUsuario, despachar } = usePlanUsuario();
  const [busqueda, setBusqueda] = useState("");

  const historia = planUsuario.historia;

  const { anios, sinCuatrimestre } = useMemo(
    () => aniosDelPlan(plan, historia),
    [plan, historia],
  );
  const electivasVisibles = useMemo(
    () => electivasDelPlan(plan, historia),
    [plan, historia],
  );
  const electivasFiltradas = useMemo(
    () => filtrarElectivas(electivasVisibles, busqueda, abreviaciones),
    [electivasVisibles, busqueda, abreviaciones],
  );

  const nombreDeMinor = useMemo(() => {
    const nombres = new Map(
      plan.minors.map((minor) => [minor.sigla, minor.nombre]),
    );
    return (sigla: Sigla) => nombres.get(sigla) ?? sigla;
  }, [plan]);

  const creditosDeElectivas = progresoElectivas(planUsuario, plan).aprobados;

  const estadoDe = (codigo: Codigo): EstadoMarca =>
    marcaDeHistoria(historia[codigo]?.estado);

  const cambiar = (codigo: Codigo, siguiente: EstadoMarca) => {
    despachar({
      tipo: "marcarEstado",
      codigo,
      estado: ESTADO_GUARDADO[siguiente],
    });
  };

  const cambiarVarias = (codigos: Codigo[], siguiente: EstadoMarca) => {
    despachar({
      tipo: "marcarVarias",
      codigos,
      estado: ESTADO_GUARDADO[siguiente],
    });
  };

  const tarjetas = sinCuatrimestre === null ? anios : [...anios, sinCuatrimestre];
  const sinNadaMarcado = Object.keys(historia).length === 0;

  return (
    <div className="plan-estudios">
      {/*
        Sin nada marcado el plan se ve igual: no hay una pantalla de bienvenida
        que lo tape (R1). Lo único que se agrega es la nota que dice qué hacer y
        que existe el atajo de pegar la historia académica.
      */}
      {sinNadaMarcado ? (
        <div className="plan-estudios__aviso">
          <Nota variante="caja">
            Marcá lo que ya aprobaste. Si tenés la historia académica del SGA,
            podés pegarla.{" "}
            <a className="plan-estudios__aviso-enlace" href="#/inicio">
              Pegar historia
            </a>
          </Nota>
        </div>
      ) : null}

      {tarjetas.map((anio) => (
        <TarjetaAnio
          key={anio.titulo}
          titulo={anio.titulo}
          ciclo={anio.ciclo}
          columnas={anio.columnas}
          estadoDe={estadoDe}
          alCambiar={cambiar}
          alMarcarVarias={cambiarVarias}
          nombreDeMinor={nombreDeMinor}
        />
      ))}

      <TarjetaElectivas
        materias={electivasFiltradas}
        creditosAprobados={creditosDeElectivas}
        creditosRequeridos={plan.electivas.creditos_requeridos}
        abreviaciones={abreviaciones}
        estadoDe={estadoDe}
        alCambiar={cambiar}
        nombreDeMinor={nombreDeMinor}
        busqueda={busqueda}
        alBuscar={setBusqueda}
      />
    </div>
  );
}

/** El plan de estudios cargando sus propios datos, para montarlo como ruta suelta. */
export function PaginaPlanDeEstudios() {
  const { plan: planUsuario } = usePlanUsuario();
  const [hoy] = useState(() => hoyIso());
  const datos = useDatos(planUsuario.plan, hoy);

  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }
  return (
    <PlanDeEstudiosConDatos
      plan={datos.datos.plan}
      abreviaciones={datos.datos.abreviaciones}
    />
  );
}
