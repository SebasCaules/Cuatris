import type { NextConfig } from "next";

// Sitio de proyecto en GitHub Pages → se sirve bajo /Cuatris. En dev queda en
// la raíz. NEXT_PUBLIC_BASE_PATH permite fijar otro prefijo (o "" para un
// dominio propio); lib/content/slug.ts lee la misma variable.
const isProd = process.env.NODE_ENV === "production";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? "/Cuatris" : "");

const nextConfig: NextConfig = {
  output: "export", // HTML estático → GitHub Pages
  basePath,
  images: { unoptimized: true },
  trailingSlash: true, // /a/b/ → /a/b/index.html
  // El sistema de diseño vive en un package privado del workspace que se
  // publica como TS/TSX crudo; Next lo transpila junto a la app.
  transpilePackages: ["@studyvaults/ui"],
};

export default nextConfig;
