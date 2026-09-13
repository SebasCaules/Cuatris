import type { SVGProps } from "react";

/**
 * CuatrisMark — el logotipo `.brand__mark` de Cuatris: cuatro casilleros
 * (cuatri-mestres) con uno en coral, el que se está planificando. Usa los
 * tokens de color del sistema para adaptarse al tema. Presentacional puro.
 */
export default function CuatrisMark(props: Omit<SVGProps<SVGSVGElement>, "ref">) {
  return (
    <svg
      className="brand__mark"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="4" y="4" width="10.5" height="10.5" rx="2.5" fill="var(--hex-coral)" />
      <rect x="17.5" y="4" width="10.5" height="10.5" rx="2.5" fill="var(--hex-blue)" opacity="0.9" />
      <rect x="4" y="17.5" width="10.5" height="10.5" rx="2.5" fill="var(--hex-blue)" opacity="0.9" />
      <rect x="17.5" y="17.5" width="10.5" height="10.5" rx="2.5" stroke="var(--hex-blue)" strokeWidth="1.6" opacity="0.7" />
    </svg>
  );
}
