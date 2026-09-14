// Colores para el perfil (icono de la barra y cabecera del menú). Van como
// datos, no como CSS: el planner no agrega hex a sus hojas. Pasteles
// distintos entre sí y de la paleta de materias; sin color, el acento del sitio.
export interface PerfilColor {
  hex: string;
  nombre: string;
}

export const PERFIL_COLORES: PerfilColor[] = [
  { hex: "#f47c59", nombre: "Coral" },
  { hex: "#7fb0e0", nombre: "Azul" },
  { hex: "#6fc7bd", nombre: "Verde agua" },
  { hex: "#8fd08f", nombre: "Verde" },
  { hex: "#e9c46a", nombre: "Ámbar" },
  { hex: "#b8a5e8", nombre: "Violeta" },
  { hex: "#f09ab8", nombre: "Rosa" },
  { hex: "#9aa7c9", nombre: "Gris azulado" },
];
