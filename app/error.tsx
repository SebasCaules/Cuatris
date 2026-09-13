"use client";

// Frontera de error a nivel de ruta: si un componente lanza en runtime, Next
// muestra esto en lugar de derribar la ventana entera. El layout raíz (header
// + toggle de tema) sigue montado.
import { useEffect } from "react";
import { Button } from "@studyvaults/ui";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: "calc(var(--nav-h) + 72px) 24px 72px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 540 }}>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          ERROR // algo se rompió al dibujar la página
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(28px, 4vw, 40px)",
            lineHeight: 1.1,
            margin: "0 0 14px",
            color: "var(--ink-strong)",
          }}
        >
          El planificador no pudo cargarse.
        </h1>
        <p style={{ color: "var(--text-secondary)", margin: "0 0 24px" }}>
          Tu progreso sigue guardado en el navegador. Probá recargar; si
          persiste, exportá tu plan desde la vista «Mis materias» antes de
          borrar datos del sitio.
        </p>
        <Button variant="primary" onClick={() => unstable_retry()}>
          Reintentar
        </Button>
      </div>
    </section>
  );
}
