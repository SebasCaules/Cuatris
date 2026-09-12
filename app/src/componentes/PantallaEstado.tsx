/**
 * Pantallas simples de carga y de error de datos.
 *
 * El mockup no cubre estos estados (README de 04-diseno: «lo que el mockup no
 * cubre»), así que se resuelven con lo mínimo y con los tokens: una tarjeta
 * centrada, sin ilustración y sin color nuevo.
 */

import {
  ContratoIncompatible,
  DatosNoDisponibles,
  NoEstaEnElIndice,
} from "../datos/cargar";
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
