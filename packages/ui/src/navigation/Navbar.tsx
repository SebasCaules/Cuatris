"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { Icon } from "../primitives/Icon";
import Brand from "./Brand";
import NavLink from "./NavLink";
import ThemeToggle from "./ThemeToggle";

/** Un enlace de navegación (interno o externo). */
export interface NavbarLink {
  label: string;
  href: string;
  external?: boolean;
  /**
   * Prefijos de ruta que también marcan este ítem como activo, más allá del
   * `href`. P. ej. "Materias" (href `/#materias`) queda activo en cualquier
   * `/[vault]/…`. Sin esto, un link-ancla solo se enciende en la home.
   */
  matchPrefixes?: string[];
}

/**
 * Navbar — la barra fija `.nav` del sistema, genérica y configurable.
 * Preserva todo el comportamiento del original: barra fija, menú mobile
 * con burger (cierra al navegar o con Escape), scroll-spy para anclas
 * in-page (`"/#x"`, activas sólo mientras su sección cruza el viewport),
 * botón de búsqueda que dispara un evento global y `ThemeToggle`.
 *
 * @example
 *   <Navbar
 *     links={[
 *       { label: "Inicio", href: "/" },
 *       { label: "Materias", href: "/#materias" },
 *     ]}
 *     meta={<>SYS.00 // <b>ITBA</b></>}
 *     cta={{ label: "GitHub", href: REPO_URL, external: true }}
 *   />
 */
export interface NavbarProps {
  links: NavbarLink[];
  /** Lockup de marca. Por defecto `<Brand/>`. */
  brand?: ReactNode;
  /** Bloque `.nav__meta` (a la derecha, antes del CTA). */
  meta?: ReactNode;
  /** Botón `.btn .nav__cta`. */
  cta?: { label: ReactNode; href: string; external?: boolean };
  /** Evento que dispara el botón de búsqueda. Por defecto `"sv:search-open"`. */
  searchEventName?: string;
  /** Muestra el `ThemeToggle`. Por defecto `true`. */
  showThemeToggle?: boolean;
}

export function Navbar({
  links,
  brand = <Brand />,
  meta,
  cta,
  searchEventName = "sv:search-open",
  showThemeToggle = true,
}: NavbarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Sección in-page actualmente a la vista (solo aplica en la home, p. ej. "materias").
  const [section, setSection] = useState("");
  const burgerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Cerrar el menú al cambiar de ruta o con Escape. El mismo listener de
  // teclado atrapa Tab dentro de #mobileMenu mientras está abierto (drawer
  // mobile), igual que WikiRail.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !open) return;
      const menu = mobileMenuRef.current;
      if (!menu) return;
      const focusables = menu.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Foco: al abrir, salta al primer link del drawer; al cerrar (si estaba
  // abierto), lo devuelve al botón burger. `wasOpen` evita robar el foco en
  // el montaje inicial (donde `open` arranca en false).
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const first = mobileMenuRef.current?.querySelector<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      first?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      burgerRef.current?.focus();
    }
  }, [open]);

  // Mobile (<900px): bloquear el scroll del body mientras el drawer está
  // abierto. Gateado por matchMedia — en desktop el burger nunca se abre,
  // así que esto no debería dispararse, pero se replica el guard de
  // WikiRail por las dudas (p. ej. un resize con el menú abierto).
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 900px)");
    if (!mq.matches) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Anclas in-page declaradas en los links (p. ej. "/#materias").
  const anchors = links
    .map((l) => {
      const [base, anchor] = l.href.split("#");
      return anchor && (base === "/" || base === "") ? anchor : null;
    })
    .filter((a): a is string => Boolean(a));
  const anchorKey = anchors.join(",");

  // Scroll-spy: solo la home tiene anclas in-page. El indicador sigue a la
  // sección que cruza el centro del viewport, en lugar de quedar fijo.
  useEffect(() => {
    if (pathname !== "/" || anchors.length === 0) {
      setSection("");
      return;
    }
    const els = anchors
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            setSection(id);
          } else {
            setSection((prev) => (prev === id ? "" : prev));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, anchorKey]);

  const isActive = ({ href, matchPrefixes }: NavbarLink) => {
    // Rutas fuera del `href` que igual encienden el ítem (p. ej. "Materias"
    // en cualquier /[vault]/…). Precede al chequeo de ancla para que el link
    // de sección quede activo en toda la wiki, no solo en la home.
    if (matchPrefixes?.some((p) => pathname.startsWith(p))) return true;
    const [base, anchor] = href.split("#");
    // Anclas in-page (p. ej. "/#materias"): activas solo mientras su sección
    // está a la vista en la home — nunca de forma permanente.
    if (anchor) return pathname === (base || "/") && section === anchor;
    // "Inicio" cede el estado activo cuando hay una sección in-page a la vista.
    if (base === "/") return pathname === "/" && section === "";
    return pathname.startsWith(base);
  };

  const fireSearch = () => window.dispatchEvent(new Event(searchEventName));

  return (
    <header className="nav" role="banner">
      <div className="nav__inner">
        {brand}

        <nav className="nav__links" aria-label="Principal">
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              external={l.external}
              active={!l.external && isActive(l)}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <span className="nav__spacer" />
        {meta != null && <span className="nav__meta">{meta}</span>}
        {cta &&
          (cta.external ? (
            <a
              className="btn btn--primary nav__cta"
              href={cta.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {cta.label}
            </a>
          ) : (
            <Link
              className="btn btn--primary nav__cta"
              href={cta.href}
              prefetch={false}
            >
              {cta.label}
            </Link>
          ))}

        <button
          type="button"
          className="theme-toggle theme-toggle--desktop"
          aria-label="Buscar (⌘K)"
          title="Buscar (⌘K)"
          onClick={fireSearch}
        >
          <Icon name="search" />
        </button>

        {showThemeToggle && <ThemeToggle variant="desktop" />}

        <button
          ref={burgerRef}
          className="nav__burger"
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="mobileMenu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <Icon name="close" /> : <Icon name="menu" />}
        </button>
      </div>

      {open && (
        <div
          className="nav__scrim"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={cn("nav__mobile", open && "is-open")}
        id="mobileMenu"
        ref={mobileMenuRef}
      >
        {links.map((l) => (
          <NavLink
            key={l.href}
            href={l.href}
            external={l.external}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </NavLink>
        ))}
        <button
          type="button"
          className="nav__link"
          style={{ textAlign: "left", background: "none", border: "none" }}
          onClick={() => {
            setOpen(false);
            fireSearch();
          }}
        >
          Buscar
        </button>
        {showThemeToggle && <ThemeToggle variant="mobile" />}
        {cta &&
          (cta.external ? (
            <a
              className="btn btn--primary"
              href={cta.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {cta.label}
            </a>
          ) : (
            <Link className="btn btn--primary" href={cta.href}>
              {cta.label}
            </Link>
          ))}
      </div>
    </header>
  );
}

export default Navbar;
