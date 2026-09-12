/**
 * Pantallas simples de carga y de error de datos.
 *
 * El mockup no cubre estos estados (README de 04-diseno: «lo que el mockup no
 * cubre»), así que se resuelven con lo mínimo y con los tokens: una tarjeta
 * centrada, sin ilustración y sin color nuevo.
 */

import { useState } from "react";

import {
  ContratoIncompatible,
  DatosNoDisponibles,
  NoEstaEnElIndice,
} from "../datos/cargar";
import { hoyIso } from "../datos/useDatos";
import type { PlanUsuarioCorrupto } from "../estado/planUsuario";
import {
  descargarTexto,
  nombreDeArchivoIlegible,
} from "./MenuPlan/acciones";
import { Boton } from "./primitivas";
import "./PantallaEstado.css";

export function PantallaCargando() {
  return (
    <div className="pantalla-estado" role="status" aria-live="polite">
      <div className="pantalla-estado__tarjeta">
        <p className="pantalla-estado__titulo">Cargando los datos…</p>
        <p className="pantalla-estado__detalle">
          El plan y los horarios se leen del repositorio. Todo queda en este
          navegador. No hay cuenta ni servidor.
        </p>
      </div>
    </div>
  );
}

export interface PropsPantallaError {
  error: unknown;
}

interface TextoError {
  titulo: string;
  detalle: string;
  tecnico: string;
}

function describir(error: unknown): TextoError {
  if (error instanceof ContratoIncompatible) {
    return {
      titulo: "Los datos son más nuevos que la aplicación",
      detalle:
        "El archivo publicado usa una versión del contrato que esta página " +
        "todavía no sabe leer. Recargá en un rato: el sitio se actualiza " +
        "solo cuando se publica una versión nueva.",
      tecnico: `${error.archivo} declara contrato ${error.contrato}`,
    };
  }
  if (error instanceof DatosNoDisponibles) {
    return {
      titulo: "No se pudieron cargar los datos",
      detalle:
        "Puede ser la conexión o un archivo que todavía no está publicado. " +
        "Tu plan sigue guardado en este navegador.",
      tecnico: error.message,
    };
  }
  if (error instanceof NoEstaEnElIndice) {
    return {
      titulo: "Faltan datos en el índice",
      detalle:
        "El índice publicado no lista lo que esta pantalla necesita. Tu plan " +
        "sigue guardado en este navegador.",
      tecnico: error.message,
    };
  }
  return {
    titulo: "Algo salió mal",
    detalle: "Tu plan sigue guardado en este navegador.",
    tecnico: error instanceof Error ? error.message : String(error),
  };
}

export function PantallaError({ error }: PropsPantallaError) {
  const texto = describir(error);
  return (
    <div className="pantalla-estado" role="alert">
      <div className="pantalla-estado__tarjeta">
        <p className="pantalla-estado__titulo">{texto.titulo}</p>
        <p className="pantalla-estado__detalle">{texto.detalle}</p>
        <p className="pantalla-estado__tecnico">{texto.tecnico}</p>
      </div>
    </div>
  );
}

export interface PropsPantallaPlanCorrupto {
  /** Por qué no se pudo leer lo guardado. */
  error: PlanUsuarioCorrupto;
  /** El contenido textual que sigue en disco, tal cual. */
  crudo: string | null;
  /** Acepta perder lo guardado y sigue con un plan vacío. */
  alEmpezarDeCero: () => void;
  /** Solo para los tests: fecha del nombre del archivo descargado. */
  fecha?: string;
}

/**
 * El plan guardado en este navegador no se puede leer (13 · estado no cubierto
 * por el mockup).
 *
 * Es la cara visible de la regla dura del §6 del contrato: el archivo original
 * no se toca y la interfaz **ofrece exportarlo antes** de empezar de cero. Por
 * eso la pantalla corta el paso —sin ella el usuario trabajaría toda la sesión
 * sobre un plan que nunca se persiste— y «Empezar de cero» recién se habilita
 * después de descargar la copia.
 */
export function PantallaPlanCorrupto({
  error,
  crudo,
  alEmpezarDeCero,
  fecha,
}: PropsPantallaPlanCorrupto) {
  const [descargado, setDescargado] = useState(false);
  const hayCopia = crudo !== null && crudo !== "";

  return (
    <div className="pantalla-estado" role="alert">
      <div className="pantalla-estado__tarjeta">
        <p className="pantalla-estado__titulo">
          No pude leer el plan guardado en este navegador
        </p>
        <p className="pantalla-estado__detalle">
          {hayCopia
            ? "No lo toqué: sigue guardado tal como estaba. Descargalo antes " +
              "de seguir, así no perdés nada y lo podés volver a importar " +
              "cuando esté arreglado."
            : "No quedó ninguna copia que descargar, así que podés empezar " +
              "de cero sin perder nada."}
        </p>
        <p className="pantalla-estado__tecnico">{error.message}</p>
        <div className="pantalla-estado__acciones">
          {hayCopia ? (
            <Boton
              variante="primario"
              onClick={() => {
                descargarTexto(
                  nombreDeArchivoIlegible(fecha ?? hoyIso()),
                  crudo,
                );
                setDescargado(true);
              }}
            >
              Descargar el plan guardado
            </Boton>
          ) : null}
          <Boton
            variante="secundario"
            disabled={hayCopia && !descargado}
            {...(hayCopia && !descargado
              ? { title: "Descargá la copia antes de perder lo guardado" }
              : {})}
            onClick={alEmpezarDeCero}
          >
            Empezar de cero
          </Boton>
        </div>
      </div>
    </div>
  );
}
