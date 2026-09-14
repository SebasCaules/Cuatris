import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@studyvaults/ui";
import CuatrisMark from "./CuatrisMark";

/**
 * Barra superior del standalone: marca, navegación entre vistas del planner
 * (`nav`, la entrega PlannerApp vía su prop `chrome`), herramientas (`tools`:
 * carrera) y, en la esquina derecha, el menú de perfiles (`perfil`, que lleva
 * adentro el tema y las referencias) o —sin él (portada, 404, error)— el
 * toggle de tema. Reusa el chrome `.nav` del sistema de diseño sin el menú
 * del portal ni el buscador global.
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
    <header className={"nav cuatris-nav" + (nav ? " cuatris-nav--views" : "")} role="banner">
      <div className="nav__inner">
        <Link className="brand" href="/" prefetch={false}>
          <CuatrisMark />
          <span className="brand__name">Cuatris</span>
        </Link>
        {nav}
        <span className="nav__spacer" />
        {tools}
        {/* con el menú de perfiles, el tema se cambia desde ahí */}
        {perfil ?? <ThemeToggle variant="desktop" />}
      </div>
    </header>
  );
}
