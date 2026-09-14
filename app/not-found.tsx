import { Button, Eyebrow } from "@studyvaults/ui";
import Header from "@/components/shell/Header";

export default function NotFound() {
  return (
    <>
    <Header />
    <section
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        padding: "calc(var(--nav-h) + 96px) 24px 96px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <Eyebrow>ERROR 404 // ruta no encontrada</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 5vw, 52px)",
            lineHeight: 1.05,
            margin: "20px 0 16px",
            color: "var(--ink-strong)",
          }}
        >
          Esta página no existe.
        </h1>
        <p style={{ color: "var(--text-secondary)", margin: "0 0 28px" }}>
          Cuatris tiene una sola página: el planificador.
        </p>
        <Button variant="primary" href="/">
          Ir al planificador
        </Button>
      </div>
    </section>
    </>
  );
}
