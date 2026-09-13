"use client";

// Badge de minor: insignia que indica con qué minor suma una electiva. Variantes:
//   "logo" — ícono propio del minor + su sigla (la más legible: se reconoce por
//            glyph, color y sigla a la vez). Es la que usan las cards de electiva.
//   "pill" — pill compacta de sigla en el color del minor.
//   "dot"  — punto de color (contextos muy densos).
// Presentacional puro sobre el tipo `Minor` (lib/planner/minors.ts). Fuente única
// del badge de minor en cards, recomendaciones, modal de curso y sidebar — evita
// que cada vista lo reinvente. API estable: agregar variantes, nunca romperlas.
import type { Minor } from "@/lib/planner/minors";
import { minorsOf } from "@/lib/planner/minors";
import { MinorIcon } from "@/components/planner/MinorIcon";

type Variant = "pill" | "dot" | "logo";

export function MinorBadge({
  minor,
  variant = "pill",
  title,
}: {
  minor: Minor;
  variant?: Variant;
  title?: string;
}) {
  const style = { ["--minor-color" as string]: minor.color };
  const label = `Minor: ${minor.name}`;
  if (variant === "dot") {
    // role="img" es obligatorio para que aria-label sea válido en un <span>
    // (sin rol, aria-label es aria-prohibited-attr y el lector lo descarta: el
    // minor quedaría comunicado solo por color). Igual que RecRow/CardSignals.
    return (
      <span
        className="minor-dot"
        style={style}
        role="img"
        title={title ?? minor.name}
        aria-label={label}
      />
    );
  }
  if (variant === "logo") {
    return (
      <span
        className="minor-badge minor-badge--logo"
        style={style}
        title={title ?? label}
        aria-label={label}
      >
        <MinorIcon minor={minor} className="minor-badge__glyph" />
        <span className="minor-badge__ini">{minor.initials}</span>
      </span>
    );
  }
  return (
    <span
      className="minor-badge"
      style={style}
      title={title ?? label}
      aria-label={label}
    >
      {minor.initials}
    </span>
  );
}

/** Fila de badges para las áreas de una materia (a partir de `Materia.areas`). */
export function MinorBadges({
  areas,
  variant = "pill",
}: {
  areas: string[] | undefined;
  variant?: Variant;
}) {
  const minors = minorsOf(areas);
  if (!minors.length) return null;
  return (
    <span className="minor-badges">
      {minors.map((m) => (
        <MinorBadge key={m.id} minor={m} variant={variant} />
      ))}
    </span>
  );
}
