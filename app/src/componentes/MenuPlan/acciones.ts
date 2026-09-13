/**
 * Las tres operaciones de copia de seguridad del plan, sin React.
 *
 * Están acá y no dentro del componente para poder probarlas solas: son las que
 * tocan el navegador (descarga, lectura de archivo, `localStorage`) y las que
 * tienen que seguir funcionando dentro de muchos años.
 *
 * Nada de esto sale del navegador: no hay cuenta ni servidor (13a).
 */

import type { Fecha, PlanUsuario } from "../../contrato/tipos";
import { CLAVE_ALMACENAMIENTO } from "../../estado/almacenamiento";
import { exportar } from "../../estado/planUsuario";

/** Tipo MIME del archivo exportado; también el `accept` del selector. */
export const TIPO_JSON = "application/json";

/**
 * Nombre del archivo descargado: `cuatris-plan-2026-09-12.json`.
 *
 * La fecha va en `YYYY-MM-DD` como todas las del contrato, así los archivos de
 * una misma carpeta quedan ordenados por nombre.
 */
export function nombreDeArchivo(fecha: Fecha): string {
  return `cuatris-plan-${fecha}.json`;
}

/**
 * Nombre del archivo con el plan guardado que no se pudo leer.
 *
 * Va aparte del exportado sano para que, si el usuario guarda los dos en la
 * misma carpeta, se vea cuál es cuál: el ilegible es el que hay que mandar a
 * arreglar, no el que se vuelve a importar.
 */
export function nombreDeArchivoIlegible(fecha: Fecha): string {
  return `cuatris-plan-ilegible-${fecha}.json`;
}

/**
 * Dispara la descarga de un texto como archivo.
 *
 * Se arma un enlace que no se llega a ver: no hay servidor que sirva el
 * archivo, así que el contenido viaja como `Blob` y la URL se revoca enseguida
 * para no dejar el objeto vivo en memoria.
 */
export function descargarTexto(
  nombre: string,
  contenido: string,
  tipo: string = TIPO_JSON,
): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

/** Descarga el plan del usuario como JSON canónico. */
export function descargarPlan(plan: PlanUsuario, fecha: Fecha): void {
  descargarTexto(nombreDeArchivo(fecha), exportar(plan));
}

/**
 * Abre el selector de archivo del sistema y resuelve con lo que se eligió.
 *
 * El `<input type="file">` se crea al abrirlo y se destruye apenas el usuario
 * elige o cancela. Es el único control nativo que el navegador no deja
 * reemplazar —no hay forma de abrir el selector sin uno—, pero así no queda en
 * el documento: la regla del autor (R2) es que en la pantalla no haya ni un
 * control nativo, y un `<input>` recortado seguía estando.
 *
 * Se agrega al documento porque Safari no dispara `change` sobre un elemento
 * suelto. `cancel` es lo que avisa que el usuario cerró el selector sin elegir;
 * donde no exista, el elemento se va igual con el `change` de la próxima vez.
 */
export function elegirArchivo(
  accept: string = `${TIPO_JSON},.json`,
): Promise<File | null> {
  return new Promise((resolver) => {
    const campo = document.createElement("input");
    campo.type = "file";
    campo.accept = accept;
    campo.className = "menu-plan__archivo";
    campo.tabIndex = -1;
    campo.setAttribute("aria-label", "Archivo de plan exportado");

    const cerrar = (elegido: File | null) => {
      campo.remove();
      resolver(elegido);
    };

    campo.addEventListener(
      "change",
      () => {
        cerrar(campo.files?.[0] ?? null);
      },
      { once: true },
    );
    campo.addEventListener(
      "cancel",
      () => {
        cerrar(null);
      },
      { once: true },
    );

    document.body.appendChild(campo);
    campo.click();
  });
}

/**
 * Lee un archivo elegido en el selector.
 *
 * `FileReader` y no `File.text()` a propósito: es lo que soportan todos los
 * navegadores en los que esta página tiene que seguir abriendo.
 */
export function leerArchivo(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      resolver(typeof lector.result === "string" ? lector.result : "");
    };
    lector.onerror = () => {
      rechazar(
        new Error(
          `No pude leer ${archivo.name}: el navegador cortó la lectura.`,
        ),
      );
    };
    lector.readAsText(archivo);
  });
}

/** Mensaje que se le muestra al usuario ante una falla de importación. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Borra el plan guardado en este navegador.
 *
 * Solo toca el disco: quien llama tiene que reemplazar además el documento en
 * memoria, porque el proveedor lo vuelve a guardar apenas cambia.
 */
export function borrarGuardado(): void {
  try {
    window.localStorage.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    // Almacenamiento bloqueado: no había nada guardado que borrar.
  }
}
