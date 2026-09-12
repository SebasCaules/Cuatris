/**
 * Cascarón de la SPA: barra, zona principal y panel derecho de la pantalla 13b,
 * con marcadores de posición donde todavía no hay componente real.
 */

import { useMemo } from "react";

import { BarraSuperior } from "./componentes/BarraSuperior";
import { Disposicion } from "./componentes/Disposicion";
import { Marcador } from "./componentes/Marcador";
import { PantallaCargando, PantallaError } from "./componentes/PantallaEstado";
import { Muestrario } from "./paginas/Muestrario";
import type { Plan } from "./contrato/tipos";
import type { PeriodoElegido } from "./datos/cargar";
import { hoyIso, useDatos } from "./datos/useDatos";
import { usePlanUsuario } from "./estado/contexto";
import { useRuta, type Ruta } from "./rutas";
import "./App.css";

function nombreDeCuatrimestre(periodo: string): string {
  const [anio, cuatrimestre] = periodo.split("-");
  const ordinal = cuatrimestre === "1C" ? "1.º" : "2.º";
  return `${ordinal} cuatrimestre ${anio ?? ""}`.trim();
}

function LeyendaPeriodo({ periodo }: { periodo: PeriodoElegido | null }) {
  if (periodo === null) {
    return (
      <p className="app__leyenda">
        El índice no publica ningún período activo ni futuro.
      </p>
    );
  }
  const cuando =
    periodo.estado === "activo"
      ? "período en curso"
      : "vista previa: todavía no empezó";
  return (
    <p className="app__leyenda">
      {nombreDeCuatrimestre(periodo.entrada.periodo)}{" "}
      <span className="marcador__dato">
        ({periodo.entrada.periodo} · {cuando} · publicado{" "}
        {periodo.entrada.publicado})
      </span>
    </p>
  );
}

function ZonaPrincipal({
  ruta,
  plan,
  periodo,
}: {
  ruta: Ruta;
  plan: Plan;
  periodo: PeriodoElegido | null;
}) {
  if (ruta.vista === "progreso") {
    return (
      <Marcador titulo="Progreso" pantalla="13i">
        <p>
          Pestaña aparte porque es lectura, no edición. Los tres títulos
          escalonados con su estado real, las electivas contra los 27 créditos y
          las cuatro orientaciones como opcionales.
        </p>
      </Marcador>
    );
  }

  if (ruta.vista === "materia") {
    const materia = plan.materias.find(
      (candidata) => candidata.codigo === ruta.codigo,
    );
    return (
      <Marcador
        titulo={
          materia === undefined
            ? `Materia ${ruta.codigo}`
            : `${materia.codigo} ${materia.nombre}`
        }
        pantalla="13e"
      >
        <p>
          Panel de detalle: correlativas que la habilitan y materias que
          habilita, horario de la comisión elegida, docentes y cupo. Las tres
          acciones que importan al pie.
        </p>
        {materia === undefined ? (
          <p className="marcador__dato">
            {ruta.codigo} no está en el plan cargado.
          </p>
        ) : null}
      </Marcador>
    );
  }

  return (
    <>
      <Marcador titulo="Carrusel de cuatrimestres" pantalla="13b">
        <p>
          La pantalla de trabajo. Dos cuatrimestres enteros con su calendario y
          el tercero asomando, que es lo que avisa que hay más. Flechas, chips de
          cuatrimestre y barra de posición; el progreso fijo a la derecha. El
          cuatrimestre sin horarios usa la misma tarjeta y el mismo alto, con su
          lista adentro.
        </p>
        <LeyendaPeriodo periodo={periodo} />
      </Marcador>
      <Marcador titulo="Agregar materia" pantalla="13c">
        <p>
          El panel entra a la derecha y el carrusel se angosta a una tarjeta:
          mientras buscás sigue viéndose dónde va a caer la materia. Las
          bloqueadas aparecen en los resultados con el motivo.
        </p>
      </Marcador>
    </>
  );
}

function PanelProgreso({ plan }: { plan: Plan }) {
  return (
    <Marcador titulo="Progreso" pantalla="13b">
      <ul className="marcador__lista">
        {plan.titulos.map((titulo) => (
          <li key={titulo.id}>
            {titulo.nombre}{" "}
            <span className="marcador__dato">{titulo.creditos} cr</span>
          </li>
        ))}
        <li>
          Electivas{" "}
          <span className="marcador__dato">
            {plan.electivas.creditos_requeridos} cr
          </span>
        </li>
        {plan.minors.map((minor) => (
          <li key={minor.sigla}>
            {minor.nombre}{" "}
            <span className="marcador__dato">
              {minor.sigla} · {minor.creditos_minimos} cr
            </span>
          </li>
        ))}
      </ul>
      <p>
        Los créditos alcanzados, las electivas acumuladas y el estimado de
        cuatrimestres los calcula el motor de dominio, que llega en la ola
        siguiente.
      </p>
    </Marcador>
  );
}

export function App() {
  const { plan: planUsuario } = usePlanUsuario();
  const { ruta, ir } = useRuta();
  const hoy = useMemo(() => hoyIso(), []);
  const datos = useDatos(planUsuario.plan, hoy);

  if (ruta.vista === "muestrario") {
    return <Muestrario />;
  }
  if (datos.fase === "cargando") {
    return <PantallaCargando />;
  }
  if (datos.fase === "error") {
    return <PantallaError error={datos.error} />;
  }

  return (
    <Disposicion
      barra={
        <BarraSuperior
          carrera={datos.datos.plan.carrera}
          plan={datos.datos.plan.plan}
          ruta={ruta}
          ir={ir}
        />
      }
      principal={
        <ZonaPrincipal
          ruta={ruta}
          plan={datos.datos.plan}
          periodo={datos.datos.periodo}
        />
      }
      panel={<PanelProgreso plan={datos.datos.plan} />}
    />
  );
}
