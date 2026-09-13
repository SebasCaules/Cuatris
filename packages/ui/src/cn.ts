/**
 * `cn` — une nombres de clase de forma segura, descartando falsy.
 * Equivalente mínimo a `clsx` sin dependencias (la librería es zero-dep).
 *
 * @example cn("btn", isPrimary && "btn--primary", className)
 */
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string" || typeof input === "number") {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) out.push(nested);
    }
  }
  return out.join(" ");
}
