import Link from "next/link";
import { ThemeToggle } from "@studyvaults/ui";
import CuatrisMark from "./CuatrisMark";
import { STUDYVAULTS_URL } from "@/lib/site";

/**
 * Barra superior del standalone: marca, origen del dato y toggle de tema.
 * Reusa el chrome `.nav` del sistema de diseño sin el menú del portal
 * (no hay más rutas que el planificador) ni el buscador global.
 */
export default function Header() {
  return (
    <header className="nav cuatris-nav" role="banner">
      <div className="nav__inner">
        <Link className="brand" href="/" prefetch={false}>
          <CuatrisMark />
          <span className="brand__name">Cuatris</span>
        </Link>
        <span className="nav__spacer" />
        <span className="nav__meta">
          Ing. en Informática · <b>ITBA</b> · plan S10-Rev23
        </span>
        <a
          className="nav__link"
          href={STUDYVAULTS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          StudyVaults
        </a>
        <ThemeToggle variant="desktop" />
      </div>
    </header>
  );
}
