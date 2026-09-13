// ============================================================
// @studyvaults/ui — API pública (barrel).
// Importá desde "@studyvaults/ui". La hoja de estilos se importa
// aparte, una sola vez: @import "@studyvaults/ui/styles.css".
// ============================================================

// --- núcleo ---
export { cn } from "./cn";
export type { ClassValue } from "./cn";
export * from "./tokens";

// --- primitivos ---
export * from "./primitives/Icon";
export * from "./primitives/Button";
export * from "./primitives/Badge";
export * from "./primitives/Tag";
export * from "./primitives/Eyebrow";
export * from "./primitives/BigNum";
export * from "./primitives/Mono";

// --- layout & superficies ---
export * from "./layout/Container";
export * from "./layout/Section";
export * from "./layout/SectionHeading";
export * from "./layout/Stack";
export * from "./layout/Row";
export * from "./layout/Card";
export * from "./layout/CardGrid";
export * from "./layout/CardIcon";
export * from "./layout/ToolCard";
export * from "./layout/Panel";
export * from "./layout/SubPanel";
export * from "./layout/PanelHeader";
export * from "./layout/Note";
export * from "./layout/Callout";

// --- navegación & chrome ---
export * from "./navigation/BrandMark";
export * from "./navigation/Brand";
export * from "./navigation/NavLink";
export * from "./navigation/Navbar";
export * from "./navigation/Breadcrumbs";
export * from "./navigation/Footer";
export * from "./navigation/ThemeToggle";
export * from "./navigation/ThemeScript";

// --- feedback & overlays ---
export * from "./feedback/Reveal";
export * from "./feedback/AmbientLayer";
export * from "./feedback/Modal";
export * from "./feedback/Drawer";
export * from "./feedback/Tabs";

// --- formularios ---
export * from "./forms/Field";
export * from "./forms/TextInput";
export * from "./forms/TextArea";
export * from "./forms/Select";
export * from "./forms/CommissionSelect";
export * from "./forms/Slider";
export * from "./forms/Chip";

// --- datos ---
export * from "./data/KeyValue";
export * from "./data/Readout";
export * from "./data/DataTable";
export * from "./data/CopyButton";
export * from "./data/CodeBlock";
export * from "./data/CodeCopy";
