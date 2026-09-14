import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@studyvaults/ui";
import CuatrisMark from "./CuatrisMark";

/**
 * Barra superior del standalone: marca, navegación entre vistas del planner
 * (`nav`, la entrega PlannerApp vía su prop `chrome`), herramientas (`tools`:
 * hoy vacías), toggle de tema y, en la esquina derecha, el menú de perfil
 * (`perfil`: carrera, perfiles y referencias). Reusa el chrome `.nav` del
 * sistema de diseño sin el menú del portal ni el buscador global. Sin
 * `nav`/`perfil` (portada, 404, error) quedan la marca y el tema.
 */
export default function Header({
  nav,
  tools,
  perfil,
}: {
  nav?: ReactNode;
  tools?: ReactNode;
  perfil?: ReactNode;
}) {
  return (
    <header
      className={
        "nav cuatris-nav" +
        (nav ? " cuatris-nav--views" : "") +
        // barra de la app (con perfil): a todo el ancho, alineada con el
        // contenido fluido del planner; la portada conserva la fila centrada
        (perfil ? " cuatris-nav--app" : "")
      }
      role="banner"
    >
      <div className="nav__inner">
        <Link className="brand" href="/" prefetch={false}>
          <CuatrisMark />
          <span className="brand__name">Cuatris</span>
        </Link>
        {nav}
        <span className="nav__spacer" />
        {tools}
        <ThemeToggle variant="desktop" />
        {perfil}
      </div>
    </header>
  );
}
