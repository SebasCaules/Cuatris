/**
 * Primitivas de interfaz: lo que todas las pantallas comparten.
 *
 * Ninguna sabe nada del dominio —no importan tipos del contrato ni del motor—
 * y ninguna trae estilos en línea: todo sale de `tokens.css`.
 */

export { BarraProgreso } from "./BarraProgreso";
export type { PropsBarraProgreso } from "./BarraProgreso";

export { Boton } from "./Boton";
export type { PropsBoton, TamanoBoton, VarianteBoton } from "./Boton";

export { Campo } from "./Campo";
export type { PropsCampo, TipoCampo } from "./Campo";

export { Chip } from "./Chip";
export type { PropsChip, VarianteChip } from "./Chip";

export { Etiqueta } from "./Etiqueta";
export type { PropsEtiqueta, VarianteEtiqueta } from "./Etiqueta";

export { Glifo, NOMBRES_GLIFO } from "./Glifo";
export type { NombreGlifo, PropsGlifo } from "./Glifo";

export { Modal } from "./Modal";
export type { PropsModal } from "./Modal";

export { Nota } from "./Nota";
export type { PropsNota, VarianteNota } from "./Nota";

export { PanelLateral } from "./PanelLateral";
export type { PropsPanelLateral } from "./PanelLateral";

export { useEscapeDeCapa, useFocoAtrapado } from "./foco";
export type { OpcionesEscape, OpcionesFoco } from "./foco";
