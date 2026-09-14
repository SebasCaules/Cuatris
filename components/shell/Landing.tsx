import Link from "next/link";
import { Button, Eyebrow, Icon, NavLink } from "@studyvaults/ui";
import Header from "./Header";
import LegacyRedirect from "./LegacyRedirect";
import data from "@/lib/planner/data.json";
import { CARRERAS } from "@/lib/planner/carreras/index";
import "./landing.css";

/**
 * Portada de Cuatris: presenta el planificador en tres pasos —elegir carrera,
 * marcar las materias con los estados disponibles, pasar al plan de cursada—
 * y dice de dónde salen los datos (horarios del SGA del período cargado).
 * Server component: los números (carreras, período) salen de los datos
 * generados en el build. Lo único con JS es la redirección de links viejos.
 */

const PLANNER = "/planificar/";

/* ---- marcas de estado: las mismas formas que el control del planner
   (EstadoControl), copiadas para no arrastrar el planner a la portada ---- */
const MarkPlus = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <path d="M8 4.2v7.6M4.2 8h7.6" />
  </svg>
);
const MarkDot = () => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="8" cy="8" r="3.4" />
  </svg>
);
const MarkCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8.5L6.5 12L13 4.5" />
  </svg>
);
const MarkCheckDouble = () => (
  <svg viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 8.5L6 12L11.5 4.5" />
    <path d="M9.5 8.5L13 12L18.5 4.5" />
  </svg>
);
const MarkCheckFilled = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

type Estado = "pending" | "cursando" | "regular" | "final" | "promo";

const MARK_ICON: Record<Estado, () => React.JSX.Element> = {
  pending: MarkPlus,
  cursando: MarkDot,
  regular: MarkCheck,
  final: MarkCheckDouble,
  promo: MarkCheckFilled,
};

/** Un control de estado, quieto. */
function Mark({ estado }: { estado: Estado }) {
  const I = MARK_ICON[estado];
  return (
    <span className={`ld-ctl st-${estado}`} aria-hidden="true">
      <I />
    </span>
  );
}

/** Un control que recorre el ciclo pendiente → cursando → cursada → final,
 *  solo con CSS (capas superpuestas con la animación desfasada por `--i`). */
function MarkCycle({ i }: { i: number }) {
  return (
    <span className="ld-ctl ld-ctl--cycle" style={{ "--i": i } as React.CSSProperties} aria-hidden="true">
      {(["pending", "cursando", "regular", "final"] as const).map((e) => {
        const I = MARK_ICON[e];
        return (
          <span key={e} className={`ld-ctl__layer st-${e}`}>
            <I />
          </span>
        );
      })}
    </span>
  );
}

/* Materias reales del plan de Informática (2.º año, 1.º cuatrimestre) para la
   tarjeta de muestra del hero: nada inventado. */
const DEMO = [
  { code: "72.33", name: "Programación Orientada a Objetos", cr: 6 },
  { code: "93.35", name: "Lógica Computacional", cr: 6 },
  { code: "93.42", name: "Física II", cr: 6 },
  { code: "12.09", name: "Química", cr: 3 },
];

const ESTADOS: { estado: Estado; label: string; hint: string }[] = [
  { estado: "pending", label: "Pendiente", hint: "todavía no la cursaste" },
  { estado: "cursando", label: "Cursando", hint: "la estás cursando ahora" },
  { estado: "regular", label: "Cursada", hint: "aprobaste la cursada, falta el final" },
  { estado: "final", label: "Final aprobado", hint: "materia terminada" },
  { estado: "promo", label: "Promocionada", hint: "no rinde final: queda saldada" },
];

export default function Landing() {
  const carreras = CARRERAS.filter((c) => c.disponible).length;
  const periodo = data.periodoLabel;

  return (
    <>
      <LegacyRedirect />
      <Header
        tools={
          <NavLink href={PLANNER} className="ld-navlink">
            Abrir el planificador
          </NavLink>
        }
      />

      {/* 1 · HERO */}
      <section className="ld-hero">
        <div className="ld-hero__bg" aria-hidden="true">
          <span className="ld-hero__blob ld-hero__blob--a" />
          <span className="ld-hero__blob ld-hero__blob--b" />
        </div>
        <div className="ld-hero__inner">
          <div className="ld-hero__copy">
            <Eyebrow className="ld-anim" style={{ "--d": "0ms" } as React.CSSProperties}>
              Planificador de cursada · ITBA
            </Eyebrow>
            <h1 className="ld-title">
              <span className="ld-mask">
                <span style={{ "--d": "80ms" } as React.CSSProperties}>Tu carrera,</span>
              </span>
              <span className="ld-mask">
                <span style={{ "--d": "200ms" } as React.CSSProperties}>
                  <em className="ld-accent">cuatri a cuatri</em>.
                </span>
              </span>
            </h1>
            <p className="ld-sub ld-anim" style={{ "--d": "380ms" } as React.CSSProperties}>
              Elegí tu carrera, marcá lo que ya cursaste y Cuatris arma el resto:
              qué podés cursar, horarios sin choques, un plan hasta recibirte y
              tus finales. Sin cuenta: todo queda en tu navegador.
            </p>
            <div className="ld-actions ld-anim" style={{ "--d": "480ms" } as React.CSSProperties}>
              <Button variant="primary" size="lg" href={PLANNER} prefetch={false}>
                Abrir el planificador
                <Icon name="arrowRight" size={16} />
              </Button>
              <Button variant="ghost" size="lg" href="#como">
                Cómo funciona
              </Button>
            </div>
            <dl className="ld-facts ld-anim" style={{ "--d": "600ms" } as React.CSSProperties}>
              <div>
                <dt>Carreras de grado</dt>
                <dd>{carreras}</dd>
              </div>
              <div>
                <dt>Horarios del SGA</dt>
                <dd>{periodo}</dd>
              </div>
              <div>
                <dt>Cuenta</dt>
                <dd>ninguna</dd>
              </div>
            </dl>
          </div>

          {/* tarjeta de muestra: así se marcan las materias */}
          <div className="ld-hero__demo ld-anim" style={{ "--d": "300ms" } as React.CSSProperties} aria-hidden="true">
            <div className="ld-demo">
              <div className="ld-demo__head">
                <span className="ld-demo__title">2.º año · 1.º cuatrimestre</span>
                <span className="ld-demo__pill">Informática</span>
              </div>
              <ul className="ld-demo__list">
                {DEMO.map((m, i) => (
                  <li key={m.code} className="ld-demo__row">
                    <MarkCycle i={i} />
                    <span className="ld-demo__code">{m.code}</span>
                    <span className="ld-demo__name">{m.name}</span>
                    <span className="ld-demo__cr">{m.cr} cr</span>
                  </li>
                ))}
              </ul>
              <div className="ld-demo__foot">
                <span>un toque por estado</span>
                <span>clic derecho: volver</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · CÓMO FUNCIONA */}
      <section id="como" className="ld-section container">
        <Eyebrow>Cómo funciona</Eyebrow>
        <h2 className="ld-h2">Tres pasos</h2>
        <ol className="ld-steps">
          <li className="ld-step">
            <span className="ld-step__n">01</span>
            <h3>Elegí tu carrera</h3>
            <p>
              Las carreras de grado del ITBA con su plan de estudios vigente.
              Cada una guarda su propio progreso en este navegador.
            </p>
          </li>
          <li className="ld-step">
            <span className="ld-step__n">02</span>
            <h3>Marcá tus materias</h3>
            <p>
              Tocá la casilla de cada materia hasta dejarla en su estado real.
              Con eso se calculan correlativas, créditos y qué podés cursar.
            </p>
            <ul className="ld-marks">
              {ESTADOS.map((e) => (
                <li key={e.estado}>
                  <Mark estado={e.estado} />
                  <span className="ld-marks__lbl">{e.label}</span>
                  <span className="ld-marks__hint">{e.hint}</span>
                </li>
              ))}
            </ul>
          </li>
          <li className="ld-step">
            <span className="ld-step__n">03</span>
            <h3>Pasá al plan de cursada</h3>
            <p>
              El planificador te propone qué cursar cuatri a cuatri hasta
              recibirte, respetando correlativas y el orden del plan. El
              combinador arma horarios sin choques y el de finales, tus mesas.
            </p>
            <Link className="ld-step__link" href={PLANNER} prefetch={false}>
              Ir al planificador
              <Icon name="arrowRight" size={14} />
            </Link>
          </li>
        </ol>
      </section>

      {/* 3 · DATOS */}
      <section className="ld-section ld-section--data container">
        <Eyebrow>De dónde salen los datos</Eyebrow>
        <h2 className="ld-h2">Del SGA, guardados en el sitio</h2>
        <div className="ld-data">
          <article className="ld-data__card">
            <h3>Horarios</h3>
            <p>
              Comisiones, días, aulas, sedes y docentes de la oferta del{" "}
              <b>{periodo}</b>, bajados del SGA del ITBA con un scraper y
              guardados acá: la página no consulta el SGA en vivo.
            </p>
          </article>
          <article className="ld-data__card">
            <h3>Planes de estudio</h3>
            <p>
              El plan vigente de cada carrera de grado, también del SGA:
              materias, créditos, correlativas y electivas.
            </p>
          </article>
          <article className="ld-data__card">
            <h3>Finales</h3>
            <p>Las mesas de la planilla oficial de finales, por llamado.</p>
          </article>
        </div>
        <p className="ld-note">
          No es material oficial de la universidad: antes de inscribirte, verificá en el SGA.
        </p>
      </section>

      {/* 4 · CIERRE */}
      <section className="ld-cta">
        <div className="container ld-cta__inner">
          <p className="ld-cta__txt">Todo se guarda en tu navegador. Empezá cuando quieras.</p>
          <Button variant="primary" size="lg" href={PLANNER} prefetch={false}>
            Abrir el planificador
            <Icon name="arrowRight" size={16} />
          </Button>
        </div>
      </section>
    </>
  );
}
