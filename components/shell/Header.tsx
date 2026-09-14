import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@studyvaults/ui";
import CuatrisMark from "./CuatrisMark";

/**
 * Barra superior del standalone: marca, navegación entre vistas del planner
 * (`nav`, la entrega PlannerApp vía su prop `chrome`), herramientas (`tools`:
 * referencias y progreso) y toggle de tema. Reusa el chrome `.nav` del sistema
 * de diseño sin el menú del portal ni el buscador global. Sin `nav`/`tools`
 * (404, error) queda solo la marca y el tema.
 */
export default function Header({
  nav,
  tools,
}: {
  nav?: ReactNode;
  tools?: ReactNode;
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
        <ThemeToggle variant="desktop" />
      </div>
    </header>
  );
}
