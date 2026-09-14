import type { Metadata, Viewport } from "next";
import { Newsreader, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AmbientLayer, ThemeScript } from "@studyvaults/ui";
import Footer from "@/components/shell/Footer";
import { BASE_PATH, SITE_URL } from "@/lib/content/slug";

// Serif editorial + mono para datos (self-hosted por next/font en el build).
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title: {
    default: "Cuatris — Planificador de cursada · ITBA",
    template: "%s · Cuatris",
  },
  description:
    "Planificador de cursada para las carreras de grado del ITBA: elegí tu carrera, marcá tus materias aprobadas y armá tu cursada — correlativas, horarios sin choques, plan cuatrimestre a cuatrimestre y combinación de finales. Sin cuenta: se guarda en tu navegador.",
  openGraph: {
    type: "website",
    siteName: "Cuatris",
    locale: "es_AR",
    title: "Cuatris — Planificador de cursada · ITBA",
    description:
      "Correlativas, horarios sin choques, plan de cursada y finales para las carreras de grado del ITBA. Sin cuenta: se guarda en tu navegador.",
  },
  // Favicon (app/icon.svg, con PNG de respaldo) e instalable como app en el
  // teléfono (manifest + icono de iOS). Declarar `icons` acá pisa la
  // convención de archivo, así que el favicon se lista explícitamente. Las
  // rutas llevan basePath a mano: metadata no pasa por next/link.
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE_PATH}/icon.svg`, type: "image/svg+xml" },
      { url: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    shortcut: `${BASE_PATH}/icons/icon-192.png`,
    apple: `${BASE_PATH}/icons/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: "Cuatris", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#4c3b30" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f5" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      data-theme="dark"
      suppressHydrationWarning
      className={`${newsreader.variable} ${jetbrains.variable}`}
    >
      <body>
        <ThemeScript />
        <a className="skip-link" href="#main">
          Saltar al contenido
        </a>
        <AmbientLayer />
        {/* la barra superior la monta cada página (el planner le entrega su
            navegación de vistas; 404 y error la muestran sola) */}
        <main id="main" className="page">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
