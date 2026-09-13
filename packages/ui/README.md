# @studyvaults/ui

Librería privada de componentes de **StudyVaults ITBA** — el sistema de diseño
_"Technical Split"_ empaquetado y consumible. Es un package interno del
workspace (no se publica a npm). La app `site` lo consume vía
[`transpilePackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages):
se distribuye como TS/TSX crudo y Next lo transpila junto a la app.

---

## Instalación (workspace)

Ya está cableado. `site/package.json` declara:

```jsonc
{
  "workspaces": ["packages/*"],
  "dependencies": { "@studyvaults/ui": "*" }
}
```

`npm install` desde `site/` crea el symlink `node_modules/@studyvaults/ui`.
`next.config.ts` incluye `transpilePackages: ["@studyvaults/ui"]` y
`tsconfig.json` mapea el alias `@studyvaults/ui`.

## Uso

```ts
// 1) la hoja de estilos (una sola vez, en app/globals.css)
@import "@studyvaults/ui/styles.css";

// 2) los componentes
import { Button, Card, CardGrid, SectionHeading, Reveal } from "@studyvaults/ui";
```

```tsx
<Section container>
  <SectionHeading eyebrow="SYS // método" title="Tres formas de entrar." />
  <CardGrid>
    <Card href="/proba/">…</Card>
  </CardGrid>
  <Button variant="primary" size="lg" href="#materias">Explorar</Button>
</Section>
```

---

## Sistema de tokens

La **única fuente de verdad de color** son 7 hex base
(`tokens.css` → `--hex-brown / brown-soft / zinc / blue / gray / coral / white`). Todo lo
demás —neutros, sombras, glows, tints por materia— deriva por `color-mix()`.
Para estados semánticos existen `--status-go/promo/warn/caution`.
Los **tokens de rol** (`--background`, `--surface-2`, `--ink-strong`, `--link`,
`--accent`…) se conmutan por `[data-theme="dark"|"light"]`, así que cualquier
componente que use roles soporta ambos temas sin recompilar. El espejo tipado
de las variantes vive en `tokens.ts`.

- **Tipografía:** Newsreader (display/body serif) + JetBrains Mono (labels/código).
- **Tint por materia:** `[data-vault="mna|derecho|…"]` setea `--vault-tint`.
- **Tema:** lo fija un script anti-flash (`<ThemeScript/>`) antes de pintar;
  lo alterna `<ThemeToggle/>` persistiendo en `localStorage["sv-theme"]`.

---

## Catálogo de componentes

| Categoría | Componentes |
|---|---|
| **primitives** | `Button`, `Icon`, `Badge`, `Tag`, `Eyebrow`, `BigNum`, `Mono` |
| **layout** | `Container`, `Section`, `SectionHeading`, `Stack`, `Row`, `Card`, `CardGrid`, `CardIcon`, `ToolCard`, `Panel`, `SubPanel`, `PanelHeader`, `Note`, `Callout` |
| **navigation** | `Navbar`, `NavLink`, `Brand`, `BrandMark`, `Breadcrumbs`, `Footer`, `ThemeToggle`, `ThemeScript` |
| **feedback** | `Reveal`, `AmbientLayer`, `Modal`, `Drawer`, `Tabs` |
| **forms** | `Field`, `TextInput`, `TextArea`, `Select`, `Slider`, `Chip`, `CommissionSelect` |
| **data** | `KeyValue`, `Readout`, `DataTable`, `CopyButton`, `CodeBlock` (+ `CodeBlockChrome`), `CodeCopy` |

> Catálogo interactivo (showcase): ruta privada **`/interno/ui`** del sitio.

---

## Convenciones

1. **Cero dependencias.** Sólo `react` y `next`. El helper de clases es `cn()`
   (no `clsx`).
2. **Server-first.** Los componentes presentacionales son React Server
   Components; sólo llevan `"use client"` los que usan hooks/refs/estado/DOM.
3. **Polimorfismo de links.** Los que pueden ser link aceptan `href`
   (→ `next/link`) y `external` (→ `<a target="_blank">`). Ver `Button`/`Card`.
4. **`className` siempre se reenvía** y se mergea con `cn(...)`; las props
   nativas del elemento se spreadean con `...rest`.
5. **Las clases CSS son detalle de implementación.** Consumí los componentes,
   no las clases. Una sola fuente de verdad por estilo.

## Estructura

```
src/
  cn.ts              · joiner de clases (zero-dep)
  tokens.ts          · tokens tipados (variantes, vault ids, tema)
  index.ts           · barrel público
  primitives/ layout/ navigation/ feedback/ forms/ data/
  styles/
    index.css        · entry (@import del resto, en orden)
    tokens.css base.css layout.css button.css badge.css card.css
    nav.css footer.css ambient.css breadcrumbs.css reveal.css
    overlay.css toolkit.css forms.css diagram.css library.css
    parcial.css sheets.css
```
